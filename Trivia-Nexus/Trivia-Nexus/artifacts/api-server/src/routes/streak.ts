import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, userInventoryTable, marketplaceItemsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { checkAdCooldown } from "../lib/adTracker";
import { awardBattlePassXp } from "./xpHelper";
import { checkAndAwardBadges } from "./badgeChecker";
import { getRatesForMode } from "../lib/economyConfig";

const router: IRouter = Router();

function milestonesFromRates(rates: Record<string, number>): Record<number, number> {
  return { 7: rates.milestone7Coins, 30: rates.milestone30Coins, 100: rates.milestone100Coins };
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function dayBeforeYesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

// GET /api/streak
router.get("/streak", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const today = todayUTC();
    const nextMilestone = ([7, 30, 100] as number[]).find(m => m > profile.currentStreak) ?? null;
    const rates = await getRatesForMode("streak_checkin");

    res.json({
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      lastStreakDate: profile.lastStreakDate ?? null,
      checkedInToday: profile.lastStreakDate === today,
      adWatchesLeft: -1,
      nextMilestone,
      milestones: milestonesFromRates(rates),
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/streak/checkin
router.post("/streak/checkin", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const today = todayUTC();
    const yesterday = yesterdayUTC();
    const dayBeforeYesterday = dayBeforeYesterdayUTC();

    let newStreak = 1;
    let newLongest = 1;
    let freezeUsed = false;
    let milestoneCoins = 0;
    let alreadyCheckedInResult = false;
    const rates = await getRatesForMode("streak_checkin");
    const milestones = milestonesFromRates(rates);

    await db.transaction(async (tx) => {
      const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.userId, userId));
      if (!profile) {
        throw new Error("PROFILE_NOT_FOUND");
      }

      if (profile.lastStreakDate === today) {
        alreadyCheckedInResult = true;
        newStreak = profile.currentStreak;
        newLongest = profile.longestStreak;
        return;
      }

      newStreak = 1;
      if (profile.lastStreakDate === yesterday) {
        newStreak = profile.currentStreak + 1;
      } else if (profile.lastStreakDate === dayBeforeYesterday) {
        // Exactly one day was missed — a streak freeze can bridge this gap, but not a longer absence
        const [freezeItem] = await tx
          .select({ id: marketplaceItemsTable.id })
          .from(marketplaceItemsTable)
          .where(eq(marketplaceItemsTable.effect, "streak_freeze"))
          .limit(1);

        if (freezeItem) {
          const [inv] = await tx
            .select()
            .from(userInventoryTable)
            .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, freezeItem.id)));

          if (inv && inv.quantity > 0) {
            newStreak = profile.currentStreak + 1;
            freezeUsed = true;
            if (inv.quantity <= 1) {
              await tx.delete(userInventoryTable).where(eq(userInventoryTable.id, inv.id));
            } else {
              await tx
                .update(userInventoryTable)
                .set({ quantity: inv.quantity - 1 })
                .where(eq(userInventoryTable.id, inv.id));
            }
          }
        }
      }

      newLongest = Math.max(newStreak, profile.longestStreak);
      milestoneCoins = milestones[newStreak] ?? 0;

      const [updatedProfile] = await tx
        .update(profilesTable)
        .set({
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastStreakDate: today,
          ...(milestoneCoins > 0 ? { coins: sql`${profilesTable.coins} + ${milestoneCoins}` } : {}),
        })
        .where(and(
          eq(profilesTable.userId, userId),
          sql`${profilesTable.lastStreakDate} IS DISTINCT FROM ${today}`
        ))
        .returning();

      if (!updatedProfile) {
        throw new Error("ALREADY_CHECKED_IN");
      }
    });

    if (alreadyCheckedInResult) {
      res.json({
        currentStreak: newStreak,
        longestStreak: newLongest,
        alreadyCheckedIn: true,
        freezeUsed: false,
        milestoneReached: null,
        coinsAwarded: 0,
      });
      return;
    }

    // Award battle pass XP for daily streak checkin
    awardBattlePassXp(userId, rates.xpPerCheckin).catch(() => {});

    // Check streak badges
    checkAndAwardBadges(userId, { streakDays: newStreak }).catch(() => {});

    res.json({
      currentStreak: newStreak,
      longestStreak: newLongest,
      alreadyCheckedIn: false,
      freezeUsed,
      milestoneReached: milestoneCoins > 0 ? newStreak : null,
      coinsAwarded: milestoneCoins,
    });
  } catch (err: any) {
    if (err.message === "PROFILE_NOT_FOUND") {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    if (err.message === "ALREADY_CHECKED_IN") {
      res.status(409).json({ error: "Already checked in or session modified" });
      return;
    }
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/streak/watch-ad-coins
router.post("/streak/watch-ad-coins", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const cooldown = checkAdCooldown(req.user.id);
  if (!cooldown.allowed) {
    res.status(429).json({ error: "Ad reward cooldown active", remainingMs: cooldown.remainingMs });
    return;
  }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const { coins: coinsPerAd } = await getRatesForMode("streak_ad");

    const [updated] = await db
      .update(profilesTable)
      .set({ coins: sql`${profilesTable.coins} + ${coinsPerAd}` })
      .where(eq(profilesTable.userId, userId))
      .returning();

    if (!updated) {
       res.status(404).json({ error: "Profile not found" });
       return;
    }

    res.json({
      coinsEarned: coinsPerAd,
      totalCoins: updated.coins,
      adWatchesLeft: -1,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
