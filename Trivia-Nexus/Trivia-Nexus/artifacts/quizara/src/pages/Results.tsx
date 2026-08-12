import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { getGetProfileQueryKey, getGetQuizSessionQueryKey, useCompleteQuiz, useGetQuizSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronRight, Clock3, Crown, Heart, LayoutGrid, Link2, Loader2, RotateCcw, Sparkles, Target, Trophy, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GameShell } from "@/components/quiz/GameShell";
import { StreakMilestoneModal } from "@/components/StreakMilestoneModal";
import { WatchAdModal } from "@/components/WatchAdModal";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";
import { showVignetteAtBreak } from "@/lib/ads";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const AD_XP = 50;

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function Results() {
  const { sessionId } = useParams();
  const [, setLocation] = useLocation();
  const reduceMotion = useReducedMotion();
  const { isAuthenticated } = useSupabaseAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [milestone, setMilestone] = useState<{ streak: number; coins: number } | null>(null);
  const [showXpAd, setShowXpAd] = useState(false);
  const [startingAgain, setStartingAgain] = useState(false);
  const [challengeCtx, setChallengeCtx] = useState<{ code: string; playerName: string } | null>(null);
  const [challengeRank, setChallengeRank] = useState<number | null>(null);
  const challengeSubmitted = useRef(false);

  const { data: session, isLoading, isError, refetch } = useGetQuizSession(sessionId || "", {
    query: {
      queryKey: getGetQuizSessionQueryKey(sessionId || ""),
      enabled: !!sessionId,
    },
  });

  const completeQuiz = useCompleteQuiz({ mutation: { onSuccess: () => {} } });

  useEffect(() => {
    if (!session || !sessionId) return;
    if (session.status === "active") {
      setLocation(`/quiz/${sessionId}`);
      return;
    }
    if (!completeQuiz.data && !completeQuiz.isPending) completeQuiz.mutate({ sessionId });
  }, [session?.status, sessionId]);

  // A finished quiz is the one moment a full-screen ad interrupts nothing. Skip
  // it while the session is still active — that render is on its way back to the
  // quiz, and an ad there would land mid-question.
  useEffect(() => {
    if (!session || session.status === "active") return;
    showVignetteAtBreak();
  }, [session?.status]);

  useEffect(() => {
    const raw = sessionStorage.getItem("challenge_ctx");
    if (!raw) return;
    try {
      const ctx = JSON.parse(raw) as { code: string; playerName: string };
      if (ctx.code) setChallengeCtx(ctx);
    } catch {}
  }, []);

  useEffect(() => {
    if (!challengeCtx || !session || session.status !== "completed" || challengeSubmitted.current) return;
    challengeSubmitted.current = true;
    sessionStorage.removeItem("challenge_ctx");
    authFetch(`/api/challenges/${challengeCtx.code}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, playerName: challengeCtx.playerName }),
    })
      .then(response => response.json())
      .then(data => { if (data.rank) setChallengeRank(data.rank); })
      .catch(() => {});
  }, [session?.status, challengeCtx, sessionId]);

  useEffect(() => {
    const raw = sessionStorage.getItem("streak_milestone");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { streak: number; coins: number };
      if (data.streak && data.coins) window.setTimeout(() => setMilestone(data), 600);
    } catch {}
    sessionStorage.removeItem("streak_milestone");
  }, []);

  const handleAdComplete = async () => {
    const response = await authFetch("/api/battlepass/watch-ad-xp", { method: "POST" });
    if (response.ok) {
      toast({ title: `+${AD_XP} XP`, description: t.results.xpAdded });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    }
    setShowXpAd(false);
  };

  const handlePlayAgain = async () => {
    if (!session) return;
    setStartingAgain(true);
    try {
      const response = await authFetch("/api/quiz/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: session.categoryId, questionCount: session.totalQuestions }),
      });
      const data = await response.json();
      if (!response.ok || !data.sessionId) throw new Error(data.error || t.results.startError);
      setLocation(`/quiz/${data.sessionId}`);
    } catch (error: any) {
      toast({ title: t.results.startError, description: error?.message ?? t.results.tryAgain, variant: "destructive" });
      setStartingAgain(false);
    }
  };

  if (isLoading) {
    return (
      <GameShell index="RESULT / 00" label={t.results.label} exitLabel={t.results.exit} onExit={() => setLocation("/categories")} compact>
        <div className="grid min-h-[70vh] content-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5"><Skeleton className="h-4 w-36 rounded-none" /><Skeleton className="h-24 w-full max-w-xl rounded-none" /><Skeleton className="h-5 w-72 rounded-none" /></div>
          <Skeleton className="aspect-square w-full max-w-sm justify-self-end rounded-full" />
        </div>
      </GameShell>
    );
  }

  if (isError || !session) {
    return (
      <GameShell index="RESULT / --" label={t.results.label} exitLabel={t.results.exit} onExit={() => setLocation("/categories")} compact>
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-start justify-center">
          <span className="mb-8 text-7xl font-black leading-none text-primary/20">404</span>
          <h1 className="text-4xl font-extrabold tracking-[-0.05em] sm:text-6xl">{t.results.notFound}</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{t.results.notFoundHint}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => refetch()} className="rounded-none"><RotateCcw className="mr-2 h-4 w-4" />{t.results.retry}</Button>
            <Button variant="outline" onClick={() => setLocation("/categories")} className="rounded-none">{t.results.exit}</Button>
          </div>
        </div>
      </GameShell>
    );
  }

  const summary = completeQuiz.data;
  const totalQuestions = summary?.totalQuestions ?? session.totalQuestions ?? 0;
  const score = summary?.score ?? session.score ?? 0;
  const correctAnswers = summary?.correctAnswers ?? session.correctAnswers ?? 0;
  const wrongAnswers = Math.max(0, totalQuestions - correctAnswers);
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const timeTaken = summary?.timeTaken ?? 0;
  const rank = summary?.rank ?? null;

  const grade = accuracy >= 90
    ? { label: t.results.grades.outstanding, note: t.results.gradeNotes.outstanding, tone: "text-primary" }
    : accuracy >= 70
      ? { label: t.results.grades.great, note: t.results.gradeNotes.great, tone: "text-foreground" }
      : accuracy >= 50
        ? { label: t.results.grades.good, note: t.results.gradeNotes.good, tone: "text-foreground" }
        : { label: t.results.grades.practice, note: t.results.gradeNotes.practice, tone: "text-foreground" };

  const metrics = [
    { label: t.results.correct, value: correctAnswers, icon: Check, accent: "text-emerald-400" },
    { label: t.results.incorrect, value: wrongAnswers, icon: X, accent: "text-rose-400" },
    { label: t.results.time, value: timeTaken ? formatDuration(timeTaken) : "—", icon: Clock3, accent: "text-primary" },
    { label: t.results.rank, value: rank ? `#${rank}` : "—", icon: Crown, accent: "text-amber-300" },
  ];

  return (
    <GameShell index="RESULT / 01" label={t.results.label} exitLabel={t.results.exit} onExit={() => setLocation("/categories")} compact>
      <section className="grid min-h-[52vh] items-center gap-10 border-b border-white/10 pb-10 sm:pb-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
        <div>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground"><span className="text-primary">01</span><span className="h-px w-10 bg-white/15" />{session.categoryName || t.results.quiz}</div>
          <h1 className={cn("mt-8 max-w-3xl text-[clamp(3.25rem,8vw,7.5rem)] font-extrabold leading-[0.82] tracking-[-0.075em]", grade.tone)}>{grade.label}</h1>
          <p className="mt-7 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">{grade.note}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button onClick={handlePlayAgain} disabled={startingAgain} size="lg" className="focus-ring min-h-12 rounded-none px-6 text-xs font-extrabold uppercase tracking-[0.14em]">
              {startingAgain ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}{startingAgain ? t.results.starting : t.results.playAgain}
            </Button>
            <Button variant="outline" size="lg" onClick={() => setLocation(`/worlds/${session.categoryId}`)} className="focus-ring min-h-12 rounded-none border-white/15 px-6 text-xs font-bold uppercase tracking-[0.14em]"><LayoutGrid className="mr-2 h-4 w-4" />{t.results.backToWorld}</Button>
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.9, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto aspect-square w-full max-w-[25rem]"
        >
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute inset-[10%] rounded-full border border-dashed border-primary/25" />
          <div className="absolute inset-[22%] grid place-items-center rounded-full bg-primary text-primary-foreground">
            <div className="text-center"><span className="block text-[clamp(4.5rem,11vw,7.5rem)] font-black leading-none tracking-[-0.09em]">{accuracy}</span><span className="mt-1 block text-[9px] font-extrabold uppercase tracking-[0.28em]">{t.results.accuracy} / 100</span></div>
          </div>
          <span className="absolute right-[4%] top-[18%] grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-background text-primary"><Target className="h-5 w-5" /></span>
          <span className="absolute bottom-[12%] left-[3%] flex items-center gap-2 bg-background px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground"><Trophy className="h-4 w-4 text-primary" />{score} {t.results.points}</span>
        </motion.div>
      </section>

      <section className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4" aria-label={t.results.performance}>
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div key={metric.label} initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.25 + index * 0.06, ease: [0.16, 1, 0.3, 1] }} className="flex min-h-28 flex-col justify-between border-white/10 p-4 even:border-l sm:min-h-36 sm:border-l sm:p-6 first:sm:border-l-0 rtl:even:border-l-0 rtl:even:border-r rtl:sm:border-l-0 rtl:sm:border-r rtl:first:sm:border-r-0">
              <Icon className={cn("h-4 w-4", metric.accent)} />
              <div><strong className="block text-3xl font-extrabold tracking-[-0.05em] sm:text-4xl">{metric.value}</strong><span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{metric.label}</span></div>
            </motion.div>
          );
        })}
      </section>

      <div id="review-mistakes-slot" data-feature-slot="review-mistakes" />

      <section className="grid gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_22rem] lg:gap-20">
        <div>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground"><span className="text-primary">02</span><span className="h-px w-10 bg-white/15" />{t.results.breakdown}</div>
          <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
            <div className="flex min-h-14 items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{t.results.questions}</span><strong>{totalQuestions}</strong></div>
            <div className="flex min-h-14 items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{t.results.correct}</span><strong>{correctAnswers} / {totalQuestions}</strong></div>
            <div className="flex min-h-16 items-center justify-between gap-4"><span className="font-bold">{t.results.finalScore}</span><strong className="text-2xl font-black text-primary">{score} {t.results.points}</strong></div>
          </div>

          {challengeCtx && (
            <div className="mt-8 flex items-center gap-4 border-y border-white/10 py-5">
              {challengeRank === 1 ? <Crown className="h-6 w-6 shrink-0 text-amber-300" /> : <Link2 className="h-6 w-6 shrink-0 text-primary" />}
              <div className="min-w-0 flex-1"><p className="font-bold">{challengeRank === 1 ? t.results.challengeFirst : challengeRank ? `${t.results.challengeRank} #${challengeRank}` : t.results.challengeSubmitted}</p><p className="mt-1 text-xs text-muted-foreground">{t.results.challengeHint}</p></div>
              <button type="button" onClick={() => setLocation(`/challenge/${challengeCtx.code}`)} className="focus-ring flex min-h-11 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-primary">{t.results.viewBoard}<ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
            </div>
          )}
        </div>

        <aside className="lg:border-l lg:border-white/10 lg:pl-8 rtl:lg:border-l-0 rtl:lg:border-r rtl:lg:pl-0 rtl:lg:pr-8">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="mt-5 text-2xl font-extrabold tracking-[-0.04em]">{t.results.nextMove}</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{t.results.nextMoveHint}</p>
          <button type="button" onClick={handlePlayAgain} disabled={startingAgain} className="focus-ring group mt-7 flex min-h-12 w-full items-center justify-between border-b border-primary py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-50"><span>{t.results.playAgain}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" /></button>
          <button type="button" onClick={() => setLocation("/categories")} className="focus-ring mt-3 flex min-h-12 w-full items-center justify-between border-b border-white/10 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"><span>{t.results.explore}</span><ArrowRight className="h-4 w-4 rtl:rotate-180" /></button>

          {isAuthenticated && (
            <button type="button" onClick={() => setShowXpAd(true)} className="focus-ring mt-9 flex w-full items-start gap-3 border border-white/10 p-4 text-left transition-colors hover:border-primary/40 rtl:text-right">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span><strong className="block text-sm">{t.results.boost}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t.results.boostHint.replace("{xp}", String(AD_XP))}</span></span>
            </button>
          )}
        </aside>
      </section>

      {showXpAd && <WatchAdModal xpMode={AD_XP} onComplete={handleAdComplete} onClose={() => setShowXpAd(false)} />}
      {milestone && <StreakMilestoneModal streak={milestone.streak} coinsAwarded={milestone.coins} onClose={() => setMilestone(null)} />}
    </GameShell>
  );
}
