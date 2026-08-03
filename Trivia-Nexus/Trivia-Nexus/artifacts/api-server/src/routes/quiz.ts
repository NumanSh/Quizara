import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { questionsTable, quizSessionsTable, profilesTable, categoriesTable, marketplaceItemsTable, userInventoryTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { StartQuizBody, SubmitAnswerBody } from "@workspace/api-zod";
import { awardBattlePassXp } from "./xpHelper";
import { checkAndAwardBadges } from "./badgeChecker";
import { updateDailyTaskProgress } from "./dailyTasks";
import { getRatesForMode } from "../lib/economyConfig";

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

function scoreAnswer(question: any, selectedAnswer: number | undefined, answerData: string | undefined): boolean {
  const qType = question.questionType ?? "multiple_choice";

  if (qType === "ordering") {
    if (!answerData) return false;
    try {
      const playerOrder: string[] = JSON.parse(answerData);
      const correctOrder = question.options as string[];
      return JSON.stringify(playerOrder) === JSON.stringify(correctOrder);
    } catch {
      return false;
    }
  }

  if (qType === "matching") {
    if (!answerData) return false;
    try {
      const playerMatches: Record<string, string> = JSON.parse(answerData);
      const opts = question.options as string[];
      const correctPairs: Record<string, string> = {};
      for (const o of opts) {
        const [l, r] = o.split(":::");
        if (l !== undefined && r !== undefined) correctPairs[l.trim()] = r.trim();
      }
      let allCorrect = true;
      for (const [l, r] of Object.entries(correctPairs)) {
        if ((playerMatches[l] ?? "").trim() !== r) { allCorrect = false; break; }
      }
      return allCorrect && Object.keys(playerMatches).length === Object.keys(correctPairs).length;
    } catch {
      return false;
    }
  }

  if (qType === "hotspot") {
    if (!answerData) return false;
    try {
      const click: { x: number; y: number } = JSON.parse(answerData);
      const opts = question.options as string[];
      const parts = (opts[0] ?? "0,0,100,100").split(",").map(Number);
      const [x1, y1, x2, y2] = parts;
      return click.x >= x1 && click.x <= x2 && click.y >= y1 && click.y <= y2;
    } catch {
      return false;
    }
  }

  // multiple_choice, true_false, image, fill_blank, audio
  return (selectedAnswer ?? -1) === question.correctAnswer;
}

router.post("/quiz/start", async (req, res) => {
  try {
    const parsed = StartQuizBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const { categoryId, questionCount: rawQuestionCount = 10, difficulty } = parsed.data;
    const questionCount = Math.max(1, Math.min(rawQuestionCount, 50));

    const whereClause = difficulty != null
      ? and(eq(questionsTable.categoryId, categoryId), eq(questionsTable.difficulty, difficulty))
      : eq(questionsTable.categoryId, categoryId);

    const allQuestions = await db.select({ id: questionsTable.id }).from(questionsTable).where(whereClause);
    if (allQuestions.length === 0) {
      res.status(400).json({ error: "No questions available for this category" });
      return;
    }

    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));
    const questionIds = selected.map(q => q.id);

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId));

    const userId = req.isAuthenticated() ? req.user.id : null;
    const [session] = await db.insert(quizSessionsTable).values({
      userId,
      categoryId,
      totalQuestions: questionIds.length,
      questionIds,
    }).returning();

    const [firstQ] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionIds[0]));

    res.status(201).json({
      sessionId: session.id,
      categoryId,
      categoryName: cat?.name ?? categoryId,
      status: "active",
      score: 0,
      questionNumber: 1,
      totalQuestions: questionIds.length,
      currentQuestion: firstQ ? buildQuestionPayload(firstQ, 1, questionIds.length) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to start quiz");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/quiz/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, session.categoryId));
    const questionIds = session.questionIds as string[];
    const currentIdx = session.currentQuestionIndex;
    let currentQuestion = null;

    if (session.status === "active" && currentIdx < questionIds.length) {
      const [q] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionIds[currentIdx]));
      if (q) currentQuestion = buildQuestionPayload(q, currentIdx + 1, questionIds.length);
    }

    res.json({
      sessionId: session.id,
      categoryId: session.categoryId,
      categoryName: cat?.name ?? session.categoryId,
      status: session.status,
      score: session.score,
      questionNumber: currentIdx + 1,
      totalQuestions: session.totalQuestions,
      currentQuestion,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get quiz session");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quiz/:sessionId/answer", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const parsed = SubmitAnswerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const { questionId, selectedAnswer, answerData } = parsed.data;

    const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Security & Integrity Checks
    const userId = req.isAuthenticated() ? req.user.id : null;
    if (session.userId && session.userId !== userId) {
      res.status(403).json({ error: "Unauthorized access to this quiz session" });
      return;
    }

    if (session.status !== "active") {
      res.status(400).json({ error: "Quiz session is not active" });
      return;
    }

    const questionIds = session.questionIds as string[];
    const currentIdx = session.currentQuestionIndex;

    if (currentIdx >= questionIds.length) {
      res.status(400).json({ error: "No more questions in this session" });
      return;
    }

    if (questionId !== questionIds[currentIdx]) {
      res.status(400).json({ error: "Invalid question ID for the current question index" });
      return;
    }

    const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionId));
    if (!question) {
      res.status(404).json({ error: "Question not found" });
      return;
    }

    const correct = scoreAnswer(question, selectedAnswer, answerData);
    const rates = await getRatesForMode("quiz");

    let doubleScore = false;
    if (req.body.doubleScore === true && correct) {
      if (session.userId) {
        const doubleScoreItemId = req.body.doubleScoreItemId;
        if (!doubleScoreItemId || typeof doubleScoreItemId !== "string") {
          res.status(400).json({ error: "doubleScoreItemId is required to apply double score" });
          return;
        }

        const [item] = await db.select().from(marketplaceItemsTable).where(eq(marketplaceItemsTable.id, doubleScoreItemId));
        if (!item || item.type !== "powerup" || item.effect !== "double_score") {
          res.status(400).json({ error: "Invalid double score power-up item" });
          return;
        }

        const [entry] = await db.select().from(userInventoryTable)
          .where(and(eq(userInventoryTable.userId, session.userId), eq(userInventoryTable.itemId, doubleScoreItemId)));

        if (!entry || entry.quantity < 1) {
          res.status(400).json({ error: "Double score power-up not in inventory" });
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
            res.status(409).json({ error: "Inventory updated concurrently, try again" });
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
            res.status(409).json({ error: "Inventory updated concurrently, try again" });
            return;
          }
        }
        doubleScore = true;
      }
      // Guests have no inventory to validate a power-up against, so no double score for them
    }

    const pointsEarned = correct ? (doubleScore ? rates.scorePerCorrect * 2 : rates.scorePerCorrect) : 0;
    const newScore = session.score + pointsEarned;
    const newCorrect = session.correctAnswers + (correct ? 1 : 0);
    const newIdx = currentIdx + 1;
    const isLastQuestion = newIdx >= questionIds.length;

    let sessionUpdateFailed = false;
    await db.transaction(async (tx) => {
      const [updatedSession] = await tx.update(quizSessionsTable).set({
        score: newScore,
        correctAnswers: newCorrect,
        currentQuestionIndex: newIdx,
        ...(isLastQuestion ? { status: "completed", completedAt: new Date() } : {}),
      }).where(and(
        eq(quizSessionsTable.id, sessionId),
        eq(quizSessionsTable.currentQuestionIndex, currentIdx)
      )).returning();

      if (!updatedSession) {
        sessionUpdateFailed = true;
        return;
      }

      // For level sessions, rewards are handled by the record endpoint (first-time pass only)
      if (isLastQuestion && session.userId && session.levelNumber === null) {
        const totalCoinsForGame = newCorrect * rates.coinsPerCorrect;
        await tx.update(profilesTable).set({
          totalScore: sql`${profilesTable.totalScore} + ${newScore}`,
          coins: sql`${profilesTable.coins} + ${totalCoinsForGame}`,
          gamesPlayed: sql`${profilesTable.gamesPlayed} + 1`,
          bestScore: sql`GREATEST(${profilesTable.bestScore}, ${newScore})`,
        }).where(eq(profilesTable.userId, session.userId));
      }
    });

    if (sessionUpdateFailed) {
      res.status(409).json({ error: "Answer already submitted for this question" });
      return;
    }

    let nextQuestion = null;
    if (!isLastQuestion) {
      const [nq] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionIds[newIdx]));
      if (nq) nextQuestion = buildQuestionPayload(nq, newIdx + 1, questionIds.length);
    }

    const coinsEarned = correct ? rates.coinsPerCorrect : 0;

    // Award battle pass XP for correct answers and quiz completion
    if (session.userId) {
      const xpToAward = (correct ? rates.xpPerCorrect : 0) + (isLastQuestion ? rates.xpOnComplete : 0);
      if (xpToAward > 0) {
        awardBattlePassXp(session.userId, xpToAward).catch(() => {});
      }
    }

    // Update daily task progress on quiz completion
    if (isLastQuestion && session.userId) {
      updateDailyTaskProgress(session.userId, {
        categoryId: session.categoryId,
        score: newScore,
        correctAnswers: newCorrect,
        totalQuestions: questionIds.length,
      }).catch(() => {});
    }

    // Check badges
    if (session.userId) {
      const answerTimeMs = typeof req.body.answerTimeMs === "number" ? req.body.answerTimeMs : undefined;
      const badgeCtx: Record<string, any> = {};
      if (answerTimeMs !== undefined && correct) badgeCtx.answerTimeMs = answerTimeMs;
      if (isLastQuestion) {
        badgeCtx.quizCorrect = newCorrect;
        badgeCtx.quizTotal = questionIds.length;
      }
      if (Object.keys(badgeCtx).length > 0) {
        checkAndAwardBadges(session.userId, badgeCtx).catch(() => {});
      }
    }

    // Build correctAnswerData for complex types
    const qType = question.questionType ?? "multiple_choice";
    let correctAnswerData: string | null = null;
    if (qType === "ordering") {
      correctAnswerData = JSON.stringify(question.options);
    } else if (qType === "matching") {
      const pairs: Record<string, string> = {};
      for (const o of (question.options as string[])) {
        const [l, r] = o.split(":::");
        if (l !== undefined && r !== undefined) pairs[l.trim()] = r.trim();
      }
      correctAnswerData = JSON.stringify(pairs);
    } else if (qType === "hotspot") {
      correctAnswerData = (question.options as string[])[0] ?? null;
    }

    res.json({
      correct,
      correctAnswer: question.correctAnswer,
      correctAnswerData,
      pointsEarned,
      coinsEarned,
      explanation: question.explanation,
      explanationAr: question.explanationAr,
      nextQuestion,
      sessionScore: newScore,
      isLastQuestion,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to submit answer");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quiz/:sessionId/complete", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, session.categoryId));
    const timeTaken = session.completedAt
      ? Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 1000)
      : 0;

    res.json({
      sessionId: session.id,
      score: session.score,
      totalQuestions: session.totalQuestions,
      correctAnswers: session.correctAnswers,
      timeTaken,
      categoryName: cat?.name ?? session.categoryId,
      rank: null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to complete quiz");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
