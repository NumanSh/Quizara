const attempts = new Map<string, { count: number; windowStart: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks whether a user is still allowed to attempt an admin-code submission.
 * Mapped in-memory; resets after the window elapses.
 */
export function checkAdminCodeAttempt(userId: string): { allowed: boolean; remainingMs: number } {
  const now = Date.now();
  const entry = attempts.get(userId);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    return { allowed: true, remainingMs: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remainingMs: WINDOW_MS - (now - entry.windowStart) };
  }
  return { allowed: true, remainingMs: 0 };
}

export function recordFailedAdminCodeAttempt(userId: string): void {
  const now = Date.now();
  const entry = attempts.get(userId);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(userId, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}
