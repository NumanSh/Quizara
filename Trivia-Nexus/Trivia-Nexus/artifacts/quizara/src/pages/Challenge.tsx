import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Trophy, Users, Clock, Copy, Play, CheckCheck, Link2, Medal, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";

interface ChallengeScore {
  rank: number;
  playerName: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  timeTaken: number;
  completedAt: string;
  isCurrentUser?: boolean;
}

interface ChallengeInfo {
  code: string;
  title: string;
  categoryName: string;
  questionCount: number;
  creatorName: string;
  createdAt: string;
  totalPlayers: number;
  scores: ChallengeScore[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-300" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
  return <span className="text-xs font-bold text-muted-foreground w-4 text-center">#{rank}</span>;
}

export default function Challenge() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useSupabaseAuth();
  const { toast } = useToast();

  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [copied, setCopied] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!code) return;
    authFetch(`/api/challenges/${code}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(data => {
        if (data) setInfo(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

  // Pre-fill username if authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      setPlayerName((user as any).username ?? (user as any).name ?? "");
    }
  }, [isAuthenticated, user]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}challenge/${code}`.replace(/\/\//g, "/").replace(":/", "://");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with your friends." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  const handlePlay = async () => {
    const name = playerName.trim();
    if (!name) {
      nameInputRef.current?.focus();
      toast({ title: "Enter your name", description: "We need a display name for the leaderboard.", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const res = await authFetch(`/api/challenges/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to start");
      const data = await res.json();
      // Store challenge context for Results page
      sessionStorage.setItem("challenge_ctx", JSON.stringify({ code, playerName: name }));
      setLocation(`/quiz/${data.sessionId}`);
    } catch {
      toast({ title: "Could not start challenge", variant: "destructive" });
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 container max-w-2xl mx-auto px-4 py-12 flex flex-col gap-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (notFound || !info) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-4">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-bold">Challenge not found</h1>
        <p className="text-muted-foreground">This link may be invalid or expired.</p>
        <Button onClick={() => setLocation("/categories")}>Browse Categories</Button>
      </div>
    );
  }

  const hasPlayed = info.scores.some(s => s.isCurrentUser);

  return (
    <div className="flex-1 w-full bg-background py-10">
      <div className="container max-w-2xl mx-auto px-4 flex flex-col gap-6">

        {/* Challenge Card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-cyan-500/10 via-indigo-500/5 to-background p-8">
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-cyan-400/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-primary font-semibold">
              <Link2 className="h-4 w-4" />
              FRIEND CHALLENGE
            </div>
            <h1 className="text-3xl font-black text-foreground leading-tight">{info.title}</h1>
            <p className="text-muted-foreground text-sm">
              Created by <span className="text-foreground font-medium">{info.creatorName}</span>
            </p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Star className="h-4 w-4 text-primary" />
                <span><span className="font-semibold text-foreground">{info.questionCount}</span> questions</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-4 w-4 text-indigo-400" />
                <span><span className="font-semibold text-foreground">{info.totalPlayers}</span> players</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Trophy className="h-4 w-4 text-yellow-400" />
                <span>Top score: <span className="font-semibold text-foreground">
                  {info.scores[0]?.score ?? 0}
                </span> pts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Share link */}
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors text-left group"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            {copied ? <CheckCheck className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">
              {window.location.origin}{import.meta.env.BASE_URL}challenge/{code}
            </p>
            <p className="text-xs text-muted-foreground">{copied ? "Copied!" : "Click to copy share link"}</p>
          </div>
        </button>

        {/* Play Section */}
        {!hasPlayed ? (
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Play this challenge
            </h2>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground">Your display name</label>
              <input
                ref={nameInputRef}
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePlay()}
                placeholder={isAuthenticated ? "Your username" : "Enter a name..."}
                maxLength={30}
                className="h-11 bg-background border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              />
              <p className="text-xs text-muted-foreground">This name appears on the leaderboard.</p>
            </div>
            <Button
              size="lg"
              className="h-13 text-base bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handlePlay}
              disabled={starting}
            >
              {starting ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting...</span>
              ) : (
                <span className="flex items-center gap-2"><Play className="h-5 w-5" /> Play Now</span>
              )}
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
            <CheckCheck className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-sm">You've played this challenge!</p>
              <p className="text-xs text-muted-foreground">Your score is on the leaderboard below.</p>
            </div>
            <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={handlePlay} disabled={starting}>
              Play Again
            </Button>
          </div>
        )}

        {/* Leaderboard */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <h2 className="font-bold text-base">Leaderboard</h2>
            <span className="ml-auto text-sm text-muted-foreground">{info.totalPlayers} players</span>
          </div>

          {info.scores.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">🎯</p>
              <p className="font-semibold text-foreground">No scores yet</p>
              <p className="text-sm text-muted-foreground mt-1">Be the first to play!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {info.scores.map(s => (
                <div
                  key={s.rank}
                  className={cn(
                    "px-5 py-3.5 flex items-center gap-3 transition-colors",
                    s.isCurrentUser && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="w-6 flex items-center justify-center shrink-0">
                    <RankIcon rank={s.rank} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-semibold text-sm truncate", s.isCurrentUser && "text-primary")}>
                      {s.playerName} {s.isCurrentUser && <span className="text-xs text-primary/70">(you)</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{s.correctAnswers}/{s.totalQuestions} correct</span>
                      {s.timeTaken > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" /> {formatTime(s.timeTaken)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    "text-right shrink-0",
                    s.rank === 1 ? "text-yellow-400" : s.rank === 2 ? "text-slate-300" : s.rank === 3 ? "text-amber-600" : "text-foreground"
                  )}>
                    <p className="font-black text-lg">{s.score}</p>
                    <p className="text-xs text-muted-foreground">pts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer action */}
        <Button
          variant="outline"
          onClick={() => setLocation("/categories")}
          className="border-border text-muted-foreground hover:text-foreground"
        >
          Browse all categories
        </Button>
      </div>
    </div>
  );
}
