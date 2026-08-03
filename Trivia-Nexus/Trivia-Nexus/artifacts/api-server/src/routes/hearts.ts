import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, quizSessionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { checkAdCooldown } from "../lib/adTracker";
import { getRatesForMode } from "../lib/economyConfig";
import { awardBattlePassXp } from "./xpHelper";

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
  const elapsed = Math.max(0, now - lastUpdated.getTime());
  const regened = Math.floor(elapsed / REFILL_MS);
  const hearts = Math.min(MAX_HEARTS, stored + regened);
  const newLastUpdated = regened > 0
    ? new Date(lastUpdated.getTime() + regened * REFILL_MS)
    : lastUpdated;
  const nextRefillMs = hearts >= MAX_HEARTS
    ? 0
    : Math.max(0, REFILL_MS - (now - newLastUpdated.getTime()));
  return { hearts, nextRefillMs, newLastUpdated };
}

router.get("/hearts", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, maxHearts: MAX_HEARTS });
    return;
  }
  let retries = 10;
  while (retries > 0) {
    try {
      let heartsResult = MAX_HEARTS;
      let nextRefillMsResult = 0;
      await db.transaction(async (tx) => {
        const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
        if (!profile) {
          heartsResult = MAX_HEARTS;
          nextRefillMsResult = 0;
          return;
        }
        const { hearts, nextRefillMs, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
        heartsResult = hearts;
        nextRefillMsResult = nextRefillMs;
        if (hearts !== profile.hearts) {
          const [updated] = await tx.update(profilesTable)
            .set({ hearts, heartsLastUpdated: newLastUpdated })
            .where(and(
              eq(profilesTable.userId, req.user.id),
              eq(profilesTable.hearts, profile.hearts),
              eq(profilesTable.heartsLastUpdated, profile.heartsLastUpdated)
            ))
            .returning();
          if (!updated) {
            throw new Error("CONCURRENT_UPDATE");
          }
        }
      });
      res.json({ hearts: heartsResult, nextRefillMs: nextRefillMsResult, maxHearts: MAX_HEARTS });
      return;
    } catch (err: any) {
      if (err.message === "CONCURRENT_UPDATE" && retries > 1) {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 80 + 20));
        continue;
      }
      req.log.error({ err }, "Failed to get hearts");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
});

router.post("/hearts/deduct", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, maxHearts: MAX_HEARTS });
    return;
  }
  let retries = 10;
  while (retries > 0) {
    try {
      let heartsResult, nextRefillMsResult;
      await db.transaction(async (tx) => {
        const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
        if (!profile) {
          heartsResult = MAX_HEARTS;
          nextRefillMsResult = 0;
          return;
        }
        const { hearts: currentHearts, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
        const newHearts = Math.max(0, currentHearts - 1);
        const timerStart = currentHearts >= MAX_HEARTS ? new Date() : newLastUpdated;

        const [updated] = await tx.update(profilesTable)
          .set({ hearts: newHearts, heartsLastUpdated: timerStart })
          .where(and(
            eq(profilesTable.userId, req.user.id),
            eq(profilesTable.hearts, profile.hearts),
            eq(profilesTable.heartsLastUpdated, profile.heartsLastUpdated)
          ))
          .returning();
        if (!updated) {
          throw new Error("CONCURRENT_UPDATE");
        }
        heartsResult = newHearts;
        nextRefillMsResult = newHearts >= MAX_HEARTS
          ? 0
          : Math.max(0, REFILL_MS - Math.max(0, Date.now() - timerStart.getTime()));
      });
      res.json({ hearts: heartsResult, nextRefillMs: nextRefillMsResult, maxHearts: MAX_HEARTS });
      return;
    } catch (err: any) {
      if (err.message === "CONCURRENT_UPDATE" && retries > 1) {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 80 + 20));
        continue;
      }
      req.log.error({ err }, "Failed to deduct heart");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
});

router.post("/hearts/watch-ad", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, heartsEarned: HEARTS_PER_AD, maxHearts: MAX_HEARTS });
    return;
  }
  const cooldown = checkAdCooldown(req.user.id);
  if (!cooldown.allowed) {
    res.status(429).json({ error: "Ad reward cooldown active", remainingMs: cooldown.remainingMs });
    return;
  }
  let retries = 10;
  while (retries > 0) {
    try {
      let heartsResult, nextRefillMsResult, heartsEarnedResult;
      await db.transaction(async (tx) => {
        const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
        if (!profile) {
          heartsResult = MAX_HEARTS;
          nextRefillMsResult = 0;
          heartsEarnedResult = HEARTS_PER_AD;
          return;
        }
        const { hearts: currentHearts, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
        const newHearts = Math.min(MAX_HEARTS, currentHearts + HEARTS_PER_AD);
        const [updated] = await tx.update(profilesTable)
          .set({ hearts: newHearts, heartsLastUpdated: newLastUpdated })
          .where(and(
            eq(profilesTable.userId, req.user.id),
            eq(profilesTable.hearts, profile.hearts),
            eq(profilesTable.heartsLastUpdated, profile.heartsLastUpdated)
          ))
          .returning();
        if (!updated) {
          throw new Error("CONCURRENT_UPDATE");
        }
        heartsResult = newHearts;
        nextRefillMsResult = newHearts >= MAX_HEARTS
          ? 0
          : Math.max(0, REFILL_MS - Math.max(0, Date.now() - newLastUpdated.getTime()));
        heartsEarnedResult = newHearts - currentHearts;
      });
      res.json({ hearts: heartsResult, nextRefillMs: nextRefillMsResult, maxHearts: MAX_HEARTS, heartsEarned: heartsEarnedResult });
      return;
    } catch (err: any) {
      if (err.message === "CONCURRENT_UPDATE" && retries > 1) {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 80 + 20));
        continue;
      }
      req.log.error({ err }, "Failed to process watch-ad");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
});

router.post("/hearts/watch-ad-fail-bonus", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.json({ guest: true, heartsEarned: HEARTS_PER_AD, maxHearts: MAX_HEARTS });
    return;
  }
  const cooldown = checkAdCooldown(req.user.id);
  if (!cooldown.allowed) {
    res.status(429).json({ error: "Ad reward cooldown active", remainingMs: cooldown.remainingMs });
    return;
  }
  let retries = 10;
  while (retries > 0) {
    try {
      const { sessionId } = req.body as { sessionId?: string };
      let bonusCoins = 0;
      let bonusScore = 0;
      let battlePassXp = 0;
      let heartsResult, nextRefillMsResult, heartsEarnedResult;
      const rates = await getRatesForMode("hearts_bonus");

      await db.transaction(async (tx) => {
        if (sessionId) {
          const [session] = await tx.select().from(quizSessionsTable).where(eq(quizSessionsTable.id, sessionId));
          if (!session) {
            throw new Error("QUIZ_SESSION_NOT_FOUND");
          }
          if (session.userId && session.userId !== req.user.id) {
            throw new Error("UNAUTHORIZED_SESSION_ACCESS");
          }
          if (session.status !== "completed") {
            throw new Error("QUIZ_SESSION_NOT_COMPLETED");
          }
          if (session.failBonusClaimed) {
            throw new Error("FAIL_BONUS_ALREADY_CLAIMED");
          }

          const correctCount = session.correctAnswers ?? 0;
          bonusCoins = correctCount * rates.coinsPerCorrect;
          bonusScore = (session.score ?? 0) * rates.scoreMultiplier;
          battlePassXp = correctCount * rates.xpPerCorrect;

          const [updatedSession] = await tx.update(quizSessionsTable)
            .set({ failBonusClaimed: true })
            .where(and(
              eq(quizSessionsTable.id, sessionId),
              eq(quizSessionsTable.failBonusClaimed, false)
            ))
            .returning();

          if (!updatedSession) {
            throw new Error("CONCURRENT_UPDATE");
          }
        }

        const [profile] = await tx.select().from(profilesTable).where(eq(profilesTable.userId, req.user.id));
        const now = new Date();
        if (!profile) {
          const [inserted] = await tx.insert(profilesTable).values({
            userId: req.user.id,
            hearts: Math.min(MAX_HEARTS, HEARTS_PER_AD),
            heartsLastUpdated: now,
            coins: bonusCoins,
            totalScore: bonusScore,
          })
          .onConflictDoUpdate({
            target: profilesTable.userId,
            set: {
              hearts: Math.min(MAX_HEARTS, HEARTS_PER_AD),
              heartsLastUpdated: now,
              coins: sql`${profilesTable.coins} + ${bonusCoins}`,
              totalScore: sql`${profilesTable.totalScore} + ${bonusScore}`,
            }
          })
          .returning();
          heartsResult = inserted.hearts;
          nextRefillMsResult = REFILL_MS;
          heartsEarnedResult = Math.min(MAX_HEARTS, HEARTS_PER_AD);
          return;
        }

        const { hearts: currentHearts, newLastUpdated } = computeHearts(profile.hearts, profile.heartsLastUpdated);
        const newHearts = Math.min(MAX_HEARTS, currentHearts + HEARTS_PER_AD);
        const [updatedProfile] = await tx.update(profilesTable)
          .set({
            hearts: newHearts,
            heartsLastUpdated: newLastUpdated,
            coins: sql`${profilesTable.coins} + ${bonusCoins}`,
            totalScore: sql`${profilesTable.totalScore} + ${bonusScore}`,
          })
          .where(and(
            eq(profilesTable.userId, req.user.id),
            eq(profilesTable.hearts, profile.hearts),
            eq(profilesTable.heartsLastUpdated, profile.heartsLastUpdated)
          ))
          .returning();

        if (!updatedProfile) {
          throw new Error("CONCURRENT_UPDATE");
        }

        heartsResult = newHearts;
        nextRefillMsResult = newHearts >= MAX_HEARTS
          ? 0
          : Math.max(0, REFILL_MS - Math.max(0, Date.now() - newLastUpdated.getTime()));
        heartsEarnedResult = newHearts - currentHearts;
      });

      if (battlePassXp > 0) {
        awardBattlePassXp(req.user.id, battlePassXp).catch(() => {});
      }

      res.json({
        hearts: heartsResult,
        nextRefillMs: nextRefillMsResult,
        maxHearts: MAX_HEARTS,
        heartsEarned: heartsEarnedResult,
        bonusCoins,
        // "bonusXp" is the response field name existing clients expect; it reflects the score
        // granted (profilesTable.totalScore), not Battle Pass XP — kept for API compatibility.
        bonusXp: bonusScore,
      });
      return;
    } catch (err: any) {
      if (err.message === "CONCURRENT_UPDATE" && retries > 1) {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 80 + 20));
        continue;
      }
      if (err.message === "QUIZ_SESSION_NOT_FOUND") {
        res.status(404).json({ error: "Quiz session not found" });
        return;
      }
      if (err.message === "UNAUTHORIZED_SESSION_ACCESS") {
        res.status(403).json({ error: "Unauthorized access to this session" });
        return;
      }
      if (err.message === "QUIZ_SESSION_NOT_COMPLETED") {
        res.status(400).json({ error: "Quiz session not completed" });
        return;
      }
      if (err.message === "FAIL_BONUS_ALREADY_CLAIMED") {
        res.status(400).json({ error: "Fail ad bonus already claimed for this session" });
        return;
      }
      req.log.error({ err }, "Failed to process watch-ad-fail-bonus");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
});

export default router;
