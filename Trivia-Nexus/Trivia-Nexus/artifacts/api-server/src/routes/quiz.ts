import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { questionsTable, quizSessionsTable, profilesTable, categoriesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { StartQuizBody, SubmitAnswerBody } from "@workspace/api-zod";
import { awardBattlePassXp } from "./xpHelper";
import { checkAndAwardBadges } from "./badgeChecker";
import { trackDailyTaskProgress } from "./dailyTasks";
import { getRatesForMode } from "../lib/economyConfig";
import { consumePowerUpItem } from "../lib/powerUps";

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
      correctAnswers: 0,
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
      correctAnswers: session.correctAnswers,
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

    // Guests have no inventory to validate a power-up against, so no double score for them.
    const wantsDoubleScore = req.body.doubleScore === true && correct && !!session.userId;

    const newCorrect = session.correctAnswers + (correct ? 1 : 0);
    const newIdx = currentIdx + 1;
    const isLastQuestion = newIdx >= questionIds.length;

    let sessionUpdateFailed = false;
    let powerUpError: { status: number; error: string } | null = null;
    let doubleScoreApplied = false;
    let pointsEarned = correct ? rates.scorePerCorrect : 0;
    let newScore = session.score + pointsEarned;

    await db.transaction(async (tx) => {
      // Consumed inside the transaction: if the session update below loses the
      // concurrency check, the rollback puts the power-up back in the inventory.
      if (wantsDoubleScore) {
        const consumed = await consumePowerUpItem(session.userId!, req.body.doubleScoreItemId, "double_score", tx);
        if (!consumed.ok) {
          powerUpError = { status: consumed.status, error: consumed.error };
          tx.rollback();
          return;
        }
        doubleScoreApplied = true;
        pointsEarned = rates.scorePerCorrect * 2;
        newScore = session.score + pointsEarned;
      }

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
        tx.rollback();
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
    }).catch(err => {
      if (!sessionUpdateFailed && !powerUpError) throw err;
    });

    if (powerUpError) {
      const { status, error } = powerUpError as { status: number; error: string };
      res.status(status).json({ error });
      return;
    }

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
      trackDailyTaskProgress(session.userId, {
        categoryId: session.categoryId,
        score: newScore,
        correctAnswers: newCorrect,
        totalQuestions: questionIds.length,
      });
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
      doubleScoreApplied,
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

    // Global all-time rank of the player who owns this session. Guests have no
    // profile to rank, so it stays null for them.
    let rank: number | null = null;
    if (session.userId) {
      const [me] = await db
        .select({ totalScore: profilesTable.totalScore })
        .from(profilesTable)
        .where(eq(profilesTable.userId, session.userId));

      if (me) {
        const [ahead] = await db
          .select({ count: sql<number>`count(*)` })
          .from(profilesTable)
          .where(sql`${profilesTable.totalScore} > ${me.totalScore}`);
        rank = Number(ahead?.count ?? 0) + 1;
      }
    }

    res.json({
      sessionId: session.id,
      score: session.score,
      totalQuestions: session.totalQuestions,
      correctAnswers: session.correctAnswers,
      timeTaken,
      categoryName: cat?.name ?? session.categoryId,
      rank,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to complete quiz");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
