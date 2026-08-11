import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  challengesTable,
  challengeScoresTable,
  quizSessionsTable,
  questionsTable,
  categoriesTable,
} from "@workspace/db";
import { eq, inArray, desc } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = crypto.randomBytes(7);
  return Array.from(bytes).map(b => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

// Fetch all question IDs for a category (including child subcategories)
async function getQuestionIdsForCategory(categoryId: string): Promise<string[]> {
  const allCats = await db.select({ id: categoriesTable.id, parentId: categoriesTable.parentId }).from(categoriesTable);
  const subcatIds = allCats
    .filter(c => c.parentId === categoryId)
    .map(c => c.id);
  const targetIds = [categoryId, ...subcatIds];
  const questions = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(inArray(questionsTable.categoryId, targetIds));
  return questions.map(q => q.id);
}

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

// POST /challenges — create a new challenge link
router.post("/challenges", async (req, res): Promise<void> => {
  try {
    const { categoryId, questionCount = 10 } = req.body as {
      categoryId: string;
      questionCount?: number;
    };
    if (!categoryId) { res.status(400).json({ error: "categoryId is required" }); return; }

    const allIds = await getQuestionIdsForCategory(categoryId);
    if (allIds.length === 0) {
      res.status(400).json({ error: "No questions available for this category" });
      return;
    }

    const shuffled = [...allIds].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, categoryId));

    const creatorId = req.isAuthenticated() ? req.user.id : null;
    const creatorName = req.isAuthenticated()
      ? (req.user.firstName ? `${req.user.firstName}${req.user.lastName ? " " + req.user.lastName : ""}`.trim() : (req.user.email?.split("@")[0] ?? "Anonymous"))
      : "Anonymous";
    const title = `${cat?.name ?? "Quiz"} Challenge`;

    let code = generateCode();
    // Ensure uniqueness (retry on collision)
    for (let i = 0; i < 5; i++) {
      const existing = await db.select({ id: challengesTable.id }).from(challengesTable).where(eq(challengesTable.id, code));
      if (existing.length === 0) break;
      code = generateCode();
    }

    await db.insert(challengesTable).values({
      id: code,
      categoryId,
      questionIds: selected,
      questionCount: selected.length,
      creatorId,
      creatorName,
      title,
    });

    res.status(201).json({ code, title, categoryName: cat?.name });
  } catch (err) {
    req.log.error({ err }, "Failed to create challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /challenges/:code — challenge info + leaderboard
router.get("/challenges/:code", async (req, res): Promise<void> => {
  try {
    const { code } = req.params;
    const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, code));
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, challenge.categoryId));

    const scores = await db
      .select()
      .from(challengeScoresTable)
      .where(eq(challengeScoresTable.challengeId, code))
      .orderBy(desc(challengeScoresTable.score), challengeScoresTable.completedAt)
      .limit(20);

    res.json({
      code: challenge.id,
      title: challenge.title,
      categoryId: challenge.categoryId,
      categoryName: cat?.name ?? challenge.categoryId,
      questionCount: challenge.questionCount,
      creatorName: challenge.creatorName,
      createdAt: challenge.createdAt,
      totalPlayers: scores.length,
      scores: scores.map((s, i) => ({
        rank: i + 1,
        playerName: s.playerName,
        score: s.score,
        correctAnswers: s.correctAnswers,
        totalQuestions: s.totalQuestions,
        timeTaken: s.timeTaken,
        completedAt: s.completedAt,
        isCurrentUser: req.isAuthenticated() && s.userId === req.user.id,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /challenges/:code/start — create a quiz session with the challenge's fixed questions
router.post("/challenges/:code/start", async (req, res): Promise<void> => {
  try {
    const { code } = req.params;
    const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, code));
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    const questionIds = challenge.questionIds as string[];
    const userId = req.isAuthenticated() ? req.user.id : null;

    const [session] = await db.insert(quizSessionsTable).values({
      userId,
      categoryId: challenge.categoryId,
      totalQuestions: questionIds.length,
      questionIds,
    }).returning();

    const [firstQ] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionIds[0]));
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, challenge.categoryId));

    res.status(201).json({
      sessionId: session.id,
      categoryId: challenge.categoryId,
      categoryName: cat?.name ?? challenge.categoryId,
      status: "active",
      score: 0,
      correctAnswers: 0,
      questionNumber: 1,
      totalQuestions: questionIds.length,
      currentQuestion: firstQ ? buildQuestionPayload(firstQ, 1, questionIds.length) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to start challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /challenges/:code/scores — submit a score after quiz completion
router.post("/challenges/:code/scores", async (req, res): Promise<void> => {
  try {
    const { code } = req.params;
    const { sessionId, playerName: rawName } = req.body as { sessionId: string; playerName?: string };
    if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

    const [challenge] = await db.select().from(challengesTable).where(eq(challengesTable.id, code));
    if (!challenge) { res.status(404).json({ error: "Challenge not found" }); return; }

    const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
    if (!session || session.status !== "completed") {
      res.status(400).json({ error: "Quiz session not completed" });
      return;
    }

    const userId = req.isAuthenticated() ? req.user.id : null;

    if (session.userId && session.userId !== userId) {
      res.status(403).json({ error: "Unauthorized access to this session's score" });
      return;
    }

    const challengeQs = challenge.questionIds as string[];
    const sessionQs = session.questionIds as string[];

    if (JSON.stringify(challengeQs) !== JSON.stringify(sessionQs)) {
      res.status(400).json({ error: "Quiz session does not match the challenge questions" });
      return;
    }
    const playerName = rawName?.trim() ||
      (req.isAuthenticated()
        ? (req.user.firstName ? `${req.user.firstName}${req.user.lastName ? " " + req.user.lastName : ""}`.trim() : (req.user.email?.split("@")[0] ?? "Anonymous"))
        : "Anonymous");

    // Compute time taken (seconds between start and complete)
    const timeTaken = session.completedAt
      ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
      : 0;

    // Check for existing score from same session (prevent duplicate submissions)
    const existing = await db
      .select()
      .from(challengeScoresTable)
      .where(eq(challengeScoresTable.sessionId, sessionId));

    if (existing.length > 0) {
      // Already submitted — return current leaderboard
    } else {
      try {
        await db.insert(challengeScoresTable).values({
          challengeId: code,
          sessionId,
          userId,
          playerName,
          score: session.score,
          correctAnswers: session.correctAnswers,
          totalQuestions: session.totalQuestions,
          timeTaken,
        });
      } catch (insertErr: any) {
        if (insertErr.code === "23505") {
          req.log.warn({ sessionId }, "Duplicate challenge score submission caught by DB constraint");
        } else {
          throw insertErr;
        }
      }
    }

    // Return updated leaderboard
    const scores = await db
      .select()
      .from(challengeScoresTable)
      .where(eq(challengeScoresTable.challengeId, code))
      .orderBy(desc(challengeScoresTable.score), challengeScoresTable.completedAt)
      .limit(20);

    const myRank = scores.findIndex(s => s.sessionId === sessionId) + 1;

    res.json({
      rank: myRank || scores.length,
      score: session.score,
      scores: scores.map((s, i) => ({
        rank: i + 1,
        playerName: s.playerName,
        score: s.score,
        correctAnswers: s.correctAnswers,
        totalQuestions: s.totalQuestions,
        timeTaken: s.timeTaken,
        completedAt: s.completedAt,
        isMe: s.sessionId === sessionId,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to submit challenge score");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
