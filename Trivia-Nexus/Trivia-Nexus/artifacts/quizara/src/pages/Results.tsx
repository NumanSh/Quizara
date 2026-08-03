import { useParams, useLocation } from "wouter";
import { useGetQuizSession, getGetQuizSessionQueryKey, useCompleteQuiz, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Target, Zap, RotateCcw, LayoutGrid, CheckCircle2, XCircle, ChevronRight, Link2, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { StreakMilestoneModal } from "@/components/StreakMilestoneModal";
import { WatchAdModal } from "@/components/WatchAdModal";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";

const AD_XP = 50;

export default function Results() {
  const { sessionId } = useParams();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [milestone, setMilestone] = useState<{ streak: number; coins: number } | null>(null);
  const [showXpAd, setShowXpAd] = useState(false);
  const [challengeCtx, setChallengeCtx] = useState<{ code: string; playerName: string } | null>(null);
  const [challengeRank, setChallengeRank] = useState<number | null>(null);
  const challengeSubmitted = useRef(false);

  const { data: session, isLoading } = useGetQuizSession(sessionId || "", {
    query: {
      queryKey: getGetQuizSessionQueryKey(sessionId || ""),
      enabled: !!sessionId,
    },
  });

  const completeQuiz = useCompleteQuiz({
    mutation: { onSuccess: () => {} },
  });

  useEffect(() => {
    if (session && session.status === "active") {
      completeQuiz.mutate({ sessionId: sessionId || "" });
    }
  }, [session?.status]);

  // Load challenge context from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem("challenge_ctx");
    if (raw) {
      try {
        const ctx = JSON.parse(raw) as { code: string; playerName: string };
        if (ctx.code) setChallengeCtx(ctx);
      } catch {}
    }
  }, []);

  // Submit challenge score once quiz is completed
  useEffect(() => {
    if (!challengeCtx || !session || session.status !== "completed" || challengeSubmitted.current) return;
    challengeSubmitted.current = true;
    sessionStorage.removeItem("challenge_ctx");
    authFetch(`/api/challenges/${challengeCtx.code}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, playerName: challengeCtx.playerName }),
    })
      .then(r => r.json())
      .then(data => { if (data.rank) setChallengeRank(data.rank); })
      .catch(() => {});
  }, [session?.status, challengeCtx, sessionId]);

  // Check for streak milestone stored by Quiz.tsx
  useEffect(() => {
    const raw = sessionStorage.getItem("streak_milestone");
    if (raw) {
      try {
        const data = JSON.parse(raw) as { streak: number; coins: number };
        if (data.streak && data.coins) {
          setTimeout(() => setMilestone(data), 600);
        }
      } catch {}
      sessionStorage.removeItem("streak_milestone");
    }
  }, []);

  const handleAdComplete = async () => {
    const res = await authFetch("/api/battlepass/watch-ad-xp", { method: "POST" });
    if (res.ok) {
      toast({ title: `+${AD_XP} XP!`, description: "Battle Pass XP added — you're climbing the tiers!" });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    }
    setShowXpAd(false);
  };

  if (isLoading || !session) {
    return (
      <div className="flex-1 container max-w-2xl mx-auto px-4 py-16 flex flex-col gap-6">
        <Skeleton className="h-12 w-64 mx-auto" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  const totalQuestions = session.totalQuestions || 10;
  const score = session.score || 0;
  const accuracy = Math.round((score / (totalQuestions * 10)) * 100);

  const getScoreGrade = () => {
    if (accuracy >= 90) return { label: "Outstanding", color: "text-yellow-400", bg: "from-yellow-500/20 to-yellow-600/5" };
    if (accuracy >= 70) return { label: "Great Job", color: "text-primary", bg: "from-primary/20 to-primary/5" };
    if (accuracy >= 50) return { label: "Good Effort", color: "text-secondary", bg: "from-secondary/20 to-secondary/5" };
    return { label: "Keep Practicing", color: "text-muted-foreground", bg: "from-muted/20 to-muted/5" };
  };

  const grade = getScoreGrade();

  return (
    <div className="flex-1 w-full bg-background py-12">
      <div className="container max-w-2xl mx-auto px-4 flex flex-col gap-8">

        {/* Result Header */}
        <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br p-8 text-center", grade.bg)}>
          <div className="absolute inset-0 bg-gradient-to-br from-background/50 to-transparent" />
          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-background/60 border border-border flex items-center justify-center">
              <Trophy className={cn("h-10 w-10", grade.color)} />
            </div>
            <h1 className={cn("text-4xl font-bold", grade.color)}>{grade.label}</h1>
            <p className="text-muted-foreground text-lg">
              {session.categoryName ? `${session.categoryName} Quiz` : "Quiz"} Complete
            </p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-7xl font-black text-foreground">{score}</span>
              <span className="text-2xl text-muted-foreground font-medium">pts</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center">
            <Target className="h-6 w-6 text-primary" />
            <span className="text-3xl font-bold">{accuracy}%</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Accuracy</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <span className="text-3xl font-bold">{Math.round(accuracy / 10)}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Correct</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center">
            <XCircle className="h-6 w-6 text-destructive" />
            <span className="text-3xl font-bold">{totalQuestions - Math.round(accuracy / 10)}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Wrong</span>
          </div>
        </div>

        {/* Battle Pass XP Boost Banner — shown to authenticated users */}
        {isAuthenticated && (
          <button
            onClick={() => setShowXpAd(true)}
            className="w-full rounded-2xl border border-indigo-500/25 bg-gradient-to-r from-indigo-500/10 to-cyan-500/5 p-4 flex items-center gap-4 hover:bg-indigo-500/15 transition-colors text-left group"
          >
            <div className="h-12 w-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Zap className="h-6 w-6 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-indigo-200 text-sm">Boost Your Battle Pass!</p>
              <p className="text-xs text-white/45 mt-0.5">Watch a short ad to earn <span className="text-indigo-300 font-bold">+{AD_XP} XP</span> and climb the tiers faster.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-indigo-400/60 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Score Breakdown */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Score Breakdown
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Total Questions</span>
              <span className="font-semibold">{totalQuestions}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Points per Correct</span>
              <span className="font-semibold">10 pts</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="font-bold text-lg">Final Score</span>
              <span className={cn("font-black text-2xl", grade.color)}>{score} pts</span>
            </div>
          </div>
        </div>

        {/* Challenge result banner */}
        {challengeCtx && (
          <div className={cn(
            "rounded-xl border p-4 flex items-center gap-3",
            challengeRank === 1
              ? "border-yellow-500/40 bg-yellow-500/10"
              : "border-primary/30 bg-primary/5"
          )}>
            {challengeRank === 1 ? (
              <Crown className="h-6 w-6 text-yellow-400 shrink-0" />
            ) : (
              <Link2 className="h-6 w-6 text-primary shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">
                {challengeRank === 1 ? "🏆 You're #1 on this challenge!" : challengeRank ? `You ranked #${challengeRank} on this challenge!` : "Score submitted to challenge!"}
              </p>
              <p className="text-xs text-muted-foreground">See how you compare with everyone who played.</p>
            </div>
            <Button size="sm" onClick={() => setLocation(`/challenge/${challengeCtx.code}`)} className="shrink-0">
              View Board <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            size="lg"
            className="flex-1 h-14 text-lg bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setLocation("/categories")}
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Play Again
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 h-14 text-lg border-border hover:bg-muted"
            onClick={() => setLocation("/categories")}
          >
            <LayoutGrid className="mr-2 h-5 w-5" />
            All Categories
          </Button>
        </div>
      </div>

      {/* Watch Ad for +XP modal */}
      {showXpAd && (
        <WatchAdModal
          xpMode={AD_XP}
          onComplete={handleAdComplete}
          onClose={() => setShowXpAd(false)}
        />
      )}

      {/* Streak Milestone Modal */}
      {milestone && (
        <StreakMilestoneModal
          streak={milestone.streak}
          coinsAwarded={milestone.coins}
          onClose={() => setMilestone(null)}
        />
      )}
    </div>
  );
}
