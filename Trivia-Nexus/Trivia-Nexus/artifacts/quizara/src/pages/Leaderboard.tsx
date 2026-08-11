import { useState } from "react";
import {
  useGetLeaderboard, getGetLeaderboardQueryKey,
  useGetCountryLeaderboard, getGetCountryLeaderboardQueryKey,
  useGetMyRank, getGetMyRankQueryKey,
  useGetArenaLeaderboard, getGetArenaLeaderboardQueryKey,
} from "@workspace/api-client-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Globe, User, Swords, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];

function PositionBadge({ rank }: { rank: number }) {
  const { t } = useI18n();
  if (rank <= 3) {
    return (
      <span className="text-xl select-none" aria-label={t.leaderboard.rankAria.replace("{rank}", String(rank))}>
        {MEDALS[rank - 1]}
      </span>
    );
  }
  return (
    <span className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center text-sm font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

function WinRateBar({ winRate }: { winRate: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-secondary to-primary transition-all"
          style={{ width: `${winRate}%` }}
        />
      </div>
      <span className="text-xs font-bold text-muted-foreground w-8 text-right">{winRate}%</span>
    </div>
  );
}

export default function Leaderboard() {
  const { t } = useI18n();
  const { isAuthenticated } = useSupabaseAuth();
  const [period, setPeriod] = useState<"all_time" | "weekly">("all_time");

  const { data: globalBoard, isLoading: loadingGlobal } = useGetLeaderboard(
    { period },
    { query: { queryKey: getGetLeaderboardQueryKey({ period }) } }
  );

  const { data: countryBoard, isLoading: loadingCountry } = useGetCountryLeaderboard({
    query: { queryKey: getGetCountryLeaderboardQueryKey() },
  });

  const { data: myRank } = useGetMyRank({
    query: {
      queryKey: getGetMyRankQueryKey(),
      enabled: isAuthenticated,
    },
  });

  const { data: arenaBoard, isLoading: loadingArena } = useGetArenaLeaderboard(
    {},
    { query: { queryKey: getGetArenaLeaderboardQueryKey({}) } }
  );

  return (
    <div className="flex-1 w-full bg-background py-10">
      <div className="container max-w-4xl mx-auto px-4">

        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{t.leaderboard.title}</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {t.leaderboard.subtitleFull}
          </p>
        </div>

        {/* My Rank Banner */}
        {isAuthenticated && myRank && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary/10 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">{t.leaderboard.myRank}</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <div className="font-bold text-xl text-foreground">#{myRank.rank}</div>
                <div className="text-muted-foreground text-xs">{t.leaderboard.position}</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-xl text-foreground">{myRank.totalScore}</div>
                <div className="text-muted-foreground text-xs">{t.leaderboard.score}</div>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="global" className="space-y-6">
          <TabsList className="w-full bg-card border border-border h-12">
            <TabsTrigger value="global" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Trophy className="mr-2 h-4 w-4" />
              {t.leaderboard.global}
            </TabsTrigger>
            <TabsTrigger value="arena" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Swords className="mr-2 h-4 w-4" />
              {t.leaderboard.arena}
            </TabsTrigger>
            <TabsTrigger value="countries" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Globe className="mr-2 h-4 w-4" />
              {t.leaderboard.countries}
            </TabsTrigger>
          </TabsList>

          {/* ── Global Tab ── */}
          <TabsContent value="global" className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setPeriod("all_time")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                  period === "all_time"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 bg-card"
                )}
              >
                {t.leaderboard.allTime}
              </button>
              <button
                onClick={() => setPeriod("weekly")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                  period === "weekly"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 bg-card"
                )}
              >
                {t.leaderboard.weekly}
              </button>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {loadingGlobal ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-5 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : !globalBoard?.length ? (
                <div className="py-20 text-center text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">{t.leaderboard.noData}</p>
                  <p className="text-sm mt-1">{t.leaderboard.beFirst}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {globalBoard.map((entry, idx) => (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-4 p-4 transition-colors hover:bg-muted/30",
                        idx === 0 && "bg-yellow-500/5"
                      )}
                    >
                      <div className="w-8 flex items-center justify-center">
                        <PositionBadge rank={entry.rank} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{entry.username || t.leaderboard.anonymous}</p>
                        <p className="text-xs text-muted-foreground">{t.leaderboard.gamesPlayedCount.replace("{count}", String(entry.gamesPlayed))}</p>
                      </div>
                      {entry.country && (
                        <span className="text-sm text-muted-foreground hidden sm:block">{entry.country}</span>
                      )}
                      <div className="text-right">
                        <p className={cn("font-bold text-lg", idx === 0 && "text-yellow-400")}>{entry.totalScore}</p>
                        <p className="text-xs text-muted-foreground">{t.leaderboard.pts}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Arena Tab ── */}
          <TabsContent value="arena" className="space-y-4">
            {/* Info strip */}
            <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4 flex items-center gap-3 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-secondary shrink-0" />
              {t.leaderboard.rankedByHint}
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {loadingArena ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-5 w-24 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : !arenaBoard?.length ? (
                <div className="py-20 text-center text-muted-foreground">
                  <Swords className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">{t.leaderboard.noArenaBattles}</p>
                  <p className="text-sm mt-1">{t.leaderboard.beFirstArenaWin}</p>
                </div>
              ) : (
                <>
                  {/* Header row */}
                  <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="w-8" />
                    <div className="flex-1">{t.leaderboard.player}</div>
                    <div className="hidden sm:flex gap-6 text-center">
                      <span className="w-10">{t.leaderboard.winAbbr}</span>
                      <span className="w-10">{t.leaderboard.lossAbbr}</span>
                      <span className="w-10">{t.leaderboard.drawAbbr}</span>
                    </div>
                    <div className="w-24 text-right hidden md:block">{t.leaderboard.winRate}</div>
                    <div className="w-16 text-right">{t.leaderboard.score}</div>
                  </div>
                  <div className="divide-y divide-border">
                    {arenaBoard.map((entry, idx) => (
                      <div
                        key={entry.userId}
                        className={cn(
                          "flex items-center gap-4 p-4 transition-colors hover:bg-muted/30",
                          idx === 0 && "bg-yellow-500/5"
                        )}
                      >
                        <div className="w-8 flex items-center justify-center shrink-0">
                          <PositionBadge rank={entry.rank} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{entry.username || t.leaderboard.anonymous}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            {t.leaderboard.winLossDrawRate.replace("{wins}", String(entry.wins)).replace("{losses}", String(entry.losses)).replace("{draws}", String(entry.draws)).replace("{rate}", String(entry.winRate))}
                          </p>
                          <p className="text-xs text-muted-foreground hidden sm:block">{t.leaderboard.matchesPlayed.replace("{count}", String(entry.totalGames))}</p>
                        </div>

                        {/* W / L / D columns — desktop */}
                        <div className="hidden sm:flex gap-6 text-center text-sm font-semibold">
                          <span className="w-10 text-green-400">{entry.wins}</span>
                          <span className="w-10 text-red-400">{entry.losses}</span>
                          <span className="w-10 text-muted-foreground">{entry.draws}</span>
                        </div>

                        {/* Win rate bar — desktop */}
                        <div className="w-24 hidden md:block">
                          <WinRateBar winRate={entry.winRate} />
                        </div>

                        <div className="w-16 text-right">
                          <p className={cn("font-bold text-base", idx === 0 && "text-yellow-400")}>{entry.totalScore}</p>
                          <p className="text-xs text-muted-foreground">{t.leaderboard.pts}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Countries Tab ── */}
          <TabsContent value="countries">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {loadingCountry ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-5 w-20 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : !countryBoard?.length ? (
                <div className="py-20 text-center text-muted-foreground">
                  <Globe className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">{t.leaderboard.noCountryData}</p>
                  <p className="text-sm mt-1">{t.leaderboard.setCountryHint}</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {countryBoard.map((entry, idx) => (
                    <div
                      key={entry.country}
                      className={cn(
                        "flex items-center gap-4 p-4 transition-colors hover:bg-muted/30",
                        idx === 0 && "bg-yellow-500/5"
                      )}
                    >
                      <div className="w-8 flex items-center justify-center">
                        <PositionBadge rank={entry.rank} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{entry.country}</p>
                        <p className="text-xs text-muted-foreground">{t.leaderboard.playersCount.replace("{count}", String(entry.playerCount))}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-bold text-lg", idx === 0 && "text-yellow-400")}>{entry.totalScore}</p>
                        <p className="text-xs text-muted-foreground">{t.leaderboard.totalPts}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
