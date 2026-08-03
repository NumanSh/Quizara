import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  userBattlePassTable,
  profilesTable,
  marketplaceItemsTable,
  userInventoryTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { awardBattlePassXp, AD_XP } from "./xpHelper";
import { checkAdCooldown } from "../lib/adTracker";

const router: IRouter = Router();

export const PREMIUM_COST = 1500;
export const XP_PER_TIER = 200;
export const SEASON_NAME = "Season 1";
export const SEASON_TOTAL_TIERS = 30;

interface TierReward {
  type: "coins" | "hearts" | "item";
  amount?: number;
  effect?: string;
  emoji: string;
  label: string;
}

interface TierDef {
  tier: number;
  xpRequired: number;
  free: TierReward;
  premium: TierReward;
}

const coins = (amount: number): TierReward => ({ type: "coins", amount, emoji: "💎", label: `${amount} Coins` });
const hearts = (amount: number): TierReward => ({ type: "hearts", amount, emoji: "❤️", label: `${amount} Heart${amount > 1 ? "s" : ""}` });
const item = (effect: string, emoji: string, label: string): TierReward => ({ type: "item", effect, emoji, label });

export const TIERS: TierDef[] = [
  { tier: 1,  xpRequired: 200,  free: coins(50),  premium: coins(200) },
  { tier: 2,  xpRequired: 400,  free: hearts(1),  premium: coins(400) },
  { tier: 3,  xpRequired: 600,  free: coins(75),  premium: item("fifty_fifty", "✂️", "50/50") },
  { tier: 4,  xpRequired: 800,  free: coins(100), premium: coins(500) },
  { tier: 5,  xpRequired: 1000, free: hearts(1),  premium: item("freeze_timer", "❄️", "Freeze Timer") },
  { tier: 6,  xpRequired: 1200, free: coins(100), premium: coins(600) },
  { tier: 7,  xpRequired: 1400, free: coins(125), premium: item("streak_freeze", "🛡️", "Streak Freeze") },
  { tier: 8,  xpRequired: 1600, free: hearts(2),  premium: coins(750) },
  { tier: 9,  xpRequired: 1800, free: coins(150), premium: item("extra_time", "⏰", "Extra Time") },
  { tier: 10, xpRequired: 2000, free: coins(200), premium: coins(1000) },
  { tier: 11, xpRequired: 2200, free: hearts(1),  premium: item("fifty_fifty", "✂️", "50/50") },
  { tier: 12, xpRequired: 2400, free: coins(175), premium: coins(800) },
  { tier: 13, xpRequired: 2600, free: coins(200), premium: item("skip_question", "⏩", "Skip Question") },
  { tier: 14, xpRequired: 2800, free: hearts(1),  premium: coins(1000) },
  { tier: 15, xpRequired: 3000, free: coins(250), premium: coins(1500) },
  { tier: 16, xpRequired: 3200, free: coins(200), premium: item("freeze_timer", "❄️", "Freeze Timer") },
  { tier: 17, xpRequired: 3400, free: hearts(2),  premium: coins(1000) },
  { tier: 18, xpRequired: 3600, free: coins(250), premium: item("streak_freeze", "🛡️", "Streak Freeze") },
  { tier: 19, xpRequired: 3800, free: coins(275), premium: coins(1200) },
  { tier: 20, xpRequired: 4000, free: hearts(1),  premium: item("fifty_fifty", "✂️", "50/50") },
  { tier: 21, xpRequired: 4200, free: coins(300), premium: coins(1500) },
  { tier: 22, xpRequired: 4400, free: hearts(2),  premium: item("extra_time", "⏰", "Extra Time") },
  { tier: 23, xpRequired: 4600, free: coins(325), premium: coins(1200) },
  { tier: 24, xpRequired: 4800, free: hearts(1),  premium: item("skip_question", "⏩", "Skip Question") },
  { tier: 25, xpRequired: 5000, free: coins(400), premium: coins(2000) },
  { tier: 26, xpRequired: 5200, free: hearts(2),  premium: item("freeze_timer", "❄️", "Freeze Timer") },
  { tier: 27, xpRequired: 5400, free: coins(400), premium: coins(1500) },
  { tier: 28, xpRequired: 5600, free: hearts(3),  premium: item("streak_freeze", "🛡️", "Streak Freeze") },
  { tier: 29, xpRequired: 5800, free: coins(450), premium: coins(2000) },
  { tier: 30, xpRequired: 6000, free: coins(500), premium: coins(3000) },
];

function getCurrentTier(xp: number): number {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (xp >= TIERS[i].xpRequired) return TIERS[i].tier;
  }
  return 0;
}

// GET /api/battlepass
router.get("/api/battlepass", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const [bp] = await db.select().from(userBattlePassTable).where(eq(userBattlePassTable.userId, userId));

    const seasonXp = bp?.seasonXp ?? 0;
    const isPremium = bp?.isPremium ?? false;
    const claimedFreeTiers = (bp?.claimedFreeTiers as number[]) ?? [];
    const claimedPremiumTiers = (bp?.claimedPremiumTiers as number[]) ?? [];
    const currentTier = getCurrentTier(seasonXp);

    res.json({
      seasonName: SEASON_NAME,
      seasonXp,
      currentTier,
      isPremium,
      claimedFreeTiers,
      claimedPremiumTiers,
      premiumCost: PREMIUM_COST,
      tiers: TIERS,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/battlepass/watch-ad-xp
router.post("/api/battlepass/watch-ad-xp", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const cooldown = checkAdCooldown(req.user.id);
  if (!cooldown.allowed) {
    res.status(429).json({ error: "Ad reward cooldown active", remainingMs: cooldown.remainingMs });
    return;
  }
  try {
    await awardBattlePassXp(req.user.id, AD_XP);
    const [bp] = await db.select().from(userBattlePassTable).where(eq(userBattlePassTable.userId, req.user.id));
    res.json({ xpAwarded: AD_XP, totalXp: bp?.seasonXp ?? AD_XP });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/battlepass/premium
router.post("/api/battlepass/premium", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    let [bp] = await db.select().from(userBattlePassTable).where(eq(userBattlePassTable.userId, userId));
    if (!bp) {
      [bp] = await db.insert(userBattlePassTable)
        .values({ userId, isPremium: false, claimedFreeTiers: [], claimedPremiumTiers: [] })
        .returning();
    }

    if (bp.isPremium) { res.json({ isPremium: true, message: "Already premium" }); return; }


    if (profile.coins < PREMIUM_COST) {
      res.status(402).json({ error: "Not enough coins", required: PREMIUM_COST, current: profile.coins });
      return;
    }

    // Transition battle pass status to premium first
    const [updatedBp] = await db.update(userBattlePassTable)
      .set({ isPremium: true })
      .where(and(
        eq(userBattlePassTable.userId, userId),
        eq(userBattlePassTable.isPremium, false)
      ))
      .returning();

    if (!updatedBp) {
      res.status(409).json({ error: "Purchase already in progress or completed" });
      return;
    }

    // Deduct coins atomically
    const [updatedProfile] = await db
      .update(profilesTable)
      .set({ coins: sql`${profilesTable.coins} - ${PREMIUM_COST}` })
      .where(and(
        eq(profilesTable.userId, userId),
        sql`${profilesTable.coins} >= ${PREMIUM_COST}`
      ))
      .returning();

    if (!updatedProfile) {
      // Revert BP if coin deduction fails
      await db.update(userBattlePassTable)
        .set({ isPremium: false })
        .where(eq(userBattlePassTable.userId, userId));

      res.status(402).json({ error: "Insufficient coins" });
      return;
    }

    res.json({ isPremium: true, coinsSpent: PREMIUM_COST, remainingCoins: updatedProfile.coins });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/battlepass/claim
router.post("/api/battlepass/claim", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = req.user.id;
    const { tier, rewardType } = req.body as { tier: number; rewardType: "free" | "premium" };

    const tierDef = TIERS.find(t => t.tier === tier);
    if (!tierDef) { res.status(400).json({ error: "Invalid tier" }); return; }

    const [bp] = await db.select().from(userBattlePassTable).where(eq(userBattlePassTable.userId, userId));
    if (!bp) { res.status(404).json({ error: "No battle pass found" }); return; }

    const claimedFree = (bp.claimedFreeTiers as number[]) ?? [];
    const claimedPremium = (bp.claimedPremiumTiers as number[]) ?? [];
    const currentTier = getCurrentTier(bp.seasonXp);

    if (tier > currentTier) { res.status(400).json({ error: "Tier not yet unlocked" }); return; }

    if (rewardType === "premium" && !bp.isPremium) {
      res.status(403).json({ error: "Premium pass required" }); return;
    }

    if (rewardType === "free" && claimedFree.includes(tier)) {
      res.status(409).json({ error: "Already claimed" }); return;
    }
    if (rewardType === "premium" && claimedPremium.includes(tier)) {
      res.status(409).json({ error: "Already claimed" }); return;
    }

    const reward = rewardType === "free" ? tierDef.free : tierDef.premium;
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const newClaimedFree = rewardType === "free" ? [...claimedFree, tier] : claimedFree;
    const newClaimedPremium = rewardType === "premium" ? [...claimedPremium, tier] : claimedPremium;

    await db.transaction(async (tx) => {
      const [updatedBp] = await tx.update(userBattlePassTable)
        .set({ claimedFreeTiers: newClaimedFree, claimedPremiumTiers: newClaimedPremium })
        .where(and(
          eq(userBattlePassTable.userId, userId),
          rewardType === "free"
            ? sql`NOT (${userBattlePassTable.claimedFreeTiers} @> ${JSON.stringify([tier])}::jsonb)`
            : sql`NOT (${userBattlePassTable.claimedPremiumTiers} @> ${JSON.stringify([tier])}::jsonb)`
        ))
        .returning();

      if (!updatedBp) {
        throw new Error("ALREADY_CLAIMED");
      }

      if (reward.type === "coins") {
        await tx.update(profilesTable).set({ coins: sql`${profilesTable.coins} + ${reward.amount ?? 0}` }).where(eq(profilesTable.userId, userId));
      } else if (reward.type === "hearts") {
        await tx.update(profilesTable).set({ hearts: sql`LEAST(6, ${profilesTable.hearts} + ${reward.amount ?? 1})` }).where(eq(profilesTable.userId, userId));
      } else if (reward.type === "item" && reward.effect) {
        const [item] = await tx.select().from(marketplaceItemsTable).where(eq(marketplaceItemsTable.effect, reward.effect)).limit(1);
        if (item) {
          await tx.insert(userInventoryTable)
            .values({ userId, itemId: item.id, quantity: 1 })
            .onConflictDoUpdate({
              target: [userInventoryTable.userId, userInventoryTable.itemId],
              set: { quantity: sql`${userInventoryTable.quantity} + 1` }
            });
        }
      }
    });

    res.json({ claimed: true, reward, tier, rewardType });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_CLAIMED") {
      res.status(409).json({ error: "Reward already claimed or session modified" });
      return;
    }
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
