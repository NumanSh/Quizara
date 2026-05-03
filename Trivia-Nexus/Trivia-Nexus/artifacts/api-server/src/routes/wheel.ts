import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, marketplaceItemsTable, userInventoryTable, userBattlePassTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

interface Segment {
  id: string;
  label: string;
  emoji: string;
  type: "coins" | "heart" | "powerup" | "xp" | "jackpot";
  amount: number;
  weight: number;
  color: string;
}

export const WHEEL_SEGMENTS: Segment[] = [
  { id: "coins_50",  label: "50 Coins",    emoji: "🪙", type: "coins",   amount: 50,  weight: 30, color: "#F59E0B" },
  { id: "coins_100", label: "100 Coins",   emoji: "🪙", type: "coins",   amount: 100, weight: 20, color: "#EAB308" },
  { id: "heart_1",   label: "1 Heart",     emoji: "❤️",  type: "heart",   amount: 1,   weight: 20, color: "#EF4444" },
  { id: "coins_200", label: "200 Coins",   emoji: "🪙", type: "coins",   amount: 200, weight: 10, color: "#D97706" },
  { id: "heart_2",   label: "2 Hearts",    emoji: "❤️",  type: "heart",   amount: 2,   weight: 10, color: "#EC4899" },
  { id: "powerup",   label: "Power-Up!",   emoji: "⚡", type: "powerup", amount: 1,   weight: 5,  color: "#8B5CF6" },
  { id: "xp_100",    label: "+100 XP",     emoji: "⭐", type: "xp",      amount: 100, weight: 4,  color: "#3B82F6" },
  { id: "jackpot",   label: "JACKPOT!",    emoji: "🏆", type: "jackpot", amount: 500, weight: 1,  color: "#10B981" },
];

function pickSegment(): Segment {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let rand = Math.random() * total;
  for (const seg of WHEEL_SEGMENTS) {
    rand -= seg.weight;
    if (rand <= 0) return seg;
  }
  return WHEEL_SEGMENTS[0];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /wheel/status — can the user spin today?
router.get("/wheel/status", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.json({ canSpin: false, extraSpins: 0, requiresAuth: true });
    return;
  }
  try {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const today = todayUtc();
    const hasUsedFreeSpinToday = profile.lastWheelDate === today;
    const extraSpins = profile.extraWheelSpins ?? 0;
    const canSpin = !hasUsedFreeSpinToday || extraSpins > 0;

    res.json({
      canSpin,
      freeSpinAvailable: !hasUsedFreeSpinToday,
      extraSpins,
      lastWheelDate: profile.lastWheelDate,
      segments: WHEEL_SEGMENTS.map(s => ({ id: s.id, label: s.label, emoji: s.emoji, color: s.color })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get wheel status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /wheel/spin — execute a spin
router.post("/wheel/spin", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const today = todayUtc();
    const hasUsedFreeSpinToday = profile.lastWheelDate === today;
    const extraSpins = profile.extraWheelSpins ?? 0;

    if (hasUsedFreeSpinToday && extraSpins <= 0) {
      res.status(429).json({ error: "No spins available", nextSpinAt: "tomorrow" });
      return;
    }

    // Pick a random segment
    const segment = pickSegment();
    const segIndex = WHEEL_SEGMENTS.findIndex(s => s.id === segment.id);

    // Apply the reward
    let coinsGained = 0;
    let heartsGained = 0;
    let xpGained = 0;
    let powerupName: string | null = null;

    if (segment.type === "coins") {
      coinsGained = segment.amount;
    } else if (segment.type === "jackpot") {
      coinsGained = segment.amount;
    } else if (segment.type === "heart") {
      heartsGained = segment.amount;
    } else if (segment.type === "xp") {
      xpGained = segment.amount;
    } else if (segment.type === "powerup") {
      // Try to give a random marketplace item, fall back to coins
      const items = await db.select().from(marketplaceItemsTable).where(eq(marketplaceItemsTable.isActive, true));
      if (items.length > 0) {
        const item = items[Math.floor(Math.random() * items.length)];
        const [existing] = await db.select().from(userInventoryTable)
          .where(eq(userInventoryTable.userId, req.user.id));
        if (existing) {
          await db.update(userInventoryTable)
            .set({ quantity: sql`${userInventoryTable.quantity} + 1` })
            .where(eq(userInventoryTable.userId, req.user.id));
        } else {
          await db.insert(userInventoryTable).values({ userId: req.user.id, itemId: item.id, quantity: 1 });
        }
        powerupName = item.name;
      } else {
        coinsGained = 75;
      }
    }

    // Update profile
    const newHearts = Math.min(6, (profile.hearts ?? 0) + heartsGained);
    const newCoins = (profile.coins ?? 0) + coinsGained;
    const updateData: Record<string, any> = {
      coins: newCoins,
      hearts: newHearts,
      lastWheelDate: today,
    };
    if (hasUsedFreeSpinToday) {
      updateData.extraWheelSpins = Math.max(0, extraSpins - 1);
    }

    await db.update(profilesTable).set(updateData).where(eq(profilesTable.userId, req.user.id));

    // Apply XP to battle pass
    if (xpGained > 0) {
      const [bp] = await db.select().from(userBattlePassTable).where(eq(userBattlePassTable.userId, req.user.id));
      if (bp) {
        await db.update(userBattlePassTable)
          .set({ seasonXp: sql`${userBattlePassTable.seasonXp} + ${xpGained}` })
          .where(eq(userBattlePassTable.userId, req.user.id));
      }
    }

    res.json({
      segmentIndex: segIndex,
      segment: {
        id: segment.id,
        label: segment.label,
        emoji: segment.emoji,
        type: segment.type,
        amount: segment.amount,
        color: segment.color,
      },
      reward: {
        coins: coinsGained,
        hearts: heartsGained,
        xp: xpGained,
        powerupName,
      },
      newCoins,
      newHearts,
    });
  } catch (err) {
    req.log.error({ err }, "Spin failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /wheel/ad-spin — grant 1 extra spin after watching an ad
router.post("/wheel/ad-spin", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    await db.update(profilesTable)
      .set({ extraWheelSpins: sql`${profilesTable.extraWheelSpins} + 1` })
      .where(eq(profilesTable.userId, req.user.id));
    res.json({ ok: true, message: "Extra spin granted!" });
  } catch (err) {
    req.log.error({ err }, "Ad spin grant failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
