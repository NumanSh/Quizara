import { db } from "@workspace/db";
import { userBattlePassTable, profilesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export const AD_XP = 50;
export const CORRECT_ANSWER_XP = 10;
export const QUIZ_COMPLETE_XP = 25;
export const STREAK_CHECKIN_XP = 20;

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
  await Promise.all([
    db.insert(userBattlePassTable)
      .values({ userId, seasonXp: xp, claimedFreeTiers: [], claimedPremiumTiers: [] })
      .onConflictDoUpdate({
        target: userBattlePassTable.userId,
        set: { seasonXp: sql`user_battle_pass.season_xp + ${xp}` },
      }),
    db.insert(profilesTable)
      .values({ userId, totalXp: xp })
      .onConflictDoUpdate({
        target: profilesTable.userId,
        set: { totalXp: sql`profiles.total_xp + ${xp}` },
      }),
  ]);
}
