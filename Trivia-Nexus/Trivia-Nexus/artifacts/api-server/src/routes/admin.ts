import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, questionsTable, profilesTable, quizSessionsTable, usersTable, settingsTable, marketplaceItemsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { AdminCreateCategoryBody, AdminCreateQuestionBody } from "@workspace/api-zod";
import { autoGenerateCategoryTask } from "./dailyTasks";

const router: IRouter = Router();

const MAX_HEARTS = 6;

function requireAdmin(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// Admin categories
router.get("/admin/categories", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db.select().from(categoriesTable);
    const withCounts = await Promise.all(rows.map(async (cat) => {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable).where(eq(questionsTable.categoryId, cat.id));
      return { ...cat, questionCount: Number(result?.count ?? 0) };
    }));
    res.json(withCounts);
  } catch (err) {
    req.log.error({ err }, "Failed to list admin categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/categories", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const parsed = AdminCreateCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [cat] = await db.insert(categoriesTable).values({
      ...parsed.data,
      nameAr: parsed.data.nameAr ?? parsed.data.name,
    }).returning();
    autoGenerateCategoryTask(cat.id, cat.name).catch(() => {});
    res.status(201).json({ ...cat, questionCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/categories/:categoryId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { categoryId } = req.params;
    const parsed = AdminCreateCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [cat] = await db.update(categoriesTable).set(parsed.data).where(eq(categoriesTable.id, categoryId)).returning();
    if (!cat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable).where(eq(questionsTable.categoryId, categoryId));
    res.json({ ...cat, questionCount: Number(result?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to update category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/categories/:categoryId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { categoryId } = req.params;
    await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin questions
router.get("/admin/questions", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { categoryId } = req.query as { categoryId?: string };
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    let query = db.select().from(questionsTable);
    if (categoryId) {
      query = query.where(eq(questionsTable.categoryId, categoryId)) as any;
    }

    const questions = await (query as any).limit(limit).offset(offset);
    const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable).where(categoryId ? eq(questionsTable.categoryId, categoryId) : sql`1=1`);

    res.json({
      questions: questions.map((q: any) => ({
        id: q.id,
        categoryId: q.categoryId,
        questionType: q.questionType ?? "multiple_choice",
        question: q.question,
        questionAr: q.questionAr,
        imageUrl: q.imageUrl ?? null,
        options: q.options,
        optionsAr: q.optionsAr,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        explanationAr: q.explanationAr,
        difficulty: q.difficulty,
      })),
      total: Number(totalResult?.count ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list questions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/questions", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const parsed = AdminCreateQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const pd = parsed.data as any;
    const [q] = await db.insert(questionsTable).values({
      categoryId: pd.categoryId,
      questionType: pd.questionType ?? "multiple_choice",
      question: pd.question,
      questionAr: pd.questionAr ?? pd.question,
      imageUrl: pd.imageUrl ?? null,
      options: pd.options,
      optionsAr: pd.optionsAr ?? pd.options,
      correctAnswer: parsed.data.correctAnswer,
      explanation: parsed.data.explanation,
      explanationAr: parsed.data.explanationAr,
      difficulty: parsed.data.difficulty ?? 1,
    }).returning();
    res.status(201).json({
      id: q.id,
      categoryId: q.categoryId,
      questionType: q.questionType ?? "multiple_choice",
      question: q.question,
      questionAr: q.questionAr,
      imageUrl: q.imageUrl ?? null,
      options: q.options,
      optionsAr: q.optionsAr,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? null,
      explanationAr: q.explanationAr ?? null,
      difficulty: q.difficulty,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create question");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/questions/:questionId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { questionId } = req.params;
    const parsed = AdminCreateQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const pd2 = parsed.data as any;
    const [q] = await db.update(questionsTable).set({
      categoryId: pd2.categoryId,
      questionType: pd2.questionType ?? "multiple_choice",
      question: pd2.question,
      questionAr: pd2.questionAr ?? pd2.question,
      imageUrl: pd2.imageUrl ?? null,
      options: pd2.options,
      optionsAr: pd2.optionsAr ?? pd2.options,
      correctAnswer: pd2.correctAnswer,
      explanation: pd2.explanation,
      explanationAr: pd2.explanationAr,
      difficulty: pd2.difficulty ?? 1,
    }).where(eq(questionsTable.id, questionId)).returning();
    if (!q) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.json({
      id: q.id,
      categoryId: q.categoryId,
      questionType: q.questionType ?? "multiple_choice",
      question: q.question,
      questionAr: q.questionAr,
      imageUrl: q.imageUrl ?? null,
      options: q.options,
      optionsAr: q.optionsAr,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? null,
      explanationAr: q.explanationAr ?? null,
      difficulty: q.difficulty,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update question");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/questions/:questionId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { questionId } = req.params;
    await db.delete(questionsTable).where(eq(questionsTable.id, questionId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete question");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin user management
router.get("/admin/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const search = (req.query.search as string | undefined)?.trim() ?? "";

    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        profileImageUrl: usersTable.profileImageUrl,
        createdAt: usersTable.createdAt,
        role: profilesTable.role,
        username: profilesTable.username,
        totalScore: profilesTable.totalScore,
        gamesPlayed: profilesTable.gamesPlayed,
        coins: profilesTable.coins,
        hearts: profilesTable.hearts,
        heartsLastUpdated: profilesTable.heartsLastUpdated,
      })
      .from(usersTable)
      .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);

    const filtered = search
      ? rows.filter(u =>
          [u.email, u.firstName, u.lastName, u.username]
            .some(v => v?.toLowerCase().includes(search.toLowerCase()))
        )
      : rows;

    res.json({
      users: filtered.map(u => ({
        id: u.id,
        email: u.email ?? null,
        firstName: u.firstName ?? null,
        lastName: u.lastName ?? null,
        profileImageUrl: u.profileImageUrl ?? null,
        username: u.username ?? null,
        role: u.role ?? "player",
        totalScore: u.totalScore ?? 0,
        gamesPlayed: u.gamesPlayed ?? 0,
        coins: u.coins ?? 0,
        hearts: u.hearts ?? MAX_HEARTS,
        createdAt: u.createdAt,
      })),
      total: Number(totalResult?.count ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list admin users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users/:userId/points", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { userId } = req.params;
    const { points } = req.body as { points?: number };
    if (typeof points !== "number" || !Number.isFinite(points)) {
      res.status(400).json({ error: "points must be a finite number" });
      return;
    }
    const existing = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    let updatedProfile;
    if (existing.length === 0) {
      [updatedProfile] = await db.insert(profilesTable).values({ userId, totalScore: Math.max(0, points) }).returning();
    } else {
      const newScore = Math.max(0, (existing[0].totalScore ?? 0) + points);
      [updatedProfile] = await db.update(profilesTable)
        .set({ totalScore: newScore })
        .where(eq(profilesTable.userId, userId))
        .returning();
    }
    res.json({ userId, totalScore: updatedProfile?.totalScore ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust user points");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users/:userId/coins", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { userId } = req.params;
    const { coins } = req.body as { coins?: number };
    if (typeof coins !== "number" || !Number.isFinite(coins)) {
      res.status(400).json({ error: "coins must be a finite number" });
      return;
    }
    const existing = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    let updatedProfile;
    if (existing.length === 0) {
      [updatedProfile] = await db.insert(profilesTable).values({ userId, coins: Math.max(0, coins) }).returning();
    } else {
      const newCoins = Math.max(0, (existing[0].coins ?? 0) + coins);
      [updatedProfile] = await db.update(profilesTable)
        .set({ coins: newCoins })
        .where(eq(profilesTable.userId, userId))
        .returning();
    }
    res.json({ userId, coins: updatedProfile?.coins ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust user coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/users/:userId/hearts", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { userId } = req.params;
    const { hearts } = req.body as { hearts?: number };
    if (typeof hearts !== "number" || !Number.isFinite(hearts) || !Number.isInteger(hearts)) {
      res.status(400).json({ error: "hearts must be an integer" });
      return;
    }
    const existing = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    const now = new Date();
    let updatedProfile;
    if (existing.length === 0) {
      const newHearts = Math.max(0, Math.min(MAX_HEARTS, hearts));
      [updatedProfile] = await db.insert(profilesTable).values({ userId, hearts: newHearts, heartsLastUpdated: now }).returning();
    } else {
      const current = existing[0].hearts ?? MAX_HEARTS;
      const newHearts = Math.max(0, Math.min(MAX_HEARTS, current + hearts));
      [updatedProfile] = await db.update(profilesTable)
        .set({ hearts: newHearts, heartsLastUpdated: now })
        .where(eq(profilesTable.userId, userId))
        .returning();
    }
    res.json({ userId, hearts: updatedProfile?.hearts ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to adjust user hearts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/users/:userId/role", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { userId } = req.params;
    const { role } = req.body as { role?: string };
    if (role !== "player" && role !== "admin") {
      res.status(400).json({ error: "Role must be 'player' or 'admin'" });
      return;
    }
    if (userId === (req as any).user?.id && role === "player") {
      res.status(400).json({ error: "You cannot revoke your own admin access" });
      return;
    }
    const existing = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (existing.length === 0) {
      await db.insert(profilesTable).values({ userId, role });
    } else {
      await db.update(profilesTable).set({ role }).where(eq(profilesTable.userId, userId));
    }
    res.json({ userId, role });
  } catch (err) {
    req.log.error({ err }, "Failed to update user role");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/stats", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    const [questionCount] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable);
    const [categoryCount] = await db.select({ count: sql<number>`count(*)` }).from(categoriesTable);
    const [gameCount] = await db.select({ count: sql<number>`count(*)` }).from(quizSessionsTable);

    const topCats = await db
      .select({
        categoryId: categoriesTable.id,
        name: categoriesTable.name,
        gamesPlayed: sql<number>`count(${quizSessionsTable.id})`,
      })
      .from(categoriesTable)
      .leftJoin(quizSessionsTable, eq(quizSessionsTable.categoryId, categoriesTable.id))
      .groupBy(categoriesTable.id, categoriesTable.name)
      .orderBy(desc(sql`count(${quizSessionsTable.id})`))
      .limit(5);

    res.json({
      totalUsers: Number(userCount?.count ?? 0),
      totalQuestions: Number(questionCount?.count ?? 0),
      totalCategories: Number(categoryCount?.count ?? 0),
      totalGamesPlayed: Number(gameCount?.count ?? 0),
      activeToday: 0,
      topCategories: topCats.map(c => ({
        categoryId: c.categoryId,
        name: c.name,
        gamesPlayed: Number(c.gamesPlayed),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get admin stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin Marketplace (Cosmetics + Powerups) ──────────────────────────────────
router.get("/admin/marketplace", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const items = await db.select().from(marketplaceItemsTable).orderBy(marketplaceItemsTable.type, marketplaceItemsTable.price);
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list marketplace items");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/marketplace", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, description, type, effect, emoji, price, isActive } = req.body as {
      name?: string; description?: string; type?: string; effect?: string; emoji?: string; price?: number; isActive?: boolean;
    };
    if (!name || !type || !effect || !emoji || price == null) {
      res.status(400).json({ error: "name, type, effect, emoji, and price are required" });
      return;
    }
    if (typeof price !== "number" || price < 0) {
      res.status(400).json({ error: "price must be a non-negative number" });
      return;
    }
    const trimmedName = name.trim();
    const trimmedDesc = description?.trim() ?? "";
    const [item] = await db.insert(marketplaceItemsTable).values({
      name: trimmedName,
      nameAr: trimmedName,
      description: trimmedDesc,
      descriptionAr: trimmedDesc,
      type: type.trim(),
      effect: effect.trim(),
      emoji: emoji.trim(),
      price,
      isActive: isActive !== false,
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to create marketplace item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/marketplace/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    const { name, description, type, effect, emoji, price, isActive } = req.body as {
      name?: string; description?: string; type?: string; effect?: string; emoji?: string; price?: number; isActive?: boolean;
    };
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (type !== undefined) updateData.type = type.trim();
    if (effect !== undefined) updateData.effect = effect.trim();
    if (emoji !== undefined) updateData.emoji = emoji.trim();
    if (price !== undefined) updateData.price = price;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(marketplaceItemsTable)
      .set(updateData)
      .where(eq(marketplaceItemsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update marketplace item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/marketplace/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    await db.delete(marketplaceItemsTable).where(eq(marketplaceItemsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete marketplace item");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin settings
const DEFAULT_ADMIN_CODE = "QUIZARA_ADMIN_2024";

router.get("/admin/settings", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "admin_code"));
    res.json({ adminCode: row?.value ?? DEFAULT_ADMIN_CODE });
  } catch (err) {
    req.log.error({ err }, "Failed to get settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/settings/admin-code", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { adminCode } = req.body as { adminCode?: string };
    if (!adminCode || typeof adminCode !== "string" || adminCode.trim().length < 4) {
      res.status(400).json({ error: "Admin code must be at least 4 characters" });
      return;
    }
    const trimmed = adminCode.trim();
    await db.insert(settingsTable)
      .values({ key: "admin_code", value: trimmed })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: trimmed } });
    res.json({ adminCode: trimmed });
  } catch (err) {
    req.log.error({ err }, "Failed to update admin code");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
