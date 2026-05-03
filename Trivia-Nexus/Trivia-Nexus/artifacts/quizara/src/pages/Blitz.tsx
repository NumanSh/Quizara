import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Zap, Clock, CheckCircle2, XCircle, Gem, Trophy, Star, Flame, RotateCcw, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
}

const DIFFICULTY_LABELS: Record<number, { label: string; color: string; multiplier: string }> = {
  1: { label: "Easy", color: "text-green-400", multiplier: "×1" },
  2: { label: "Medium", color: "text-yellow-400", multiplier: "×2" },
  3: { label: "Hard", color: "text-red-400", multiplier: "×3" },
};

function DifficultyPip({ difficulty }: { difficulty: number }) {
  const cfg = DIFFICULTY_LABELS[difficulty] ?? DIFFICULTY_LABELS[1];
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border border-white/10 bg-white/5", cfg.color)}>
      {cfg.label} {cfg.multiplier}
    </span>
  );
}

export default function Blitz() {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
      await fetch(`/api/blitz/${aId}/complete`, {
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

  async function fetchToday() {
    try {
      const res = await fetch("/api/blitz/today", { credentials: "include" });
      const data = await res.json();
      setTodayInfo(data);
      if (data.inProgress && data.attemptId) {
        setAttemptId(data.attemptId);
      }
    } catch {
      toast({ title: "Failed to load blitz", variant: "destructive" });
    }
  }

  async function handleStart() {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    setState("loading");
    completedRef.current = false;
    try {
      const res = await fetch("/api/blitz/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          await fetchToday();
          setState("idle");
          toast({ title: err.error ?? "Already played today", variant: "destructive" });
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
      toast({ title: err.message ?? "Failed to start blitz", variant: "destructive" });
    }
  }

  async function handleAnswer(optionIndex: number) {
    if (!attemptId || isSubmitting || feedback !== null) return;
    const q = questions[currentIdx];
    if (!q) return;

    setSelectedOption(optionIndex);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/blitz/${attemptId}/answer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, selectedAnswer: optionIndex }),
      });

      if (res.status === 409) {
        completeBlitz(attemptId);
        return;
      }

      const data: AnswerFeedback = await res.json();
      setFeedback(data);
      setAnsweredCount((p) => p + 1);
      if (data.isCorrect) {
        setCorrectCount((p) => p + 1);
        setScore((p) => p + data.pointsEarned);
        setTotalCoins((p) => p + data.coinsEarned);
        setTotalPoints((p) => p + data.pointsEarned);
      }

      setTimeout(() => {
        setFeedback(null);
        setSelectedOption(null);
        setIsSubmitting(false);
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
          <h1 className="text-3xl font-black text-foreground mb-2">Daily Blitz</h1>
          <p className="text-muted-foreground">Sign in to play the daily 90-second speed challenge</p>
        </div>
        <Button onClick={() => setLocation("/login")} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8">
          Sign In to Play
        </Button>
      </div>
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
          <span className="text-green-400 font-bold">{correctCount} correct</span>
          <DifficultyPip difficulty={q.difficulty} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-xl">
          <p className="text-lg font-semibold text-foreground leading-snug">{q.question}</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {q.options.map((opt, idx) => {
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
          <h1 className="text-3xl font-black text-foreground">Blitz Complete!</h1>
          <p className="text-muted-foreground mt-1">Today's challenge finished</p>
        </div>

        <div className="w-full grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-secondary">{score}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Score</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-amber-400">{totalCoins}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><Gem className="h-3 w-3" />Coins Earned</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-green-400">{correctCount}/{answeredCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Correct Answers</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/60 p-5">
            <p className="text-3xl font-black text-violet-400">{accuracy}%</p>
            <p className="text-xs text-muted-foreground mt-1">Accuracy</p>
          </div>
        </div>

        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 w-full">
          <div className="flex items-center gap-2 text-orange-400 text-sm font-bold">
            <Calendar className="h-4 w-4" />
            Come back tomorrow for a new Blitz!
          </div>
        </div>

        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1 border-white/10"
            onClick={() => setLocation("/leaderboard")}
          >
            <Trophy className="h-4 w-4 mr-2" />
            Leaderboard
          </Button>
          <Button
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold"
            onClick={() => setLocation("/")}
          >
            Home
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
              DAILY
            </span>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-black text-foreground">Daily Blitz</h1>
          <p className="text-muted-foreground mt-1">90 seconds. Answer as many as you can. Pure speed.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Clock, label: "90 Seconds", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { icon: Flame, label: "Speed Mode", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { icon: Gem, label: "Earn Coins", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
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
          How it works
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "All players answer the same questions today",
            "Answer instantly — no waiting between questions",
            "Each correct answer earns coins based on difficulty",
            "Score = correct answers × difficulty multiplier",
            "A fresh set of questions every day",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card/60 p-4">
        <div className="text-xs text-muted-foreground mb-1">Coin rewards per correct answer</div>
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-green-400 font-bold text-sm"><Gem className="h-3 w-3" />Easy: 5</span>
          <span className="flex items-center gap-1 text-yellow-400 font-bold text-sm"><Gem className="h-3 w-3" />Medium: 10</span>
          <span className="flex items-center gap-1 text-red-400 font-bold text-sm"><Gem className="h-3 w-3" />Hard: 15</span>
        </div>
      </div>

      {alreadyPlayed && todayInfo && (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-400 font-bold">
            <CheckCircle2 className="h-5 w-5" />
            You've played today!
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-black text-secondary">{todayInfo.previousScore ?? 0}</p>
              <p className="text-xs text-muted-foreground">Score</p>
            </div>
            <div>
              <p className="text-2xl font-black text-green-400">{todayInfo.previousCorrect ?? 0}</p>
              <p className="text-xs text-muted-foreground">Correct</p>
            </div>
            <div>
              <p className="text-2xl font-black text-amber-400">{todayInfo.coinsEarned ?? 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Gem className="h-3 w-3" />Coins</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">Come back tomorrow for a new challenge!</p>
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
              Starting...
            </span>
          ) : hasInProgress ? (
            <span className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Resume Blitz
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Start Blitz — {todayInfo?.questionCount ?? 30} Questions
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
