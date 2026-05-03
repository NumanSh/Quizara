import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketplaceItemsTable, userInventoryTable, profilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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
    { name: "Double Score", nameAr: "مضاعفة النقاط", description: "Doubles your points for the next 3 questions.", descriptionAr: "يضاعف نقاطك لمدة 3 أسئلة قادمة.", type: "powerup", effect: "double_score", emoji: "✖️", price: 500 },
    { name: "Lucky Wheel", nameAr: "عجلة الحظ", description: "Spin for a random reward — coins, power-ups, or bonus points.", descriptionAr: "أدر العجلة للحصول على مكافأة عشوائية.", type: "powerup", effect: "lucky_wheel", emoji: "🎰", price: 300 },
  ]);
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
      [profile] = await db.insert(profilesTable).values({ userId }).returning();
    }

    if (profile.coins < item.price) {
      res.status(402).json({ error: "Insufficient coins", coins: profile.coins, required: item.price });
      return;
    }

    // Deduct coins
    const [updatedProfile] = await db
      .update(profilesTable)
      .set({ coins: profile.coins - item.price })
      .where(eq(profilesTable.userId, userId))
      .returning();

    // Cosmetics: only one per effect key (not stackable)
    const existingInv = await db
      .select()
      .from(userInventoryTable)
      .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));

    if (existingInv.length > 0) {
      if (item.type === "cosmetic") {
        // Don't add duplicate for cosmetics — refund
        await db
          .update(profilesTable)
          .set({ coins: updatedProfile.coins + item.price })
          .where(eq(profilesTable.userId, userId));
        res.status(409).json({ error: "You already own this cosmetic" });
        return;
      }
      await db
        .update(userInventoryTable)
        .set({ quantity: existingInv[0].quantity + 1 })
        .where(eq(userInventoryTable.id, existingInv[0].id));
    } else {
      await db.insert(userInventoryTable).values({ userId, itemId, quantity: 1 });
    }

    res.json({
      success: true,
      itemName: item.name,
      coinsSpent: item.price,
      remainingCoins: updatedProfile.coins,
    });
  } catch (err) {
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
      await db.delete(userInventoryTable).where(eq(userInventoryTable.id, entry.id));
    } else {
      await db
        .update(userInventoryTable)
        .set({ quantity: entry.quantity - 1 })
        .where(eq(userInventoryTable.id, entry.id));
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
      [profile] = await db.insert(profilesTable).values({ userId }).returning();
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

export default router;
