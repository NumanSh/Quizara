import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, questionsTable } from "@workspace/db";
import { eq, isNull, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/categories", async (req, res) => {
  try {
    const { parentId } = req.query as { parentId?: string };

    const allCategories = await db.select().from(categoriesTable);

    const counts = await db
      .select({
        categoryId: questionsTable.categoryId,
        count: sql<number>`cast(count(${questionsTable.id}) as integer)`,
      })
      .from(questionsTable)
      .groupBy(questionsTable.categoryId);

    const countMap = Object.fromEntries(counts.map(c => [c.categoryId, c.count]));

    const mapped = allCategories.map(cat => {
      const subcategoryIds = allCategories
        .filter(sub => sub.parentId === cat.id)
        .map(sub => sub.id);

      let questionCount = countMap[cat.id] ?? 0;
      for (const subId of subcategoryIds) {
        questionCount += countMap[subId] ?? 0;
      }

      return {
        id: cat.id,
        name: cat.name,
        nameAr: cat.nameAr,
        icon: cat.icon,
        color: cat.color,
        imageUrl: cat.imageUrl,
        parentId: cat.parentId,
        createdAt: cat.createdAt,
        questionCount,
      };
    });

    const result = mapped.filter(cat => 
      parentId ? cat.parentId === parentId : cat.parentId === null
    );

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId));
    if (!cat) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const subs = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(eq(categoriesTable.parentId, categoryId));
    const subIds = subs.map(s => s.id);
    const allCatIds = [categoryId, ...subIds];

    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(questionsTable)
      .where(inArray(questionsTable.categoryId, allCatIds));

    res.json({ ...cat, questionCount: Number(result?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to get category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories/:categoryId/subcategories", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const rows = await db
      .select({
        id: categoriesTable.id,
        name: categoriesTable.name,
        nameAr: categoriesTable.nameAr,
        icon: categoriesTable.icon,
        color: categoriesTable.color,
        imageUrl: categoriesTable.imageUrl,
        parentId: categoriesTable.parentId,
        createdAt: categoriesTable.createdAt,
        questionCount: sql<number>`cast(count(${questionsTable.id}) as integer)`,
      })
      .from(categoriesTable)
      .leftJoin(questionsTable, eq(categoriesTable.id, questionsTable.categoryId))
      .where(eq(categoriesTable.parentId, categoryId))
      .groupBy(categoriesTable.id);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list subcategories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories/:categoryId/stats", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subs = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(eq(categoriesTable.parentId, categoryId));
    const subIds = subs.map(s => s.id);
    const allCatIds = [categoryId, ...subIds];

    const [result] = await db.select({
      count: sql<number>`count(*)`,
      avgDifficulty: sql<number>`avg(difficulty)`,
    }).from(questionsTable).where(inArray(questionsTable.categoryId, allCatIds));

    res.json({
      categoryId,
      questionCount: Number(result?.count ?? 0),
      avgDifficulty: Number(result?.avgDifficulty ?? 0),
      timesPlayed: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get category stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
