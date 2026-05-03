import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Gem, Zap, Trophy, Target, LayoutGrid, Flame,
  Lock, Star, Gift, RefreshCw, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface DailyTask {
  id: string;
  title: string;
  description: string;
  type: string;
  targetValue: number;
  coinReward: number;
  xpReward: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  currentValue: number;
  isCompleted: boolean;
  isClaimed: boolean;
  completedAt: string | null;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  quiz_count:      { icon: LayoutGrid,   color: "text-cyan-400",   label: "Complete Quizzes" },
  score_target:    { icon: Trophy,       color: "text-yellow-400", label: "Score Target" },
  category_quiz:   { icon: Target,       color: "text-violet-400", label: "Category Quest" },
  correct_answers: { icon: CheckCircle2, color: "text-green-400",  label: "Correct Answers" },
};

function TaskCard({ task, onClaim }: { task: DailyTask; onClaim: (id: string) => void }) {
  const { isAuthenticated } = useAuth();
  const cfg = TYPE_CONFIG[task.type] ?? { icon: Star, color: "text-blue-400", label: task.type };
  const Icon = cfg.icon;
  const pct = Math.min(100, Math.round((task.currentValue / task.targetValue) * 100));

  return (
    <div
      className={cn(
        "relative rounded-2xl border p-5 transition-all",
        task.isClaimed
          ? "bg-green-900/10 border-green-500/20 opacity-75"
          : task.isCompleted
          ? "bg-secondary/10 border-secondary/40 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
          : "bg-card/60 border-white/5 hover:border-white/10",
      )}
    >
      {task.isCompleted && !task.isClaimed && (
        <div className="absolute -top-2 -right-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[10px] font-black text-white animate-pulse">
            !
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(
          "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
          task.isClaimed ? "bg-green-500/10" : "bg-white/5",
        )}>
          {task.isClaimed
            ? <CheckCircle2 className="h-6 w-6 text-green-400" />
            : <Icon className={cn("h-6 w-6", cfg.color)} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground">{task.title}</span>
            {task.categoryName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/30 text-violet-400">
                {task.categoryIcon} {task.categoryName}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>

          {/* Progress */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {task.currentValue} / {task.targetValue}
              </span>
              <span className={cn("font-bold", task.isCompleted ? "text-secondary" : "text-muted-foreground")}>
                {pct}%
              </span>
            </div>
            <Progress
              value={pct}
              className="h-1.5"
              indicatorClassName={task.isCompleted ? "bg-secondary" : "bg-primary/60"}
            />
          </div>

          {/* Rewards + CTA */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
                <Gem className="h-3 w-3" />{task.coinReward}
              </span>
              <span className="flex items-center gap-1 text-xs text-violet-400 font-semibold">
                <Zap className="h-3 w-3" />{task.xpReward} XP
              </span>
            </div>

            {!isAuthenticated ? (
              <Link href="/login">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  <Lock className="h-3 w-3" /> Sign in
                </Button>
              </Link>
            ) : task.isClaimed ? (
              <span className="text-xs text-green-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Claimed
              </span>
            ) : task.isCompleted ? (
              <Button
                size="sm"
                className="h-7 text-xs bg-secondary hover:bg-secondary/90 gap-1"
                onClick={() => onClaim(task.id)}
              >
                <Gift className="h-3.5 w-3.5" /> Claim
              </Button>
            ) : (
              <Link href={task.categoryId ? `/worlds/${task.categoryId}` : "/categories"}>
                <Button size="sm" variant="outline" className="h-7 text-xs border-white/10 hover:border-white/20">
                  Play →
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DailyTasks() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ tasks: DailyTask[]; date: string }>({
    queryKey: ["daily-tasks"],
    queryFn: async () => {
      const res = await fetch("/api/daily-tasks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tasks");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const claim = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/daily-tasks/${id}/claim`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to claim");
      }
      return res.json() as Promise<{ coinReward: number; xpReward: number }>;
    },
    onMutate: (id) => setClaimingId(id),
    onSuccess: (data) => {
      toast({
        title: "Reward claimed!",
        description: `+${data.coinReward} coins  +${data.xpReward} XP`,
      });
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    onSettled: () => setClaimingId(null),
  });

  const tasks = data?.tasks ?? [];
  const completedCount = tasks.filter(t => t.isCompleted).length;
  const claimedCount = tasks.filter(t => t.isClaimed).length;
  const allDone = tasks.length > 0 && claimedCount === tasks.length;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="h-5 w-5 text-secondary" />
            <h1 className="text-2xl font-black text-foreground">Daily Tasks</h1>
            <Badge className="text-[10px] bg-secondary/20 text-secondary border-secondary/30">
              Resets at midnight
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress summary */}
      {tasks.length > 0 && (
        <div className="rounded-2xl bg-card/60 border border-white/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">
              {allDone ? "All done! 🎉" : `${completedCount} of ${tasks.length} completed`}
            </span>
            <span className="text-xs text-muted-foreground">{claimedCount} claimed</span>
          </div>
          <Progress
            value={Math.round((completedCount / tasks.length) * 100)}
            className="h-2"
            indicatorClassName={allDone ? "bg-green-400" : "bg-secondary"}
          />
        </div>
      )}

      {/* Tasks */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl bg-card/40 border border-white/5 p-5 h-32 animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
            <Flame className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">No tasks today</p>
            <p className="text-sm text-muted-foreground mt-1">
              The admin hasn't set any daily tasks yet. Check back soon!
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onClaim={(id) => {
                setClaimingId(id);
                claim.mutate(id);
              }}
            />
          ))}
        </div>
      )}

      {/* Tip */}
      {!isAuthenticated && tasks.length > 0 && (
        <div className="rounded-xl bg-secondary/10 border border-secondary/20 p-4 text-sm text-center text-muted-foreground">
          <Link href="/login" className="text-secondary font-semibold hover:underline">Sign in</Link> to track your progress and claim rewards
        </div>
      )}
    </div>
  );
}
