import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useGetQuizSession, getGetQuizSessionQueryKey, useSubmitAnswer } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Timer, Trophy, CheckCircle2, XCircle, Gem, Music, ArrowUp, ArrowDown, Crosshair, Star, RotateCcw, Map, Heart, Tv2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@workspace/replit-auth-web";
import { useHearts } from "@/hooks/useHearts";
import { HeartsDisplay } from "@/components/HeartsDisplay";
import { WatchAdModal } from "@/components/WatchAdModal";

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

  const { user } = useAuth();
  const { hearts, maxHearts, nextRefillMs, canPlay, deductHeart, watchAd } = useHearts(!!user?.id);

  const { data: session, isLoading, refetch } = useGetQuizSession(sessionId || "", {
    query: {
      queryKey: getGetQuizSessionQueryKey(sessionId || ""),
      enabled: !!sessionId,
    }
  });

  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<any>(null);

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

  const submitAnswer = useSubmitAnswer({
    mutation: {
      onSuccess: (result: any) => {
        setAnswerResult(result);
        if (isLevelMode && result.isLastQuestion) {
          const passed = (result.sessionScore ?? 0) >= 30;
          setLevelPassed(passed);
          if (!passed) { deductHeart(); }
          // Record progress server-side (fire-and-forget)
          fetch(`/api/quiz/levels/${sessionId}/record`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ worldId, levelNumber: levelNum, passed }),
          }).catch(() => {});
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
          setTimeout(() => setShowLevelOverlay(true), 900);
        }
      }
    }
  });

  const question = session?.currentQuestion;
  const qType = (question as any)?.questionType ?? "multiple_choice";

  // Initialize complex type state when question changes
  useEffect(() => {
    if (!question) return;
    const type = (question as any).questionType ?? "multiple_choice";
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
  }, [question?.id]);

  // Timer logic
  useEffect(() => {
    if (!question || answerResult) return;
    setTimeLeft(30);
    const interval = setInterval(() => {
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
  }, [question?.id, answerResult]);

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

  const handleOptionSelect = (index: number) => {
    if (selectedOption !== null || answerResult || submitAnswer.isPending) return;
    setSelectedOption(index);
    submitAnswer.mutate({
      sessionId: sessionId || "",
      data: { questionId: question?.id || "", selectedAnswer: index }
    });
  };

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

  const handleHotspotClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (answerResult || submitAnswer.isPending) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    const click = { x, y };
    setHotspotClick(click);
    submitAnswer.mutate({
      sessionId: sessionId || "",
      data: { questionId: question?.id || "", answerData: JSON.stringify(click) }
    });
  };

  const handleNext = () => {
    if (answerResult?.isLastQuestion) {
      if (isLevelMode) return; // overlay handles navigation
      // Streak checkin — store milestone result for Results page
      fetch("/api/streak/checkin", { method: "POST", credentials: "include" })
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
      setSelectedOption(null);
      setAnswerResult(null);
      setHotspotClick(null);
      refetch();
    }
  };

  const handleTryAgain = async () => {
    setStartingNext(true);
    try {
      const res = await fetch("/api/quiz/levels/start", {
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
      const res = await fetch("/api/hearts/watch-ad-fail-bonus", {
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
      const res = await fetch("/api/quiz/levels/start", {
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

  if (isLoading || !session) {
    return (
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-10 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-48 w-full mt-8 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Level mode overlay (pass/fail)
  if (showLevelOverlay) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className={cn(
          "w-full max-w-md rounded-3xl border p-10 flex flex-col items-center text-center gap-6 shadow-2xl",
          levelPassed
            ? "border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-card"
            : "border-destructive/30 bg-gradient-to-b from-destructive/10 to-card"
        )}>
          {/* Icon */}
          <div className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center border-4",
            levelPassed ? "border-amber-400 bg-amber-500/20" : "border-destructive bg-destructive/20"
          )}>
            {levelPassed
              ? <Star className="h-12 w-12 text-amber-400 fill-amber-400" />
              : <XCircle className="h-12 w-12 text-destructive" />
            }
          </div>

          {/* Title */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {worldName} — Level {levelNum}
            </p>
            <h2 className={cn("text-4xl font-black", levelPassed ? "text-amber-400" : "text-destructive")}>
              {levelPassed ? "Level Complete!" : "Level Failed"}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {levelPassed
                ? "You answered all 3 questions correctly. The next level is now unlocked!"
                : "You need to answer all 3 questions correctly to pass. Try again!"}
            </p>
          </div>

          {/* Score dots */}
          <div className="flex items-center gap-3">
            {[0, 1, 2].map(i => {
              const correct = i < (answerResult?.sessionScore ?? 0) / 10;
              return (
                <div key={i} className={cn(
                  "w-10 h-10 rounded-full border-2 flex items-center justify-center",
                  correct ? "border-green-500 bg-green-500/20" : "border-white/20 bg-card"
                )}>
                  {correct
                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                    : <XCircle className="h-5 w-5 text-muted-foreground/40" />
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
                  className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(6,182,212,0.15))",
                    border: "1px solid rgba(99,102,241,0.4)"
                  }}
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #6366f1, #06b6d4)" }}
                  >
                    <Tv2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-foreground">Watch Ad</p>
                    <p className="text-xs text-muted-foreground">Restore +1 ❤️ and earn 2× Bonus Coins & XP</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-0.5">
                      <Heart className="h-3 w-3 fill-red-400" />+1
                    </span>
                    <span className="text-xs font-bold text-amber-400">2× Bonus</span>
                  </div>
                </button>
              ) : failBonus && (failBonus.coins > 0 || failBonus.xp > 0) ? (
                <div
                  className="w-full rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
                >
                  <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-green-400">Bonus claimed!</p>
                    <p className="text-xs text-muted-foreground">
                      +1 ❤️{failBonus.coins > 0 ? ` · +${failBonus.coins} coins` : ""}{failBonus.xp > 0 ? ` · +${failBonus.xp} XP` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="w-full rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}
                >
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <p className="text-xs font-bold text-green-400">+1 Heart restored!</p>
                </div>
              )}

              {/* Hearts count */}
              <div className="flex flex-col items-center gap-1.5 w-full border border-border/50 rounded-2xl py-3 bg-muted/20">
                <p className="text-xs text-muted-foreground font-medium">Hearts remaining</p>
                <HeartsDisplay hearts={hearts} maxHearts={maxHearts} nextRefillMs={nextRefillMs} size="md" />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              variant="outline"
              className="flex-1 border-border"
              onClick={() => setLocation(`/worlds/${worldId}`)}
            >
              <Map className="mr-2 h-4 w-4" />
              Back to Map
            </Button>
            {levelPassed ? (
              <Button
                className="flex-1 bg-gradient-to-r from-secondary to-primary text-white font-semibold"
                disabled={startingNext}
                onClick={handleNextLevel}
              >
                <Star className="mr-2 h-4 w-4 fill-current" />
                {startingNext ? "Loading…" : "Next Level →"}
              </Button>
            ) : canPlay || failAdClaimed ? (
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                disabled={startingNext}
                onClick={handleTryAgain}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {startingNext ? "Loading…" : "Try Again"}
              </Button>
            ) : (
              <Button
                className="flex-1 bg-muted text-muted-foreground cursor-not-allowed"
                disabled
              >
                <Heart className="mr-2 h-4 w-4 text-red-400 fill-red-400/50" />
                Wait for a heart to retry
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
                  ? { coins: Math.floor((answerResult.sessionScore / 10)) * 10, xp: (answerResult.sessionScore ?? 0) * 2 }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    );
  }

  if (session.status === "completed") {
    setLocation(`/results/${sessionId}`);
    return null;
  }

  if (!question) return null;

  const progress = (session.questionNumber / session.totalQuestions) * 100;
  const opts = question.options ?? [];

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
    <div className="flex-1 container max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col min-h-[calc(100vh-4rem)]">

      {/* Header Stats */}
      <div className="flex items-center justify-between mb-6 bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2">
          {isLevelMode ? (
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <span className="font-bold text-base">Level {levelNum}</span>
              </div>
              <HeartsDisplay hearts={hearts} maxHearts={maxHearts} nextRefillMs={nextRefillMs} size="sm" watchAd={watchAd} />
            </div>
          ) : (
            <>
              <Trophy className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">{session.score} pts</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-xl font-mono font-bold bg-muted px-4 py-2 rounded-lg border border-border">
          <Timer className={cn("h-5 w-5", timeLeft <= 5 ? "text-destructive animate-pulse" : "text-primary")} />
          <span className={timeLeft <= 5 ? "text-destructive" : ""}>
            00:{timeLeft.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm text-muted-foreground font-medium">Question {session.questionNumber} of {session.totalQuestions}</span>
          {isLevelMode && (
            <span className="text-[10px] text-muted-foreground/60">{worldName}</span>
          )}
        </div>
      </div>

      <Progress value={progress} className="h-2 mb-8 bg-muted" />

      {/* Question Card */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />

        {/* Audio player for audio type */}
        {qType === "audio" && (question as any).imageUrl && (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                <Music className="h-5 w-5 text-sky-400" />
              </div>
              <span className="text-sm text-sky-400 font-medium">Listen and answer</span>
            </div>
            <audio
              controls
              autoPlay
              src={(question as any).imageUrl}
              className="w-full rounded-lg"
            />
          </div>
        )}

        {/* Image for image type */}
        {qType === "image" && (question as any).imageUrl && (
          <div className="mb-4 rounded-xl overflow-hidden border border-border">
            <img src={(question as any).imageUrl} alt="Question" className="w-full max-h-56 object-cover" />
          </div>
        )}

        <h2 className="text-2xl md:text-3xl font-bold leading-tight">{question.question}</h2>

        {/* Type label */}
        {(qType === "ordering" || qType === "matching" || qType === "hotspot") && (
          <p className="text-sm text-muted-foreground mt-2">
            {qType === "ordering" && "Use the arrows to arrange items in the correct order."}
            {qType === "matching" && "Click a left item, then click the matching right item."}
            {qType === "hotspot" && "Click the correct region on the image below."}
          </p>
        )}
      </div>

      {/* ── MULTIPLE CHOICE / TRUE-FALSE / FILL_BLANK / AUDIO ── */}
      {(qType === "multiple_choice" || qType === "true_false" || qType === "fill_blank" || qType === "audio" || qType === "image") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {opts.map((option: string, index: number) => {
            const isSelected = selectedOption === index;
            const isCorrect = answerResult?.correctAnswer === index;
            const isWrongSelected = isSelected && !answerResult?.correct;

            let stateClass = "hover:border-primary/50 hover:bg-primary/5 border-border bg-card";
            if (answerResult) {
              if (isCorrect) stateClass = "bg-green-500/20 border-green-500 text-green-400";
              else if (isWrongSelected) stateClass = "bg-destructive/20 border-destructive text-destructive";
              else stateClass = "opacity-50 border-border bg-card";
            }

            return (
              <button
                key={index}
                disabled={!!answerResult || submitAnswer.isPending}
                onClick={() => handleOptionSelect(index)}
                className={cn("relative text-left p-6 rounded-xl border-2 transition-all duration-200 overflow-hidden", stateClass)}
              >
                <div className="flex justify-between items-center gap-4">
                  <span className="text-lg font-medium">{option}</span>
                  {answerResult && isCorrect && <CheckCircle2 className="h-6 w-6 shrink-0" />}
                  {answerResult && isWrongSelected && <XCircle className="h-6 w-6 shrink-0" />}
                </div>
              </button>
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
                className={cn("flex items-center gap-3 p-4 rounded-xl border-2 transition-all", itemClass)}
              >
                <span className="text-muted-foreground font-bold w-6 text-sm shrink-0">{idx + 1}.</span>
                <span className="flex-1 font-medium">{item}</span>
                {!answerResult && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => moveOrderingItem(idx, -1)}
                      disabled={idx === 0}
                      className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 transition-colors"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveOrderingItem(idx, 1)}
                      disabled={idx === orderedItems.length - 1}
                      className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 transition-colors"
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
              className="w-full bg-primary text-primary-foreground mt-2"
              size="lg"
            >
              Submit Order
            </Button>
          )}
          {answerResult && answerResult.correctAnswerData && (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground font-medium mb-2">Correct order:</p>
              <ol className="space-y-1">
                {(JSON.parse(answerResult.correctAnswerData) as string[]).map((item, i) => (
                  <li key={i} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground w-4 text-xs">{i + 1}.</span>
                    {item}
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
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-3">Match From</p>
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
                    className={cn("w-full text-left p-3 rounded-xl border-2 transition-all text-sm font-medium", cls)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{left}</span>
                      {isMatched && !answerResult && (
                        <span className="text-xs text-secondary font-normal shrink-0">→ {playerMatches[left]}</span>
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
                  <span className="text-primary">Select match for "{selectedLeft}"</span>
                ) : "Match To"}
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
                    className={cn("w-full text-left p-3 rounded-xl border-2 transition-all text-sm font-medium", cls)}
                  >
                    {right}
                  </button>
                );
              })}
            </div>
          </div>

          {!answerResult && (
            <Button
              onClick={handleMatchingSubmit}
              disabled={submitAnswer.isPending || Object.keys(playerMatches).length < leftItems.length}
              className="w-full bg-primary text-primary-foreground"
              size="lg"
            >
              {Object.keys(playerMatches).length < leftItems.length
                ? `Match ${leftItems.length - Object.keys(playerMatches).length} more`
                : "Submit Matches"}
            </Button>
          )}

          {answerResult && answerResult.correctAnswerData && (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground font-medium mb-2">Correct matches:</p>
              <div className="space-y-1">
                {Object.entries(JSON.parse(answerResult.correctAnswerData) as Record<string, string>).map(([l, r]) => (
                  <div key={l} className="text-sm flex items-center gap-2">
                    <span className="font-medium">{l}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HOTSPOT ── */}
      {qType === "hotspot" && (question as any).imageUrl && (
        <div className="mb-8 space-y-4">
          <div className="relative rounded-2xl overflow-hidden border-2 border-border group select-none">
            <img
              ref={hotspotImgRef}
              src={(question as any).imageUrl}
              alt="Click the correct region"
              onClick={handleHotspotClick}
              className={cn(
                "w-full max-h-96 object-cover",
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
                <p className="text-white text-sm font-medium drop-shadow">Click anywhere on the image to select your answer</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No image for hotspot fallback */}
      {qType === "hotspot" && !(question as any).imageUrl && (
        <div className="mb-8 rounded-xl border-2 border-dashed border-border bg-muted/10 p-10 text-center text-muted-foreground">
          <Crosshair className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No image available for this hotspot question.</p>
        </div>
      )}

      {/* Feedback Panel */}
      {answerResult && (
        <div className="mt-auto animate-in fade-in slide-in-from-bottom-4">
          <div className={cn(
            "p-6 rounded-xl border flex flex-col md:flex-row items-center justify-between gap-6",
            answerResult.correct ? "bg-green-500/10 border-green-500/30" : "bg-destructive/10 border-destructive/30"
          )}>
            <div className="flex items-center gap-4 text-center md:text-left">
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center shrink-0",
                answerResult.correct ? "bg-green-500/20 text-green-500" : "bg-destructive/20 text-destructive"
              )}>
                {answerResult.correct ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
              </div>
              <div>
                <h3 className={cn("font-bold text-xl", answerResult.correct ? "text-green-500" : "text-destructive")}>
                  {answerResult.correct ? "Correct!" : "Incorrect!"}
                </h3>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {answerResult.pointsEarned > 0 && (
                    <span className="text-sm font-semibold text-primary flex items-center gap-1">
                      <Trophy className="h-3.5 w-3.5" />+{answerResult.pointsEarned} pts
                    </span>
                  )}
                  {answerResult.coinsEarned > 0 && (
                    <span className="text-sm font-semibold text-amber-400 flex items-center gap-1">
                      <Gem className="h-3.5 w-3.5" />+{answerResult.coinsEarned} coins
                    </span>
                  )}
                </div>
                {answerResult.explanation && (
                  <p className="text-sm mt-2 max-w-xl text-muted-foreground">{answerResult.explanation}</p>
                )}
              </div>
            </div>

            {/* In level mode on last question, the overlay auto-appears — hide the button */}
            {!(isLevelMode && answerResult.isLastQuestion) && (
              <Button
                size="lg"
                onClick={handleNext}
                className={cn(
                  "w-full md:w-auto h-12 px-8 text-lg shrink-0",
                  answerResult.correct ? "bg-green-600 hover:bg-green-700 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
              >
                {answerResult.isLastQuestion ? "View Results" : "Next Question"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
