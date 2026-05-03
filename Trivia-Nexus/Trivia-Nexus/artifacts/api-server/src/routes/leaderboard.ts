import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, usersTable, arenaStatsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);

    const rows = await db
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
