import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  dailyTaskTemplatesTable,
  userDailyTaskProgressTable,
  profilesTable,
  categoriesTable,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { awardBattlePassXp } from "./xpHelper";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function requireAdmin(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Admin role required" });
    return false;
  }
  return true;
}

// ─── Public: get today's tasks + user progress ────────────────────────────────

router.get("/daily-tasks", async (req, res): Promise<void> => {
  try {
    const templates = await db
      .select()
      .from(dailyTaskTemplatesTable)
      .where(eq(dailyTaskTemplatesTable.isActive, true))
      .orderBy(dailyTaskTemplatesTable.sortOrder, dailyTaskTemplatesTable.createdAt);

    if (templates.length === 0) {
      res.json({ tasks: [], date: today() });
      return;
    }

    const catIds = [...new Set(templates.map(t => t.categoryId).filter(Boolean) as string[])];
    const cats = catIds.length > 0
      ? await db.select({ id: categoriesTable.id, name: categoriesTable.name, icon: categoriesTable.icon })
          .from(categoriesTable)
          .where(inArray(categoriesTable.id, catIds))
      : [];
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

    let progressMap: Record<string, typeof userDailyTaskProgressTable.$inferSelect> = {};
    if (req.isAuthenticated()) {
      const templateIds = templates.map(t => t.id);
      const progress = await db
        .select()
        .from(userDailyTaskProgressTable)
        .where(
          and(
            eq(userDailyTaskProgressTable.userId, req.user.id),
            eq(userDailyTaskProgressTable.date, today()),
            inArray(userDailyTaskProgressTable.templateId, templateIds),
          ),
        );
      progressMap = Object.fromEntries(progress.map(p => [p.templateId, p]));
    }

    const tasks = templates.map(t => {
      const prog = progressMap[t.id];
      const cat = t.categoryId ? catMap[t.categoryId] : null;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type,
        targetValue: t.targetValue,
        coinReward: t.coinReward,
        xpReward: t.xpReward,
        categoryId: t.categoryId ?? null,
        categoryName: cat?.name ?? null,
        categoryIcon: cat?.icon ?? null,
        currentValue: prog?.currentValue ?? 0,
        isCompleted: prog?.isCompleted ?? false,
        isClaimed: prog?.isClaimed ?? false,
        completedAt: prog?.completedAt ?? null,
      };
    });

    res.json({ tasks, date: today() });
  } catch (err) {
    req.log.error({ err }, "Failed to get daily tasks");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Claim reward ─────────────────────────────────────────────────────────────

router.post("/daily-tasks/:id/claim", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Sign in to claim rewards" });
    return;
  }

  try {
    const { id } = req.params;
    const [template] = await db
      .select()
      .from(dailyTaskTemplatesTable)
      .where(eq(dailyTaskTemplatesTable.id, id));

    if (!template || !template.isActive) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const [progress] = await db
      .select()
      .from(userDailyTaskProgressTable)
      .where(
        and(
          eq(userDailyTaskProgressTable.userId, req.user.id),
          eq(userDailyTaskProgressTable.templateId, id),
          eq(userDailyTaskProgressTable.date, today()),
        ),
      );

    if (!progress || !progress.isCompleted) {
      res.status(400).json({ error: "Task not yet completed" });
      return;
    }
    if (progress.isClaimed) {
      res.status(400).json({ error: "Reward already claimed" });
      return;
    }

    // Flag the claim and pay it out in one transaction, so the task can never be
    // marked claimed without the coins actually landing.
    let alreadyClaimed = false;
    await db.transaction(async (tx) => {
      const [updatedProgress] = await tx
        .update(userDailyTaskProgressTable)
        .set({ isClaimed: true, claimedAt: new Date() })
        .where(and(
          eq(userDailyTaskProgressTable.id, progress.id),
          eq(userDailyTaskProgressTable.isClaimed, false)
        ))
        .returning();

      if (!updatedProgress) {
        alreadyClaimed = true;
        return;
      }

      if (template.coinReward > 0) {
        await tx
          .update(profilesTable)
          .set({ coins: sql`${profilesTable.coins} + ${template.coinReward}` })
          .where(eq(profilesTable.userId, req.user.id));
      }
    });

    if (alreadyClaimed) {
      res.status(409).json({ error: "Reward already claimed or session modified" });
      return;
    }

    if (template.xpReward > 0) {
      awardBattlePassXp(req.user.id, template.xpReward).catch(() => {});
    }

    res.json({
      success: true,
      coinReward: template.coinReward,
      xpReward: template.xpReward,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to claim daily task reward");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Admin: CRUD for task templates ──────────────────────────────────────────

router.get("/admin/daily-tasks", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const templates = await db
      .select()
      .from(dailyTaskTemplatesTable)
      .orderBy(dailyTaskTemplatesTable.sortOrder, dailyTaskTemplatesTable.createdAt);

    const catIds = [...new Set(templates.map(t => t.categoryId).filter(Boolean) as string[])];
    const cats = catIds.length > 0
      ? await db.select({ id: categoriesTable.id, name: categoriesTable.name })
          .from(categoriesTable)
          .where(inArray(categoriesTable.id, catIds))
      : [];
    const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));

    res.json(templates.map(t => ({
      ...t,
      categoryName: t.categoryId ? (catMap[t.categoryId] ?? null) : null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list daily task templates");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/daily-tasks", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const { title, description, type, categoryId, targetValue, coinReward, xpReward, isActive, sortOrder } =
      req.body as {
        title?: string; description?: string; type?: string;
        categoryId?: string | null; targetValue?: number;
        coinReward?: number; xpReward?: number; isActive?: boolean; sortOrder?: number;
      };

    if (!title?.trim() || !description?.trim() || !type?.trim()) {
      res.status(400).json({ error: "title, description, and type are required" });
      return;
    }

    const validTypes = ["quiz_count", "score_target", "category_quiz", "correct_answers"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
      return;
    }

    if (type === "category_quiz" && !categoryId) {
      res.status(400).json({ error: "categoryId is required for category_quiz type" });
      return;
    }

    const [template] = await db
      .insert(dailyTaskTemplatesTable)
      .values({
        title: title.trim(),
        description: description.trim(),
        type,
        categoryId: categoryId || null,
        targetValue: targetValue ?? 1,
        coinReward: coinReward ?? 50,
        xpReward: xpReward ?? 100,
        isActive: isActive !== false,
        isAutoGenerated: false,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    res.status(201).json(template);
  } catch (err) {
    req.log.error({ err }, "Failed to create daily task template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/daily-tasks/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    const { title, description, type, categoryId, targetValue, coinReward, xpReward, isActive, sortOrder } =
      req.body as {
        title?: string; description?: string; type?: string;
        categoryId?: string | null; targetValue?: number;
        coinReward?: number; xpReward?: number; isActive?: boolean; sortOrder?: number;
      };

    const update: Partial<typeof dailyTaskTemplatesTable.$inferInsert> = {};
    if (title !== undefined) update.title = title.trim();
    if (description !== undefined) update.description = description.trim();
    if (type !== undefined) update.type = type;
    if (categoryId !== undefined) update.categoryId = categoryId || null;
    if (targetValue !== undefined) update.targetValue = targetValue;
    if (coinReward !== undefined) update.coinReward = coinReward;
    if (xpReward !== undefined) update.xpReward = xpReward;
    if (isActive !== undefined) update.isActive = isActive;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;

    const [updated] = await db
      .update(dailyTaskTemplatesTable)
      .set(update)
      .where(eq(dailyTaskTemplatesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Task template not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update daily task template");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/daily-tasks/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const { id } = req.params;
    await db.delete(dailyTaskTemplatesTable).where(eq(dailyTaskTemplatesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete daily task template");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Internal helper: update progress after quiz completion ──────────────────

export async function updateDailyTaskProgress(
  userId: string,
  opts: { categoryId: string; score: number; correctAnswers: number; totalQuestions: number },
): Promise<void> {
  const dateStr = today();

  const templates = await db
    .select()
    .from(dailyTaskTemplatesTable)
    .where(eq(dailyTaskTemplatesTable.isActive, true));

  if (templates.length === 0) return;

  const existingProgress = await db
    .select()
    .from(userDailyTaskProgressTable)
    .where(
      and(
        eq(userDailyTaskProgressTable.userId, userId),
        eq(userDailyTaskProgressTable.date, dateStr),
        inArray(userDailyTaskProgressTable.templateId, templates.map(t => t.id)),
      ),
    );

  const progressByTemplate = Object.fromEntries(existingProgress.map(p => [p.templateId, p]));

  for (const template of templates) {
    const existing = progressByTemplate[template.id];
    if (existing?.isCompleted) continue;

    let increment = 0;
    let isNowCompleted = false;

    if (template.type === "quiz_count") {
      increment = 1;
    } else if (template.type === "category_quiz" && template.categoryId === opts.categoryId) {
      increment = 1;
    } else if (template.type === "score_target") {
      const newVal = (existing?.currentValue ?? 0) + opts.score;
      isNowCompleted = newVal >= template.targetValue;
      if (!existing) {
        await db.insert(userDailyTaskProgressTable).values({
          userId, templateId: template.id, date: dateStr,
          currentValue: newVal,
          isCompleted: isNowCompleted,
          completedAt: isNowCompleted ? new Date() : undefined,
        }).onConflictDoNothing();
      } else {
        await db.update(userDailyTaskProgressTable).set({
          currentValue: newVal,
          isCompleted: isNowCompleted,
          completedAt: isNowCompleted ? new Date() : null,
        }).where(eq(userDailyTaskProgressTable.id, existing.id));
      }
      continue;
    } else if (template.type === "correct_answers") {
      const newVal = (existing?.currentValue ?? 0) + opts.correctAnswers;
      isNowCompleted = newVal >= template.targetValue;
      if (!existing) {
        await db.insert(userDailyTaskProgressTable).values({
          userId, templateId: template.id, date: dateStr,
          currentValue: newVal,
          isCompleted: isNowCompleted,
          completedAt: isNowCompleted ? new Date() : undefined,
        }).onConflictDoNothing();
      } else {
        await db.update(userDailyTaskProgressTable).set({
          currentValue: newVal,
          isCompleted: isNowCompleted,
          completedAt: isNowCompleted ? new Date() : null,
        }).where(eq(userDailyTaskProgressTable.id, existing.id));
      }
      continue;
    }

    if (increment === 0) continue;

    const currentVal = (existing?.currentValue ?? 0) + increment;
    isNowCompleted = currentVal >= template.targetValue;

    if (!existing) {
      await db.insert(userDailyTaskProgressTable).values({
        userId, templateId: template.id, date: dateStr,
        currentValue: currentVal,
        isCompleted: isNowCompleted,
        completedAt: isNowCompleted ? new Date() : undefined,
      }).onConflictDoNothing();
    } else {
      await db.update(userDailyTaskProgressTable).set({
        currentValue: currentVal,
        isCompleted: isNowCompleted,
        completedAt: isNowCompleted ? new Date() : null,
      }).where(eq(userDailyTaskProgressTable.id, existing.id));
    }
  }
}

/**
 * Fire-and-forget wrapper for `updateDailyTaskProgress`.
 *
 * Task progress must never fail the game action that triggered it, but a failure
 * still costs the player a reward — so it is logged rather than swallowed.
 * Pass `categoryId: ""` for modes with no single category (blitz, arena); only
 * `category_quiz` templates are category-scoped.
 */
export function trackDailyTaskProgress(
  userId: string,
  opts: { categoryId: string; score: number; correctAnswers: number; totalQuestions: number },
): void {
  updateDailyTaskProgress(userId, opts).catch((err) => {
    logger.error({ err, userId }, "Failed to update daily task progress");
  });
}

// ─── Internal helper: auto-generate task for a new category ──────────────────

export async function autoGenerateCategoryTask(categoryId: string, categoryName: string): Promise<void> {
  await db.insert(dailyTaskTemplatesTable).values({
    title: `${categoryName} Explorer`,
    description: `Complete 2 quizzes in the ${categoryName} category`,
    type: "category_quiz",
    categoryId,
    targetValue: 2,
    coinReward: 60,
    xpReward: 120,
    isActive: true,
    isAutoGenerated: true,
    sortOrder: 10,
  });
}

export default router;
