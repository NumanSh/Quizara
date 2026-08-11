import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Zap, Clock, CheckCircle2, XCircle, Gem, Trophy, Star, Flame, RotateCcw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PowerUpBar, { type PowerUpItem } from "@/components/PowerUpBar";
import PreGamePowerUpModal from "@/components/PreGamePowerUpModal";
import { authFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Translations } from "@/locales/en";

const BLITZ_DURATION = 90;

type BlitzState = "idle" | "loading" | "playing" | "completed";

interface BlitzQuestion {
  id: string;
  question: string;
  questionAr: string;
  questionType: string;
  options: string[];
  optionsAr: string[];
  difficulty: number;
  imageUrl: string | null;
}

interface TodayInfo {
  date: string;
  questionCount: number;
  hasPlayed: boolean;
  inProgress: boolean;
  attemptId: string | null;
  previousScore: number | null;
  previousCorrect: number | null;
  coinsEarned: number | null;
  pointsEarned: number | null;
  timeRemaining: number | null;
}

interface AnswerFeedback {
  isCorrect: boolean;
  correctAnswer: number;
  coinsEarned: number;
  pointsEarned: number;
  doubleScoreApplied?: boolean;
}

function difficultyLabels(t: Translations): Record<number, { label: string; color: string; multiplier: string }> {
  return {
    1: { label: t.blitz.easy, color: "text-green-400", multiplier: "×1" },
    2: { label: t.blitz.medium, color: "text-yellow-400", multiplier: "×2" },
    3: { label: t.blitz.hard, color: "text-red-400", multiplier: "×3" },
  };
}

function DifficultyPip({ difficulty }: { difficulty: number }) {
  const { t } = useI18n();
  const labels = difficultyLabels(t);
  const cfg = labels[difficulty] ?? labels[1];
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border border-white/10 bg-white/5", cfg.color)}>
      {cfg.label} {cfg.multiplier}
    </span>
  );
}

export default function Blitz() {
  const { t } = useI18n();
  const { isAuthenticated, user } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // ── Power-up state ──────────────────────────────────────────────────────────
  const [showPreGameModal, setShowPreGameModal] = useState(false);
  const [powerUpInventory, setPowerUpInventory] = useState<PowerUpItem[]>([]);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [usedEffects, setUsedEffects] = useState<Set<string>>(new Set());
  const [doubleScoreRemaining, setDoubleScoreRemaining] = useState(0);
  const [doubleScoreItemId, setDoubleScoreItemId] = useState<string | null>(null);
  // ────────────────────────────────────────────────────────────────────────────

  const [state, setState] = useState<BlitzState>("idle");
  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null);
  const [questions, setQuestions] = useState<BlitzQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(BLITZ_DURATION);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCoins, setTotalCoins] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const completeBlitz = useCallback(async (aId: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    stopTimer();
    setState("completed");
    try {
      await authFetch(`/api/blitz/${aId}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // ignore
    }
  }, [stopTimer]);

  const startTimer = useCallback((initial: number, aId: string) => {
    setTimeLeft(initial);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          completeBlitz(aId);
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [completeBlitz]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchToday();
  }, [isAuthenticated]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  async function fetchInventory() {
    if (!isAuthenticated) return;
    try {
      const res = await authFetch("/api/marketplace/inventory", { credentials: "include" });
      const data = await res.json();
      const pus = (Array.isArray(data) ? data : []).filter(
        (i: any) => i.type === "powerup" && i.quantity > 0 &&
          ["fifty_fifty", "extra_time", "skip_question", "double_score"].includes(i.effect)
      );
      setPowerUpInventory(pus.map((i: any) => ({
        itemId: i.itemId, effect: i.effect, emoji: i.emoji, name: i.name, quantity: i.quantity,
      })));
    } catch {}
  }

  async function fetchToday() {
    try {
      const res = await authFetch("/api/blitz/today", { credentials: "include" });
      const data = await res.json();
      setTodayInfo(data);
      if (data.inProgress && data.attemptId) {
        setAttemptId(data.attemptId);
      }
    } catch {
      toast({ title: t.blitz.loadFailed, variant: "destructive" });
    }
  }

  async function handleBlitzPowerUp(itemId: string, effect: string) {
    const q = questions[currentIdx];
    if (!q) return;

    if (effect === "fifty_fifty") {
      try {
        const res = await authFetch("/api/powerups/fifty-fifty", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: q.id, itemId }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.eliminatedOptions?.length) {
          setHiddenOptions(data.eliminatedOptions);
          setPowerUpInventory(prev => prev.map(p => p.itemId === itemId ? { ...p, quantity: p.quantity - 1 } : p).filter(p => p.quantity > 0));
          setUsedEffects(prev => new Set([...prev, effect]));
          toast({ title: t.blitz.fiftyActivated, description: t.blitz.fiftyActivatedDesc });
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
      toast({ title: t.blitz.doubleArmed, description: t.blitz.doubleArmedDesc });
      return;
    }

    // Consume item for other power-ups
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
        setTimeLeft(t => Math.min(t + 15, BLITZ_DURATION + 15));
        toast({ title: t.blitz.timeAdded });
        break;
      case "skip_question": {
        setUsedEffects(prev => new Set([...prev, effect]));
        setFeedback(null);
        setSelectedOption(null);
        const nextIdx = currentIdx + 1;
        setHiddenOptions([]);
        setUsedEffects(new Set());
        if (nextIdx >= questions.length) {
          completeBlitz(attemptId!);
        } else {
          setCurrentIdx(nextIdx);
        }
        toast({ title: t.blitz.skipped });
        return;
      }
    }
    setUsedEffects(prev => new Set([...prev, effect]));
  }

  async function handleStart() {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }

    // Show pre-game modal first (fetch inventory in background)
    fetchInventory();
    setShowPreGameModal(true);
  }

  async function doStart() {
    setShowPreGameModal(false);
    setState("loading");
    completedRef.current = false;
    try {
      const res = await authFetch("/api/blitz/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          await fetchToday();
          setState("idle");
          toast({ title: err.error ?? t.blitz.alreadyPlayedError, variant: "destructive" });
          return;
        }
        throw new Error(err.error);
      }
      const data = await res.json();
      setQuestions(data.questions);
      setAttemptId(data.attemptId);
      setCurrentIdx(data.answeredCount ?? 0);
      setAnsweredCount(data.answeredCount ?? 0);
      setScore(0);
      setCorrectCount(0);
      setTotalCoins(0);
      setTotalPoints(0);
      setFeedback(null);
      setSelectedOption(null);
      setState("playing");
      startTimer(data.timeRemaining ?? BLITZ_DURATION, data.attemptId);
    } catch (err: any) {
      setState("idle");
      toast({ title: err.message ?? t.blitz.startFailed, variant: "destructive" });
    }
  }

  async function handleAnswer(optionIndex: number) {
    if (!attemptId || isSubmitting || feedback !== null) return;
    const q = questions[currentIdx];
    if (!q) return;

    setSelectedOption(optionIndex);
    setIsSubmitting(true);

    try {
      const useDouble = doubleScoreRemaining > 0 && doubleScoreItemId !== null;
      const res = await authFetch(`/api/blitz/${attemptId}/answer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: q.id,
          selectedAnswer: optionIndex,
          ...(useDouble ? { doubleScore: true, doubleScoreItemId } : {}),
        }),
      });

      if (res.status === 409) {
        completeBlitz(attemptId);
        return;
      }

      if (!res.ok) {
        // The answer was not recorded (e.g. the power-up was rejected). Let the
        // player retry rather than showing an empty feedback card.
        const body = await res.json().catch(() => ({}));
        toast({ title: t.blitz.answerNotRecorded, description: body.error ?? t.blitz.pleaseTryAgain, variant: "destructive" });
        setSelectedOption(null);
        setIsSubmitting(false);
        return;
      }

      const data: AnswerFeedback = await res.json();
      setFeedback(data);
      setAnsweredCount((p) => p + 1);

      if (data.doubleScoreApplied) {
        setDoubleScoreRemaining(0);
        setDoubleScoreItemId(null);
        setPowerUpInventory(prev =>
          prev.map(p => p.itemId === doubleScoreItemId ? { ...p, quantity: p.quantity - 1 } : p).filter(p => p.quantity > 0)
        );
      }

      if (data.isCorrect) {
        setCorrectCount((p) => p + 1);
        // pointsEarned already includes the double-score multiplier
        setScore((p) => p + data.pointsEarned);
        setTotalCoins((p) => p + data.coinsEarned);
        setTotalPoints((p) => p + data.pointsEarned);
      }

      setTimeout(() => {
        setFeedback(null);
        setSelectedOption(null);
        setIsSubmitting(false);
        setHiddenOptions([]);
        setUsedEffects(new Set());
        const nextIdx = currentIdx + 1;
        if (nextIdx >= questions.length) {
          completeBlitz(attemptId!);
        } else {
          setCurrentIdx(nextIdx);
        }
      }, 500);
    } catch {
      setIsSubmitting(false);
      setSelectedOption(null);
    }
  }

  const timerPercent = (timeLeft / BLITZ_DURATION) * 100;
  const timerColor = timeLeft > 30 ? "bg-emerald-500" : timeLeft > 10 ? "bg-amber-400" : "bg-red-500";
  const timerPulse = timeLeft <= 10;

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
        <div className="h-20 w-20 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
          <Zap className="h-10 w-10 text-orange-400" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-foreground mb-2">{t.blitz.title}</h1>
          <p className="text-muted-foreground">{t.blitz.signInHint}</p>
        </div>
        <Button onClick={() => setLocation("/login")} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8">
          {t.blitz.signInBtn}
        </Button>
      </div>
    );
  }

  if (showPreGameModal) {
    return (
      <PreGamePowerUpModal
        isOpen={true}
        onPlay={(pus) => {
          if (pus.length > 0) setPowerUpInventory(pus);
          doStart();
        }}
        isAuthenticated={isAuthenticated}
        allowedEffects={["fifty_fifty", "extra_time", "skip_question", "double_score"]}
        theme="blitz"
      />
    );
  }

  if (state === "playing") {
    const q = questions[currentIdx];
    if (!q) return null;

    return (
      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className={cn("flex items-center gap-2 text-2xl font-black tabular-nums", timerPulse && "animate-pulse")}>
            <Clock className={cn("h-6 w-6", timeLeft > 30 ? "text-emerald-400" : timeLeft > 10 ? "text-amber-400" : "text-red-500")} />
            <span className={timeLeft > 30 ? "text-emerald-400" : timeLeft > 10 ? "text-amber-400" : "text-red-500"}>
              {timeLeft}s
            </span>
          </div>
          <div className="flex-1">
            <Progress value={timerPercent} className="h-3 bg-white/10" indicatorClassName={timerColor} />
          </div>
          <div className="flex items-center gap-3 text-sm font-bold">
            <span className="flex items-center gap-1 text-amber-400">
              <Gem className="h-4 w-4" />{totalCoins}
            </span>
            <span className="flex items-center gap-1 text-secondary">
              <Star className="h-4 w-4" />{score}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{currentIdx + 1} / {questions.length}</span>
          <span className="text-green-400 font-bold">{correctCount} {t.blitz.correctSuffix}</span>
          <DifficultyPip difficulty={q.difficulty} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-xl">
          <p className="text-lg font-semibold text-foreground leading-snug">{q.question}</p>
        </div>

        {/* Power-up bar */}
        {feedback === null && (
          <div>
            {doubleScoreRemaining > 0 && (
              <div className="flex justify-center mb-2">
                <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 text-xs font-semibold">{t.blitz.doubleScoreArmedBadge}</span>
              </div>
            )}
            <PowerUpBar
              powerUps={powerUpInventory}
              usedEffects={usedEffects}
              doubleScoreRemaining={doubleScoreRemaining}
              shieldActive={false}
              frozenTimer={false}
              onUse={handleBlitzPowerUp}
              disabled={feedback !== null || isSubmitting}
              allowedEffects={["fifty_fifty", "extra_time", "skip_question", "double_score"]}
              currentQuestionType={q.questionType}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {q.options.map((opt, idx) => {
            const isHidden = hiddenOptions.includes(idx) && feedback === null;
            if (isHidden) return (
              <div key={idx} className="w-full px-5 py-4 rounded-xl border border-white/5 bg-white/3 opacity-20 cursor-not-allowed select-none">
                <span className="text-transparent">—</span>
              </div>
            );

            const isSelected = selectedOption === idx;
            const isCorrectOpt = feedback !== null && idx === feedback.correctAnswer;
            const isWrongOpt = feedback !== null && isSelected && !feedback.isCorrect;

            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={feedback !== null || isSubmitting}
                className={cn(
                  "w-full text-left px-5 py-4 rounded-xl border font-semibold text-sm transition-all duration-150 active:scale-[0.98]",
                  feedback === null
                    ? "border-white/10 bg-white/5 hover:border-orange-400/50 hover:bg-orange-500/10 hover:text-orange-300"
                    : isCorrectOpt
                      ? "border-green-500 bg-green-500/20 text-green-300"
                      : isWrongOpt
                        ? "border-red-500 bg-red-500/20 text-red-300"
                        : "border-white/5 bg-white/3 text-muted-foreground opacity-60"
                )}
              >
                <span className="flex items-center gap-3">
                  <span className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                    feedback === null ? "bg-white/10 text-muted-foreground" : isCorrectOpt ? "bg-green-500 text-white" : isWrongOpt ? "bg-red-500 text-white" : "bg-white/5 text-muted-foreground"
                  )}>
                    {["A", "B", "C", "D"][idx]}
                  </span>
                  {opt}
                  {isCorrectOpt && <CheckCircle2 className="ml-auto h-4 w-4 text-green-400 shrink-0" />}
                  {isWrongOpt && <XCircle className="ml-auto h-4 w-4 text-red-400 shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center gap-1 flex-wrap mt-2">
          {questions.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i < currentIdx ? "w-4 bg-orange-400" : i === currentIdx ? "w-6 bg-orange-300" : "w-4 bg-white/10"
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  if (state === "completed") {
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
    return (
      <div className="max-w-lg mx-auto p-6 flex flex-col items-center gap-6 text-center">
        <div className="relative">
          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-orange-500/30 to-yellow-500/20 border border-orange-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.3)]">
            <Zap className="h-12 w-12 text-orange-400" />
          </div>
          <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-yellow-400 flex items-center justify-center text-black text-xs font-black">
            ⚡
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-black text-foreground">{t.blitz.completed}</h1>
          <p className="text-muted-foreground mt-1">{t.blitz.todayFinishedDesc}</p>
        </div>

        <div className="w-full grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-secondary">{score}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.blitz.totalScore}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-amber-400">{totalCoins}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><Gem className="h-3 w-3" />{t.blitz.coinsEarnedLabel}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-green-400">{correctCount}/{answeredCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.blitz.correctAnswersLabel}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-violet-400">{accuracy}%</p>
            <p className="text-xs text-muted-foreground mt-1">{t.blitz.accuracy}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 w-full">
          <div className="flex items-center gap-2 text-orange-400 text-sm font-bold">
            <Calendar className="h-4 w-4" />
            {t.blitz.comeBackForBlitz}
          </div>
        </div>

        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1 border-white/10"
            onClick={() => setLocation("/leaderboard")}
          >
            <Trophy className="h-4 w-4 mr-2" />
            {t.blitz.viewLeaderboard}
          </Button>
          <Button
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold"
            onClick={() => setLocation("/")}
          >
            {t.arena.home}
          </Button>
        </div>
      </div>
    );
  }

  const alreadyPlayed = todayInfo?.hasPlayed;
  const hasInProgress = todayInfo?.inProgress;

  return (
    <div className="max-w-lg mx-auto p-6 flex flex-col gap-6">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="relative">
          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-orange-500/30 to-yellow-500/20 border border-orange-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.2)]">
            <Zap className="h-12 w-12 text-orange-400" />
          </div>
          <div className="absolute -top-2 -right-2">
            <span className="text-[10px] font-black px-2 py-1 rounded-full bg-red-500 text-white uppercase tracking-wide animate-pulse">
              {t.blitz.dailyBadge}
            </span>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-black text-foreground">{t.blitz.title}</h1>
          <p className="text-muted-foreground mt-1">{t.blitz.subtitle90}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Clock, label: t.blitz.ninetySeconds, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { icon: Flame, label: t.blitz.speedMode, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { icon: Gem, label: t.blitz.earnCoins, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
        ].map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className={cn("rounded-xl border p-3 flex flex-col items-center gap-2", bg)}>
            <Icon className={cn("h-5 w-5", color)} />
            <p className="text-xs font-bold text-foreground text-center">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-card/60 p-5 space-y-3">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-400" />
          {t.blitz.howItWorks}
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            t.blitz.tip1,
            t.blitz.tip2,
            t.blitz.tip3,
            t.blitz.tip4,
            t.blitz.tip5,
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card/60 p-4">
        <div className="text-xs text-muted-foreground mb-1">{t.blitz.coinRewardsHeading}</div>
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-green-400 font-bold text-sm"><Gem className="h-3 w-3" />{t.blitz.easyReward}</span>
          <span className="flex items-center gap-1 text-yellow-400 font-bold text-sm"><Gem className="h-3 w-3" />{t.blitz.mediumReward}</span>
          <span className="flex items-center gap-1 text-red-400 font-bold text-sm"><Gem className="h-3 w-3" />{t.blitz.hardReward}</span>
        </div>
      </div>

      {alreadyPlayed && todayInfo && (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-400 font-bold">
            <CheckCircle2 className="h-5 w-5" />
            {t.blitz.playedToday}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-black text-secondary">{todayInfo.previousScore ?? 0}</p>
              <p className="text-xs text-muted-foreground">{t.topbar.score}</p>
            </div>
            <div>
              <p className="text-2xl font-black text-green-400">{todayInfo.previousCorrect ?? 0}</p>
              <p className="text-xs text-muted-foreground">{t.blitz.correctLabel}</p>
            </div>
            <div>
              <p className="text-2xl font-black text-amber-400">{todayInfo.coinsEarned ?? 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Gem className="h-3 w-3" />{t.blitz.coins}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">{t.blitz.comeBackTomorrow}</p>
        </div>
      )}

      {!alreadyPlayed && (
        <Button
          size="lg"
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-lg h-14 shadow-lg shadow-orange-500/20"
          onClick={handleStart}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <span className="flex items-center gap-2">
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t.blitz.starting}
            </span>
          ) : hasInProgress ? (
            <span className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              {t.blitz.resumeBlitz}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t.blitz.startBlitz.replace("{count}", String(todayInfo?.questionCount ?? 30))}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
