import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, marketplaceItemsTable, userInventoryTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { checkAdCooldown } from "../lib/adTracker";
import { getRatesForMode } from "../lib/economyConfig";
import { awardBattlePassXp } from "./xpHelper";

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

// Segment structure (id/label/emoji/weight/color) is fixed; only the coin/XP `amount`
// values are admin-configurable (heart/powerup amounts stay out of the 3-currency scope).
const SEGMENT_STRUCTURE: Omit<Segment, "amount">[] = [
  { id: "coins_50",  label: "50 Coins",    emoji: "🪙", type: "coins",   weight: 30, color: "#F59E0B" },
  { id: "coins_100", label: "100 Coins",   emoji: "🪙", type: "coins",   weight: 20, color: "#EAB308" },
  { id: "heart_1",   label: "1 Heart",     emoji: "❤️",  type: "heart",   weight: 20, color: "#EF4444" },
  { id: "coins_200", label: "200 Coins",   emoji: "🪙", type: "coins",   weight: 10, color: "#D97706" },
  { id: "heart_2",   label: "2 Hearts",    emoji: "❤️",  type: "heart",   weight: 10, color: "#EC4899" },
  { id: "powerup",   label: "Power-Up!",   emoji: "⚡", type: "powerup", weight: 5,  color: "#8B5CF6" },
  { id: "xp_100",    label: "+100 XP",     emoji: "⭐", type: "xp",      weight: 4,  color: "#3B82F6" },
  { id: "jackpot",   label: "JACKPOT!",    emoji: "🏆", type: "jackpot", weight: 1,  color: "#10B981" },
];
const STATIC_AMOUNTS: Record<string, number> = { heart_1: 1, heart_2: 2, powerup: 1 };

async function getWheelSegments(): Promise<Segment[]> {
  const rates = await getRatesForMode("wheel");
  return SEGMENT_STRUCTURE.map(s => ({
    ...s,
    amount: STATIC_AMOUNTS[s.id] ?? rates[s.id] ?? 0,
  }));
}

function pickSegment(segments: Segment[]): Segment {
  const total = segments.reduce((s, seg) => s + seg.weight, 0);
  let rand = Math.random() * total;
  for (const seg of segments) {
    rand -= seg.weight;
    if (rand <= 0) return seg;
  }
  return segments[0];
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
    const segments = await getWheelSegments();

    res.json({
      canSpin,
      freeSpinAvailable: !hasUsedFreeSpinToday,
      extraSpins,
      lastWheelDate: profile.lastWheelDate,
      segments: segments.map(s => ({ id: s.id, label: s.label, emoji: s.emoji, color: s.color })),
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
    const segments = await getWheelSegments();
    const rates = await getRatesForMode("wheel");
    const segment = pickSegment(segments);
    const segIndex = segments.findIndex(s => s.id === segment.id);

    // Apply the reward
    let coinsGained = 0;
    let heartsGained = 0;
    let xpGained = 0;
    let powerupName: string | null = null;
    let powerupItem: any = null;

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
      const items = await db.select().from(marketplaceItemsTable).where(
        and(
          eq(marketplaceItemsTable.isActive, true),
          eq(marketplaceItemsTable.type, "powerup")
        )
      );
      if (items.length > 0) {
        powerupItem = items[Math.floor(Math.random() * items.length)];
        powerupName = powerupItem.name;
      } else {
        coinsGained = rates.powerup_fallback;
      }
    }

    const { updatedProfile, newCoins, newHearts } = await db.transaction(async (tx) => {
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
      const whereClause = and(
        eq(profilesTable.userId, req.user.id),
        hasUsedFreeSpinToday
          ? eq(profilesTable.extraWheelSpins, extraSpins)
          : sql`${profilesTable.lastWheelDate} IS DISTINCT FROM ${today}`
      );

      const [upProfile] = await tx.update(profilesTable)
        .set(updateData)
        .where(whereClause)
        .returning();

      if (!upProfile) {
        throw new Error("SPIN_ALREADY_PROCESSED");
      }

      if (powerupItem) {
        await tx.insert(userInventoryTable)
          .values({ userId: req.user.id, itemId: powerupItem.id, quantity: 1 })
          .onConflictDoUpdate({
            target: [userInventoryTable.userId, userInventoryTable.itemId],
            set: { quantity: sql`${userInventoryTable.quantity} + 1` }
          });
      }

      return { updatedProfile: upProfile, newCoins, newHearts };
    });

    if (xpGained > 0) {
      awardBattlePassXp(req.user.id, xpGained).catch(() => {});
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
    if (err instanceof Error && err.message === "SPIN_ALREADY_PROCESSED") {
      res.status(409).json({ error: "Spin already processed or profile modified" });
      return;
    }
    req.log.error({ err }, "Spin failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /wheel/ad-spin — grant 1 extra spin after watching an ad
router.post("/wheel/ad-spin", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const cooldown = checkAdCooldown(req.user.id);
  if (!cooldown.allowed) {
    res.status(429).json({ error: "Ad reward cooldown active", remainingMs: cooldown.remainingMs });
    return;
  }
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
