import { Link } from "wouter";
import { Play, ArrowRight, Flame, Users, HelpCircle, Globe, Trophy, Zap, Target, Star, Swords, UserPlus } from "lucide-react";
import {
  useListCategories, getListCategoriesQueryKey,
  useGetLeaderboard, getGetLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStreak } from "@/hooks/useStreak";
import { useI18n } from "@/lib/i18n";

// Scrolling banner tiles — gradient backgrounds per category
const BANNER_TILES = [
  { label: "Science", bg: "from-cyan-900/80 to-cyan-950", accent: "#22d3ee", symbol: "⚗️" },
  { label: "History", bg: "from-amber-900/80 to-amber-950", accent: "#f59e0b", symbol: "🏛️" },
  { label: "Anime", bg: "from-rose-900/80 to-rose-950", accent: "#fb7185", symbol: "⚔️" },
  { label: "Cinema", bg: "from-violet-900/80 to-violet-950", accent: "#a78bfa", symbol: "🎬" },
  { label: "Sports", bg: "from-green-900/80 to-green-950", accent: "#4ade80", symbol: "⚽" },
  { label: "Geography", bg: "from-sky-900/80 to-sky-950", accent: "#38bdf8", symbol: "🌍" },
  { label: "Pop Culture", bg: "from-pink-900/80 to-pink-950", accent: "#f472b6", symbol: "🎵" },
  { label: "Tech", bg: "from-indigo-900/80 to-indigo-950", accent: "#818cf8", symbol: "💡" },
];

const ALL_TILES = [...BANNER_TILES, ...BANNER_TILES];

const CATEGORY_ACCENT_COLORS = [
  "text-cyan-400 group-hover:shadow-[inset_0_0_20px_rgba(34,211,238,0.12)] hover:border-cyan-400/40",
  "text-yellow-400 group-hover:shadow-[inset_0_0_20px_rgba(234,179,8,0.12)] hover:border-yellow-400/40",
  "text-violet-400 group-hover:shadow-[inset_0_0_20px_rgba(167,139,250,0.12)] hover:border-violet-400/40",
  "text-emerald-400 group-hover:shadow-[inset_0_0_20px_rgba(52,211,153,0.12)] hover:border-emerald-400/40",
  "text-rose-400 group-hover:shadow-[inset_0_0_20px_rgba(251,113,133,0.12)] hover:border-rose-400/40",
  "text-sky-400 group-hover:shadow-[inset_0_0_20px_rgba(56,189,248,0.12)] hover:border-sky-400/40",
];

function BannerTile({ tile }: { tile: typeof BANNER_TILES[0] }) {
  return (
    <div className={cn("relative w-48 h-full shrink-0 bg-gradient-to-b", tile.bg, "flex flex-col items-center justify-center gap-3 border-r border-white/5")}>
      <div className="text-5xl select-none">{tile.symbol}</div>
      <div className="text-center">
        <p className="text-sm font-bold text-white/80">{tile.label}</p>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/20" />
    </div>
  );
}

const MILESTONE_COINS: Record<number, number> = { 7: 50, 30: 200, 100: 500 };

export default function Home() {
  const { isAuthenticated } = useSupabaseAuth();
  const { data: streak } = useStreak(isAuthenticated);
  const { t } = useI18n();

  const { data: categories, isLoading: catsLoading } = useListCategories(
    undefined,
    { query: { queryKey: getListCategoriesQueryKey() } }
  );

  const { data: leaderboard, isLoading: lbLoading } = useGetLeaderboard(
    { period: "all_time" },
    { query: { queryKey: getGetLeaderboardQueryKey({ period: "all_time" }) } }
  );

  const rootCategories = categories?.filter(c => !c.parentId).slice(0, 6) || [];
  const topPlayers = leaderboard?.slice(0, 3) || [];

  return (
    <div className="flex-1 w-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 pb-8">

        {/* ── Hero ── */}
        <section className="relative rounded-2xl overflow-hidden min-h-[420px] flex items-center justify-center border border-white/8 shadow-2xl">

          {/* Scrolling background banner */}
          <div className="absolute inset-0 z-0 flex bg-card overflow-hidden">
            <div className="flex animate-banner-scroll" style={{ width: "max-content" }}>
              {ALL_TILES.map((tile, i) => (
                <BannerTile key={i} tile={tile} />
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/65 to-background backdrop-blur-[2px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-background/40" />
          </div>

          {/* Hero content */}
          <div className="relative z-10 text-center max-w-2xl mx-auto px-4 space-y-5 bg-card/40 backdrop-blur-md border border-white/10 p-8 md:p-12 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] m-4">
            <h2 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary leading-tight drop-shadow-lg">
              {t.home.hero.title}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
              {t.home.hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 flex-wrap">
              <Link href="/categories">
                <button className="flex items-center justify-center gap-2 bg-gradient-to-r from-secondary to-primary text-white px-7 py-3.5 rounded-xl font-bold text-sm shadow-[0_8px_30px_rgba(99,102,241,0.4)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.6)] transition-all active:scale-95 w-full sm:w-auto">
                  <Play className="h-4 w-4 fill-current" />
                  {t.home.hero.quickPlay}
                </button>
              </Link>
              <Link href="/arena">
                <button className="flex items-center justify-center gap-2 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 px-7 py-3.5 rounded-xl font-bold text-sm hover:bg-cyan-500/25 hover:border-cyan-400/60 transition-all active:scale-95 backdrop-blur-md w-full sm:w-auto shadow-[0_4px_20px_rgba(34,211,238,0.15)]">
                  <Swords className="h-4 w-4" />
                  {t.home.hero.onlineGame}
                </button>
              </Link>
              <Link href="/arena">
                <button className="flex items-center justify-center gap-2 bg-card/80 border border-white/15 text-foreground px-7 py-3.5 rounded-xl font-bold text-sm hover:bg-card transition-all active:scale-95 backdrop-blur-md w-full sm:w-auto">
                  <UserPlus className="h-4 w-4" />
                  {t.home.hero.friendsGame}
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Live Stats Strip ── */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { icon: Users, label: t.home.stats.playersOnline, value: "2,400+", color: "text-primary" },
            { icon: HelpCircle, label: t.home.stats.questionsToday, value: "18,900+", color: "text-secondary" },
            { icon: Globe, label: t.home.stats.countries, value: "80+", color: "text-yellow-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm p-4 flex flex-col items-center text-center gap-1 hover:border-white/15 transition-colors">
              <Icon className={cn("h-5 w-5", color)} />
              <p className="text-xl md:text-2xl font-black text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Bento Grid: Categories + Sidebar ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* Categories — 8 cols */}
          <section className="md:col-span-8 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-foreground">{t.home.categories.title}</h3>
              <Link href="/categories" className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                {t.home.categories.viewAll} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {catsLoading
                ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[130px] rounded-xl" />)
                : rootCategories.map((cat, i) => {
                    const accentClass = CATEGORY_ACCENT_COLORS[i % CATEGORY_ACCENT_COLORS.length];
                    return (
                      <Link key={cat.id} href={`/worlds/${cat.id}`}>
                        <div className={cn(
                          "group relative overflow-hidden rounded-xl border border-white/8 bg-card/80 p-6 cursor-pointer transition-all duration-200 hover:border-opacity-50",
                          accentClass
                        )}>
                          <div className="absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl -mr-12 -mt-12 bg-current opacity-10 group-hover:opacity-20 transition-opacity" />
                          <div className="relative z-10">
                            <div className="text-3xl mb-3 select-none">{cat.icon || "📚"}</div>
                            <h4 className="font-bold text-base text-foreground">{cat.name}</h4>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
            </div>
          </section>

          {/* Right sidebar — 4 cols */}
          <aside className="md:col-span-4 space-y-5">

            {/* Daily Streak card */}
            <div className="relative overflow-hidden rounded-2xl border border-orange-500/25 bg-gradient-to-br from-card to-orange-950/20 p-6 shadow-lg">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-orange-500/10 blur-3xl rounded-full" />

              <div className="flex items-center justify-between mb-1 relative z-10">
                <div className="flex items-center gap-2">
                  <Flame className="h-6 w-6 text-orange-400" />
                  <h3 className="font-bold text-base text-foreground">{t.home.streak.title}</h3>
                </div>
                {isAuthenticated && streak && streak.currentStreak > 0 && (
                  <span className="text-xs font-bold text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full">
                    🔥 {t.home.streak.day} {streak.currentStreak}
                  </span>
                )}
              </div>

              {isAuthenticated && streak ? (
                <>
                  <div className="flex items-end gap-2 my-3 relative z-10">
                    <span className="text-5xl font-black text-orange-400 leading-none">
                      {streak.currentStreak}
                    </span>
                    <span className="text-sm text-muted-foreground mb-1">{t.home.streak.dayStreak}</span>
                  </div>

                  {streak.nextMilestone && (
                    <div className="bg-background/40 rounded-lg p-3 mb-4 relative z-10">
                      <div className="flex justify-between text-xs font-medium mb-2">
                        <span className="text-muted-foreground">{t.home.streak.nextMilestone}</span>
                        <span className="text-orange-400">
                          {t.home.streak.dayLabel} {streak.nextMilestone} · +{MILESTONE_COINS[streak.nextMilestone] ?? "?"} {t.home.streak.coins}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (streak.currentStreak / streak.nextMilestone) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {streak.nextMilestone - streak.currentStreak} {streak.nextMilestone - streak.currentStreak !== 1 ? t.home.streak.daysToGo : t.home.streak.dayToGo}
                      </p>
                    </div>
                  )}

                  {streak.checkedInToday ? (
                    <div className="relative z-10 flex items-center gap-2 py-2.5 px-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm font-semibold text-green-400">
                      <Target className="h-4 w-4" />
                      {t.home.streak.checkedIn}
                    </div>
                  ) : (
                    <Link href="/categories">
                      <button className="w-full relative z-10 bg-orange-500/15 border border-orange-500/30 text-orange-400 rounded-xl py-2.5 text-sm font-semibold hover:bg-orange-500/25 transition-colors">
                        {t.home.streak.playToKeep}
                      </button>
                    </Link>
                  )}

                  {streak.longestStreak > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-3 relative z-10 flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      {t.home.streak.best} {streak.longestStreak} {t.home.streak.days}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground my-3 relative z-10">
                    {t.home.streak.playDaily}
                  </p>
                  <div className="flex gap-2 text-xs text-muted-foreground mb-4 relative z-10">
                    {[{ d: 7, c: 50 }, { d: 30, c: 200 }, { d: 100, c: 500 }].map(({ d, c }) => (
                      <span key={d} className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-lg">
                        🔥{d} <span className="text-amber-400 font-bold">+{c}</span>
                      </span>
                    ))}
                  </div>
                  <Link href="/categories">
                    <button className="w-full relative z-10 border border-orange-500/30 text-orange-400 rounded-xl py-2.5 text-sm font-semibold hover:bg-orange-500/10 transition-colors">
                      {t.home.streak.startStreak}
                    </button>
                  </Link>
                </>
              )}
            </div>

            {/* Top Players card */}
            <div className="rounded-2xl border border-white/8 bg-card/80 p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg text-foreground">{t.home.topPlayers.title}</h3>
                <Trophy className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="space-y-3">
                {lbLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))
                  : topPlayers.length === 0
                    ? (
                      <div className="py-8 text-center">
                        <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{t.home.topPlayers.noPlayers}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{t.home.topPlayers.beFirst}</p>
                      </div>
                    )
                    : topPlayers.map((player, idx) => {
                        const medals = ["🥇", "🥈", "🥉"];
                        return (
                          <div
                            key={player.userId}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-xl transition-colors",
                              idx === 0 ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-background/30"
                            )}
                          >
                            <span className="text-lg w-7 text-center select-none">{medals[idx]}</span>
                            <div className="h-9 w-9 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-secondary">{(player.username || "?")[0].toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{player.username || t.home.topPlayers.anonymous}</p>
                              <p className={cn("text-xs", idx === 0 ? "text-yellow-400" : "text-muted-foreground")}>
                                {player.totalScore.toLocaleString()} {t.home.topPlayers.pts}
                              </p>
                            </div>
                            {idx === 0 && <Zap className="h-4 w-4 text-yellow-400 shrink-0" />}
                          </div>
                        );
                      })}
              </div>

              <Link href="/leaderboard">
                <button className="w-full mt-5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                  {t.home.topPlayers.viewFull}
                </button>
              </Link>
            </div>
          </aside>
        </div>

        {/* ── How to Play ── */}
        <section className="rounded-2xl border border-white/8 bg-card/40 p-8">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-foreground">{t.home.howToPlay.title}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{t.home.howToPlay.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: t.home.howToPlay.step1.title,
                desc: t.home.howToPlay.step1.desc,
                color: "text-primary border-primary/20 bg-primary/10",
              },
              {
                step: "02",
                title: t.home.howToPlay.step2.title,
                desc: t.home.howToPlay.step2.desc,
                color: "text-secondary border-secondary/20 bg-secondary/10",
              },
              {
                step: "03",
                title: t.home.howToPlay.step3.title,
                desc: t.home.howToPlay.step3.desc,
                color: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
              },
            ].map(({ step, title, desc, color }) => (
              <div key={step} className="flex flex-col items-center text-center gap-4">
                <div className={cn("h-14 w-14 rounded-full border-2 flex items-center justify-center text-lg font-black", color)}>
                  {step}
                </div>
                <div>
                  <h4 className="font-bold text-base text-foreground">{title}</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{desc}</p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
