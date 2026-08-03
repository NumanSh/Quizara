const adCooldowns = new Map<string, number>();
const COOLDOWN_MS = 15000; // 15 seconds cooldown

/**
 * Checks and enforces a cooldown between ad reward claims for a user.
 * Mapped in-memory.
 */
export function checkAdCooldown(userId: string): { allowed: boolean; remainingMs: number } {
  const now = Date.now();
  const lastTime = adCooldowns.get(userId) || 0;
  const elapsed = now - lastTime;
  if (elapsed < COOLDOWN_MS) {
    return { allowed: false, remainingMs: COOLDOWN_MS - elapsed };
  }
  adCooldowns.set(userId, now);
  return { allowed: true, remainingMs: 0 };
}
