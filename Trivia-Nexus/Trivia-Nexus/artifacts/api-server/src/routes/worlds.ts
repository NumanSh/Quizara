import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { questionsTable, quizSessionsTable, categoriesTable, levelProgressTable, profilesTable } from "@workspace/db";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { getRatesForMode } from "../lib/economyConfig";
import { awardBattlePassXp } from "./xpHelper";

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

    const [qCount] = await db.select({ value: count() }).from(questionsTable)
      .where(inArray(questionsTable.categoryId, allCatIds));

    const totalQuestions = Number(qCount.value);
    const levelCount = totalQuestions < 3 ? 0 : Math.min(30, Math.floor(totalQuestions / 3));

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

    const parsedLevel = Number(levelNumber);
    if (isNaN(parsedLevel) || parsedLevel < 1) {
      res.status(400).json({ error: "Invalid levelNumber" });
      return;
    }

    const userId = req.isAuthenticated() ? req.user.id : null;
    if (userId) {
      if (parsedLevel > 1) {
        const [prevLevel] = await db
          .select()
          .from(levelProgressTable)
          .where(
            and(
              eq(levelProgressTable.userId, userId),
              eq(levelProgressTable.categoryId, worldId),
              eq(levelProgressTable.levelNumber, parsedLevel - 1),
              eq(levelProgressTable.completed, true)
            )
          );

        if (!prevLevel) {
          res.status(403).json({ error: "This level is locked. Complete the previous level to unlock it." });
          return;
        }
      }
    } else {
      if (parsedLevel > 1) {
        res.status(403).json({ error: "Guests can only play level 1. Sign in to unlock more levels." });
        return;
      }
    }

    const subs = await db.select({ id: categoriesTable.id }).from(categoriesTable)
      .where(eq(categoriesTable.parentId, worldId));
    const subIds = subs.map(s => s.id);
    const allCatIds = [worldId, ...subIds];

    const [qCount] = await db.select({ value: count() }).from(questionsTable)
      .where(inArray(questionsTable.categoryId, allCatIds));
    
    const totalQuestions = Number(qCount.value);
    const maxLevel = Math.max(1, Math.min(30, Math.floor(totalQuestions / 3)));

    if (totalQuestions < 3 || parsedLevel > maxLevel) {
      res.status(400).json({ error: "Invalid level or not enough questions for this level" });
      return;
    }

    const allQs = await db.select({ id: questionsTable.id })
      .from(questionsTable)
      .where(inArray(questionsTable.categoryId, allCatIds))
      .orderBy(questionsTable.difficulty, questionsTable.id)
      .limit(3)
      .offset((parsedLevel - 1) * 3);

    const questionIds = allQs.map(q => q.id);

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
      res.status(401).json({ error: "Unauthorized", saved: false });
      return;
    }

    const { worldId, levelNumber } = req.body;
    if (!worldId || !levelNumber) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }

    const { sessionId } = req.params;
    const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Quiz session not found" });
      return;
    }

    // Security & Integrity Checks
    if (session.userId !== userId) {
      res.status(403).json({ error: "Unauthorized access to this session" });
      return;
    }
    if (session.status !== "completed") {
      res.status(400).json({ error: "Quiz session is not completed" });
      return;
    }
    if (session.categoryId !== worldId) {
      res.status(400).json({ error: "Session category does not match requested worldId" });
      return;
    }
    if (session.levelNumber !== Number(levelNumber)) {
      res.status(400).json({ error: "Session level number does not match requested levelNumber" });
      return;
    }

    // Determine pass status server-side (30 points or more)
    const passed = session.score >= 30;
    const rates = await getRatesForMode("worlds");

    let coinsAwarded = 0;
    let scoreAwarded = 0;
    let battlePassXpAwarded = 0;

    await db.transaction(async (tx) => {
      // Advisory lock to serialize concurrent level progress inserts/updates for the same user
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

      const [existing] = await tx.select().from(levelProgressTable)
        .where(and(
          eq(levelProgressTable.userId, userId),
          eq(levelProgressTable.categoryId, worldId),
          eq(levelProgressTable.levelNumber, levelNumber)
        ));

      const isFirstPass = passed && (!existing || !existing.completed);

      if (!existing) {
        await tx.insert(levelProgressTable).values({
          userId,
          categoryId: worldId,
          levelNumber,
          completed: passed,
          attempts: 1,
          completedAt: passed ? new Date() : null,
        });
      } else {
        await tx.update(levelProgressTable).set({
          completed: passed ? true : existing.completed,
          attempts: sql`${levelProgressTable.attempts} + 1`,
          completedAt: (passed && !existing.completed) ? new Date() : existing.completedAt,
        }).where(eq(levelProgressTable.id, existing.id));
      }

      // Award coins/score/XP only on first-time pass
      if (isFirstPass) {
        const correctAnswers = session.correctAnswers ?? 0;
        coinsAwarded = correctAnswers * rates.coinsPerCorrect;
        scoreAwarded = correctAnswers * rates.scorePerCorrect;
        battlePassXpAwarded = correctAnswers * rates.xpPerCorrect + rates.xpOnComplete;
        await tx.insert(profilesTable).values({
          userId,
          totalScore: scoreAwarded,
          coins: coinsAwarded,
          gamesPlayed: 1,
          bestScore: scoreAwarded,
        }).onConflictDoUpdate({
          target: profilesTable.userId,
          set: {
            totalScore: sql`${profilesTable.totalScore} + ${scoreAwarded}`,
            coins: sql`${profilesTable.coins} + ${coinsAwarded}`,
            gamesPlayed: sql`${profilesTable.gamesPlayed} + 1`,
            bestScore: sql`GREATEST(${profilesTable.bestScore}, ${scoreAwarded})`,
          }
        });
      }
    });

    if (battlePassXpAwarded > 0) {
      awardBattlePassXp(userId, battlePassXpAwarded).catch(() => {});
    }

    // "xpAwarded" is the response field name existing clients expect; it reflects the score
    // granted (profilesTable.totalScore), not Battle Pass XP — kept for API compatibility.
    res.json({ saved: true, coinsAwarded, xpAwarded: scoreAwarded });
  } catch (err) {
    req.log.error({ err }, "Failed to record level progress");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
