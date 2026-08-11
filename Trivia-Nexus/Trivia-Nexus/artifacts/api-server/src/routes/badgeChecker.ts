import { db, badgesTable, userBadgesTable, profilesTable, arenaStatsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface BadgeCheckContext {
  answerTimeMs?: number;  // for speed_answer
  quizCorrect?: number;   // for perfect_quiz
  quizTotal?: number;     // for perfect_quiz
  streakDays?: number;    // for streak_days
  arenaWin?: boolean;     // for first_arena_win
}

export interface EarnedBadge {
  name: string;
  icon: string;
  coinReward: number;
}

export async function checkAndAwardBadges(userId: string, ctx: BadgeCheckContext): Promise<EarnedBadge[]> {
  if (userId.startsWith("guest_")) return [];
  const newBadges: EarnedBadge[] = [];
  try {
    const allBadges = await db.select().from(badgesTable).where(eq(badgesTable.isActive, true));
    if (allBadges.length === 0) return [];

    const earnedRows = await db
      .select({ badgeId: userBadgesTable.badgeId })
      .from(userBadgesTable)
      .where(eq(userBadgesTable.userId, userId));
    const earnedIds = new Set(earnedRows.map(r => r.badgeId));

    const unearnedBadges = allBadges.filter(b => !earnedIds.has(b.id));
    if (unearnedBadges.length === 0) return [];

    const needsProfile = unearnedBadges.some(b => ["total_score", "games_played"].includes(b.triggerType));
    const needsArena = unearnedBadges.some(b => ["total_arena_wins", "first_arena_win"].includes(b.triggerType));

    let profile: any = null;
    let arenaStats: any = null;
    if (needsProfile) {
      [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    }
    if (needsArena) {
      [arenaStats] = await db.select().from(arenaStatsTable).where(eq(arenaStatsTable.userId, userId));
    }

    for (const badge of unearnedBadges) {
      let qualified = false;
      switch (badge.triggerType) {
        case "speed_answer":
          qualified = ctx.answerTimeMs !== undefined && ctx.answerTimeMs < (badge.triggerValue ?? 3000);
          break;
        case "perfect_quiz":
          qualified =
            ctx.quizCorrect !== undefined &&
            ctx.quizTotal !== undefined &&
            ctx.quizTotal > 0 &&
            ctx.quizCorrect === ctx.quizTotal;
          break;
        case "streak_days":
          qualified = ctx.streakDays !== undefined && ctx.streakDays >= (badge.triggerValue ?? 7);
          break;
        case "first_arena_win":
          // `>= 1`, not `=== 1`: the badge is only ever checked for players who
          // have not earned it, so an exact match would permanently lock out
          // anyone who already had wins when the badge was created or activated.
          qualified = ctx.arenaWin === true && (arenaStats?.wins ?? 0) >= 1;
          break;
        case "total_arena_wins":
          qualified = (arenaStats?.wins ?? 0) >= (badge.triggerValue ?? 1);
          break;
        case "games_played":
          qualified = (profile?.gamesPlayed ?? 0) >= (badge.triggerValue ?? 1);
          break;
        case "total_score":
          qualified = (profile?.totalScore ?? 0) >= (badge.triggerValue ?? 1000);
          break;
        case "manual":
          qualified = false;
          break;
      }
      if (!qualified) continue;

      await db.insert(userBadgesTable).values({
        userId,
        badgeId: badge.id,
        coinsClaimed: badge.coinReward === 0,
      }).onConflictDoNothing();
      newBadges.push({ name: badge.name, icon: badge.icon, coinReward: badge.coinReward });
    }
  } catch (err) {
    logger.error({ err }, "checkAndAwardBadges failed");
  }
  return newBadges;
}
