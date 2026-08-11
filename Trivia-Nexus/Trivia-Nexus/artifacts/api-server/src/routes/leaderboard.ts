import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, usersTable, arenaStatsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

interface LeaderboardRow {
  userId: string;
  username: string | null;
  country: string | null;
  totalScore: number;
  gamesPlayed: number;
  profileImageUrl: string | null;
}

/**
 * Score earned in the last 7 days, summed across the two modes that keep a
 * timestamped per-game record: classic/level quizzes (`quiz_sessions`) and
 * Blitz (`user_blitz_attempts`). Arena has no per-match history table — only
 * the aggregate in `arena_stats` — so arena points cannot be windowed and are
 * excluded from the weekly board.
 */
async function getWeeklyLeaderboard(limit: number): Promise<LeaderboardRow[]> {
  const result = await db.execute(sql`
    WITH earned AS (
      SELECT user_id, SUM(score)::int AS score, COUNT(*)::int AS games
      FROM quiz_sessions
      WHERE status = 'completed'
        AND user_id IS NOT NULL
        AND completed_at >= now() - interval '7 days'
      GROUP BY user_id
      UNION ALL
      -- Blitz credits points to the profile per answer, so an abandoned run's
      -- score is already banked and must be counted here to stay consistent
      -- with the all-time board. Only *completed* runs count as a game played.
      SELECT user_id,
             SUM(points_earned)::int AS score,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS games
      FROM user_blitz_attempts
      WHERE started_at >= now() - interval '7 days'
      GROUP BY user_id
    ), totals AS (
      SELECT user_id, SUM(score)::int AS total_score, SUM(games)::int AS games_played
      FROM earned
      GROUP BY user_id
    )
    SELECT t.user_id, p.username, p.country, t.total_score, t.games_played, u.profile_image_url
    FROM totals t
    JOIN profiles p ON p.user_id = t.user_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.total_score > 0
    ORDER BY t.total_score DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row: Record<string, unknown>) => ({
    userId: String(row.user_id),
    username: String(row.username),
    country: (row.country as string | null) ?? null,
    totalScore: Number(row.total_score),
    gamesPlayed: Number(row.games_played),
    profileImageUrl: (row.profile_image_url as string | null) ?? null,
  }));
}

async function getAllTimeLeaderboard(limit: number): Promise<LeaderboardRow[]> {
  return db
    .select({
      userId: profilesTable.userId,
      username: profilesTable.username,
      country: profilesTable.country,
      totalScore: profilesTable.totalScore,
      gamesPlayed: profilesTable.gamesPlayed,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(profilesTable)
    .leftJoin(usersTable, eq(profilesTable.userId, usersTable.id))
    .orderBy(desc(profilesTable.totalScore))
    .limit(limit);
}

router.get("/leaderboard", async (req, res) => {
  try {
    // Guard against NaN: a non-numeric ?limit would otherwise reach SQL as
    // `LIMIT NaN` and blow up the query.
    const parsedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(1, Math.trunc(parsedLimit)), 100) : 50;
    const period = req.query.period === "weekly" ? "weekly" : "all_time";

    const rows = period === "weekly"
      ? await getWeeklyLeaderboard(limit)
      : await getAllTimeLeaderboard(limit);

    const result = rows.map((row, i) => ({
      rank: i + 1,
      userId: row.userId,
      username: row.username,
      profileImageUrl: row.profileImageUrl ?? null,
      totalScore: row.totalScore,
      gamesPlayed: row.gamesPlayed,
      country: row.country,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get leaderboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard/countries", async (req, res) => {
  try {
    const rows = await db
      .select({
        country: profilesTable.country,
        totalScore: sql<number>`sum(total_score)`,
        playerCount: sql<number>`count(*)`,
        avgScore: sql<number>`avg(total_score)`,
      })
      .from(profilesTable)
      .where(sql`country IS NOT NULL`)
      .groupBy(profilesTable.country)
      .orderBy(desc(sql`sum(total_score)`))
      .limit(100);

    const result = rows.map((row, i) => ({
      rank: i + 1,
      country: row.country ?? "",
      totalScore: Number(row.totalScore),
      playerCount: Number(row.playerCount),
      avgScore: Number(row.avgScore ?? 0),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get country leaderboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard/me", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) {
      res.json({ rank: null, totalScore: 0, gamesPlayed: 0, percentile: 0 });
      return;
    }

    const [higherCount] = await db.select({ count: sql<number>`count(*)` }).from(profilesTable).where(sql`total_score > ${profile.totalScore}`);
    const [totalCount] = await db.select({ count: sql<number>`count(*)` }).from(profilesTable);

    const rank = Number(higherCount?.count ?? 0) + 1;
    const total = Number(totalCount?.count ?? 1);
    const percentile = Math.round(((total - rank + 1) / total) * 100);

    res.json({
      rank,
      totalScore: profile.totalScore,
      gamesPlayed: profile.gamesPlayed,
      percentile,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get my rank");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard/arena/me", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;

    const [stats] = await db
      .select()
      .from(arenaStatsTable)
      .where(eq(arenaStatsTable.userId, userId));

    if (!stats) {
      res.json({ rank: null, wins: 0, losses: 0, draws: 0, totalGames: 0, totalScore: 0, winRate: 0 });
      return;
    }

    const [higherCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(arenaStatsTable)
      .where(sql`wins > ${stats.wins} OR (wins = ${stats.wins} AND total_score > ${stats.totalScore})`);

    const rank = Number(higherCount?.count ?? 0) + 1;
    const winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;

    res.json({
      rank,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      totalGames: stats.totalGames,
      totalScore: stats.totalScore,
      winRate,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get my arena stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard/arena", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);

    const rows = await db
      .select({
        userId: arenaStatsTable.userId,
        username: profilesTable.username,
        profileImageUrl: usersTable.profileImageUrl,
        wins: arenaStatsTable.wins,
        losses: arenaStatsTable.losses,
        draws: arenaStatsTable.draws,
        totalGames: arenaStatsTable.totalGames,
        totalScore: arenaStatsTable.totalScore,
      })
      .from(arenaStatsTable)
      .leftJoin(profilesTable, eq(arenaStatsTable.userId, profilesTable.userId))
      .leftJoin(usersTable, eq(arenaStatsTable.userId, usersTable.id))
      .orderBy(desc(arenaStatsTable.wins), desc(arenaStatsTable.totalScore))
      .limit(limit);

    const result = rows.map((row, i) => ({
      rank: i + 1,
      userId: row.userId,
      username: row.username ?? null,
      profileImageUrl: row.profileImageUrl ?? null,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      totalGames: row.totalGames,
      totalScore: row.totalScore,
      winRate: row.totalGames > 0 ? Math.round((row.wins / row.totalGames) * 100) : 0,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get arena leaderboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
