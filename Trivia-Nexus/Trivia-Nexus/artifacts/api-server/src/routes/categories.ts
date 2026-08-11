import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, questionsTable } from "@workspace/db";
import { eq, isNull, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

interface CategoryListItem {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  color: string | null;
  imageUrl: string | null;
  parentId: string | null;
  createdAt: Date;
  questionCount: number;
}

// This endpoint scans every category plus a group-by over questions, and it is
// hit on every home/categories page load. The catalog changes only through the
// admin panel, so a short TTL is plenty and `invalidateCategoryCache` gives
// admin writes an immediate refresh.
const CATEGORY_CACHE_TTL_MS = 60_000;
let categoryCache: { data: CategoryListItem[]; expiresAt: number } | null = null;

// Concurrent misses share one query instead of stampeding the DB.
let inFlight: Promise<CategoryListItem[]> | null = null;

// Bumped on every write. A load that started before an invalidation must not
// install its now-stale result, so it compares the generation before caching.
let generation = 0;

export function invalidateCategoryCache(): void {
  categoryCache = null;
  generation++;
}

async function loadCategories(): Promise<CategoryListItem[]> {
  const cached = categoryCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (inFlight) return inFlight;

  const startedAtGeneration = generation;
  inFlight = queryCategories()
    .then(data => {
      if (startedAtGeneration === generation) {
        categoryCache = { data, expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS };
      }
      return data;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

async function queryCategories(): Promise<CategoryListItem[]> {
  const allCategories = await db.select().from(categoriesTable);

  const counts = await db
    .select({
      categoryId: questionsTable.categoryId,
      count: sql<number>`cast(count(${questionsTable.id}) as integer)`,
    })
    .from(questionsTable)
    .groupBy(questionsTable.categoryId);

  const countMap = Object.fromEntries(counts.map(c => [c.categoryId, c.count]));

  const childrenByParent = new Map<string, string[]>();
  for (const cat of allCategories) {
    if (!cat.parentId) continue;
    const siblings = childrenByParent.get(cat.parentId) ?? [];
    siblings.push(cat.id);
    childrenByParent.set(cat.parentId, siblings);
  }

  // Walk the whole subtree, not just direct children — nesting deeper than one
  // level would otherwise silently under-count.
  const rollupCache = new Map<string, number>();
  function rollup(id: string, seen: Set<string>): number {
    const memo = rollupCache.get(id);
    if (memo !== undefined) return memo;
    if (seen.has(id)) return 0; // defensive: a parentId cycle must not hang the request
    seen.add(id);

    let total = countMap[id] ?? 0;
    for (const childId of childrenByParent.get(id) ?? []) {
      total += rollup(childId, seen);
    }
    rollupCache.set(id, total);
    return total;
  }

  const data = allCategories.map(cat => ({
    id: cat.id,
    name: cat.name,
    nameAr: cat.nameAr,
    icon: cat.icon,
    color: cat.color,
    imageUrl: cat.imageUrl,
    parentId: cat.parentId,
    createdAt: cat.createdAt,
    questionCount: rollup(cat.id, new Set()),
  }));

  // Caching is the caller's job — `loadCategories` gates it on the generation
  // check so a load that raced an admin write cannot install stale data.
  return data;
}

router.get("/categories", async (req, res) => {
  try {
    const { parentId } = req.query as { parentId?: string };
    const all = await loadCategories();

    const result = all.filter(cat =>
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
