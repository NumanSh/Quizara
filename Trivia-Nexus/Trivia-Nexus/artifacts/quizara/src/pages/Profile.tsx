import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  useGetProfile, getGetProfileQueryKey,
  useUpdateProfile,
  useGetMyArenaStats, getGetMyArenaStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Trophy, Target, Gamepad2, Shield, Save, Swords, Crown, Flame, Medal, Palette, Star } from "lucide-react";
import { useStreak } from "@/hooks/useStreak";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/api";
import { getFrameStyle, getBgStyle, getUsernameStyle, cosmeticLabel, FRAME_DEFS, BG_DEFS, COLOR_DEFS } from "@/lib/cosmetics";
import { RankBadge, rankTitleLabel } from "@/components/RankBadge";
import { getXpProgress, XP_RANKS } from "@/lib/xpRank";
import { useI18n } from "@/lib/i18n";

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Angola", "Argentina", "Armenia", "Australia",
  "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia",
  "Bosnia and Herzegovina", "Brazil", "Bulgaria", "Cambodia", "Cameroon", "Canada",
  "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cuba", "Czech Republic",
  "Denmark", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Ethiopia",
  "Finland", "France", "Georgia", "Germany", "Ghana", "Greece", "Guatemala",
  "Honduras", "Hungary", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kuwait", "Lebanon",
  "Libya", "Malaysia", "Mexico", "Morocco", "Mozambique", "Netherlands", "New Zealand",
  "Nicaragua", "Nigeria", "Norway", "Oman", "Pakistan", "Palestine", "Panama",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Russia", "Saudi Arabia", "Senegal", "Serbia", "Singapore", "Somalia", "South Africa",
  "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tanzania", "Thailand", "Tunisia", "Turkey", "UAE", "Uganda", "Ukraine",
  "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam",
  "Yemen", "Zimbabwe"
];

function WinRateArc({ winRate }: { winRate: number }) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const filled = (winRate / 100) * circ;
  return (
    <svg width="72" height="72" className="-rotate-90">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <circle
        cx="36" cy="36" r={radius} fill="none"
        stroke="url(#arc-grad)" strokeWidth="5"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <defs>
        <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(239 84% 67%)" />
          <stop offset="100%" stopColor="hsl(188 86% 53%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Profile() {
  const { t } = useI18n();
  const { isAuthenticated, login } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: profile, isLoading, refetch } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isAuthenticated,
    },
  });

  const { data: arenaStats, isLoading: arenaLoading } = useGetMyArenaStats({
    query: {
      queryKey: getGetMyArenaStatsQueryKey(),
      enabled: isAuthenticated,
    },
  });

  const { data: streak } = useStreak(isAuthenticated);

  const [username, setUsername] = useState("");
  const [country, setCountry] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showAdminField, setShowAdminField] = useState(false);

  const [badges, setBadges] = useState<any[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    setBadgesLoading(true);
    authFetch("/api/badges")
      .then(r => r.json())
      .then(d => setBadges(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setBadgesLoading(false));
  }, [isAuthenticated]);

  const claimBadgeCoins = async (badgeId: string) => {
    try {
      const res = await authFetch(`/api/badges/${badgeId}/claim`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setBadges(prev => prev.map(b => b.id === badgeId ? { ...b, coinsClaimed: true } : b));
      toast({ title: t.profilePage.coinsClaimedToast.replace("{amount}", String(data.coinsAwarded)), description: t.profilePage.coinsClaimedTotal.replace("{total}", String(data.totalCoins)) });
    } catch {
      toast({ title: t.profilePage.claimFailed, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || "");
      setCountry(profile.country || "");
    }
  }, [profile]);

  const updateProfile = useUpdateProfile({
    mutation: {
      onSuccess: () => {
        toast({ title: t.profilePage.profileUpdated, description: t.profilePage.profileUpdatedDesc });
        refetch();
      },
      onError: () => {
        toast({ title: t.profilePage.error, description: t.profilePage.updateFailed, variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    updateProfile.mutate({
      data: {
        username: username || undefined,
        country: country || undefined,
        adminCode: adminCode || undefined,
      },
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-center px-4">
        <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <User className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t.profilePage.signInTitle}</h2>
        <p className="text-muted-foreground max-w-sm">
          {t.profilePage.signInDesc}
        </p>
        <Button onClick={() => login()} size="lg" className="bg-primary text-primary-foreground">
          {t.profilePage.signIn}
        </Button>
      </div>
    );
  }

  if (updateProfile.isError || (profile === undefined && !isLoading)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-center px-4">
        <div className="h-20 w-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <Flame className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold">{t.profilePage.loadFailedTitle}</h2>
        <p className="text-muted-foreground max-w-sm">
          {t.profilePage.loadFailedDesc}
        </p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <Gamepad2 className="h-4 w-4" />
          {t.profilePage.retry}
        </Button>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="flex-1 container max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-24 rounded-2xl w-full" />
        <Skeleton className="h-40 rounded-2xl w-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl w-full" />
      </div>
    );
  }

  const hasArenaGames = (arenaStats?.totalGames ?? 0) > 0;

  const activeFrame = (profile as any).activeAvatarFrame ?? null;
  const activeBg   = (profile as any).activeProfileBg   ?? null;
  const activeColor = (profile as any).activeUsernameColor ?? null;

  const frameStyle = getFrameStyle(activeFrame);
  const bgStyle    = getBgStyle(activeBg);
  const colorStyle = getUsernameStyle(activeColor);

  return (
    <div className="flex-1 w-full bg-background py-10" style={bgStyle}>
      <div className="container max-w-2xl mx-auto px-4 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-center gap-4">
          <div
            className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 transition-all duration-300"
            style={frameStyle}
          >
            {profile.profileImageUrl ? (
              <img src={profile.profileImageUrl} alt={profile.username || "User"} className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold truncate max-w-[300px]" style={colorStyle}>
                {profile.username || t.profilePage.yourProfile}
              </h1>
              <RankBadge totalXp={(profile as any).totalXp ?? 0} size="sm" />
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              {profile.country || t.profilePage.noCountry}
              {profile.role === "admin" && (
                <span className="inline-flex items-center gap-1 text-xs bg-secondary/20 text-secondary px-2 py-0.5 rounded-full border border-secondary/30">
                  <Shield className="h-3 w-3" />
                  {t.profilePage.admin}
                </span>
              )}
            </p>
            {/* Active cosmetics display */}
            {(activeFrame || activeBg || activeColor) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {activeFrame && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                    {FRAME_DEFS[activeFrame]?.emoji} {cosmeticLabel(t, activeFrame)}
                  </span>
                )}
                {activeBg && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                    {BG_DEFS[activeBg]?.emoji} {cosmeticLabel(t, activeBg)}
                  </span>
                )}
                {activeColor && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                    {COLOR_DEFS[activeColor]?.emoji} {cosmeticLabel(t, activeColor)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Streak Banner ── */}
        {streak && streak.currentStreak > 0 && (
          <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-r from-orange-950/30 to-amber-950/10 p-5 flex items-center gap-5">
            <div className="text-5xl font-black text-orange-400 leading-none shrink-0">
              🔥 {streak.currentStreak}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-foreground">{t.profilePage.dayStreak}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.profilePage.best.replace("{days}", String(streak.longestStreak))}
                {streak.nextMilestone && (
                  <> · <span className="text-amber-400">{t.profilePage.daysToMilestone.replace("{days}", String(streak.nextMilestone - streak.currentStreak)).replace("{milestone}", String(streak.nextMilestone))}</span></>
                )}
              </p>
              {streak.nextMilestone && (
                <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                    style={{ width: `${Math.min(100, (streak.currentStreak / streak.nextMilestone) * 100)}%` }}
                  />
                </div>
              )}
            </div>
            {streak.checkedInToday && (
              <span className="text-xs font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full shrink-0">
                {t.profilePage.today}
              </span>
            )}
          </div>
        )}

        {/* ── XP Rank Card ── */}
        {(() => {
          const totalXp = (profile as any).totalXp ?? 0;
          const progress = getXpProgress(totalXp);
          return (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center text-xl border",
                      progress.current.bgColor, progress.current.borderColor
                    )}>
                      {progress.current.emoji}
                    </div>
                    <div>
                      <p className={cn("font-black text-lg leading-tight", progress.current.textColor)}>
                        {rankTitleLabel(t, progress.current.title)}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.profilePage.totalXp.replace("{xp}", totalXp.toLocaleString())}</p>
                    </div>
                  </div>
                  {progress.next && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t.profilePage.nextRank}</p>
                      <p className="text-sm font-bold text-muted-foreground">
                        {progress.next.emoji} {rankTitleLabel(t, progress.next.title)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {progress.next ? (
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${progress.progressPct}%`,
                          background: progress.current.title === "Legend"
                            ? "#facc15"
                            : progress.current.title === "Master"
                            ? "#fb923c"
                            : progress.current.title === "Expert"
                            ? "#a78bfa"
                            : progress.current.title === "Scholar"
                            ? "#60a5fa"
                            : "#94a3b8",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{progress.current.minXp.toLocaleString()} XP</span>
                      <span className={cn("font-semibold", progress.current.textColor)}>
                        {progress.progressPct}% · {progress.xpNeededForNext} {t.profilePage.xpTo} {rankTitleLabel(t, progress.next.title)}
                      </span>
                      <span>{progress.next.minXp.toLocaleString()} XP</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-1">
                    <p className="text-xs font-semibold text-yellow-400">{t.profilePage.maxRankAchieved}</p>
                  </div>
                )}

                {/* All ranks roadmap */}
                <div className="flex items-center justify-between pt-1">
                  {XP_RANKS.map((r, i) => (
                    <div key={r.title} className="flex flex-col items-center gap-1">
                      <span className={cn(
                        "text-base transition-all",
                        totalXp >= r.minXp ? "opacity-100 scale-110" : "opacity-25"
                      )}>{r.emoji}</span>
                      <span className={cn(
                        "text-[9px] font-bold",
                        totalXp >= r.minXp ? r.textColor : "text-muted-foreground"
                      )}>{rankTitleLabel(t, r.title)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Quiz Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center">
            <Trophy className="h-6 w-6 text-yellow-400" />
            <span className="text-3xl font-black">{profile.totalScore || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{t.profilePage.totalScore}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center">
            <Gamepad2 className="h-6 w-6 text-primary" />
            <span className="text-3xl font-black">{profile.gamesPlayed || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{t.profilePage.gamesPlayed}</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2 text-center">
            <Target className="h-6 w-6 text-secondary" />
            <span className="text-3xl font-black">{profile.bestScore || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{t.profilePage.bestScore}</span>
          </div>
        </div>

        {/* ── Streak Stats row ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 flex flex-col items-center gap-2 text-center">
            <Flame className="h-6 w-6 text-orange-400" />
            <span className="text-3xl font-black text-orange-400">{streak?.currentStreak ?? 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{t.profilePage.currentStreak}</span>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 flex flex-col items-center gap-2 text-center">
            <Trophy className="h-6 w-6 text-amber-400" />
            <span className="text-3xl font-black text-amber-400">{streak?.longestStreak ?? 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{t.profilePage.bestStreak}</span>
          </div>
        </div>

        {/* ── Arena Stats Card ── */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card">
          {/* Glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-secondary/10 blur-3xl rounded-full pointer-events-none" />

          <div className="relative z-10 p-6">
            {/* Card header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Swords className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-lg leading-tight">{t.profilePage.arenaRecord}</h2>
                  <p className="text-xs text-muted-foreground">{t.profilePage.arenaRecordDesc}</p>
                </div>
              </div>
              {arenaStats?.rank != null && (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <Crown className="h-4 w-4 text-yellow-400" />
                    <span className="text-2xl font-black text-yellow-400">#{arenaStats.rank}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.profilePage.arenaRank}</p>
                </div>
              )}
            </div>

            {arenaLoading ? (
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : !hasArenaGames ? (
              <div className="flex flex-col items-center py-6 gap-3 text-center">
                <Swords className="h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm font-medium text-muted-foreground">{t.profilePage.noArenaGames}</p>
                <p className="text-xs text-muted-foreground/60">{t.profilePage.noArenaGamesHint}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/arena")}
                  className="mt-1 border-primary/30 text-primary hover:bg-primary/10"
                >
                  {t.profilePage.goToArena}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                {/* Win rate arc */}
                <div className="relative shrink-0">
                  <WinRateArc winRate={arenaStats?.winRate ?? 0} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-black leading-none">{arenaStats?.winRate ?? 0}%</span>
                    <span className="text-[9px] text-muted-foreground leading-none mt-0.5">{t.profilePage.win}</span>
                  </div>
                </div>

                {/* W / L / D + total games */}
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className={cn(
                    "rounded-xl border p-3 text-center",
                    "border-green-500/20 bg-green-500/5"
                  )}>
                    <p className="text-2xl font-black text-green-400">{arenaStats?.wins ?? 0}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">{t.profilePage.wins}</p>
                  </div>
                  <div className={cn(
                    "rounded-xl border p-3 text-center",
                    "border-red-500/20 bg-red-500/5"
                  )}>
                    <p className="text-2xl font-black text-red-400">{arenaStats?.losses ?? 0}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">{t.profilePage.losses}</p>
                  </div>
                  <div className={cn(
                    "rounded-xl border p-3 text-center",
                    "border-border bg-muted/20"
                  )}>
                    <p className="text-2xl font-black text-muted-foreground">{arenaStats?.draws ?? 0}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">{t.profilePage.draws}</p>
                  </div>
                  <div className={cn(
                    "rounded-xl border p-3 text-center",
                    "border-primary/20 bg-primary/5"
                  )}>
                    <p className="text-2xl font-black text-primary">{arenaStats?.totalGames ?? 0}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">{t.profilePage.total}</p>
                  </div>
                </div>
              </div>
            )}

            {hasArenaGames && (
              <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t.profilePage.arenaScore} <span className="font-bold text-foreground">{(arenaStats?.totalScore ?? 0).toLocaleString()} {t.profilePage.arenaScorePts}</span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/leaderboard")}
                  className="text-xs text-primary hover:bg-primary/10 h-7 px-3"
                >
                  {t.profilePage.viewArenaLeaderboard}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Trophy Cabinet ── */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                <Medal className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h2 className="font-bold text-lg leading-tight">{t.profilePage.trophyCabinet}</h2>
                <p className="text-xs text-muted-foreground">
                  {t.profilePage.earnedOf.replace("{earned}", String(badges.filter(b => b.earned).length)).replace("{total}", String(badges.length))}
                </p>
              </div>
            </div>
            {badges.some(b => b.earned && !b.coinsClaimed && b.coinReward > 0) && (
              <span className="text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full animate-pulse">
                {t.profilePage.coinsReady}
              </span>
            )}
          </div>

          {badgesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : badges.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Medal className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{t.profilePage.noBadges}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {badges.map(badge => (
                <div
                  key={badge.id}
                  className={cn(
                    "relative rounded-xl border p-4 flex flex-col items-center gap-2 text-center transition-all",
                    badge.earned
                      ? "border-yellow-500/30 bg-yellow-500/5 shadow-sm"
                      : "border-border bg-muted/5 opacity-45 grayscale"
                  )}
                >
                  {badge.earned && (
                    <span className="absolute top-2 right-2 text-[10px] text-yellow-400 font-bold leading-none">✓</span>
                  )}
                  {!badge.earned && (
                    <span className="absolute top-2 right-2 text-[10px] text-muted-foreground leading-none">🔒</span>
                  )}
                  <span className="text-3xl leading-none">{badge.icon}</span>
                  <div className="flex-1 w-full">
                    <p className={cn("font-semibold text-xs leading-tight", badge.earned ? "text-foreground" : "text-muted-foreground")}>
                      {badge.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                      {badge.description}
                    </p>
                  </div>
                  {badge.earned && badge.coinReward > 0 && (
                    badge.coinsClaimed ? (
                      <span className="text-[10px] text-green-400 font-medium">{t.profilePage.coinsClaimed.replace("{amount}", String(badge.coinReward))}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2.5 bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                        onClick={() => claimBadgeCoins(badge.id)}
                      >
                        {t.profilePage.claim.replace("{amount}", String(badge.coinReward))}
                      </Button>
                    )
                  )}
                  {badge.earned && badge.coinReward === 0 && (
                    <span className="text-[10px] text-muted-foreground">{t.profilePage.noCoinReward}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Edit Form ── */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">{t.profilePage.editProfile}</h2>

          <div className="space-y-2">
            <Label htmlFor="username">{t.profilePage.username}</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t.profilePage.usernamePlaceholder}
              className="bg-muted/30 border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">{t.profilePage.country}</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="bg-muted/30 border-border">
                <SelectValue placeholder={t.profilePage.countryPlaceholder} />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {profile.role !== "admin" && (
            <div className="space-y-2">
              {!showAdminField ? (
                <button
                  type="button"
                  onClick={() => setShowAdminField(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                >
                  {t.profilePage.haveAdminCode}
                </button>
              ) : (
                <>
                  <Label htmlFor="adminCode" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {t.profilePage.adminCode}
                  </Label>
                  <Input
                    id="adminCode"
                    type="password"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                    placeholder={t.profilePage.adminCodePlaceholder}
                    className="bg-muted/30 border-border"
                  />
                </>
              )}
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className="mr-2 h-4 w-4" />
            {updateProfile.isPending ? t.profilePage.saving : t.profilePage.saveChanges}
          </Button>
        </div>

        {profile.role === "admin" && (
          <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-secondary" />
              <div>
                <p className="font-semibold text-secondary">{t.profilePage.adminAccess}</p>
                <p className="text-sm text-muted-foreground">{t.profilePage.adminAccessDesc}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setLocation("/admin")} className="border-secondary/40 text-secondary hover:bg-secondary/10">
              {t.profilePage.adminPanel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
