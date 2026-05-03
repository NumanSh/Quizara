export type RankTitle = "Rookie" | "Scholar" | "Expert" | "Master" | "Legend";

export interface RankDef {
  title: RankTitle;
  minXp: number;
  maxXp: number | null;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const XP_RANKS: RankDef[] = [
  {
    title: "Rookie",
    minXp: 0,
    maxXp: 499,
    emoji: "🌱",
    color: "text-slate-400",
    bgColor: "bg-slate-400/10",
    borderColor: "border-slate-400/20",
    textColor: "text-slate-400",
  },
  {
    title: "Scholar",
    minXp: 500,
    maxXp: 1999,
    emoji: "📚",
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    borderColor: "border-blue-400/20",
    textColor: "text-blue-400",
  },
  {
    title: "Expert",
    minXp: 2000,
    maxXp: 4999,
    emoji: "⚡",
    color: "text-violet-400",
    bgColor: "bg-violet-400/10",
    borderColor: "border-violet-400/20",
    textColor: "text-violet-400",
  },
  {
    title: "Master",
    minXp: 5000,
    maxXp: 9999,
    emoji: "🔥",
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
    borderColor: "border-orange-400/20",
    textColor: "text-orange-400",
  },
  {
    title: "Legend",
    minXp: 10000,
    maxXp: null,
    emoji: "👑",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/20",
    textColor: "text-yellow-400",
  },
];

export function getRankDef(totalXp: number): RankDef {
  for (let i = XP_RANKS.length - 1; i >= 0; i--) {
    if (totalXp >= XP_RANKS[i].minXp) return XP_RANKS[i];
  }
  return XP_RANKS[0];
}

export function getNextRank(totalXp: number): RankDef | null {
  for (let i = 0; i < XP_RANKS.length; i++) {
    if (totalXp < XP_RANKS[i].minXp) return XP_RANKS[i];
  }
  return null;
}

export function getXpProgress(totalXp: number): {
  current: RankDef;
  next: RankDef | null;
  progressPct: number;
  xpInCurrentRank: number;
  xpNeededForNext: number;
} {
  const current = getRankDef(totalXp);
  const next = getNextRank(totalXp);

  if (!next) {
    return { current, next: null, progressPct: 100, xpInCurrentRank: totalXp - current.minXp, xpNeededForNext: 0 };
  }

  const rangeSize = next.minXp - current.minXp;
  const earned = totalXp - current.minXp;
  const progressPct = Math.min(100, Math.round((earned / rangeSize) * 100));

  return {
    current,
    next,
    progressPct,
    xpInCurrentRank: earned,
    xpNeededForNext: next.minXp - totalXp,
  };
}
