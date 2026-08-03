import { db, economyRatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

// Every mode's rates, seeded on first read so that shipping this table
// changes zero existing gameplay behavior until an admin edits a value.
export const ECONOMY_DEFAULTS: Record<string, Record<string, number>> = {
  quiz: { coinsPerCorrect: 5, scorePerCorrect: 10, xpPerCorrect: 10, xpOnComplete: 25 },
  worlds: { coinsPerCorrect: 5, scorePerCorrect: 10, xpPerCorrect: 10, xpOnComplete: 25 },
  blitz: { coinsPerCorrectBase: 5, scorePerCorrectBase: 10, xpPerCorrectOnComplete: 5, xpCompleteMinimum: 10 },
  arena: { coinsPerWin: 50, coinsLostPerLoss: 20, scorePerWin: 50, xpPerWin: 30 },
  streak_checkin: { milestone7Coins: 50, milestone30Coins: 200, milestone100Coins: 500, xpPerCheckin: 20 },
  streak_ad: { coins: 75 },
  hearts_bonus: { coinsPerCorrect: 10, scoreMultiplier: 2, xpPerCorrect: 10 },
  wheel: { coins_50: 50, coins_100: 100, coins_200: 200, jackpot: 500, powerup_fallback: 75, xp_100: 100 },
};

let seeded = false;
async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  try {
    const rows: { mode: string; metric: string; value: number }[] = [];
    for (const [mode, metrics] of Object.entries(ECONOMY_DEFAULTS)) {
      for (const [metric, value] of Object.entries(metrics)) {
        rows.push({ mode, metric, value });
      }
    }
    await db.insert(economyRatesTable).values(rows).onConflictDoNothing();
    seeded = true;
  } catch (err) {
    logger.error({ err }, "Failed to seed economy rates");
  }
}

const cache = new Map<string, number>();

export function invalidateEconomyCache(): void {
  cache.clear();
}

export async function getRate(mode: string, metric: string): Promise<number> {
  const key = `${mode}:${metric}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  await ensureSeeded();

  const [row] = await db
    .select()
    .from(economyRatesTable)
    .where(and(eq(economyRatesTable.mode, mode), eq(economyRatesTable.metric, metric)));

  const value = row?.value ?? ECONOMY_DEFAULTS[mode]?.[metric] ?? 0;
  cache.set(key, value);
  return value;
}

export async function getRatesForMode(mode: string): Promise<Record<string, number>> {
  await ensureSeeded();
  const rows = await db.select().from(economyRatesTable).where(eq(economyRatesTable.mode, mode));
  const result: Record<string, number> = { ...(ECONOMY_DEFAULTS[mode] ?? {}) };
  for (const row of rows) {
    result[row.metric] = row.value;
    cache.set(`${mode}:${row.metric}`, row.value);
  }
  return result;
}

export async function getAllRates(): Promise<Record<string, Record<string, number>>> {
  await ensureSeeded();
  const rows = await db.select().from(economyRatesTable);
  const result: Record<string, Record<string, number>> = {};
  for (const [mode, metrics] of Object.entries(ECONOMY_DEFAULTS)) {
    result[mode] = { ...metrics };
  }
  for (const row of rows) {
    if (!result[row.mode]) result[row.mode] = {};
    result[row.mode][row.metric] = row.value;
  }
  return result;
}

export async function setRates(mode: string, updates: Record<string, number>): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [metric, value] of Object.entries(updates)) {
      await tx
        .insert(economyRatesTable)
        .values({ mode, metric, value })
        .onConflictDoUpdate({
          target: [economyRatesTable.mode, economyRatesTable.metric],
          set: { value, updatedAt: new Date() },
        });
    }
  });
  invalidateEconomyCache();
}
