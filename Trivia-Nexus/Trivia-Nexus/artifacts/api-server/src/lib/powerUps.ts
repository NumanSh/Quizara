import { db, marketplaceItemsTable, userInventoryTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type ConsumeResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Either the root `db` handle or a transaction handle. Callers that award points
 * in a transaction must pass the transaction, so a rollback also restores the
 * consumed item.
 */
export type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

/**
 * Validates that `itemId` is a power-up with the expected effect, that the user
 * owns at least one, and consumes exactly one — guarding against concurrent
 * spends by matching the quantity we read.
 *
 * Shared by the quiz and blitz answer endpoints so a power-up cannot be applied
 * to a score without the inventory actually being debited.
 */
export async function consumePowerUpItem(
  userId: string,
  itemId: unknown,
  expectedEffect: string,
  executor: DbExecutor = db,
): Promise<ConsumeResult> {
  if (!itemId || typeof itemId !== "string") {
    return { ok: false, status: 400, error: `itemId is required to apply ${expectedEffect}` };
  }

  const [item] = await executor.select().from(marketplaceItemsTable).where(eq(marketplaceItemsTable.id, itemId));
  if (!item || item.type !== "powerup" || item.effect !== expectedEffect) {
    return { ok: false, status: 400, error: `Invalid ${expectedEffect} power-up item` };
  }

  const [entry] = await executor.select().from(userInventoryTable)
    .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));

  if (!entry || entry.quantity < 1) {
    return { ok: false, status: 400, error: `${expectedEffect} power-up not in inventory` };
  }

  if (entry.quantity === 1) {
    const [deleted] = await executor.delete(userInventoryTable)
      .where(and(eq(userInventoryTable.id, entry.id), eq(userInventoryTable.quantity, 1)))
      .returning();
    if (!deleted) return { ok: false, status: 409, error: "Inventory updated concurrently, try again" };
  } else {
    const [updated] = await executor.update(userInventoryTable)
      .set({ quantity: entry.quantity - 1 })
      .where(and(eq(userInventoryTable.id, entry.id), eq(userInventoryTable.quantity, entry.quantity)))
      .returning();
    if (!updated) return { ok: false, status: 409, error: "Inventory updated concurrently, try again" };
  }

  return { ok: true };
}
