import { Router, type IRouter } from "express";
import { db, badgesTable, userBadgesTable, profilesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Default badges (seeded once on first request) ───────────────────────────

const DEFAULT_BADGES = [
  { name: "Newcomer", description: "Play your first quiz game", icon: "🎯", coinReward: 25, triggerType: "games_played", triggerValue: 1, sortOrder: 1 },
  { name: "First Blood", description: "Win your first Arena match", icon: "⚔️", coinReward: 100, triggerType: "first_arena_win", triggerValue: null, sortOrder: 2 },
  { name: "Speed Demon", description: "Answer a question in under 3 seconds", icon: "⚡", coinReward: 75, triggerType: "speed_answer", triggerValue: 3000, sortOrder: 3 },
  { name: "7-Day Streak", description: "Maintain a 7-day daily streak", icon: "🔥", coinReward: 150, triggerType: "streak_days", triggerValue: 7, sortOrder: 4 },
  { name: "Perfect Quiz", description: "Complete a quiz with every answer correct", icon: "✨", coinReward: 100, triggerType: "perfect_quiz", triggerValue: null, sortOrder: 5 },
  { name: "Century", description: "Play 10 quiz games", icon: "💯", coinReward: 50, triggerType: "games_played", triggerValue: 10, sortOrder: 6 },
  { name: "Trivia Master", description: "Reach 10,000 total score", icon: "🏆", coinReward: 200, triggerType: "total_score", triggerValue: 10000, sortOrder: 7 },
  { name: "Arena Champion", description: "Win 10 Arena matches", icon: "👑", coinReward: 300, triggerType: "total_arena_wins", triggerValue: 10, sortOrder: 8 },
  { name: "30-Day Streak", description: "Maintain a 30-day daily streak", icon: "🌟", coinReward: 500, triggerType: "streak_days", triggerValue: 30, sortOrder: 9 },
  { name: "Veteran", description: "Play 50 quiz games", icon: "🛡️", coinReward: 250, triggerType: "games_played", triggerValue: 50, sortOrder: 10 },
];

let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  try {
    const existing = await db.select({ id: badgesTable.id }).from(badgesTable).limit(1);
    if (existing.length === 0) {
      await db.insert(badgesTable).values(DEFAULT_BADGES as any[]);
      logger.info("Seeded default badges");
    }
    seeded = true;
  } catch (err) {
    logger.error({ err }, "Failed to seed badges");
  }
}

// ─── Public / Player routes ───────────────────────────────────────────────────

// GET /api/badges — all active badges; if authenticated, include earned status
router.get("/badges", async (req, res): Promise<void> => {
  await ensureSeeded();
  try {
    const badges = await db
      .select()
      .from(badgesTable)
      .where(eq(badgesTable.isActive, true))
      .orderBy(asc(badgesTable.sortOrder), asc(badgesTable.createdAt));

    if (!req.user) {
      res.json(badges.map(b => ({ ...b, earned: false, earnedAt: null, coinsClaimed: false })));
      return;
    }

    const userBadges = await db
      .select()
      .from(userBadgesTable)
      .where(eq(userBadgesTable.userId, req.user.id));
    const earnedMap = new Map(userBadges.map(ub => [ub.badgeId, ub]));

    res.json(badges.map(b => {
      const ub = earnedMap.get(b.id);
      return { ...b, earned: !!ub, earnedAt: ub?.earnedAt ?? null, coinsClaimed: ub?.coinsClaimed ?? false };
    }));
  } catch (err) {
    req.log.error({ err }, "GET /api/badges failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/badges/:id/claim — claim coin reward for an earned badge
router.post("/badges/:id/claim", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { id } = req.params;
    const [userBadge] = await db
      .select()
      .from(userBadgesTable)
      .where(and(eq(userBadgesTable.userId, req.user.id), eq(userBadgesTable.badgeId, id)));

    if (!userBadge) { res.status(404).json({ error: "Badge not earned" }); return; }
    if (userBadge.coinsClaimed) { res.status(409).json({ error: "Coins already claimed" }); return; }

    const [badge] = await db.select().from(badgesTable).where(eq(badgesTable.id, id));
    if (!badge) { res.status(404).json({ error: "Badge not found" }); return; }

    await db
      .update(userBadgesTable)
      .set({ coinsClaimed: true })
      .where(eq(userBadgesTable.id, userBadge.id));

    if (badge.coinReward > 0) {
      await db
        .update(profilesTable)
        .set({ coins: sql`${profilesTable.coins} + ${badge.coinReward}` })
        .where(eq(profilesTable.userId, req.user.id));
    }

    const [updated] = await db
      .select({ coins: profilesTable.coins })
      .from(profilesTable)
      .where(eq(profilesTable.userId, req.user.id));

    res.json({ coinsAwarded: badge.coinReward, totalCoins: updated?.coins ?? 0 });
  } catch (err) {
    req.log.error({ err }, "POST /api/badges/:id/claim failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

function requireAdmin(req: any, res: any, next: any) {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  next();
}

// GET /api/admin/badges — all badges (including inactive)
router.get("/admin/badges", requireAdmin, async (req, res): Promise<void> => {
  await ensureSeeded();
  try {
    const badges = await db
      .select()
      .from(badgesTable)
      .orderBy(asc(badgesTable.sortOrder), asc(badgesTable.createdAt));

    // Include earned count per badge
    const withCounts = await Promise.all(badges.map(async b => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userBadgesTable)
        .where(eq(userBadgesTable.badgeId, b.id));
      return { ...b, earnedCount: count ?? 0 };
    }));

    res.json(withCounts);
  } catch (err) {
    req.log.error({ err }, "GET /api/admin/badges failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/admin/badges — create badge
router.post("/admin/badges", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { name, description, imageUrl, icon, coinReward, triggerType, triggerValue, isActive, sortOrder } = req.body;
    if (!name || !description || !triggerType) {
      res.status(400).json({ error: "name, description and triggerType are required" });
      return;
    }
    const [badge] = await db.insert(badgesTable).values({
      name,
      description,
      imageUrl: imageUrl || null,
      icon: icon || "🏆",
      coinReward: Number(coinReward ?? 0),
      triggerType,
      triggerValue: triggerValue != null ? Number(triggerValue) : null,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder ?? 0),
    }).returning();
    res.status(201).json(badge);
  } catch (err) {
    req.log.error({ err }, "POST /api/admin/badges failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// PUT /api/admin/badges/:id — update badge
router.put("/admin/badges/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, imageUrl, icon, coinReward, triggerType, triggerValue, isActive, sortOrder } = req.body;
    const [badge] = await db
      .update(badgesTable)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(icon !== undefined && { icon }),
        ...(coinReward !== undefined && { coinReward: Number(coinReward) }),
        ...(triggerType !== undefined && { triggerType }),
        ...(triggerValue !== undefined && { triggerValue: triggerValue !== null ? Number(triggerValue) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      })
      .where(eq(badgesTable.id, id))
      .returning();
    if (!badge) { res.status(404).json({ error: "Badge not found" }); return; }
    res.json(badge);
  } catch (err) {
    req.log.error({ err }, "PUT /api/admin/badges/:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// DELETE /api/admin/badges/:id — delete badge
router.delete("/admin/badges/:id", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    await db.delete(userBadgesTable).where(eq(userBadgesTable.badgeId, id));
    await db.delete(badgesTable).where(eq(badgesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /api/admin/badges/:id failed");
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/admin/badges/:badgeId/award/:userId — manually award badge to user
router.post("/admin/badges/:badgeId/award/:userId", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { badgeId, userId } = req.params;
    const [badge] = await db.select().from(badgesTable).where(eq(badgesTable.id, badgeId));
    if (!badge) { res.status(404).json({ error: "Badge not found" }); return; }

    const [existing] = await db
      .select()
      .from(userBadgesTable)
      .where(and(eq(userBadgesTable.userId, userId), eq(userBadgesTable.badgeId, badgeId)));
    if (existing) { res.status(409).json({ error: "User already has this badge" }); return; }

    await db.insert(userBadgesTable).values({ userId, badgeId, coinsClaimed: badge.coinReward === 0 });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Award badge failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
