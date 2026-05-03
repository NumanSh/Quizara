import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, questionsTable } from "@workspace/db";
import { eq, isNull, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/categories", async (req, res) => {
  try {
    const { parentId } = req.query as { parentId?: string };
    const rows = await db.select().from(categoriesTable).where(
      parentId ? eq(categoriesTable.parentId, parentId) : isNull(categoriesTable.parentId)
    );

    const withCounts = await Promise.all(rows.map(async (cat) => {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable).where(eq(questionsTable.categoryId, cat.id));
      return { ...cat, questionCount: Number(result?.count ?? 0) };
    }));

    res.json(withCounts);
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
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable).where(eq(questionsTable.categoryId, categoryId));
    res.json({ ...cat, questionCount: Number(result?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to get category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories/:categoryId/subcategories", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const rows = await db.select().from(categoriesTable).where(eq(categoriesTable.parentId, categoryId));
    const withCounts = await Promise.all(rows.map(async (cat) => {
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(questionsTable).where(eq(questionsTable.categoryId, cat.id));
      return { ...cat, questionCount: Number(result?.count ?? 0) };
    }));
    res.json(withCounts);
  } catch (err) {
    req.log.error({ err }, "Failed to list subcategories");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/categories/:categoryId/stats", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const [result] = await db.select({
      count: sql<number>`count(*)`,
      avgDifficulty: sql<number>`avg(difficulty)`,
    }).from(questionsTable).where(eq(questionsTable.categoryId, categoryId));

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
