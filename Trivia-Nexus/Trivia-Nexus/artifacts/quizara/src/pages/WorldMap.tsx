import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { ArrowLeft, Lock, Trophy, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHearts } from "@/hooks/useHearts";
import { HeartsDisplay } from "@/components/HeartsDisplay";

const CATEGORY_BG_IMAGES: Record<string, string> = {
  "anime":           "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&q=80",
  "anime & manga":   "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&q=80",
  "geography":       "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80",
  "cinema":          "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80",
  "cinema & tv":     "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&q=80",
  "science":         "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
  "science & technology": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80",
  "history":         "https://images.unsplash.com/photo-1461360370896-9a2f70c4e6d9?w=1200&q=80",
  "sports":          "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=80",
  "pop culture":     "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80",
  "general knowledge":"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80",
  "technology":      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80",
  "music":           "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&q=80",
  "art":             "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&q=80",
  "food":            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80",
  "nature":          "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80",
  "literature":      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=80",
};

const THEME_COLORS: Array<{ bg: string; node: string; glow: string; dark: string }> = [
  { bg: "rgba(99,102,241,0.55)",  node: "#818cf8", glow: "rgba(129,140,248,0.45)", dark: "rgba(49,46,129,0.7)"  },
  { bg: "rgba(20,184,166,0.55)",  node: "#2dd4bf", glow: "rgba(45,212,191,0.45)",  dark: "rgba(19,78,74,0.7)"   },
  { bg: "rgba(236,72,153,0.55)",  node: "#f472b6", glow: "rgba(244,114,182,0.45)", dark: "rgba(131,24,67,0.7)"  },
  { bg: "rgba(234,179,8,0.55)",   node: "#facc15", glow: "rgba(250,204,21,0.45)",  dark: "rgba(113,63,18,0.7)"  },
  { bg: "rgba(59,130,246,0.55)",  node: "#60a5fa", glow: "rgba(96,165,250,0.45)",  dark: "rgba(30,58,138,0.7)"  },
  { bg: "rgba(249,115,22,0.55)",  node: "#fb923c", glow: "rgba(251,146,60,0.45)",  dark: "rgba(124,45,18,0.7)"  },
  { bg: "rgba(168,85,247,0.55)",  node: "#c084fc", glow: "rgba(192,132,252,0.45)", dark: "rgba(88,28,135,0.7)"  },
  { bg: "rgba(34,197,94,0.55)",   node: "#4ade80", glow: "rgba(74,222,128,0.45)",  dark: "rgba(20,83,45,0.7)"   },
];

function getTheme(name: string, index?: number) {
  const lower = name.toLowerCase();
  if (lower.includes("anime") || lower.includes("manga"))  return THEME_COLORS[6];
  if (lower.includes("geo"))                               return THEME_COLORS[1];
  if (lower.includes("cinema") || lower.includes("tv"))    return THEME_COLORS[2];
  if (lower.includes("science") || lower.includes("tech")) return THEME_COLORS[4];
  if (lower.includes("hist"))                              return THEME_COLORS[3];
  if (lower.includes("sport"))                             return THEME_COLORS[5];
  if (lower.includes("pop") || lower.includes("culture"))  return THEME_COLORS[2];
  if (lower.includes("music"))                             return THEME_COLORS[6];
  if (lower.includes("food"))                              return THEME_COLORS[3];
  if (lower.includes("nature"))                            return THEME_COLORS[1];
  if (lower.includes("liter") || lower.includes("book"))   return THEME_COLORS[4];
  return THEME_COLORS[(index ?? 0) % THEME_COLORS.length];
}

function getBg(name: string, imageUrl: string | null): string | null {
  if (imageUrl) return imageUrl;
  const lower = name.toLowerCase();
  for (const [key, url] of Object.entries(CATEGORY_BG_IMAGES)) {
    if (lower.includes(key) || key.includes(lower)) return url;
  }
  return null;
}

// --- layout math ---
const LS = 180; // px per level

function containerH(total: number) {
  return Math.max(520, 200 + Math.max(0, total - 1) * LS);
}

function nodeY(idx: number, total: number, ch: number) {
  return ch - 110 - idx * LS;
}

function nodeX(idx: number) {
  return 50 + 30 * Math.sin(idx * 1.15);
}

function buildPath(pts: Array<{ x: number; y: number }>) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const my = (a.y + b.y) / 2;
    d += ` C ${a.x.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}

interface LevelNode { levelNumber: number; isCompleted: boolean; isUnlocked: boolean; }
interface WorldData {
  id: string; name: string; icon: string; color: string | null;
  imageUrl: string | null; totalLevels: number; completedLevels: number;
  totalQuestions: number; levels: LevelNode[];
}

function StarRow({ filled }: { filled: boolean }) {
  return (
    <div className="flex justify-center gap-0.5 mb-2">
      {[0, 1, 2].map(i => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24">
          <polygon
            points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
            fill={filled ? "#fbbf24" : "rgba(255,255,255,0.2)"}
            stroke={filled ? "#f59e0b" : "rgba(255,255,255,0.15)"}
            strokeWidth="1"
          />
        </svg>
      ))}
    </div>
  );
}

export default function WorldMap() {
  const { categoryId } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<number | null>(null);
  const [lockedTip, setLockedTip] = useState<number | null>(null);
  const [noHeartsTip, setNoHeartsTip] = useState(false);
  const [cw, setCw] = useState(400);

  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const isGuest = !user?.id;
  const { hearts, maxHearts, nextRefillMs, canPlay, watchAd } = useHearts(!!user?.id);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setCw(e[0].contentRect.width));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/quiz/worlds/${categoryId}`, { credentials: "include" })
      .then(r => r.json())
      .then((data: WorldData & { error?: string }) => {
        if (data.error) { setError(data.error); return; }
        if (isGuest) {
          try {
            const local: number[] = JSON.parse(localStorage.getItem(`quizara_levels_${categoryId}`) ?? "[]");
            const merged = data.levels.map(l => ({
              ...l,
              isCompleted: local.includes(l.levelNumber),
              isUnlocked: l.levelNumber === 1 || local.includes(l.levelNumber - 1),
            }));
            setWorldData({ ...data, levels: merged, completedLevels: local.length });
          } catch { setWorldData(data); }
        } else {
          setWorldData(data);
        }
      })
      .catch(() => setError("Failed to load world"))
      .finally(() => setLoading(false));
  }, [categoryId, isGuest]);

  useEffect(() => {
    if (worldData && currentRef.current) {
      setTimeout(() => currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    }
  }, [worldData]);

  const handleLevelClick = async (level: LevelNode) => {
    if (!level.isUnlocked) {
      setLockedTip(level.levelNumber);
      setTimeout(() => setLockedTip(null), 2500);
      return;
    }
    if (!canPlay && !level.isCompleted) {
      setNoHeartsTip(true);
      setTimeout(() => setNoHeartsTip(false), 3000);
      return;
    }
    if (starting !== null) return;
    setStarting(level.levelNumber);
    try {
      const res = await fetch("/api/quiz/levels/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ worldId: categoryId, levelNumber: level.levelNumber }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { alert(data.error ?? "Failed to start level"); return; }
      const p = new URLSearchParams({ levelNum: String(level.levelNumber), worldId: categoryId!, worldName: worldData?.name ?? "" });
      setLocation(`/quiz/${data.sessionId}?${p.toString()}`);
    } catch { alert("Failed to start level. Please try again."); }
    finally { setStarting(null); }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/10 animate-pulse" />
          <p className="text-white/40 text-sm animate-pulse">Loading world…</p>
        </div>
      </div>
    );
  }

  if (error || !worldData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center bg-[#0d1117]">
        <p className="text-lg font-semibold text-white">{error ?? "World not found"}</p>
        <button onClick={() => setLocation("/categories")} className="text-primary text-sm hover:underline">← Back to worlds</button>
      </div>
    );
  }

  const bg = getBg(worldData.name, worldData.imageUrl);
  const theme = getTheme(worldData.name);
  const ch = containerH(worldData.totalLevels);
  const progress = worldData.totalLevels > 0 ? Math.round((worldData.completedLevels / worldData.totalLevels) * 100) : 0;

  const positions = worldData.levels.map((_, i) => ({
    xPct: nodeX(i),
    xPx: (nodeX(i) / 100) * cw,
    yPx: nodeY(i, worldData.totalLevels, ch),
  }));

  const pathD = buildPath(positions.map(p => ({ x: p.xPx, y: p.yPx })));

  return (
    <div ref={containerRef} className="relative w-full overflow-x-hidden" style={{ minHeight: ch }}>

      {/* Background */}
      {bg ? (
        <div className="absolute inset-0" style={{ backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center top" }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 to-[#0d1117]" />
      )}

      {/* Theme colour wash */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${theme.bg} 0%, ${theme.dark} 100%)` }} />

      {/* Darkness for readability */}
      <div className="absolute inset-0 bg-black/45" />

      {/* Top fade for header */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 to-transparent pointer-events-none" />

      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent pointer-events-none" />

      {/* SVG path */}
      {worldData.totalLevels >= 2 && cw > 0 && (
        <svg className="absolute inset-0 pointer-events-none" width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`}>
          {/* shadow */}
          <path d={pathD} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          {/* path body */}
          <path d={pathD} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          {/* bright centre */}
          <path d={pathD} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          {/* dashes */}
          <path d={pathD} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeDasharray="14 20" />
        </svg>
      )}

      {/* Level nodes */}
      {worldData.levels.map((level, i) => {
        const pos = positions[i];
        const done = level.isCompleted;
        const current = level.isUnlocked && !level.isCompleted;
        const locked = !level.isUnlocked;

        const nodeBg   = done ? "#fbbf24" : current ? theme.node : "rgba(100,116,139,0.8)";
        const nodeBord = done ? "#f59e0b" : current ? theme.node : "rgba(148,163,184,0.4)";
        const textCol  = done ? "#1c1917" : "white";

        return (
          <div
            key={level.levelNumber}
            ref={current ? currentRef : undefined}
            className="absolute z-10"
            style={{ left: `${pos.xPct}%`, top: pos.yPx, transform: "translate(-50%, -50%)" }}
          >
            <StarRow filled={done} />

            {/* Pulse ring for current level */}
            {current && (
              <div
                className="absolute rounded-full animate-ping pointer-events-none"
                style={{ inset: -10, background: theme.glow, animationDuration: "2s" }}
              />
            )}

            {/* Soft glow halo */}
            {(current || done) && (
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: -6,
                  background: done
                    ? "radial-gradient(circle, rgba(251,191,36,0.25) 0%, transparent 70%)"
                    : `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
                }}
              />
            )}

            <button
              onClick={() => handleLevelClick(level)}
              disabled={starting === level.levelNumber}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-full select-none transition-transform duration-100",
                locked ? "cursor-not-allowed opacity-60" : "active:scale-95 hover:brightness-110",
                starting === level.levelNumber && "cursor-wait opacity-70"
              )}
              style={{
                width: 68,
                height: 68,
                background: nodeBg,
                border: `3px solid ${nodeBord}`,
                boxShadow: locked
                  ? "0 2px 8px rgba(0,0,0,0.5)"
                  : done
                    ? "0 4px 16px rgba(251,191,36,0.5), 0 2px 6px rgba(0,0,0,0.5)"
                    : `0 4px 16px ${theme.glow}, 0 2px 6px rgba(0,0,0,0.5)`,
              }}
            >
              {locked ? (
                <Lock className="h-6 w-6 text-slate-300" />
              ) : (
                <span
                  className="font-black text-xl leading-none"
                  style={{ color: textCol, textShadow: done ? "none" : "0 1px 4px rgba(0,0,0,0.4)" }}
                >
                  {starting === level.levelNumber ? "…" : level.levelNumber}
                </span>
              )}
            </button>

            {/* Locked tooltip */}
            {lockedTip === level.levelNumber && (
              <div
                className="absolute -top-12 left-1/2 whitespace-nowrap text-xs text-white rounded-xl px-3 py-1.5 z-30 pointer-events-none shadow-xl"
                style={{ transform: "translateX(-50%)", background: "rgba(0,0,0,0.88)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Complete Level {level.levelNumber - 1} first
              </div>
            )}
          </div>
        );
      })}

      {/* No hearts notification */}
      {noHeartsTip && (
        <div
          className="fixed top-24 left-1/2 z-50 pointer-events-none"
          style={{ transform: "translateX(-50%)" }}
        >
          <div
            className="flex items-center gap-2 text-sm text-white rounded-2xl px-4 py-3 shadow-2xl"
            style={{ background: "rgba(15,10,10,0.92)", border: "1px solid rgba(239,68,68,0.5)", backdropFilter: "blur(12px)" }}
          >
            ❤️ No hearts left — wait for one to refill!
          </div>
        </div>
      )}

      {/* Empty world */}
      {worldData.totalLevels === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20 p-8">
          <div className="text-center rounded-2xl p-8 max-w-xs" style={{ background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="font-bold text-white text-lg">No levels yet</p>
            <p className="text-white/55 text-sm mt-1">Add at least 3 questions to generate Level 1.</p>
            <button onClick={() => setLocation("/categories")} className="mt-4 text-primary text-sm hover:underline">← Back to worlds</button>
          </div>
        </div>
      )}

      {/* ── Sticky header ── */}
      <div className="sticky top-16 z-20 flex items-center justify-between px-4 py-3 pointer-events-none">
        <button
          className="pointer-events-auto h-10 w-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(10px)" }}
          onClick={() => setLocation("/categories")}
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        <div
          className="pointer-events-auto text-center px-5 py-2 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(10px)" }}
        >
          <p className="text-white/45 text-[10px] uppercase tracking-widest font-semibold">World</p>
          <h1 className="text-white font-black text-sm leading-tight">{worldData.name}</h1>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(251,191,36,0.35)", backdropFilter: "blur(10px)" }}
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-amber-400 font-bold text-sm">{worldData.completedLevels}/{worldData.totalLevels}</span>
          </div>
          <div
            className="px-3 py-1.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${hearts === 0 ? "rgba(239,68,68,0.55)" : "rgba(239,68,68,0.25)"}`, backdropFilter: "blur(10px)" }}
          >
            <HeartsDisplay hearts={hearts} maxHearts={maxHearts} nextRefillMs={nextRefillMs} size="sm" dark watchAd={watchAd} />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="sticky top-[116px] z-20 px-4 pointer-events-none">
        <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${theme.node}, #fbbf24)` }}
          />
        </div>
      </div>

      {/* Guest notice */}
      {isGuest && (
        <div
          className="absolute z-20 flex items-center gap-2 text-xs text-amber-200 rounded-xl px-3 py-2"
          style={{ top: 68, left: 16, right: 16, background: "rgba(0,0,0,0.65)", border: "1px solid rgba(251,191,36,0.2)", backdropFilter: "blur(8px)" }}
        >
          <Zap className="h-3 w-3 shrink-0 text-amber-400" />
          Sign in to save your progress across devices
        </div>
      )}

      {/* Bottom padding */}
      <div style={{ height: 48 }} />
    </div>
  );
}
