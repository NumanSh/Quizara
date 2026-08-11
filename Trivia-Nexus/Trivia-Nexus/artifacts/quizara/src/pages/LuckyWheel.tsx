import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProfileQueryKey } from "@workspace/api-client-react";
import { WatchAdModal } from "@/components/WatchAdModal";
import { Gem, Heart, Zap, Star, Trophy, RefreshCw, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Translations } from "@/locales/en";

// Matches backend WHEEL_SEGMENTS order exactly
function buildSegments(t: Translations) {
  return [
    { id: "coins_50",  label: t.luckyWheelPage.coins50,  emoji: "🪙", color: "#F59E0B", textColor: "#1a1a1a" },
    { id: "coins_100", label: t.luckyWheelPage.coins100, emoji: "🪙", color: "#EAB308", textColor: "#1a1a1a" },
    { id: "heart_1",   label: t.luckyWheelPage.heart1,   emoji: "❤️",  color: "#EF4444", textColor: "#fff" },
    { id: "coins_200", label: t.luckyWheelPage.coins200, emoji: "🪙", color: "#D97706", textColor: "#1a1a1a" },
    { id: "heart_2",   label: t.luckyWheelPage.hearts2,  emoji: "❤️",  color: "#EC4899", textColor: "#fff" },
    { id: "powerup",   label: t.luckyWheelPage.powerUp,  emoji: "⚡", color: "#8B5CF6", textColor: "#fff" },
    { id: "xp_100",    label: t.luckyWheelPage.xp100,    emoji: "⭐", color: "#3B82F6", textColor: "#fff" },
    { id: "jackpot",   label: t.luckyWheelPage.jackpot,  emoji: "🏆", color: "#10B981", textColor: "#fff" },
  ];
}

const N = 8;

// Label contrast per slice colour — presentation only, so it stays client-side
// while the labels themselves come from the server.
const SEGMENT_TEXT_COLOR: Record<string, string> = {
  coins_50: "#1a1a1a",
  coins_100: "#1a1a1a",
  heart_1: "#fff",
  coins_200: "#1a1a1a",
  heart_2: "#fff",
  powerup: "#fff",
  xp_100: "#fff",
  jackpot: "#fff",
};
const SLICE_DEG = 360 / N;
const CX = 200;
const CY = 200;
const R = 178;
const LABEL_R = 126;

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const a = toRad(angleDeg - 90); // -90 so 0° = top
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function slicePath(i: number): string {
  const start = i * SLICE_DEG;
  const end = start + SLICE_DEG;
  const s = polarToXY(CX, CY, R, start);
  const e = polarToXY(CX, CY, R, end);
  return `M ${CX} ${CY} L ${s.x} ${s.y} A ${R} ${R} 0 0 1 ${e.x} ${e.y} Z`;
}

interface WheelSegment {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

interface WheelStatus {
  canSpin: boolean;
  freeSpinAvailable: boolean;
  extraSpins: number;
  requiresAuth?: boolean;
  segments?: WheelSegment[];
}

interface SpinResult {
  segmentIndex: number;
  segment: { id: string; label: string; emoji: string; type: string; amount: number; color: string };
  reward: { coins: number; hearts: number; xp: number; powerupName: string | null };
  newCoins: number;
  newHearts: number;
}

function RewardIcon({ type }: { type: string }) {
  if (type === "coins" || type === "jackpot") return <Gem className="h-8 w-8 text-amber-400" />;
  if (type === "heart") return <Heart className="h-8 w-8 text-rose-400" />;
  if (type === "xp") return <Star className="h-8 w-8 text-blue-400" />;
  if (type === "powerup") return <Zap className="h-8 w-8 text-purple-400" />;
  return <Trophy className="h-8 w-8 text-emerald-400" />;
}

export default function LuckyWheel() {
  const { t } = useI18n();
  const { isAuthenticated } = useSupabaseAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Track accumulated rotation to avoid snapping back
  const accRotation = useRef(0);

  // Prefer the server's segments: labels there are derived from the live,
  // admin-configurable amounts. SEGMENTS below is only a pre-auth placeholder so
  // the wheel can render before /wheel/status resolves.
  const wheelSegments: WheelSegment[] =
    status?.segments?.length === N ? status.segments : buildSegments(t);

  const fetchStatus = async () => {
    try {
      const res = await authFetch("/api/wheel/status", { credentials: "include" });
      const data = await res.json();
      setStatus(data);
    } catch {
      toast({ title: t.luckyWheelPage.couldNotLoadStatus, variant: "destructive" });
    }
  };

  useEffect(() => { fetchStatus(); }, [isAuthenticated]);

  const doSpin = async () => {
    if (spinning || isAnimating) return;
    setSpinning(true);
    setResult(null);

    try {
      const res = await authFetch("/api/wheel/spin", { method: "POST", credentials: "include" });
      if (res.status === 429) {
        toast({ title: t.luckyWheelPage.noSpinsLeft, description: t.luckyWheelPage.comeBackOrWatchAd, variant: "destructive" });
        setSpinning(false);
        return;
      }
      if (!res.ok) throw new Error("Spin failed");
      const data: SpinResult = await res.json();

      // Compute final rotation angle
      // Segment i center is at i * SLICE_DEG + SLICE_DEG/2 degrees from top
      // To bring segment i center to pointer (top = 0), rotate by:
      const segCenterAngle = data.segmentIndex * SLICE_DEG + SLICE_DEG / 2;
      const rotToTop = (360 - segCenterAngle % 360) % 360;
      const finalRotation = accRotation.current + 5 * 360 + rotToTop;

      accRotation.current = finalRotation;
      setIsAnimating(true);
      setRotation(finalRotation);

      // Wait for animation to finish (4.5s)
      setTimeout(() => {
        setIsAnimating(false);
        setSpinning(false);
        setResult(data);
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        fetchStatus();
      }, 4500);
    } catch {
      toast({ title: t.luckyWheelPage.spinFailed, variant: "destructive" });
      setSpinning(false);
    }
  };

  const handleAdComplete = async () => {
    setShowAdModal(false);
    try {
      const res = await authFetch("/api/wheel/ad-spin", { method: "POST", credentials: "include" });
      if (res.ok) {
        toast({ title: t.luckyWheelPage.extraSpinGranted, description: t.luckyWheelPage.spinAgain });
        await fetchStatus();
      }
    } catch {
      toast({ title: t.luckyWheelPage.couldNotGrantSpin, variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 w-full bg-background">
      {/* Hero gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-400/5 rounded-full blur-[120px]" />
        <div className="absolute top-48 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-[80px]" />
      </div>

      <div className="relative container max-w-2xl mx-auto px-4 py-10 flex flex-col items-center gap-8">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            {t.luckyWheelPage.title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t.luckyWheelPage.subtitle}
          </p>
        </div>

        {/* Status badges */}
        {status && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className={cn(
              "flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full border",
              status.freeSpinAvailable
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-border bg-card text-muted-foreground"
            )}>
              {status.freeSpinAvailable ? t.luckyWheelPage.freeSpinReady : t.luckyWheelPage.freeSpinUsed}
            </div>
            {(status.extraSpins ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-400">
                {t.luckyWheelPage.extraSpins.replace("{count}", String(status.extraSpins)).replace("{plural}", status.extraSpins !== 1 ? "s" : "")}
              </div>
            )}
          </div>
        )}

        {/* Wheel container */}
        <div className="relative w-full max-w-[420px] aspect-square select-none">

          {/* Glow ring */}
          <div className={cn(
            "absolute inset-2 rounded-full transition-opacity duration-500",
            isAnimating ? "opacity-100" : "opacity-30",
            "bg-gradient-to-br from-amber-500/20 via-violet-500/20 to-primary/20 blur-2xl"
          )} />

          {/* Pointer / needle — fixed at top center */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20 flex flex-col items-center">
            <div className="w-5 h-7 bg-white rounded-sm shadow-lg" style={{
              clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
              background: "linear-gradient(to bottom, #fff, #e2e8f0)",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
            }} />
          </div>

          {/* Wheel */}
          <div
            className="absolute inset-4 rounded-full overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.6)]"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isAnimating
                ? "transform 4.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                : "none",
            }}
          >
            <svg viewBox="0 0 400 400" width="100%" height="100%">
              {wheelSegments.map((seg, i) => {
                const midAngle = i * SLICE_DEG + SLICE_DEG / 2 - 90;
                const lp = polarToXY(CX, CY, LABEL_R, i * SLICE_DEG + SLICE_DEG / 2);
                const ep = polarToXY(CX, CY, LABEL_R - 28, i * SLICE_DEG + SLICE_DEG / 2);
                return (
                  <g key={seg.id}>
                    {/* Slice */}
                    <path
                      d={slicePath(i)}
                      fill={seg.color}
                      stroke="#0d1117"
                      strokeWidth="2"
                    />
                    {/* Emoji */}
                    <text
                      x={ep.x}
                      y={ep.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="22"
                      transform={`rotate(${midAngle + 90}, ${ep.x}, ${ep.y})`}
                    >
                      {seg.emoji}
                    </text>
                    {/* Label */}
                    <text
                      x={lp.x}
                      y={lp.y + 18}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill={SEGMENT_TEXT_COLOR[seg.id] ?? "#fff"}
                      transform={`rotate(${midAngle + 90}, ${lp.x}, ${lp.y + 18})`}
                    >
                      {seg.label}
                    </text>
                  </g>
                );
              })}
              {/* Center circle */}
              <circle cx={CX} cy={CY} r={28} fill="#0d1117" stroke="#1e2533" strokeWidth="3" />
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle" fontSize="18">🎡</text>
            </svg>
          </div>

          {/* Outer ring decoration */}
          <div className="absolute inset-2 rounded-full border-4 border-white/10 pointer-events-none" />
          <div className="absolute inset-1 rounded-full border border-white/5 pointer-events-none" />
        </div>

        {/* Spin result */}
        {result && !isAnimating && (
          <div
            className={cn(
              "w-full rounded-2xl border p-6 flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in-95 duration-300",
              result.segment.type === "jackpot"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-amber-500/30 bg-amber-500/5"
            )}
          >
            <RewardIcon type={result.segment.type} />
            <div>
              <p className="text-2xl font-black text-foreground">{result.segment.emoji} {result.segment.label}</p>
              {result.reward.coins > 0 && (
                <p className="text-muted-foreground text-sm mt-1">{t.luckyWheelPage.coinsAdded.replace("{coins}", String(result.reward.coins))}</p>
              )}
              {result.reward.hearts > 0 && (
                <p className="text-muted-foreground text-sm mt-1">{t.luckyWheelPage.heartsRestored.replace("{count}", String(result.reward.hearts)).replace("{plural}", result.reward.hearts > 1 ? "s" : "")}</p>
              )}
              {result.reward.xp > 0 && (
                <p className="text-muted-foreground text-sm mt-1">{t.luckyWheelPage.xpAdded.replace("{xp}", String(result.reward.xp))}</p>
              )}
              {result.reward.powerupName && (
                <p className="text-muted-foreground text-sm mt-1">{t.luckyWheelPage.itemAdded.replace("{name}", result.reward.powerupName)}</p>
              )}
            </div>
          </div>
        )}

        {/* Spin button / status */}
        {!isAuthenticated ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground text-sm">{t.luckyWheelPage.signInToSpin}</p>
            <Button onClick={() => setLocation("/login")} size="lg" className="min-w-48">
              {t.luckyWheelPage.signInBtn} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : status?.canSpin ? (
          <Button
            size="lg"
            onClick={doSpin}
            disabled={spinning || isAnimating}
            className="min-w-48 h-14 text-lg font-black bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 disabled:opacity-60 shadow-lg shadow-amber-500/20"
          >
            {isAnimating ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                {t.luckyWheelPage.spinning}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                {status.freeSpinAvailable ? t.luckyWheelPage.spinFree : t.luckyWheelPage.useExtraSpin}
              </span>
            )}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <p className="text-muted-foreground text-sm font-medium">{t.luckyWheelPage.freeSpinUsedToday}</p>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowAdModal(true)}
              className="w-full h-12 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
            >
              <Zap className="mr-2 h-4 w-4" />
              {t.luckyWheelPage.watchAdExtraSpin}
            </Button>
            <p className="text-xs text-muted-foreground">{t.luckyWheelPage.comeBackFreeSpin}</p>
          </div>
        )}

        {/* Reward table */}
        <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="font-bold text-sm">{t.luckyWheelPage.possibleRewards}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
            {wheelSegments.map((seg, i) => (
              <div
                key={seg.id}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-4 px-3 text-center",
                  i % 2 === 0 ? "bg-card" : "bg-muted/20",
                  "border-b border-r border-border/40 last:border-r-0"
                )}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-lg shadow-inner"
                  style={{ backgroundColor: seg.color + "30", border: `2px solid ${seg.color}60` }}
                >
                  {seg.emoji}
                </div>
                <p className="text-xs font-semibold text-foreground">{seg.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showAdModal && (
        <WatchAdModal
          onComplete={handleAdComplete}
          onClose={() => setShowAdModal(false)}
        />
      )}
    </div>
  );
}
