import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { useGetQuizSession, getGetQuizSessionQueryKey, useSubmitAnswer, type AnswerResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Timer, Trophy, CheckCircle2, XCircle, Gem, Music, ArrowUp, ArrowDown, Crosshair, Star, RotateCcw, Map, Heart, Tv2, ArrowRight, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useHearts } from "@/hooks/useHearts";
import { HeartsDisplay } from "@/components/HeartsDisplay";
import { WatchAdModal } from "@/components/WatchAdModal";
import PowerUpBar, { type PowerUpItem } from "@/components/PowerUpBar";
import PreGamePowerUpModal from "@/components/PreGamePowerUpModal";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { GameShell } from "@/components/quiz/GameShell";
import { useI18n } from "@/lib/i18n";

// Shuffle an array without mutating
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Quiz() {
  const { sessionId } = useParams();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const levelNum = parseInt(searchParams.get("levelNum") ?? "0");
  const worldId = searchParams.get("worldId") ?? "";
  const worldName = searchParams.get("worldName") ?? "";
  const isLevelMode = !!levelNum && !!worldId;
  const reduceMotion = useReducedMotion();
  const { t, lang } = useI18n();

  const { user } = useSupabaseAuth();
  const { hearts, maxHearts, nextRefillMs, canPlay, deductHeart, watchAd } = useHearts(!!user?.id);
  const { toast } = useToast();

  const { data: session, isLoading, isError, refetch } = useGetQuizSession(sessionId || "", {
    query: {
      queryKey: getGetQuizSessionQueryKey(sessionId || ""),
      enabled: !!sessionId,
    }
  });

  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // ── Power-up state ──────────────────────────────────────────────────────────
  const [showPreGame, setShowPreGame] = useState(true);
  const [powerUpInventory, setPowerUpInventory] = useState<PowerUpItem[]>([]);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [usedEffects, setUsedEffects] = useState<Set<string>>(new Set());
  const [doubleScoreRemaining, setDoubleScoreRemaining] = useState(0);
  const [doubleScoreItemId, setDoubleScoreItemId] = useState<string | null>(null);
  // Item id optimistically spent on the in-flight answer, so a failed submit can
  // put the power-up back rather than silently swallowing it.
  const pendingDoubleRef = useRef<string | null>(null);
  const frozenTimerRef = useRef(false);
  const [frozenTimerDisplay, setFrozenTimerDisplay] = useState(false);
  // ────────────────────────────────────────────────────────────────────────────

  // Level mode state
  const [showLevelOverlay, setShowLevelOverlay] = useState(false);
  const [levelPassed, setLevelPassed] = useState(false);
  const [startingNext, setStartingNext] = useState(false);
  const [showFailAd, setShowFailAd] = useState(false);
  const [failBonus, setFailBonus] = useState<{ coins: number; xp: number } | null>(null);
  const [failAdClaimed, setFailAdClaimed] = useState(false);

  // Ordering state
  const [orderedItems, setOrderedItems] = useState<string[]>([]);

  // Matching state
  const [shuffledRight, setShuffledRight] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [playerMatches, setPlayerMatches] = useState<Record<string, string>>({});

  // Hotspot state
  const [hotspotClick, setHotspotClick] = useState<{ x: number; y: number } | null>(null);
  const hotspotImgRef = useRef<HTMLImageElement>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);

  // Fetch power-up inventory when user is known
  useEffect(() => {
    if (!user?.id) return;
    authFetch("/api/marketplace/inventory", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const pus = (Array.isArray(data) ? data : []).filter(
          (i: any) => i.type === "powerup" && i.quantity > 0 &&
            ["fifty_fifty", "extra_time", "skip_question", "double_score", "freeze_timer"].includes(i.effect)
        );
        setPowerUpInventory(pus.map((i: any) => ({
          itemId: i.itemId, effect: i.effect, emoji: i.emoji, name: i.name, quantity: i.quantity,
        })));
      }).catch(() => {});
  }, [user?.id]);

  const submitAnswer = useSubmitAnswer({
    mutation: {
      onError: (err: any) => {
        // The answer was not recorded. Undo the optimistic power-up spend and let
        // the player pick again, instead of leaving the option stuck and selected.
        const spentItemId = pendingDoubleRef.current;
        pendingDoubleRef.current = null;
        if (spentItemId) {
          setDoubleScoreItemId(spentItemId);
          setDoubleScoreRemaining(1);
          setPowerUpInventory(prev =>
            prev.map(p => p.itemId === spentItemId ? { ...p, quantity: p.quantity + 1 } : p)
          );
        }
        setSelectedOption(null);
        toast({
          title: t.quiz.answerNotRecorded,
          description: err?.data?.error ?? t.quiz.pleaseTryAgain,
          variant: "destructive",
        });
      },
      onSuccess: (result) => {
        pendingDoubleRef.current = null;
        setAnswerResult(result);
        if (isLevelMode && result.isLastQuestion) {
          const passed = (result.sessionScore ?? 0) >= 30;
          setLevelPassed(passed);
          if (!passed) { deductHeart(); }
          // Authenticated progress syncs to the server. Guest progress remains local.
          if (user?.id) {
            supabase.auth.getSession().then(({ data: { session: authSession } }) => {
              authFetch(`/api/quiz/levels/${sessionId}/record`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(authSession?.access_token ? { "Authorization": `Bearer ${authSession.access_token}` } : {})
                },
                credentials: "include",
                body: JSON.stringify({ worldId, levelNumber: levelNum, passed }),
              }).then(async response => {
                if (response.status === 401) {
                  toast({ title: t.quiz.authError, description: t.quiz.progressNotSaved, variant: "destructive" });
                }
              }).catch(() => {});
            });
          }
          // Also persist to localStorage for guest users
          if (passed) {
            try {
              const key = `quizara_levels_${worldId}`;
              const existing: number[] = JSON.parse(localStorage.getItem(key) ?? "[]");
              if (!existing.includes(levelNum)) {
                localStorage.setItem(key, JSON.stringify([...existing, levelNum]));
              }
            } catch {}
          }
          // Show overlay after a short delay so user sees the last answer feedback
          setTimeout(() => setShowLevelOverlay(true), 200);
        }
      }
    }
  });

  const question = session?.currentQuestion;
  const qType = question?.questionType ?? "multiple_choice";

  // Initialize complex type state when question changes
  useEffect(() => {
    if (!question) return;
    const type = question.questionType ?? "multiple_choice";
    const opts = question.options ?? [];

    if (type === "ordering") {
      setOrderedItems(shuffleArray(opts));
    } else if (type === "matching") {
      const rights = opts.map((o: string) => o.split(":::")[1]?.trim() ?? o);
      setShuffledRight(shuffleArray(rights));
      setPlayerMatches({});
      setSelectedLeft(null);
    }

    setSelectedOption(null);
    setHotspotClick(null);
    // Reset per-question power-up state
    setHiddenOptions([]);
    setUsedEffects(new Set());
  }, [question?.id]);

  useEffect(() => {
    if (showPreGame || !question) return;
    const focusTimer = window.setTimeout(() => questionHeadingRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [question?.id, showPreGame]);

  // Timer logic (respects pre-game modal and freeze power-up)
  useEffect(() => {
    if (!question || answerResult || showPreGame) return;
    setTimeLeft(30);
    const interval = setInterval(() => {
      if (frozenTimerRef.current) return;
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [question?.id, answerResult, showPreGame]);

  const handleTimeUp = useCallback(() => {
    if (answerResult) return;
    const type = (question as any)?.questionType ?? "multiple_choice";
    const qId = question?.id ?? "";
    if (type === "ordering") {
      submitAnswer.mutate({ sessionId: sessionId || "", data: { questionId: qId, answerData: JSON.stringify([]) } });
    } else if (type === "matching") {
      submitAnswer.mutate({ sessionId: sessionId || "", data: { questionId: qId, answerData: JSON.stringify({}) } });
    } else if (type === "hotspot") {
      submitAnswer.mutate({ sessionId: sessionId || "", data: { questionId: qId, answerData: JSON.stringify({ x: -1, y: -1 }) } });
    } else {
      submitAnswer.mutate({ sessionId: sessionId || "", data: { questionId: qId, selectedAnswer: 99 } });
    }
  }, [question?.id, answerResult, sessionId]);

  // Power-up activation handler
  const handlePowerUp = async (itemId: string, effect: string) => {
    if (effect === "fifty_fifty") {
      try {
        const res = await authFetch("/api/powerups/fifty-fifty", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question?.id, itemId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.eliminatedOptions?.length) {
          setHiddenOptions(data.eliminatedOptions);
          setPowerUpInventory(prev => prev.map(p => p.itemId === itemId ? { ...p, quantity: p.quantity - 1 } : p).filter(p => p.quantity > 0));
          setUsedEffects(prev => new Set([...prev, effect]));
          toast({ title: `✂️ ${t.quiz.fiftyActivated}`, description: t.quiz.optionsRemoved });
        }
      } catch {}
      return;
    }
    if (effect === "double_score") {
      // Not consumed here — the answer endpoint debits the item as it applies the
      // multiplier, so the score shown always matches the score persisted.
      setDoubleScoreItemId(itemId);
      setDoubleScoreRemaining(1);
      setUsedEffects(prev => new Set([...prev, effect]));
      toast({ title: `✖️ ${t.quiz.doubleArmed}`, description: t.quiz.doubleArmedHint });
      return;
    }

    // Consume item
    try {
      const res = await authFetch("/api/marketplace/use-item", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) return;
      setPowerUpInventory(prev => prev.map(p => p.itemId === itemId ? { ...p, quantity: p.quantity - 1 } : p).filter(p => p.quantity > 0));
    } catch { return; }

    switch (effect) {
      case "extra_time":
        setTimeLeft(t => t + 15);
        toast({ title: `⏰ ${t.quiz.timeAdded}` });
        break;
      case "skip_question":
        toast({ title: `⏭️ ${t.quiz.skipped}` });
        handleTimeUp();
        return;
      case "freeze_timer":
        frozenTimerRef.current = true;
        setFrozenTimerDisplay(true);
        toast({ title: `❄️ ${t.quiz.timerFrozen}` });
        setTimeout(() => { frozenTimerRef.current = false; setFrozenTimerDisplay(false); }, 10000);
        break;
    }
    setUsedEffects(prev => new Set([...prev, effect]));
  };

  const handleOptionSelect = (index: number) => {
    if (selectedOption !== null || answerResult || submitAnswer.isPending) return;
    setSelectedOption(index);
    const useDouble = doubleScoreRemaining > 0 && doubleScoreItemId !== null;
    if (useDouble) {
      pendingDoubleRef.current = doubleScoreItemId;
      setDoubleScoreRemaining(0);
      setDoubleScoreItemId(null);
      // Kept at quantity 0 rather than filtered out, so onError can restore it.
      // PowerUpBar already hides zero-quantity entries.
      setPowerUpInventory(prev =>
        prev.map(p => p.itemId === doubleScoreItemId ? { ...p, quantity: p.quantity - 1 } : p)
      );
    }
    submitAnswer.mutate({
      sessionId: sessionId || "",
      data: {
        questionId: question?.id || "",
        selectedAnswer: index,
        ...(useDouble ? { doubleScore: true, doubleScoreItemId } : {}),
      } as any,
    });
  };

  useEffect(() => {
    const supportsNumberKeys = ["multiple_choice", "true_false", "fill_blank", "audio", "image"].includes(qType);
    if (!supportsNumberKeys || answerResult || submitAnswer.isPending || showPreGame) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const optionIndex = Number(event.key) - 1;
      if (optionIndex >= 0 && optionIndex < (question?.options?.length ?? 0)) {
        event.preventDefault();
        handleOptionSelect(optionIndex);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [qType, answerResult, submitAnswer.isPending, showPreGame, question?.id]);

  const handleOrderingSubmit = () => {
    if (answerResult || submitAnswer.isPending) return;
    submitAnswer.mutate({
      sessionId: sessionId || "",
      data: { questionId: question?.id || "", answerData: JSON.stringify(orderedItems) }
    });
  };

  const moveOrderingItem = (idx: number, dir: -1 | 1) => {
    if (answerResult) return;
    const next = [...orderedItems];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrderedItems(next);
  };

  const handleLeftClick = (left: string) => {
    if (answerResult) return;
    if (playerMatches[left]) {
      // Unselect existing match
      const next = { ...playerMatches };
      delete next[left];
      setPlayerMatches(next);
      setSelectedLeft(left);
      return;
    }
    setSelectedLeft(left);
  };

  const handleRightClick = (right: string) => {
    if (answerResult || !selectedLeft) return;
    // Remove any existing left→this right mapping
    const next = { ...playerMatches };
    for (const [l, r] of Object.entries(next)) {
      if (r === right) delete next[l];
    }
    next[selectedLeft] = right;
    setPlayerMatches(next);
    setSelectedLeft(null);
  };

  const handleMatchingSubmit = () => {
    if (answerResult || submitAnswer.isPending) return;
    submitAnswer.mutate({
      sessionId: sessionId || "",
      data: { questionId: question?.id || "", answerData: JSON.stringify(playerMatches) }
    });
  };

  const submitHotspotPoint = (click: { x: number; y: number }) => {
    if (answerResult || submitAnswer.isPending) return;
    setHotspotClick(click);
    submitAnswer.mutate({
      sessionId: sessionId || "",
      data: { questionId: question?.id || "", answerData: JSON.stringify(click) }
    });
  };

  const handleHotspotClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    submitHotspotPoint({
      x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((event.clientY - rect.top) / rect.height) * 100),
    });
  };

  const handleHotspotKeyDown = (event: React.KeyboardEvent<HTMLImageElement>) => {
    if (answerResult || submitAnswer.isPending) return;
    const current = hotspotClick ?? { x: 50, y: 50 };
    const movement: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -5, y: 0 }, ArrowRight: { x: 5, y: 0 }, ArrowUp: { x: 0, y: -5 }, ArrowDown: { x: 0, y: 5 },
    };
    if (movement[event.key]) {
      event.preventDefault();
      setHotspotClick({ x: Math.max(0, Math.min(100, current.x + movement[event.key].x)), y: Math.max(0, Math.min(100, current.y + movement[event.key].y)) });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      submitHotspotPoint(current);
    }
  };

  const handleNext = async () => {
    if (answerResult?.isLastQuestion) {
      if (isLevelMode) return; // overlay handles navigation
      // Streak checkin — store milestone result for Results page
      authFetch("/api/streak/checkin", { method: "POST", credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.milestoneReached && data?.coinsAwarded > 0) {
            sessionStorage.setItem("streak_milestone", JSON.stringify({
              streak: data.milestoneReached,
              coins: data.coinsAwarded,
            }));
          }
        })
        .catch(() => {});
      setLocation(`/results/${sessionId}`);
    } else {
      setIsAdvancing(true);
      try {
        await refetch();
        setSelectedOption(null);
        setAnswerResult(null);
        setHotspotClick(null);
      } finally {
        setIsAdvancing(false);
      }
    }
  };

  const handleTryAgain = async () => {
    setStartingNext(true);
    try {
      const res = await authFetch("/api/quiz/levels/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ worldId, levelNumber: levelNum }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return;
      const params = new URLSearchParams({
        levelNum: String(levelNum),
        worldId,
        worldName,
      });
      setLocation(`/quiz/${data.sessionId}?${params.toString()}`);
    } catch {}
    finally { setStartingNext(false); }
  };

  const handleFailAdComplete = async () => {
    try {
      const res = await authFetch("/api/hearts/watch-ad-fail-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!data.guest) {
        setFailBonus({ coins: data.bonusCoins ?? 0, xp: data.bonusXp ?? 0 });
      } else {
        await watchAd();
      }
    } catch {}
    setShowFailAd(false);
    setFailAdClaimed(true);
  };

  const handleNextLevel = async () => {
    setStartingNext(true);
    try {
      const res = await authFetch("/api/quiz/levels/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ worldId, levelNumber: levelNum + 1 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        // No more levels — go back to map
        setLocation(`/worlds/${worldId}`);
        return;
      }
      const params = new URLSearchParams({
        levelNum: String(levelNum + 1),
        worldId,
        worldName,
      });
      setLocation(`/quiz/${data.sessionId}?${params.toString()}`);
    } catch {
      setLocation(`/worlds/${worldId}`);
    } finally { setStartingNext(false); }
  };

  // Pre-game power-up modal (shown before first question)
  if (showPreGame && !isLoading && session && session.status !== "completed" && !showLevelOverlay) {
    return (
      <PreGamePowerUpModal
        isOpen={true}
        onPlay={(pus) => {
          if (pus.length > 0) setPowerUpInventory(pus);
          setShowPreGame(false);
        }}
        isAuthenticated={!!user?.id}
        allowedEffects={["fifty_fifty", "extra_time", "skip_question", "double_score", "freeze_timer"]}
      />
    );
  }

  if (isLoading) {
    return (
      <GameShell index="QUIZ / 00" label={t.quiz.arenaLabel} exitLabel={t.quiz.exit} onExit={() => setLocation(worldId ? `/worlds/${worldId}` : "/categories")}>
        <div className="grid flex-1 content-center gap-8">
          <div className="grid grid-cols-3 items-center border-y border-white/10 py-4"><Skeleton className="h-8 w-24 rounded-none" /><Skeleton className="mx-auto h-12 w-20 rounded-none" /><Skeleton className="ml-auto h-8 w-24 rounded-none rtl:ml-0 rtl:mr-auto" /></div>
          <div className="mx-auto w-full max-w-4xl space-y-7"><Skeleton className="h-5 w-32 rounded-none" /><Skeleton className="h-28 w-full rounded-none" /><div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-none" />)}</div></div>
        </div>
      </GameShell>
    );
  }

  if (isError || !session) {
    return (
      <GameShell index="QUIZ / --" label={t.quiz.arenaLabel} exitLabel={t.quiz.exit} onExit={() => setLocation(worldId ? `/worlds/${worldId}` : "/categories")}>
        <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-start justify-center">
          <span className="text-7xl font-black text-primary/20">404</span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.05em] sm:text-6xl">{t.quiz.notFound}</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{t.quiz.notFoundHint}</p>
          <div className="mt-8 flex gap-3"><Button onClick={() => refetch()} className="rounded-none"><RotateCcw className="mr-2 h-4 w-4" />{t.quiz.retry}</Button><Button variant="outline" onClick={() => setLocation(worldId ? `/worlds/${worldId}` : "/categories")} className="rounded-none">{t.quiz.exit}</Button></div>
        </div>
      </GameShell>
    );
  }

  // Level mode overlay (pass/fail)
  if (showLevelOverlay) {
    return (
      <GameShell index={`LEVEL / ${String(levelNum).padStart(2, "0")}`} label={worldName || t.quiz.world} exitLabel={t.quiz.backToMap} onExit={() => setLocation(`/worlds/${worldId}`)} compact>
        <div className={cn(
          "mx-auto flex min-h-[76vh] w-full max-w-3xl flex-col items-center justify-center gap-8 border-y p-6 text-center sm:p-12",
          levelPassed
            ? "border-primary/30"
            : "border-rose-400/30"
        )}>
          {/* Icon */}
          <div className={cn(
            "grid h-28 w-28 place-items-center rounded-full border",
            levelPassed ? "border-primary/40 bg-primary text-primary-foreground" : "border-rose-400/40 bg-rose-400 text-background"
          )}>
            {levelPassed
              ? <Star className="h-12 w-12 fill-current" />
              : <XCircle className="h-12 w-12" />
            }
          </div>

          {/* Title */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {worldName} / {t.quiz.level} {levelNum}
            </p>
            <h2 className={cn("text-[clamp(3rem,8vw,6.5rem)] font-black leading-[0.85] tracking-[-0.07em]", levelPassed ? "text-primary" : "text-foreground")}>
              {levelPassed ? t.quiz.levelComplete : t.quiz.levelFailed}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground">
              {levelPassed
                ? t.quiz.levelCompleteHint
                : t.quiz.levelFailedHint}
            </p>
          </div>

          {/* Score dots */}
          <div className="flex items-center gap-3">
            {[0, 1, 2].map(i => {
              const correct = i < (answerResult?.sessionScore ?? 0) / 10;
              return (
                <div key={i} className={cn(
                    "grid h-11 w-11 place-items-center rounded-full border",
                    correct ? "border-emerald-400 text-emerald-400" : "border-white/15 text-muted-foreground"
                )}>
                  {correct
                    ? <CheckCircle2 className="h-5 w-5" />
                    : <XCircle className="h-5 w-5" />
                  }
                </div>
              );
            })}
          </div>

          {/* Hearts remaining (fail state only) */}
          {!levelPassed && (
            <div className="w-full space-y-3">
              {/* Watch Ad for Heart + 2× Bonus */}
              {!failAdClaimed ? (
                <button
                  onClick={() => setShowFailAd(true)}
                  className="focus-ring flex min-h-14 w-full items-center gap-3 border border-white/15 px-4 py-3.5 transition-colors hover:border-primary/45 active:bg-primary/10"
                >
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center border border-primary/30">
                    <Tv2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-foreground">{t.quiz.watchAd}</p>
                    <p className="text-xs text-muted-foreground">{t.quiz.restoreHeart}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-0.5">
                      <Heart className="h-3 w-3 fill-red-400" />+1
                    </span>
                    <span className="text-xs font-bold text-amber-400">2× Bonus</span>
                  </div>
                </button>
              ) : failBonus && (failBonus.coins > 0 || failBonus.xp > 0) ? (
                <div className="flex w-full items-center gap-3 border border-emerald-400/25 px-4 py-3">
                  <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-green-400">{t.quiz.bonusClaimed}</p>
                    <p className="text-xs text-muted-foreground">
                      +1 ❤️{failBonus.coins > 0 ? ` · +${failBonus.coins} coins` : ""}{failBonus.xp > 0 ? ` · +${failBonus.xp} XP` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex w-full items-center gap-3 border border-emerald-400/25 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <p className="text-xs font-bold text-green-400">{t.quiz.heartRestored}</p>
                </div>
              )}

              {/* Hearts count */}
              <div className="flex w-full flex-col items-center gap-2 border-y border-white/10 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{t.quiz.heartsRemaining}</p>
                <HeartsDisplay hearts={hearts} maxHearts={maxHearts} nextRefillMs={nextRefillMs} size="md" />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              variant="outline"
              className="min-h-12 flex-1 rounded-none border-white/15"
              onClick={() => setLocation(`/worlds/${worldId}`)}
            >
              <Map className="mr-2 h-4 w-4" />
              {t.quiz.backToMap}
            </Button>
            {levelPassed ? (
              <Button
                className="min-h-12 flex-1 rounded-none font-semibold"
                disabled={startingNext}
                onClick={handleNextLevel}
              >
                <Star className="mr-2 h-4 w-4 fill-current" />
                {startingNext ? t.quiz.loading : t.quiz.nextLevel}
              </Button>
            ) : canPlay || failAdClaimed ? (
              <Button
                className="min-h-12 flex-1 rounded-none bg-primary text-primary-foreground"
                disabled={startingNext}
                onClick={handleTryAgain}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {startingNext ? t.quiz.loading : t.quiz.tryAgain}
              </Button>
            ) : (
              <Button
                className="min-h-12 flex-1 cursor-not-allowed rounded-none bg-muted text-muted-foreground"
                disabled
              >
                <Heart className="mr-2 h-4 w-4 text-red-400 fill-red-400/50" />
                {t.quiz.waitForHeart}
              </Button>
            )}
          </div>

          {/* Watch Ad modal for fail bonus */}
          {showFailAd && (
            <WatchAdModal
              onComplete={handleFailAdComplete}
              onClose={() => setShowFailAd(false)}
              bonus={
                (answerResult?.sessionScore ?? 0) > 0
                  ? { coins: Math.floor(((answerResult?.sessionScore ?? 0) / 10)) * 10, xp: (answerResult?.sessionScore ?? 0) * 2 }
                  : undefined
              }
            />
          )}
        </div>
      </GameShell>
    );
  }

  if (session.status === "completed") {
    setLocation(`/results/${sessionId}`);
    return null;
  }

  if (!question) return null;

  const progress = (session.questionNumber / session.totalQuestions) * 100;
  const opts = question.options ?? [];
  const localizedOptions = lang === "ar" && question.optionsAr?.length === opts.length ? question.optionsAr : opts;
  const localizedQuestion = lang === "ar" && question.questionAr ? question.questionAr : question.question;
  const localizedTokenMap = new globalThis.Map<string, string>();
  opts.forEach((option: string, index: number) => {
    const localized = localizedOptions[index] ?? option;
    const sourceParts = option.split(":::");
    const localizedParts = localized.split(":::");
    sourceParts.forEach((part, partIndex) => localizedTokenMap.set(part.trim(), (localizedParts[partIndex] ?? part).trim()));
  });
  const displayToken = (value: string) => localizedTokenMap.get(value.trim()) ?? value;
  const localizedExplanation = lang === "ar" && answerResult?.explanationAr ? answerResult.explanationAr : answerResult?.explanation;

  // For matching: parse left items from options
  const leftItems = opts.map((o: string) => o.split(":::")[0]?.trim() ?? o);
  const correctPairs: Record<string, string> = {};
  for (const o of opts) {
    const [l, r] = o.split(":::");
    if (l && r) correctPairs[l.trim()] = r.trim();
  }

  // For hotspot: parse correct region from options[0]
  const hotspotRegion = opts[0] ? opts[0].split(",").map(Number) : [0, 0, 100, 100];
  const [hx1, hy1, hx2, hy2] = hotspotRegion;

  return (
    <GameShell index={`QUIZ / ${String(session.questionNumber).padStart(2, "0")}`} label={session.categoryName || t.quiz.arenaLabel} exitLabel={isLevelMode ? t.quiz.backToMap : t.quiz.exit} onExit={() => setLocation(isLevelMode ? `/worlds/${worldId}` : "/categories")}>

      {/* Header Stats */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-y border-white/10 py-3 sm:py-4">
        <div className="flex min-w-0 items-center gap-2">
          {isLevelMode ? (
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-primary text-primary" />
                <span className="text-xs font-bold uppercase tracking-[0.14em] sm:text-sm">{t.quiz.level} {levelNum}</span>
              </div>
              <HeartsDisplay hearts={hearts} maxHearts={maxHearts} nextRefillMs={nextRefillMs} size="sm" watchAd={watchAd} />
            </div>
          ) : (
            <>
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-[0.14em] sm:text-sm">{session.score} {t.results.points}</span>
            </>
          )}
        </div>
        <div role="timer" aria-label={`${t.quiz.timeLeft}: ${timeLeft}`} className={cn("flex min-h-12 items-center gap-2 border px-3 text-lg font-black tabular-nums sm:px-5 sm:text-xl", timeLeft <= 5 ? "border-rose-400/60 text-rose-400" : "border-white/15 text-primary")}>
          <Timer className={cn("h-4 w-4", timeLeft <= 5 && "animate-pulse")} />
          <span>
            00:{timeLeft.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-end">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs">{t.quiz.question} {session.questionNumber} {t.quiz.of} {session.totalQuestions}</span>
          {isLevelMode && (
            <span className="max-w-24 truncate text-[9px] text-muted-foreground/60 sm:max-w-48">{worldName}</span>
          )}
        </div>
      </div>

      <div className="relative mb-5 h-px bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <motion.span className="absolute inset-y-0 left-0 w-full origin-left bg-primary rtl:left-auto rtl:right-0 rtl:origin-right" initial={false} animate={{ scaleX: progress / 100 }} transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }} />
      </div>

      {/* Power-up bar */}
      {!answerResult && (
        <div className="mb-4">
          {(frozenTimerDisplay || doubleScoreRemaining > 0) && (
            <div className="flex items-center gap-2 justify-center mb-2 flex-wrap text-xs font-semibold">
              {frozenTimerDisplay && <span className="border border-primary/30 px-2 py-1 text-primary">❄️ {t.quiz.frozenStatus}</span>}
              {doubleScoreRemaining > 0 && <span className="border border-primary/30 px-2 py-1 text-primary">✖️ {t.quiz.doubleStatus}</span>}
            </div>
          )}
          <PowerUpBar
            powerUps={powerUpInventory}
            usedEffects={usedEffects}
            doubleScoreRemaining={doubleScoreRemaining}
            shieldActive={false}
            frozenTimer={frozenTimerDisplay}
            onUse={handlePowerUp}
            disabled={!!answerResult || submitAnswer.isPending}
            allowedEffects={["fifty_fifty", "extra_time", "skip_question", "double_score", "freeze_timer"]}
            currentQuestionType={qType}
            editorial
          />
        </div>
      )}

      {/* Question Card */}
      <section className="relative mb-5 border-b border-white/10 pb-6 pt-4 sm:mb-7 sm:pb-9 sm:pt-7">
        <div className="mb-5 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground"><span className="text-primary">{String(session.questionNumber).padStart(2, "0")}</span><span className="h-px w-8 bg-white/15" />{t.quiz.questionPrompt}</div>

        {/* Audio player for audio type */}
        {qType === "audio" && question.imageUrl && (
          <div className="mb-6 border-y border-white/10 py-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center border border-primary/30 text-primary">
                <Music className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-primary">{t.quiz.listenAndAnswer}</span>
            </div>
            <audio
              controls
              autoPlay
              src={question.imageUrl}
              className="w-full"
            />
          </div>
        )}

        {/* Image for image type */}
        {qType === "image" && question.imageUrl && (
          <div className="mb-6 overflow-hidden border border-white/10">
            <img src={question.imageUrl} alt={t.quiz.questionImage} className="max-h-72 w-full object-cover" />
          </div>
        )}

        <h1 ref={questionHeadingRef} tabIndex={-1} className="focus:outline-none max-w-4xl text-[clamp(1.75rem,4.8vw,4.25rem)] font-extrabold leading-[1.02] tracking-[-0.045em]">{localizedQuestion}</h1>

        {/* Type label */}
        {(qType === "ordering" || qType === "matching" || qType === "hotspot") && (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            {qType === "ordering" && t.quiz.orderingHint}
            {qType === "matching" && t.quiz.matchingHint}
            {qType === "hotspot" && t.quiz.hotspotHint}
          </p>
        )}
      </section>

      {/* ── MULTIPLE CHOICE / TRUE-FALSE / FILL_BLANK / AUDIO ── */}
      {(qType === "multiple_choice" || qType === "true_false" || qType === "fill_blank" || qType === "audio" || qType === "image") && (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {opts.map((option: string, index: number) => {
            const isHidden = hiddenOptions.includes(index) && !answerResult;
            if (isHidden) return (
              <div key={index} className="relative min-h-20 select-none border border-white/5 opacity-25">
                <span className="sr-only">{t.quiz.optionRemoved}</span>
              </div>
            );

            const isSelected = selectedOption === index;
            const isCorrect = answerResult?.correctAnswer === index;
            const isWrongSelected = isSelected && !answerResult?.correct;

            let stateClass = "border-white/12 bg-background/45 hover:border-primary/55 hover:bg-primary/[0.035]";
            if (answerResult) {
              if (isCorrect) stateClass = "border-emerald-400 bg-emerald-400/10 text-emerald-300";
              else if (isWrongSelected) stateClass = "border-rose-400 bg-rose-400/10 text-rose-300";
              else stateClass = "border-white/8 bg-background/35 opacity-45";
            }

            return (
              <motion.button
                key={index}
                disabled={!!answerResult || submitAnswer.isPending}
                onClick={() => handleOptionSelect(index)}
                aria-pressed={isSelected}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                className={cn("focus-ring group relative min-h-20 overflow-hidden border p-4 text-left transition-colors duration-200 sm:min-h-24 sm:p-5 rtl:text-right", stateClass)}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex min-w-0 items-center gap-4"><span className={cn("grid h-8 w-8 shrink-0 place-items-center border text-[10px] font-black", isSelected ? "border-current" : "border-white/15 text-muted-foreground")}>{String.fromCharCode(65 + index)}</span><span className="text-base font-semibold leading-6 sm:text-lg">{localizedOptions[index] ?? option}</span></span>
                  {submitAnswer.isPending && isSelected && <Loader2 className="h-5 w-5 shrink-0 animate-spin" />}
                  {answerResult && isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  {answerResult && isWrongSelected && <XCircle className="h-5 w-5 shrink-0" aria-hidden="true" />}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── ORDERING ── */}
      {qType === "ordering" && (
        <div className="space-y-3 mb-8">
          {orderedItems.map((item, idx) => {
            let itemClass = "border-border bg-card hover:border-primary/40";
            if (answerResult) {
              const correctOrder = JSON.parse(answerResult.correctAnswerData ?? "[]") as string[];
              const isInPlace = correctOrder[idx] === item;
              itemClass = isInPlace
                ? "border-green-500 bg-green-500/10"
                : "border-destructive/60 bg-destructive/10";
            }
            return (
              <div
                key={`${item}-${idx}`}
                className={cn("flex min-h-16 items-center gap-3 border p-4 transition-colors", itemClass)}
              >
                <span className="text-muted-foreground font-bold w-6 text-sm shrink-0">{idx + 1}.</span>
                <span className="flex-1 font-medium">{displayToken(item)}</span>
                {!answerResult && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => moveOrderingItem(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`${t.quiz.moveUp}: ${displayToken(item)}`}
                      className="focus-ring grid h-11 w-11 place-items-center border border-white/15 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveOrderingItem(idx, 1)}
                      disabled={idx === orderedItems.length - 1}
                      aria-label={`${t.quiz.moveDown}: ${displayToken(item)}`}
                      className="focus-ring grid h-11 w-11 place-items-center border border-white/15 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {answerResult && (() => {
                  const correctOrder = JSON.parse(answerResult.correctAnswerData ?? "[]") as string[];
                  return correctOrder[idx] === item
                    ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    : <XCircle className="h-5 w-5 text-destructive shrink-0" />;
                })()}
              </div>
            );
          })}
          {!answerResult && (
            <Button
              onClick={handleOrderingSubmit}
              disabled={submitAnswer.isPending}
              className="mt-2 min-h-12 w-full rounded-none bg-primary text-primary-foreground"
              size="lg"
            >
              {t.quiz.submitOrder}
            </Button>
          )}
          {answerResult && answerResult.correctAnswerData && (
            <div className="border-y border-white/10 py-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t.quiz.correctOrder}</p>
              <ol className="space-y-1">
                {(JSON.parse(answerResult.correctAnswerData) as string[]).map((item, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground w-4 text-xs">{i + 1}.</span>
                    {displayToken(item)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ── MATCHING ── */}
      {qType === "matching" && (
        <div className="mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.quiz.matchFrom}</p>
              {leftItems.map((left: string) => {
                const isMatched = !!playerMatches[left];
                const isActive = selectedLeft === left;
                let cls = "border-border bg-card hover:border-primary/50";
                if (isActive) cls = "border-primary bg-primary/10";
                else if (isMatched) cls = "border-secondary/50 bg-secondary/10";
                if (answerResult) {
                  const correctRight = correctPairs[left];
                  const playerRight = playerMatches[left];
                  cls = playerRight === correctRight
                    ? "border-green-500 bg-green-500/10"
                    : "border-destructive/60 bg-destructive/10";
                }
                return (
                  <button
                    key={left}
                    onClick={() => handleLeftClick(left)}
                    disabled={!!answerResult}
                    aria-pressed={isActive}
                    className={cn("focus-ring min-h-12 w-full border p-3 text-left text-sm font-medium transition-colors rtl:text-right", cls)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{displayToken(left)}</span>
                      {isMatched && !answerResult && (
                        <span className="shrink-0 text-xs font-normal text-primary">→ {displayToken(playerMatches[left])}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Right column */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-3">
                {selectedLeft ? (
                  <span className="text-primary">{t.quiz.selectMatch} “{displayToken(selectedLeft)}”</span>
                ) : t.quiz.matchTo}
              </p>
              {shuffledRight.map((right: string) => {
                const isUsed = Object.values(playerMatches).includes(right);
                let cls = "border-border bg-card hover:border-secondary/50";
                if (selectedLeft && !isUsed) cls = "border-secondary/40 bg-secondary/5 hover:border-secondary hover:bg-secondary/10 cursor-pointer";
                if (isUsed) cls = "border-secondary/30 bg-secondary/5 opacity-70";
                if (answerResult) {
                  const matchedLeft = Object.entries(playerMatches).find(([, r]) => r === right)?.[0];
                  if (matchedLeft) {
                    cls = playerMatches[matchedLeft] === correctPairs[matchedLeft]
                      ? "border-green-500 bg-green-500/10"
                      : "border-destructive/60 bg-destructive/10";
                  } else {
                    cls = "border-border bg-card opacity-60";
                  }
                }
                return (
                  <button
                    key={right}
                    onClick={() => handleRightClick(right)}
                    disabled={!!answerResult || (!selectedLeft && !isUsed)}
                    aria-pressed={isUsed}
                    className={cn("focus-ring min-h-12 w-full border p-3 text-left text-sm font-medium transition-colors rtl:text-right", cls)}
                  >
                    {displayToken(right)}
                  </button>
                );
              })}
            </div>
          </div>

          {!answerResult && (
            <Button
              onClick={handleMatchingSubmit}
              disabled={submitAnswer.isPending || Object.keys(playerMatches).length < leftItems.length}
              className="min-h-12 w-full rounded-none bg-primary text-primary-foreground"
              size="lg"
            >
              {Object.keys(playerMatches).length < leftItems.length
                ? `${t.quiz.matchMore} ${leftItems.length - Object.keys(playerMatches).length}`
                : t.quiz.submitMatches}
            </Button>
          )}

          {answerResult && answerResult.correctAnswerData && (
            <div className="border-y border-white/10 py-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t.quiz.correctMatches}</p>
              <div className="space-y-1">
                {Object.entries(JSON.parse(answerResult.correctAnswerData) as Record<string, string>).map(([l, r]) => (
                  <div key={l} className="text-sm flex items-center gap-2">
                    <span className="font-medium">{displayToken(l)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{displayToken(r)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HOTSPOT ── */}
      {qType === "hotspot" && question.imageUrl && (
        <div className="mb-8 space-y-4">
          <div className="group relative select-none overflow-hidden border border-white/15">
            <img
              ref={hotspotImgRef}
              src={question.imageUrl}
              alt={t.quiz.hotspotImage}
              onClick={handleHotspotClick}
              onKeyDown={handleHotspotKeyDown}
              tabIndex={answerResult ? -1 : 0}
              role="button"
              aria-label={t.quiz.hotspotKeyboardHint}
              className={cn(
                "focus-ring max-h-96 w-full object-cover",
                !answerResult && !submitAnswer.isPending ? "cursor-crosshair" : "cursor-default"
              )}
              draggable={false}
            />

            {/* Player's click marker */}
            {hotspotClick && (
              <div
                className={cn(
                  "absolute w-8 h-8 rounded-full border-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all",
                  answerResult
                    ? answerResult.correct ? "border-green-500 bg-green-500/30" : "border-destructive bg-destructive/30"
                    : "border-primary bg-primary/20"
                )}
                style={{ left: `${hotspotClick.x}%`, top: `${hotspotClick.y}%` }}
              >
                <Crosshair className="h-3 w-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
              </div>
            )}

            {/* Show correct region after answering */}
            {answerResult && (
              <div
                className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none"
                style={{ left: `${hx1}%`, top: `${hy1}%`, width: `${hx2 - hx1}%`, height: `${hy2 - hy1}%` }}
              />
            )}

            {/* Overlay instruction */}
            {!hotspotClick && !answerResult && (
              <div className="absolute inset-0 flex items-end p-4 bg-gradient-to-t from-black/50 to-transparent pointer-events-none">
                <p className="text-sm font-medium text-white drop-shadow">{t.quiz.hotspotInstruction}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No image for hotspot fallback */}
      {qType === "hotspot" && !question.imageUrl && (
        <div className="mb-8 border border-dashed border-white/15 p-10 text-center text-muted-foreground">
          <Crosshair className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t.quiz.noHotspotImage}</p>
        </div>
      )}

      {/* Feedback Panel */}
      {answerResult && (
        <div role="status" aria-live="polite" className="sticky bottom-0 z-30 -mx-4 mt-auto border-t border-white/10 bg-background/95 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
          <div className={cn(
            "mx-auto flex max-w-7xl flex-col items-stretch justify-between gap-4 border-l-2 py-2 pl-4 sm:flex-row sm:items-center rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-4",
            answerResult.correct ? "border-emerald-400" : "border-rose-400"
          )}>
            <div className="flex items-center gap-4 text-left rtl:text-right">
              <div className={cn(
                "grid h-11 w-11 shrink-0 place-items-center border",
                answerResult.correct ? "border-emerald-400/40 text-emerald-400" : "border-rose-400/40 text-rose-400"
              )}>
                {answerResult.correct ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
              </div>
              <div>
                <h2 className={cn("text-xl font-extrabold tracking-[-0.03em]", answerResult.correct ? "text-emerald-400" : "text-rose-400")}>
                  {answerResult.correct ? t.quiz.correct : t.quiz.incorrect}
                </h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {answerResult.pointsEarned > 0 && (
                    <span className="text-sm font-semibold text-primary flex items-center gap-1">
                      <Trophy className="h-3.5 w-3.5" />+{answerResult.pointsEarned} {t.results.points}
                    </span>
                  )}
                  {answerResult.coinsEarned > 0 && (
                    <span className="text-sm font-semibold text-amber-400 flex items-center gap-1">
                      <Gem className="h-3.5 w-3.5" />+{answerResult.coinsEarned} {t.profile.coins}
                    </span>
                  )}
                </div>
                {localizedExplanation && (
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{localizedExplanation}</p>
                )}
              </div>
            </div>

            {/* In level mode on last question, the overlay auto-appears — hide the button */}
            {!(isLevelMode && answerResult.isLastQuestion) && (
              <div className="flex items-center gap-3">
                <div id="report-question-slot" data-feature-slot="report-question" />
                <Button size="lg" onClick={handleNext} disabled={isAdvancing} className="focus-ring min-h-12 flex-1 shrink-0 rounded-none px-7 text-sm font-bold uppercase tracking-[0.12em] sm:flex-none">
                  {isAdvancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin rtl:ml-2 rtl:mr-0" /> : null}{answerResult.isLastQuestion ? t.quiz.viewResults : isAdvancing ? t.quiz.loading : t.quiz.nextQuestion}{!isAdvancing && <ArrowRight className="ml-2 h-4 w-4 rtl:ml-0 rtl:mr-2 rtl:rotate-180" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </GameShell>
  );
}
