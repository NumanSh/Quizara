import { db } from "@workspace/db";
import { userBattlePassTable, profilesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export const AD_XP = 50;

export const XP_RANKS = [
  { title: "Rookie",  minXp: 0 },
  { title: "Scholar", minXp: 500 },
  { title: "Expert",  minXp: 2000 },
  { title: "Master",  minXp: 5000 },
  { title: "Legend",  minXp: 10000 },
] as const;

export function getRankTitle(totalXp: number): string {
  for (let i = XP_RANKS.length - 1; i >= 0; i--) {
    if (totalXp >= XP_RANKS[i].minXp) return XP_RANKS[i].title;
  }
  return "Rookie";
}

export async function awardBattlePassXp(userId: string, xp: number): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(userBattlePassTable)
        .values({ userId, seasonXp: xp, claimedFreeTiers: [], claimedPremiumTiers: [] })
        .onConflictDoUpdate({
          target: userBattlePassTable.userId,
          set: { seasonXp: sql`${userBattlePassTable.seasonXp} + ${xp}` },
        });
      await tx.insert(profilesTable)
        .values({ userId, totalXp: xp })
        .onConflictDoUpdate({
          target: profilesTable.userId,
          set: { totalXp: sql`${profilesTable.totalXp} + ${xp}` },
        });
    });
  } catch (err) {
    logger.error({ err, userId, xp }, "Failed to award battle pass XP");
    throw err;
  }
}
