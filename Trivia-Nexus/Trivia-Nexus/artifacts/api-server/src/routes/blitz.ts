import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  blitzDailyPoolTable,
  userBlitzAttemptsTable,
  questionsTable,
  profilesTable,
} from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { awardBattlePassXp } from "./xpHelper";
import { getRatesForMode } from "../lib/economyConfig";

const router: IRouter = Router();

const BLITZ_DURATION = 90;
const BLITZ_QUESTION_COUNT = 30;

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

async function ensurePool(date: string, createdBy?: string): Promise<string[]> {
  const existing = await db.select().from(blitzDailyPoolTable).where(eq(blitzDailyPoolTable.date, date)).limit(1);
  if (existing.length > 0) return existing[0].questionIds;

  const questions = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .orderBy(sql`RANDOM()`)
    .limit(BLITZ_QUESTION_COUNT);

  const questionIds = questions.map((q) => q.id);
  try {
    await db.insert(blitzDailyPoolTable).values({ date, questionIds, createdBy: createdBy ?? null }).onConflictDoNothing();
  } catch (err) {
    // Ignore duplicate insert errors from concurrent players starting at the same time
  }
  const pool = await db.select().from(blitzDailyPoolTable).where(eq(blitzDailyPoolTable.date, date)).limit(1);
  return pool[0]?.questionIds ?? questionIds;
}

async function completeAttempt(attemptId: string, userId: string, correctCount: number) {
  const [updated] = await db.update(userBlitzAttemptsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(
      eq(userBlitzAttemptsTable.id, attemptId),
      eq(userBlitzAttemptsTable.status, "in_progress")
    ))
    .returning();
  if (updated) {
    const rates = await getRatesForMode("blitz");
    const xp = Math.max(correctCount * rates.xpPerCorrectOnComplete, rates.xpCompleteMinimum);
    await awardBattlePassXp(userId, xp).catch(() => {});
  }
}

async function fetchQuestions(questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const rows = await db.select().from(questionsTable).where(inArray(questionsTable.id, questionIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return questionIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((q) => ({
      id: q!.id,
      question: q!.question,
      questionAr: q!.questionAr,
      questionType: q!.questionType ?? "multiple_choice",
      options: q!.options as string[],
      optionsAr: q!.optionsAr as string[],
      difficulty: q!.difficulty,
      imageUrl: q!.imageUrl ?? null,
    }));
}

router.get("/blitz/today", async (req, res) => {
  try {
    const today = getToday();
    const pool = await db.select().from(blitzDailyPoolTable).where(eq(blitzDailyPoolTable.date, today)).limit(1);
    const questionCount = pool.length > 0 ? pool[0].questionIds.length : BLITZ_QUESTION_COUNT;

    let hasPlayed = false;
    let inProgress = false;
    let attemptId: string | null = null;
    let previousScore: number | null = null;
    let previousCorrect: number | null = null;
    let coinsEarned: number | null = null;
    let pointsEarned: number | null = null;
    let timeRemaining: number | null = null;

    if (req.isAuthenticated()) {
      const user = (req as any).user;
      const attempts = await db
        .select()
        .from(userBlitzAttemptsTable)
        .where(and(eq(userBlitzAttemptsTable.userId, user.id), eq(userBlitzAttemptsTable.blitzDate, today)))
        .limit(1);
      if (attempts.length > 0) {
        const attempt = attempts[0];
        attemptId = attempt.id;
        if (attempt.status === "completed") {
          hasPlayed = true;
          previousScore = attempt.score;
          previousCorrect = attempt.correctCount;
          coinsEarned = attempt.coinsEarned;
          pointsEarned = attempt.pointsEarned;
        } else {
          const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
          if (elapsed >= BLITZ_DURATION) {
            await completeAttempt(attempt.id, user.id, attempt.correctCount);
            const [finalAttempt] = await db.select().from(userBlitzAttemptsTable).where(eq(userBlitzAttemptsTable.id, attempt.id)).limit(1);
            hasPlayed = true;
            previousScore = finalAttempt?.score ?? attempt.score;
            previousCorrect = finalAttempt?.correctCount ?? attempt.correctCount;
            coinsEarned = finalAttempt?.coinsEarned ?? attempt.coinsEarned;
            pointsEarned = finalAttempt?.pointsEarned ?? attempt.pointsEarned;
          } else {
            inProgress = true;
            timeRemaining = Math.max(0, BLITZ_DURATION - Math.floor(elapsed));
          }
        }
      }
    }

    res.json({ date: today, questionCount, hasPlayed, inProgress, attemptId, previousScore, previousCorrect, coinsEarned, pointsEarned, timeRemaining });
  } catch (err) {
    req.log.error({ err }, "Failed to get blitz today");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/blitz/start", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = (req as any).user;
    const today = getToday();

    const existing = await db
      .select()
      .from(userBlitzAttemptsTable)
      .where(and(eq(userBlitzAttemptsTable.userId, user.id), eq(userBlitzAttemptsTable.blitzDate, today)))
      .limit(1);

    if (existing.length > 0) {
      const attempt = existing[0];
      if (attempt.status === "completed") {
        res.status(409).json({ error: "Already played today", attemptId: attempt.id });
        return;
      }
      const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
      if (elapsed >= BLITZ_DURATION) {
        await completeAttempt(attempt.id, user.id, attempt.correctCount);
        res.status(409).json({ error: "Session expired", attemptId: attempt.id });
        return;
      }
      const questions = await fetchQuestions(attempt.questionIds);
      res.json({ attemptId: attempt.id, questions, answeredCount: attempt.answeredCount, timeRemaining: Math.max(0, BLITZ_DURATION - Math.floor(elapsed)) });
      return;
    }

    const questionIds = await ensurePool(today);
    try {
      const [attempt] = await db.insert(userBlitzAttemptsTable).values({ userId: user.id, blitzDate: today, questionIds, status: "in_progress" }).returning();
      const questions = await fetchQuestions(questionIds);
      res.json({ attemptId: attempt.id, questions, answeredCount: 0, timeRemaining: BLITZ_DURATION });
    } catch (insertErr: any) {
      if (insertErr.code === "23505" || insertErr.message?.includes("uba_user_date_idx")) {
        // Fetch existing attempt since it was created concurrently
        const [existingAttempt] = await db
          .select()
          .from(userBlitzAttemptsTable)
          .where(and(eq(userBlitzAttemptsTable.userId, user.id), eq(userBlitzAttemptsTable.blitzDate, today)))
          .limit(1);
        if (existingAttempt) {
          if (existingAttempt.status === "completed") {
            res.status(409).json({ error: "Already played today", attemptId: existingAttempt.id });
            return;
          }
          const elapsed = (Date.now() - existingAttempt.startedAt.getTime()) / 1000;
          if (elapsed >= BLITZ_DURATION) {
            await completeAttempt(existingAttempt.id, user.id, existingAttempt.correctCount);
            res.status(409).json({ error: "Session expired", attemptId: existingAttempt.id });
            return;
          }
          const questions = await fetchQuestions(existingAttempt.questionIds);
          res.json({ attemptId: existingAttempt.id, questions, answeredCount: existingAttempt.answeredCount, timeRemaining: Math.max(0, BLITZ_DURATION - Math.floor(elapsed)) });
          return;
        }
      }
      throw insertErr;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to start blitz");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/blitz/:attemptId/answer", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = (req as any).user;
    const { attemptId } = req.params;
    const { questionId, selectedAnswer } = req.body as { questionId?: string; selectedAnswer?: number };

    if (!questionId || selectedAnswer === undefined) {
      res.status(400).json({ error: "questionId and selectedAnswer are required" });
      return;
    }

    const [attempt] = await db.select().from(userBlitzAttemptsTable).where(and(eq(userBlitzAttemptsTable.id, attemptId), eq(userBlitzAttemptsTable.userId, user.id))).limit(1);
    if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
    if (attempt.status !== "in_progress") { res.status(409).json({ error: "Session not in progress" }); return; }

    const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
    if (elapsed > BLITZ_DURATION + 5) {
      await completeAttempt(attemptId, user.id, attempt.correctCount);
      res.status(409).json({ error: "Time expired" });
      return;
    }

    const questionIds = attempt.questionIds as string[];
    const answeredCount = attempt.answeredCount;

    if (answeredCount >= questionIds.length) {
      res.status(400).json({ error: "All questions have already been answered" });
      return;
    }

    const expectedQuestionId = questionIds[answeredCount];
    if (questionId !== expectedQuestionId) {
      res.status(400).json({ error: "Invalid question ID for the current question index" });
      return;
    }

    const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionId)).limit(1);
    if (!question) { res.status(404).json({ error: "Question not found" }); return; }

    const isCorrect = selectedAnswer === question.correctAnswer;
    const diff = question.difficulty ?? 1;
    const rates = await getRatesForMode("blitz");
    const coinsThisAnswer = isCorrect ? diff * rates.coinsPerCorrectBase : 0;
    const pointsThisAnswer = isCorrect ? diff * rates.scorePerCorrectBase : 0;

    let transactionFailed = false;
    await db.transaction(async (tx) => {
      const [updatedAttempt] = await tx.update(userBlitzAttemptsTable).set({
        answeredCount: sql`${userBlitzAttemptsTable.answeredCount} + 1`,
        correctCount: sql`${userBlitzAttemptsTable.correctCount} + ${isCorrect ? 1 : 0}`,
        score: sql`${userBlitzAttemptsTable.score} + ${pointsThisAnswer}`,
        coinsEarned: sql`${userBlitzAttemptsTable.coinsEarned} + ${coinsThisAnswer}`,
        pointsEarned: sql`${userBlitzAttemptsTable.pointsEarned} + ${pointsThisAnswer}`,
      }).where(and(
        eq(userBlitzAttemptsTable.id, attemptId),
        eq(userBlitzAttemptsTable.answeredCount, answeredCount)
      )).returning();

      if (!updatedAttempt) {
        transactionFailed = true;
        tx.rollback();
        return;
      }

      if (coinsThisAnswer > 0 || pointsThisAnswer > 0) {
        await tx.update(profilesTable).set({
          coins: sql`${profilesTable.coins} + ${coinsThisAnswer}`,
          totalScore: sql`${profilesTable.totalScore} + ${pointsThisAnswer}`,
        }).where(eq(profilesTable.userId, user.id));
      }
    }).catch(err => {
      if (!transactionFailed) throw err;
    });

    if (transactionFailed) {
      res.status(409).json({ error: "Answer already submitted or session modified" });
      return;
    }

    res.json({ isCorrect, correctAnswer: question.correctAnswer, coinsEarned: coinsThisAnswer, pointsEarned: pointsThisAnswer });
  } catch (err) {
    req.log.error({ err }, "Failed to submit blitz answer");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/blitz/:attemptId/complete", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = (req as any).user;
    const { attemptId } = req.params;

    const [attempt] = await db.select().from(userBlitzAttemptsTable).where(and(eq(userBlitzAttemptsTable.id, attemptId), eq(userBlitzAttemptsTable.userId, user.id))).limit(1);
    if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

    if (attempt.status !== "completed") {
      await completeAttempt(attemptId, user.id, attempt.correctCount);
    }

    res.json({ score: attempt.score, correctCount: attempt.correctCount, answeredCount: attempt.answeredCount, coinsEarned: attempt.coinsEarned, pointsEarned: attempt.pointsEarned });
  } catch (err) {
    req.log.error({ err }, "Failed to complete blitz");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/blitz/setup", async (req, res) => {
  try {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.user.role !== "admin") { res.status(403).json({ error: "Forbidden: Admin role required" }); return; }
    const { date, questionCount, questionIds } = req.body as { date?: string; questionCount?: number; questionIds?: string[] };
    const user = (req as any).user;
    const targetDate = date ?? getToday();
    const count = Math.min(questionCount ?? BLITZ_QUESTION_COUNT, 50);

    let pool: string[];
    if (questionIds && questionIds.length > 0) {
      pool = questionIds;
    } else {
      const questions = await db.select({ id: questionsTable.id }).from(questionsTable).orderBy(sql`RANDOM()`).limit(count);
      pool = questions.map((q) => q.id);
    }

    await db.insert(blitzDailyPoolTable)
      .values({ date: targetDate, questionIds: pool, createdBy: user.id })
      .onConflictDoUpdate({ target: blitzDailyPoolTable.date, set: { questionIds: pool, createdBy: user.id } });

    res.json({ date: targetDate, questionCount: pool.length, success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to setup blitz pool");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/blitz/status", async (req, res) => {
  try {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.user.role !== "admin") { res.status(403).json({ error: "Forbidden: Admin role required" }); return; }
    const today = getToday();
    const pool = await db.select().from(blitzDailyPoolTable).where(eq(blitzDailyPoolTable.date, today)).limit(1);
    const [attemptCount] = await db.select({ count: sql<number>`count(*)` }).from(userBlitzAttemptsTable).where(eq(userBlitzAttemptsTable.blitzDate, today));
    const [completedCount] = await db.select({ count: sql<number>`count(*)` }).from(userBlitzAttemptsTable).where(and(eq(userBlitzAttemptsTable.blitzDate, today), eq(userBlitzAttemptsTable.status, "completed")));

    res.json({
      today,
      hasPool: pool.length > 0,
      questionCount: pool[0]?.questionIds.length ?? 0,
      totalAttempts: Number(attemptCount?.count ?? 0),
      completedAttempts: Number(completedCount?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get blitz status");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
