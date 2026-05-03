import { useState, useEffect, useCallback, useRef } from "react";

export const MAX_HEARTS = 6;
const HEARTS_PER_AD = 1;
const REFILL_MS = 30 * 60 * 1000; // 30 min background refill
const STORAGE_KEY = "quizara_hearts";

export interface HeartsState {
  hearts: number;
  nextRefillMs: number;
  maxHearts: number;
  isLoading: boolean;
  canPlay: boolean;
}

interface GuestData {
  hearts: number;
  lastUpdated: string;
}

function computeGuestHearts(data: GuestData): { hearts: number; nextRefillMs: number } {
  if (data.hearts >= MAX_HEARTS) return { hearts: MAX_HEARTS, nextRefillMs: 0 };
  const now = Date.now();
  const lastUpdated = new Date(data.lastUpdated).getTime();
  const elapsed = now - lastUpdated;
  const regened = Math.floor(elapsed / REFILL_MS);
  const hearts = Math.min(MAX_HEARTS, data.hearts + regened);
  const newLastUpdated = regened > 0 ? lastUpdated + regened * REFILL_MS : lastUpdated;
  const nextRefillMs = hearts >= MAX_HEARTS ? 0 : REFILL_MS - (now - newLastUpdated);
  return { hearts, nextRefillMs };
}

function getGuestData(): GuestData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { hearts: MAX_HEARTS, lastUpdated: new Date().toISOString() };
}

function saveGuestData(data: GuestData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export function useHearts(isAuthenticated: boolean) {
  const [state, setState] = useState<HeartsState>({
    hearts: MAX_HEARTS,
    nextRefillMs: 0,
    maxHearts: MAX_HEARTS,
    isLoading: true,
    canPlay: true,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHearts = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const r = await fetch("/api/hearts", { credentials: "include" });
        const d = await r.json();
        if (!d.guest) {
          setState({ hearts: d.hearts, nextRefillMs: d.nextRefillMs, maxHearts: d.maxHearts, isLoading: false, canPlay: d.hearts > 0 });
          return;
        }
      } catch {}
    }
    const data = getGuestData();
    saveGuestData(data);
    const { hearts, nextRefillMs } = computeGuestHearts(data);
    setState({ hearts, nextRefillMs, maxHearts: MAX_HEARTS, isLoading: false, canPlay: hearts > 0 });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchHearts();
    const interval = setInterval(fetchHearts, 60_000);
    return () => clearInterval(interval);
  }, [fetchHearts]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (state.nextRefillMs > 0) {
      timerRef.current = setTimeout(() => fetchHearts(), state.nextRefillMs + 200);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state.nextRefillMs, fetchHearts]);

  const deductHeart = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const r = await fetch("/api/hearts/deduct", { method: "POST", credentials: "include" });
        const d = await r.json();
        if (!d.guest) {
          setState({ hearts: d.hearts, nextRefillMs: d.nextRefillMs, maxHearts: d.maxHearts, isLoading: false, canPlay: d.hearts > 0 });
          return;
        }
      } catch {}
    }
    const data = getGuestData();
    const { hearts: current } = computeGuestHearts(data);
    const newHearts = Math.max(0, current - 1);
    const newData: GuestData = {
      hearts: newHearts,
      lastUpdated: current >= MAX_HEARTS ? new Date().toISOString() : data.lastUpdated,
    };
    saveGuestData(newData);
    const { hearts, nextRefillMs } = computeGuestHearts(newData);
    setState({ hearts, nextRefillMs, maxHearts: MAX_HEARTS, isLoading: false, canPlay: hearts > 0 });
  }, [isAuthenticated]);

  const watchAd = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const r = await fetch("/api/hearts/watch-ad", { method: "POST", credentials: "include" });
        const d = await r.json();
        if (!d.guest) {
          setState({ hearts: d.hearts, nextRefillMs: d.nextRefillMs, maxHearts: d.maxHearts, isLoading: false, canPlay: d.hearts > 0 });
          return;
        }
      } catch {}
    }
    const data = getGuestData();
    const { hearts: current } = computeGuestHearts(data);
    const newHearts = Math.min(MAX_HEARTS, current + HEARTS_PER_AD);
    const newData: GuestData = { hearts: newHearts, lastUpdated: data.lastUpdated };
    saveGuestData(newData);
    const { hearts, nextRefillMs } = computeGuestHearts(newData);
    setState({ hearts, nextRefillMs, maxHearts: MAX_HEARTS, isLoading: false, canPlay: hearts > 0 });
  }, [isAuthenticated]);

  return { ...state, deductHeart, watchAd, refetchHearts: fetchHearts };
}
