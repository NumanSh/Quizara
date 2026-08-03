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

// Matches backend WHEEL_SEGMENTS order exactly
const SEGMENTS = [
  { id: "coins_50",  label: "50 Coins",  emoji: "🪙", color: "#F59E0B", textColor: "#1a1a1a" },
  { id: "coins_100", label: "100 Coins", emoji: "🪙", color: "#EAB308", textColor: "#1a1a1a" },
  { id: "heart_1",   label: "1 Heart",   emoji: "❤️",  color: "#EF4444", textColor: "#fff" },
  { id: "coins_200", label: "200 Coins", emoji: "🪙", color: "#D97706", textColor: "#1a1a1a" },
  { id: "heart_2",   label: "2 Hearts",  emoji: "❤️",  color: "#EC4899", textColor: "#fff" },
  { id: "powerup",   label: "Power-Up!", emoji: "⚡", color: "#8B5CF6", textColor: "#fff" },
  { id: "xp_100",    label: "+100 XP",   emoji: "⭐", color: "#3B82F6", textColor: "#fff" },
  { id: "jackpot",   label: "JACKPOT!",  emoji: "🏆", color: "#10B981", textColor: "#fff" },
];

const N = SEGMENTS.length;
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

interface WheelStatus {
  canSpin: boolean;
  freeSpinAvailable: boolean;
  extraSpins: number;
  requiresAuth?: boolean;
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

  const fetchStatus = async () => {
    try {
      const res = await authFetch("/api/wheel/status", { credentials: "include" });
      const data = await res.json();
      setStatus(data);
    } catch {
      toast({ title: "Could not load wheel status", variant: "destructive" });
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
        toast({ title: "No spins left!", description: "Come back tomorrow or watch an ad.", variant: "destructive" });
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
      toast({ title: "Spin failed", variant: "destructive" });
      setSpinning(false);
    }
  };

  const handleAdComplete = async () => {
    setShowAdModal(false);
    try {
      const res = await authFetch("/api/wheel/ad-spin", { method: "POST", credentials: "include" });
      if (res.ok) {
        toast({ title: "Extra spin granted!", description: "Spin the wheel again!" });
        await fetchStatus();
      }
    } catch {
      toast({ title: "Could not grant extra spin", variant: "destructive" });
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
            🎡 Lucky Wheel
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Spin daily for free — win coins, hearts, power-ups, and more!
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
              {status.freeSpinAvailable ? "✨ Free spin ready!" : "✓ Free spin used today"}
            </div>
            {(status.extraSpins ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-400">
                +{status.extraSpins} extra spin{status.extraSpins !== 1 ? "s" : ""}
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
              {SEGMENTS.map((seg, i) => {
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
                      fill={seg.textColor}
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
                <p className="text-muted-foreground text-sm mt-1">+{result.reward.coins} coins added to your wallet</p>
              )}
              {result.reward.hearts > 0 && (
                <p className="text-muted-foreground text-sm mt-1">+{result.reward.hearts} heart{result.reward.hearts > 1 ? "s" : ""} restored</p>
              )}
              {result.reward.xp > 0 && (
                <p className="text-muted-foreground text-sm mt-1">+{result.reward.xp} XP added to Battle Pass</p>
              )}
              {result.reward.powerupName && (
                <p className="text-muted-foreground text-sm mt-1">{result.reward.powerupName} added to inventory</p>
              )}
            </div>
          </div>
        )}

        {/* Spin button / status */}
        {!isAuthenticated ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground text-sm">Sign in to spin the wheel</p>
            <Button onClick={() => setLocation("/login")} size="lg" className="min-w-48">
              Sign In to Spin <ArrowRight className="ml-2 h-4 w-4" />
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
                Spinning...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                {status.freeSpinAvailable ? "Spin for Free!" : "Use Extra Spin"}
              </span>
            )}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <p className="text-muted-foreground text-sm font-medium">Free spin used today</p>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowAdModal(true)}
              className="w-full h-12 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
            >
              <Zap className="mr-2 h-4 w-4" />
              Watch Ad for Extra Spin
            </Button>
            <p className="text-xs text-muted-foreground">Come back tomorrow for your free spin!</p>
          </div>
        )}

        {/* Reward table */}
        <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="font-bold text-sm">Possible Rewards</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
            {SEGMENTS.map((seg, i) => (
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
