import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, quizSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const MAX_HEARTS = 6;
const REFILL_MS = 30 * 60 * 1000; // 30 min background refill
const HEARTS_PER_AD = 1;

function computeHearts(stored: number, lastUpdated: Date): {
  hearts: number;
  nextRefillMs: number;
  newLastUpdated: Date;
} {
  if (stored >= MAX_HEARTS) {
    return { hearts: MAX_HEARTS, nextRefillMs: 0, newLastUpdated: lastUpdated };
  }
  const now = Date.now();
  const elapsed = now - lastUpdated.getTime();
  const regened = Math.floor(elapsed / REFILL_MS);
  const hearts = Math.min(MAX_HEARTS, stored + regened);
  const newLastUpdated = regened > 0
    ? new Date(lastUpdated.getTime() + regened * REFILL_MS)
    : lastUpdated;
  const nextRefillMs = hearts >= MAX_HEARTS
    ? 0
    : REFILL_MS - (now - newLastUpdated.getTime());
  return { hearts, nextRefillMs, newLastUpdated };
}

router.get("/hearts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, maxHearts: MAX_HEARTS });
    return;
  }
  try {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
    if (!profile) {
      res.json({ hearts: MAX_HEARTS, nextRefillMs: 0, maxHearts: MAX_HEARTS });
      return;
    }
    const { hearts, nextRefillMs, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
    if (hearts !== profile.hearts) {
      await db.update(profilesTable)
        .set({ hearts, heartsLastUpdated: newLastUpdated })
        .where(eq(profilesTable.userId, req.user.id));
    }
    res.json({ hearts, nextRefillMs, maxHearts: MAX_HEARTS });
  } catch (err) {
    req.log.error({ err }, "Failed to get hearts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/hearts/deduct", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, maxHearts: MAX_HEARTS });
    return;
  }
  try {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
    if (!profile) {
      res.json({ hearts: MAX_HEARTS, nextRefillMs: 0, maxHearts: MAX_HEARTS });
      return;
    }
    const { hearts: currentHearts, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
    const newHearts = Math.max(0, currentHearts - 1);
    const timerStart = currentHearts >= MAX_HEARTS ? new Date() : newLastUpdated;
    await db.update(profilesTable)
      .set({ hearts: newHearts, heartsLastUpdated: timerStart })
      .where(eq(profilesTable.userId, req.user.id));
    const nextRefillMs = newHearts >= MAX_HEARTS
      ? 0
      : REFILL_MS - (Date.now() - timerStart.getTime());
    res.json({ hearts: newHearts, nextRefillMs, maxHearts: MAX_HEARTS });
  } catch (err) {
    req.log.error({ err }, "Failed to deduct heart");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/hearts/watch-ad", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, heartsEarned: HEARTS_PER_AD, maxHearts: MAX_HEARTS });
    return;
  }
  try {
    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
    if (!profile) {
      res.json({ hearts: MAX_HEARTS, nextRefillMs: 0, maxHearts: MAX_HEARTS, heartsEarned: HEARTS_PER_AD });
      return;
    }
    const { hearts: currentHearts, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
    const newHearts = Math.min(MAX_HEARTS, currentHearts + HEARTS_PER_AD);
    const newLastUpdated2 = newHearts >= MAX_HEARTS ? newLastUpdated : newLastUpdated;
    await db.update(profilesTable)
      .set({ hearts: newHearts, heartsLastUpdated: newLastUpdated2 })
      .where(eq(profilesTable.userId, req.user.id));
    const nextRefillMs = newHearts >= MAX_HEARTS
      ? 0
      : REFILL_MS - (Date.now() - newLastUpdated2.getTime());
    const heartsEarned = newHearts - currentHearts;
    res.json({ hearts: newHearts, nextRefillMs, maxHearts: MAX_HEARTS, heartsEarned });
  } catch (err) {
    req.log.error({ err }, "Failed to process watch-ad");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/hearts/watch-ad-fail-bonus", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, heartsEarned: HEARTS_PER_AD, maxHearts: MAX_HEARTS });
    return;
  }
  try {
    const { sessionId } = req.body as { sessionId?: string };
    let bonusCoins = 0;
    let bonusXp = 0;

    if (sessionId) {
      const [session] = await db.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
      if (session) {
        const correctCount = session.correctAnswers ?? 0;
        bonusCoins = correctCount * 10; // 2× the normal 5 per correct
        bonusXp = (session.score ?? 0) * 2;
      }
    }

    const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
    const now = new Date();
    if (!profile) {
      await db.insert(profilesTable).values({
        userId: req.user.id,
        hearts: Math.min(MAX_HEARTS, HEARTS_PER_AD),
        heartsLastUpdated: now,
        coins: bonusCoins,
        totalScore: bonusXp,
      });
      res.json({ hearts: HEARTS_PER_AD, nextRefillMs: REFILL_MS, maxHearts: MAX_HEARTS, heartsEarned: HEARTS_PER_AD, bonusCoins, bonusXp });
      return;
    }

    const { hearts: currentHearts, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
    const newHearts = Math.min(MAX_HEARTS, currentHearts + HEARTS_PER_AD);
    await db.update(profilesTable).set({
      hearts: newHearts,
      heartsLastUpdated: newLastUpdated,
      coins: profile.coins + bonusCoins,
      totalScore: profile.totalScore + bonusXp,
    }).where(eq(profilesTable.userId, req.user.id));

    const nextRefillMs = newHearts >= MAX_HEARTS
      ? 0
      : REFILL_MS - (Date.now() - newLastUpdated.getTime());
    const heartsEarned = newHearts - currentHearts;
    res.json({ hearts: newHearts, nextRefillMs, maxHearts: MAX_HEARTS, heartsEarned, bonusCoins, bonusXp });
  } catch (err) {
    req.log.error({ err }, "Failed to process watch-ad-fail-bonus");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
