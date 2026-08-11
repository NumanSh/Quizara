import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketplaceItemsTable, userInventoryTable, profilesTable, questionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { checkAdCooldown } from "../lib/adTracker";

const router: IRouter = Router();

// Seed default powerup items if none exist
async function ensureMarketplaceItems() {
  const existing = await db.select().from(marketplaceItemsTable).limit(1);
  if (existing.length > 0) return;

  await db.insert(marketplaceItemsTable).values([
    { name: "50/50", nameAr: "خمسون خمسون", description: "Eliminates 2 wrong answer options instantly.", descriptionAr: "تزيل خيارَين خاطئَين على الفور.", type: "powerup", effect: "fifty_fifty", emoji: "✂️", price: 200 },
    { name: "Freeze Timer", nameAr: "تجميد الوقت", description: "Stops the countdown clock for 10 seconds.", descriptionAr: "يوقف ساعة العد التنازلي لمدة 10 ثوانٍ.", type: "powerup", effect: "freeze_timer", emoji: "❄️", price: 400 },
    { name: "Extra Time", nameAr: "وقت إضافي", description: "Adds 15 extra seconds to the current question.", descriptionAr: "يضيف 15 ثانية إضافية للسؤال الحالي.", type: "powerup", effect: "extra_time", emoji: "⏰", price: 150 },
    { name: "Skip Question", nameAr: "تخطي السؤال", description: "Skip the current question without any penalty.", descriptionAr: "تخطى السؤال الحالي دون أي خصم.", type: "powerup", effect: "skip_question", emoji: "⏭️", price: 250 },
    { name: "Double Score", nameAr: "مضاعفة النقاط", description: "Doubles your points for your next correct answer.", descriptionAr: "يضاعف نقاطك لإجابتك الصحيحة التالية.", type: "powerup", effect: "double_score", emoji: "✖️", price: 500 },
    { name: "Lucky Wheel", nameAr: "عجلة الحظ", description: "Spin for a random reward — coins, power-ups, or bonus points.", descriptionAr: "أدر العجلة للحصول على مكافأة عشوائية.", type: "powerup", effect: "lucky_wheel", emoji: "🎰", price: 300 },
    { name: "Shield", nameAr: "درع", description: "Block your opponent's next power-up (Arena only).", descriptionAr: "يحجب قوة خصمك التالية في الساحة.", type: "powerup", effect: "shield", emoji: "🛡️", price: 350 },
    { name: "Steal Question", nameAr: "سرقة السؤال", description: "Steal your opponent's points for the current question (Arena only).", descriptionAr: "تسرق نقاط خصمك للسؤال الحالي.", type: "powerup", effect: "steal_question", emoji: "🎯", price: 600 },
  ]);
}

/**
 * Power-ups that were added after the original seed list, and so are missing
 * from databases seeded by an earlier version. Checked on every items fetch.
 *
 * `streak_freeze` must exist here: the Battle Pass grants it at premium tiers
 * 7/18/28, and the streak logic looks it up by effect.
 */
const LATE_ADDED_POWER_UPS = [
  {
    name: "Shield", nameAr: "درع",
    description: "Block your opponent's next power-up (Arena only).", descriptionAr: "يحجب قوة خصمك التالية في الساحة.",
    type: "powerup", effect: "shield", emoji: "🛡️", price: 350,
  },
  {
    name: "Steal Question", nameAr: "سرقة السؤال",
    description: "Steal your opponent's points for the current question (Arena only).", descriptionAr: "تسرق نقاط خصمك للسؤال الحالي.",
    type: "powerup", effect: "steal_question", emoji: "🎯", price: 600,
  },
  {
    name: "Streak Freeze", nameAr: "تجميد السلسلة",
    description: "Protects your daily streak for one missed day.", descriptionAr: "يحمي سلسلتك اليومية عند تفويت يوم واحد.",
    type: "powerup", effect: "streak_freeze", emoji: "🛡️", price: 450,
  },
];

async function ensureArenaPowerUps() {
  for (const item of LATE_ADDED_POWER_UPS) {
    const [existing] = await db.select().from(marketplaceItemsTable)
      .where(eq(marketplaceItemsTable.effect, item.effect));
    if (!existing) {
      await db.insert(marketplaceItemsTable).values(item);
    }
  }
}

// Seed cosmetic items if none exist yet
async function ensureCosmeticItems() {
  const existing = await db
    .select()
    .from(marketplaceItemsTable)
    .where(eq(marketplaceItemsTable.type, "cosmetic"));
  if (existing.length > 0) return;

  const c = (name: string, desc: string, type: string, effect: string, emoji: string, price: number) => ({
    name, nameAr: name, description: desc, descriptionAr: desc, type, effect, emoji, price,
  });
  await db.insert(marketplaceItemsTable).values([
    // ── Avatar Frames ──
    c("Gold Crown",   "A radiant gold border fit for champions.",      "cosmetic", "frame_gold",    "👑", 500),
    c("Fire Ring",    "Blazing flames encircle your avatar.",          "cosmetic", "frame_fire",    "🔥", 400),
    c("Ice Crystal",  "A cool icy halo shimmers around you.",          "cosmetic", "frame_ice",     "❄️",  400),
    c("Diamond Aura", "Pure diamond clarity — rare and prestigious.",  "cosmetic", "frame_diamond", "💎", 800),
    c("Neon Glow",    "Electric green energy surges around you.",      "cosmetic", "frame_neon",    "⚡", 500),
    c("Rainbow",      "A full-spectrum rainbow border of pride.",      "cosmetic", "frame_rainbow", "🌈", 1000),
    c("Dark Void",    "A mysterious void consumes the darkness.",      "cosmetic", "frame_dark",    "🌑", 600),
    c("Royal Purple", "Majestic purple reserved for royalty.",         "cosmetic", "frame_royal",   "👸", 700),
    // ── Profile Backgrounds ──
    c("Sunset",       "Warm amber and rose gradient fills the sky.",   "cosmetic", "bg_sunset",    "🌅", 300),
    c("Ocean Depths", "Deep cyan and blue like the ocean floor.",      "cosmetic", "bg_ocean",     "🌊", 300),
    c("Galaxy",       "A deep-space violet nebula glows behind you.",  "cosmetic", "bg_galaxy",    "🌌", 500),
    c("Forest",       "Lush emerald greens of an enchanted forest.",   "cosmetic", "bg_forest",    "🌲", 300),
    c("Cyberpunk",    "Hot pink and neon purple — future is now.",     "cosmetic", "bg_cyberpunk", "🤖", 600),
    c("Midnight",     "Pitch dark midnight sky — sleek and stealthy.", "cosmetic", "bg_midnight",  "🌙", 400),
    c("Aurora",       "Teal and violet lights dance like the aurora.", "cosmetic", "bg_aurora",    "🌠", 500),
    c("Lava",         "Molten red and orange surge from the depths.",  "cosmetic", "bg_lava",      "🌋", 400),
    // ── Username Colors ──
    c("Gold Text",    "Your name shines in precious gold.",            "cosmetic", "color_gold",    "🟡", 200),
    c("Cyan Text",    "Electric cyan — bright and eye-catching.",      "cosmetic", "color_cyan",    "🔵", 200),
    c("Purple Text",  "Royal violet hue for your display name.",       "cosmetic", "color_purple",  "🟣", 200),
    c("Rose Text",    "Bold rose red that demands attention.",         "cosmetic", "color_rose",    "🔴", 200),
    c("Emerald Text", "Vivid emerald green — fresh and powerful.",     "cosmetic", "color_emerald", "🟢", 200),
    c("Orange Text",  "Warm orange energy radiates from your name.",   "cosmetic", "color_orange",  "🟠", 200),
    c("Rainbow Text", "All 7 colors cascade across your username.",    "cosmetic", "color_rainbow", "🌈", 600),
  ]);
}

// GET /api/marketplace/items
router.get("/marketplace/items", async (req, res) => {
  try {
    await ensureMarketplaceItems();
    await ensureCosmeticItems();
    await ensureArenaPowerUps();
    const items = await db
      .select()
      .from(marketplaceItemsTable)
      .where(eq(marketplaceItemsTable.isActive, true));
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list marketplace items");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/marketplace/inventory
router.get("/marketplace/inventory", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const inventory = await db
      .select({
        id: userInventoryTable.id,
        itemId: userInventoryTable.itemId,
        quantity: userInventoryTable.quantity,
        name: marketplaceItemsTable.name,
        nameAr: marketplaceItemsTable.nameAr,
        description: marketplaceItemsTable.description,
        descriptionAr: marketplaceItemsTable.descriptionAr,
        effect: marketplaceItemsTable.effect,
        emoji: marketplaceItemsTable.emoji,
        type: marketplaceItemsTable.type,
        price: marketplaceItemsTable.price,
      })
      .from(userInventoryTable)
      .innerJoin(marketplaceItemsTable, eq(userInventoryTable.itemId, marketplaceItemsTable.id))
      .where(and(eq(userInventoryTable.userId, userId)));

    res.json(inventory);
  } catch (err) {
    req.log.error({ err }, "Failed to get inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/marketplace/purchase
router.post("/marketplace/purchase", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const { itemId } = req.body;

    if (!itemId || typeof itemId !== "string") {
      res.status(400).json({ error: "itemId is required" });
      return;
    }

    const [item] = await db
      .select()
      .from(marketplaceItemsTable)
      .where(and(eq(marketplaceItemsTable.id, itemId), eq(marketplaceItemsTable.isActive, true)));

    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) {
      [profile] = await db
        .insert(profilesTable)
        .values({ userId })
        .onConflictDoUpdate({
          target: profilesTable.userId,
          set: { updatedAt: new Date() },
        })
        .returning();
    }

    if (profile.coins < item.price) {
      res.status(402).json({ error: "Insufficient coins", coins: profile.coins, required: item.price });
      return;
    }

    // Cosmetics: only one per effect key (not stackable)
    const existingInv = await db
      .select()
      .from(userInventoryTable)
      .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));

    if (existingInv.length > 0 && item.type === "cosmetic") {
      res.status(409).json({ error: "You already own this cosmetic" });
      return;
    }

    // Perform transaction for coin deduction and inventory increment
    const updatedProfile = await db.transaction(async (tx) => {
      // 1. Deduct coins atomically
      const [up] = await tx
        .update(profilesTable)
        .set({ coins: sql`${profilesTable.coins} - ${item.price}` })
        .where(and(
          eq(profilesTable.userId, userId),
          sql`${profilesTable.coins} >= ${item.price}`
        ))
        .returning();

      if (!up) {
        throw new Error("INSUFFICIENT_COINS");
      }

      // 2. Insert or update inventory row atomically
      if (item.type === "cosmetic") {
        const inserted = await tx
          .insert(userInventoryTable)
          .values({ userId, itemId, quantity: 1 })
          .onConflictDoNothing()
          .returning();
        if (inserted.length === 0) {
          throw new Error("COSMETIC_ALREADY_OWNED");
        }
      } else {
        await tx
          .insert(userInventoryTable)
          .values({ userId, itemId, quantity: 1 })
          .onConflictDoUpdate({
            target: [userInventoryTable.userId, userInventoryTable.itemId],
            set: { quantity: sql`${userInventoryTable.quantity} + 1` },
          });
      }

      return up;
    });

    res.json({
      success: true,
      itemName: item.name,
      coinsSpent: item.price,
      remainingCoins: updatedProfile.coins,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_COINS") {
      res.status(402).json({ error: "Insufficient coins" });
      return;
    }
    if (err instanceof Error && err.message === "COSMETIC_ALREADY_OWNED") {
      res.status(409).json({ error: "You already own this cosmetic" });
      return;
    }
    req.log.error({ err }, "Failed to purchase item");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/marketplace/use-item  (consume 1 from inventory)
router.post("/marketplace/use-item", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const { itemId } = req.body;

    if (!itemId || typeof itemId !== "string") {
      res.status(400).json({ error: "itemId is required" });
      return;
    }

    const [entry] = await db
      .select()
      .from(userInventoryTable)
      .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));

    if (!entry || entry.quantity < 1) {
      res.status(404).json({ error: "Item not in inventory" });
      return;
    }

    if (entry.quantity === 1) {
      const [deleted] = await db.delete(userInventoryTable)
        .where(and(
          eq(userInventoryTable.id, entry.id),
          eq(userInventoryTable.quantity, 1)
        ))
        .returning();
      if (!deleted) {
        res.status(409).json({ error: "Item state modified, try again" });
        return;
      }
    } else {
      const [updated] = await db
        .update(userInventoryTable)
        .set({ quantity: entry.quantity - 1 })
        .where(and(
          eq(userInventoryTable.id, entry.id),
          eq(userInventoryTable.quantity, entry.quantity)
        ))
        .returning();
      if (!updated) {
        res.status(409).json({ error: "Item state modified, try again" });
        return;
      }
    }

    res.json({ success: true, remainingQuantity: Math.max(0, entry.quantity - 1) });
  } catch (err) {
    req.log.error({ err }, "Failed to use item");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/marketplace/equip  — equip or unequip a cosmetic
router.post("/marketplace/equip", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const { itemId, unequip } = req.body as { itemId?: string; unequip?: boolean };

    if (!itemId || typeof itemId !== "string") {
      res.status(400).json({ error: "itemId is required" });
      return;
    }

    // Load the item
    const [item] = await db
      .select()
      .from(marketplaceItemsTable)
      .where(eq(marketplaceItemsTable.id, itemId));

    if (!item || item.type !== "cosmetic") {
      res.status(404).json({ error: "Cosmetic item not found" });
      return;
    }

    // Check ownership (unless unequipping, allow either way)
    if (!unequip) {
      const [inv] = await db
        .select()
        .from(userInventoryTable)
        .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));
      if (!inv) {
        res.status(403).json({ error: "You do not own this item" });
        return;
      }
    }

    // Determine which slot to update based on effect prefix
    const effect = item.effect;
    let updateField: Partial<{ activeAvatarFrame: string | null; activeProfileBg: string | null; activeUsernameColor: string | null }> = {};

    if (effect.startsWith("frame_")) {
      updateField = { activeAvatarFrame: unequip ? null : effect };
    } else if (effect.startsWith("bg_")) {
      updateField = { activeProfileBg: unequip ? null : effect };
    } else if (effect.startsWith("color_")) {
      updateField = { activeUsernameColor: unequip ? null : effect };
    } else {
      res.status(400).json({ error: "Unknown cosmetic type" });
      return;
    }

    let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) {
      [profile] = await db
        .insert(profilesTable)
        .values({ userId })
        .onConflictDoUpdate({
          target: profilesTable.userId,
          set: { updatedAt: new Date() },
        })
        .returning();
    }

    const [updated] = await db
      .update(profilesTable)
      .set(updateField)
      .where(eq(profilesTable.userId, userId))
      .returning();

    res.json({
      success: true,
      activeAvatarFrame: updated.activeAvatarFrame,
      activeProfileBg: updated.activeProfileBg,
      activeUsernameColor: updated.activeUsernameColor,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to equip cosmetic");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Power-Up Endpoints ────────────────────────────────────────────────────────

// POST /api/powerups/fifty-fifty — consume item + return 2 wrong option indices to eliminate
router.post("/powerups/fifty-fifty", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const { questionId, itemId } = req.body;

    if (!questionId || !itemId) {
      res.status(400).json({ error: "questionId and itemId are required" });
      return;
    }

    // Verify and consume the item
    const [item] = await db.select().from(marketplaceItemsTable)
      .where(eq(marketplaceItemsTable.id, itemId));
    
    if (!item || item.type !== "powerup" || item.effect !== "fifty_fifty") {
      res.status(400).json({ error: "Invalid power-up item" });
      return;
    }

    // Look up question first — validate it exists and supports fifty-fifty before consuming the item
    const [q] = await db.select({
      questionType: questionsTable.questionType,
      options: questionsTable.options,
      correctAnswer: questionsTable.correctAnswer,
    }).from(questionsTable).where(eq(questionsTable.id, questionId));

    if (!q) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    const questionType = q.questionType ?? "multiple_choice";
    if (questionType === "matching" || questionType === "ordering" || questionType === "hotspot") {
      res.status(400).json({ error: "This power-up isn't available for this question type." });
      return;
    }

    const [entry] = await db.select().from(userInventoryTable)
      .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));

    if (!entry || entry.quantity < 1) {
      res.status(404).json({ error: "Item not in inventory" });
      return;
    }

    if (entry.quantity === 1) {
      const [deleted] = await db.delete(userInventoryTable)
        .where(and(
          eq(userInventoryTable.id, entry.id),
          eq(userInventoryTable.quantity, 1)
        ))
        .returning();
      if (!deleted) {
        res.status(409).json({ error: "Item state modified, try again" });
        return;
      }
    } else {
      const [updated] = await db.update(userInventoryTable)
        .set({ quantity: entry.quantity - 1 })
        .where(and(
          eq(userInventoryTable.id, entry.id),
          eq(userInventoryTable.quantity, entry.quantity)
        ))
        .returning();
      if (!updated) {
        res.status(409).json({ error: "Item state modified, try again" });
        return;
      }
    }

    const opts = q.options as string[];
    const wrongIndices = opts.map((_, i) => i).filter(i => i !== q.correctAnswer);
    // Shuffle wrong indices and pick 2
    const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
    const eliminatedOptions = shuffled.slice(0, 2).sort((a, b) => a - b);

    res.json({ eliminatedOptions });
  } catch (err) {
    req.log.error({ err }, "Failed to apply fifty-fifty");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/powerups/watch-ad — give a free random powerup from the marketplace
router.post("/powerups/watch-ad", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const cooldown = checkAdCooldown(req.user.id);
  if (!cooldown.allowed) {
    res.status(429).json({ error: "Ad reward cooldown active", remainingMs: cooldown.remainingMs });
    return;
  }
  try {
    const userId = req.user.id;

    // Get all active powerup items (excluding Arena-only ones for the free reward)
    const allPowerups = await db.select().from(marketplaceItemsTable)
      .where(and(eq(marketplaceItemsTable.type, "powerup"), eq(marketplaceItemsTable.isActive, true)));

    const eligible = allPowerups.filter(p =>
      ["fifty_fifty", "extra_time", "skip_question", "double_score", "freeze_timer"].includes(p.effect ?? "")
    );

    if (eligible.length === 0) {
      res.status(404).json({ error: "No powerups available" });
      return;
    }

    const randomPowerup = eligible[Math.floor(Math.random() * eligible.length)]!;

    // Add to user inventory atomically using upsert
    await db.insert(userInventoryTable)
      .values({ userId, itemId: randomPowerup.id, quantity: 1 })
      .onConflictDoUpdate({
        target: [userInventoryTable.userId, userInventoryTable.itemId],
        set: { quantity: sql`${userInventoryTable.quantity} + 1` }
      });


    res.json({
      powerup: {
        name: randomPowerup.name,
        emoji: randomPowerup.emoji,
        effect: randomPowerup.effect,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to award watch-ad powerup");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
