import { useState, useEffect, useCallback } from "react";

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastStreakDate: string | null;
  checkedInToday: boolean;
  adWatchesLeft: number;
  nextMilestone: number | null;
  milestones: Record<number, number>;
}

export function useStreak(enabled = true) {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch("/api/streak", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const checkin = useCallback(async () => {
    const res = await fetch("/api/streak/checkin", { method: "POST", credentials: "include" });
    if (res.ok) {
      const result = await res.json();
      setData(prev => prev ? {
        ...prev,
        currentStreak: result.currentStreak,
        longestStreak: result.longestStreak,
        checkedInToday: true,
      } : null);
      return result as {
        currentStreak: number;
        longestStreak: number;
        alreadyCheckedIn: boolean;
        freezeUsed: boolean;
        milestoneReached: number | null;
        coinsAwarded: number;
      };
    }
    return null;
  }, []);

  return { data, loading, refetch: fetch_, checkin };
}
