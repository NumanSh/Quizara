import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, userInventoryTable, marketplaceItemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { awardBattlePassXp, STREAK_CHECKIN_XP } from "./xpHelper";
import { checkAndAwardBadges } from "./badgeChecker";

const router: IRouter = Router();

const COINS_PER_AD = 75;
const MILESTONES: Record<number, number> = { 7: 50, 30: 200, 100: 500 };

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// GET /api/streak
router.get("/api/streak", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const today = todayUTC();
    const nextMilestone = ([7, 30, 100] as number[]).find(m => m > profile.currentStreak) ?? null;

    res.json({
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      lastStreakDate: profile.lastStreakDate ?? null,
      checkedInToday: profile.lastStreakDate === today,
      adWatchesLeft: -1,
      nextMilestone,
      milestones: MILESTONES,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/streak/checkin
router.post("/api/streak/checkin", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const today = todayUTC();
    const yesterday = yesterdayUTC();

    if (profile.lastStreakDate === today) {
      res.json({
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        alreadyCheckedIn: true,
        freezeUsed: false,
        milestoneReached: null,
        coinsAwarded: 0,
      });
      return;
    }

    let newStreak = 1;
    let freezeUsed = false;

    if (profile.lastStreakDate === yesterday) {
      newStreak = profile.currentStreak + 1;
    } else if (profile.lastStreakDate) {
      const [freezeItem] = await db
        .select({ id: marketplaceItemsTable.id })
        .from(marketplaceItemsTable)
        .where(eq(marketplaceItemsTable.effect, "streak_freeze"))
        .limit(1);

      if (freezeItem) {
        const [inv] = await db
          .select()
          .from(userInventoryTable)
          .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, freezeItem.id)));

        if (inv && inv.quantity > 0) {
          newStreak = profile.currentStreak + 1;
          freezeUsed = true;
          if (inv.quantity <= 1) {
            await db.delete(userInventoryTable).where(eq(userInventoryTable.id, inv.id));
          } else {
            await db
              .update(userInventoryTable)
              .set({ quantity: inv.quantity - 1 })
              .where(eq(userInventoryTable.id, inv.id));
          }
        }
      }
    }

    const newLongest = Math.max(newStreak, profile.longestStreak);
    const milestoneCoins = MILESTONES[newStreak] ?? 0;

    await db
      .update(profilesTable)
      .set({
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastStreakDate: today,
        ...(milestoneCoins > 0 ? { coins: profile.coins + milestoneCoins } : {}),
      })
      .where(eq(profilesTable.userId, userId));

    // Award battle pass XP for daily streak checkin
    awardBattlePassXp(userId, STREAK_CHECKIN_XP).catch(() => {});

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
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/streak/watch-ad-coins
router.post("/api/streak/watch-ad-coins", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const newCoins = profile.coins + COINS_PER_AD;

    await db
      .update(profilesTable)
      .set({ coins: newCoins })
      .where(eq(profilesTable.userId, userId));

    res.json({
      coinsEarned: COINS_PER_AD,
      totalCoins: newCoins,
      adWatchesLeft: -1,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
