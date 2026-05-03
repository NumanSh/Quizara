import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { questionsTable, quizSessionsTable, categoriesTable, levelProgressTable, profilesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const COINS_PER_CORRECT = 5;

const router: IRouter = Router();

function buildQuestionPayload(q: any, questionNumber: number, totalQuestions: number) {
  return {
    id: q.id,
    questionType: q.questionType ?? "multiple_choice",
    question: q.question,
    questionAr: q.questionAr,
    imageUrl: q.imageUrl ?? null,
    options: q.options as string[],
    optionsAr: q.optionsAr as string[],
    questionNumber,
    totalQuestions,
    difficulty: q.difficulty,
  };
}

router.get("/quiz/worlds/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const userId = req.isAuthenticated() ? req.user.id : null;

    const [world] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId));
    if (!world || world.parentId) {
      res.status(404).json({ error: "World not found" });
      return;
    }

    const subs = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(eq(categoriesTable.parentId, categoryId));
    const subIds = subs.map(s => s.id);
    const allCatIds = [categoryId, ...subIds];

    const allQs = await db.select({ id: questionsTable.id }).from(questionsTable)
      .where(inArray(questionsTable.categoryId, allCatIds));

    const totalQuestions = allQs.length;
    const levelCount = Math.max(1, Math.min(30, Math.floor(totalQuestions / 3)));

    let completedLevels: number[] = [];
    if (userId) {
      const progress = await db.select({ levelNumber: levelProgressTable.levelNumber })
        .from(levelProgressTable)
        .where(and(
          eq(levelProgressTable.userId, userId),
          eq(levelProgressTable.categoryId, categoryId),
          eq(levelProgressTable.completed, true)
        ));
      completedLevels = progress.map(p => p.levelNumber);
    }

    const levels = Array.from({ length: levelCount }, (_, i) => {
      const levelNum = i + 1;
      const isCompleted = completedLevels.includes(levelNum);
      const isUnlocked = userId
        ? (levelNum === 1 || completedLevels.includes(levelNum - 1))
        : levelNum === 1;
      return { levelNumber: levelNum, isCompleted, isUnlocked };
    });

    res.json({
      id: world.id,
      name: world.name,
      nameAr: world.nameAr,
      icon: world.icon,
      color: world.color,
      imageUrl: world.imageUrl,
      totalQuestions,
      totalLevels: levelCount,
      completedLevels: completedLevels.length,
      levels,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get world");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quiz/levels/start", async (req, res) => {
  try {
    const { worldId, levelNumber } = req.body;
    if (!worldId || !levelNumber) {
      res.status(400).json({ error: "Missing worldId or levelNumber" });
      return;
    }

    const subs = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(eq(categoriesTable.parentId, worldId));
    const subIds = subs.map(s => s.id);
    const allCatIds = [worldId, ...subIds];

    const allQs = await db.select({ id: questionsTable.id }).from(questionsTable)
      .where(inArray(questionsTable.categoryId, allCatIds));

    if (allQs.length < 3) {
      res.status(400).json({ error: "Not enough questions for this level" });
      return;
    }

    const shuffled = [...allQs].sort(() => Math.random() - 0.5);
    const questionIds = shuffled.slice(0, 3).map(q => q.id);

    const userId = req.isAuthenticated() ? req.user.id : null;
    const [session] = await db.insert(quizSessionsTable).values({
      userId,
      categoryId: worldId,
      totalQuestions: 3,
      questionIds,
      levelNumber: Number(levelNumber),
    }).returning();

    const [firstQ] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionIds[0]));

    res.status(201).json({
      sessionId: session.id,
      worldId,
      levelNumber,
      totalQuestions: 3,
      currentQuestion: firstQ ? buildQuestionPayload(firstQ, 1, 3) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to start level");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quiz/levels/:sessionId/record", async (req, res) => {
  try {
    const userId = req.isAuthenticated() ? req.user.id : null;
    if (!userId) {
      res.json({ saved: false });
      return;
    }

    const { worldId, levelNumber, passed } = req.body;
    if (!worldId || !levelNumber) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const [existing] = await db.select().from(levelProgressTable)
      .where(and(
        eq(levelProgressTable.userId, userId),
        eq(levelProgressTable.categoryId, worldId),
        eq(levelProgressTable.levelNumber, levelNumber)
      ));

    const isFirstPass = passed && (!existing || !existing.completed);

    if (!existing) {
      await db.insert(levelProgressTable).values({
        userId,
        categoryId: worldId,
        levelNumber,
        completed: !!passed,
        attempts: 1,
        completedAt: passed ? new Date() : null,
      });
    } else {
      await db.update(levelProgressTable).set({
        completed: passed ? true : existing.completed,
        attempts: existing.attempts + 1,
        completedAt: (passed && !existing.completed) ? new Date() : existing.completedAt,
      }).where(eq(levelProgressTable.id, existing.id));
    }

    // Award coins/XP only on first-time pass
    let coinsAwarded = 0;
    let xpAwarded = 0;
    if (isFirstPass) {
      const { sessionId } = req.params;
      const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
      if (session) {
        coinsAwarded = (session.correctAnswers ?? 0) * COINS_PER_CORRECT;
        xpAwarded = session.score ?? 0;
        const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
        if (profile) {
          await db.update(profilesTable).set({
            totalScore: profile.totalScore + xpAwarded,
            coins: profile.coins + coinsAwarded,
            gamesPlayed: profile.gamesPlayed + 1,
            bestScore: Math.max(profile.bestScore, xpAwarded),
          }).where(eq(profilesTable.userId, userId));
        } else {
          await db.insert(profilesTable).values({
            userId,
            totalScore: xpAwarded,
            coins: coinsAwarded,
            gamesPlayed: 1,
            bestScore: xpAwarded,
          });
        }
      }
    }

    res.json({ saved: true, coinsAwarded, xpAwarded });
  } catch (err) {
    req.log.error({ err }, "Failed to record level progress");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
