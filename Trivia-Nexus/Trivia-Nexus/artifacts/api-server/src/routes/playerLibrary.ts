import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  categoriesTable,
  categoryFavoritesTable,
  levelProgressTable,
  questionsTable,
  quizSessionsTable,
} from "@workspace/db";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

const router: IRouter = Router();

function authenticatedUserId(req: any, res: any): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to use your player library" });
    return null;
  }
  return req.user.id;
}

router.get("/player/library", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;

  try {
    const favorites = await db
      .select({ categoryId: categoryFavoritesTable.categoryId })
      .from(categoryFavoritesTable)
      .where(eq(categoryFavoritesTable.userId, userId))
      .orderBy(desc(categoryFavoritesTable.createdAt));

    const [recentSession] = await db
      .select({
        sessionId: quizSessionsTable.id,
        categoryId: quizSessionsTable.categoryId,
        status: quizSessionsTable.status,
        currentQuestionIndex: quizSessionsTable.currentQuestionIndex,
        totalQuestions: quizSessionsTable.totalQuestions,
        levelNumber: quizSessionsTable.levelNumber,
        startedAt: quizSessionsTable.startedAt,
        completedAt: quizSessionsTable.completedAt,
        name: categoriesTable.name,
        nameAr: categoriesTable.nameAr,
        icon: categoriesTable.icon,
        imageUrl: categoriesTable.imageUrl,
      })
      .from(quizSessionsTable)
      .innerJoin(categoriesTable, eq(quizSessionsTable.categoryId, categoriesTable.id))
      .where(and(
        eq(quizSessionsTable.userId, userId),
        isNotNull(quizSessionsTable.levelNumber),
        isNull(categoriesTable.parentId),
      ))
      .orderBy(desc(quizSessionsTable.startedAt))
      .limit(1);

    let continuePlaying = null;
    if (recentSession) {
      const children = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.parentId, recentSession.categoryId));
      const categoryIds = [recentSession.categoryId, ...children.map(child => child.id)];

      const [questionTotal] = await db
        .select({ value: count() })
        .from(questionsTable)
        .where(inArray(questionsTable.categoryId, categoryIds));
      const totalQuestionsInWorld = Number(questionTotal?.value ?? 0);
      const totalLevels = totalQuestionsInWorld < 3 ? 0 : Math.min(30, Math.floor(totalQuestionsInWorld / 3));

      const completed = await db
        .select({ levelNumber: levelProgressTable.levelNumber })
        .from(levelProgressTable)
        .where(and(
          eq(levelProgressTable.userId, userId),
          eq(levelProgressTable.categoryId, recentSession.categoryId),
          eq(levelProgressTable.completed, true),
        ));

      const completedSet = new Set(completed.map(item => item.levelNumber).filter(level => level <= totalLevels));
      let nextLevel = totalLevels > 0 ? 1 : 0;
      for (let level = 1; level <= totalLevels; level += 1) {
        if (!completedSet.has(level) && (level === 1 || completedSet.has(level - 1))) {
          nextLevel = level;
          break;
        }
        if (level === totalLevels && completedSet.has(level)) nextLevel = totalLevels;
      }

      const hasActiveSession = recentSession.status === "active"
        && recentSession.currentQuestionIndex < recentSession.totalQuestions;
      const isWorldComplete = totalLevels > 0 && completedSet.size >= totalLevels;

      continuePlaying = {
        categoryId: recentSession.categoryId,
        name: recentSession.name,
        nameAr: recentSession.nameAr,
        icon: recentSession.icon,
        imageUrl: recentSession.imageUrl,
        totalLevels,
        completedLevels: completedSet.size,
        nextLevel,
        lastPlayedAt: recentSession.completedAt ?? recentSession.startedAt,
        state: hasActiveSession ? "resume_quiz" : isWorldComplete ? "complete" : "continue_world",
        href: hasActiveSession ? `/quiz/${recentSession.sessionId}` : `/worlds/${recentSession.categoryId}`,
        activeSession: hasActiveSession ? {
          sessionId: recentSession.sessionId,
          levelNumber: recentSession.levelNumber,
          currentQuestionNumber: recentSession.currentQuestionIndex + 1,
          totalQuestions: recentSession.totalQuestions,
        } : null,
      };
    }

    res.json({
      favoriteCategoryIds: favorites.map(favorite => favorite.categoryId),
      continuePlaying,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load player library");
    res.status(500).json({ error: "Could not load your player library" });
  }
});

router.put("/player/favorites/:categoryId", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;

  try {
    const { categoryId } = req.params;
    const [category] = await db
      .select({ id: categoriesTable.id, parentId: categoriesTable.parentId })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, categoryId));

    if (!category || category.parentId) {
      res.status(404).json({ error: "World not found" });
      return;
    }

    await db.insert(categoryFavoritesTable).values({ userId, categoryId }).onConflictDoNothing({
      target: [categoryFavoritesTable.userId, categoryFavoritesTable.categoryId],
    });

    res.json({ categoryId, favorited: true });
  } catch (err) {
    req.log.error({ err }, "Failed to add favorite world");
    res.status(500).json({ error: "Could not save this favorite" });
  }
});

router.delete("/player/favorites/:categoryId", async (req, res) => {
  const userId = authenticatedUserId(req, res);
  if (!userId) return;

  try {
    const { categoryId } = req.params;
    await db.delete(categoryFavoritesTable).where(and(
      eq(categoryFavoritesTable.userId, userId),
      eq(categoryFavoritesTable.categoryId, categoryId),
    ));
    res.json({ categoryId, favorited: false });
  } catch (err) {
    req.log.error({ err }, "Failed to remove favorite world");
    res.status(500).json({ error: "Could not remove this favorite" });
  }
});

export default router;
