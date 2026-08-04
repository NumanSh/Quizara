import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, Gem, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AD_DURATION = 30;
const SKIP_AFTER = 5;
const HEARTS_EARNED = 1;

interface WatchAdModalProps {
  onComplete: () => Promise<void>;
  onClose: () => void;
  bonus?: { coins: number; xp: number };
  coinsMode?: number;
  xpMode?: number;
}

let rewardAdInjected = false;

function triggerRewardAd() {
  if (rewardAdInjected) return;
  rewardAdInjected = true;
  const script = document.createElement("script");
  script.dataset.zone = "11500519";
  script.src = "https://nap5k.com/tag.min.js";
  ([document.documentElement, document.body].filter(Boolean).pop() as HTMLElement).appendChild(script);
}

export function WatchAdModal({ onComplete, onClose, bonus, coinsMode, xpMode }: WatchAdModalProps) {
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<"playing" | "earned">("playing");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    triggerRewardAd();
  }, []);

  const canSkip = elapsed >= SKIP_AFTER;
  const progress = Math.min(100, (elapsed / AD_DURATION) * 100);
  const timeLeft = AD_DURATION - elapsed;

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setElapsed(prev => {
        if (prev >= AD_DURATION) {
          clearInterval(id);
          setPhase("earned");
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const handleSkip = () => {
    if (!canSkip) return;
    setPhase("earned");
  };

  const handleClaim = async () => {
    setClaiming(true);
    await onComplete();
  };

  const hasBonus = bonus && (bonus.coins > 0 || bonus.xp > 0);

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)", zIndex: 9999 }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {phase === "playing" ? (
          <>
            {/* Ad chrome top */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0a0a] border-b border-white/[0.08]">
              <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Advertisement</span>
              <button
                onClick={canSkip ? handleSkip : undefined}
                className={cn(
                  "text-xs px-3 py-1 rounded-full font-semibold transition-all",
                  canSkip
                    ? "bg-white/15 text-white hover:bg-white/25 cursor-pointer"
                    : "bg-white/5 text-white/25 cursor-default"
                )}
              >
                {canSkip ? "Skip ›" : `Skip in ${SKIP_AFTER - elapsed}s`}
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-white/[0.08]">
              <div
                className="h-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #6366f1, #06b6d4)" }}
              />
            </div>

            {/* Mock Ad content */}
            <div
              className="flex flex-col px-6 py-6 gap-5"
              style={{ background: "linear-gradient(160deg, #080d14 0%, #0f1728 100%)" }}
            >
              {/* Brand */}
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #6366f1, #06b6d4)" }}
                >
                  <span className="text-white font-black text-base">Q</span>
                </div>
                <div>
                  <span className="text-white font-black text-lg tracking-tight">Quizara</span>
                  <span className="ml-2 text-[10px] text-cyan-400 font-bold uppercase tracking-widest bg-cyan-400/10 px-1.5 py-0.5 rounded">Premium</span>
                </div>
              </div>

              {/* Ad message */}
              <div className="flex flex-col gap-2">
                <h2 className="text-white font-black text-2xl leading-tight">
                  No Hearts.<br />No Waiting.
                </h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  Play unlimited levels, go ad-free, and challenge friends in Arena mode.
                </p>

                {/* Hearts visual */}
                <div className="flex items-center gap-1.5 mt-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Heart key={i} className="h-4 w-4 text-red-500 fill-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                  ))}
                  <span className="text-white/60 text-xs ml-1 font-semibold">∞ Unlimited</span>
                </div>
              </div>

              {/* CTA + timer */}
              <div className="flex items-center justify-between">
                <a
                  href="https://omg10.com/4/11500520"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer hover:scale-105 transition-transform"
                  style={{ background: "linear-gradient(135deg, #6366f1, #06b6d4)" }}
                >
                  Get Premium →
                </a>
                <span className="text-white/25 text-xs font-mono tabular-nums">{timeLeft}s</span>
              </div>
            </div>
          </>
        ) : (
          /* Earned screen */
          <div
            className="flex flex-col items-center text-center px-7 py-8 gap-4"
            style={{ background: "linear-gradient(160deg, #080d14 0%, #0f1728 100%)" }}
          >
            {xpMode ? (
              <>
                {/* XP earned screen */}
                <div className="flex gap-3 items-center justify-center">
                  <Zap className="h-12 w-12 text-indigo-400 drop-shadow-[0_0_14px_rgba(99,102,241,0.7)] animate-bounce" style={{ animationDuration: "0.8s" }} />
                </div>
                <div>
                  <p className="text-white font-black text-2xl">+{xpMode} XP!</p>
                  <p className="text-white/45 text-sm mt-1">Battle Pass XP added</p>
                </div>
              </>
            ) : coinsMode ? (
              <>
                {/* Coins earned screen */}
                <div className="flex gap-3 items-center justify-center">
                  <Gem className="h-12 w-12 text-amber-400 drop-shadow-[0_0_14px_rgba(251,191,36,0.7)] animate-bounce" style={{ animationDuration: "0.8s" }} />
                </div>
                <div>
                  <p className="text-white font-black text-2xl">+{coinsMode} Coins!</p>
                  <p className="text-white/45 text-sm mt-1">Added to your balance</p>
                </div>
              </>
            ) : (
              <>
                {/* Hearts earned screen */}
                <div className="flex gap-3">
                  {Array.from({ length: HEARTS_EARNED }).map((_, i) => (
                    <Heart
                      key={i}
                      className="h-10 w-10 text-red-500 fill-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.7)] animate-bounce"
                      style={{ animationDelay: `${i * 120}ms`, animationDuration: "0.8s" }}
                    />
                  ))}
                </div>
                <div>
                  <p className="text-white font-black text-2xl">+{HEARTS_EARNED} Heart Restored!</p>
                  <p className="text-white/45 text-sm mt-1">Thanks for watching</p>
                </div>
                {/* Bonus rewards */}
                {hasBonus && (
                  <div
                    className="w-full rounded-xl p-3 flex flex-col gap-2"
                    style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
                  >
                    <p className="text-xs text-indigo-300 font-bold uppercase tracking-widest">2× Bonus Rewards</p>
                    <div className="flex justify-center gap-6">
                      {bonus!.coins > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Gem className="h-4 w-4 text-amber-400" />
                          <span className="text-amber-300 font-bold text-sm">+{bonus!.coins} coins</span>
                        </div>
                      )}
                      {bonus!.xp > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Trophy className="h-4 w-4 text-indigo-400" />
                          <span className="text-indigo-300 font-bold text-sm">+{bonus!.xp} XP</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <Button
              className="w-full font-bold text-white h-12 text-base rounded-xl"
              style={{ background: "linear-gradient(135deg, #6366f1, #06b6d4)" }}
              disabled={claiming}
              onClick={handleClaim}
            >
              {claiming ? "Claiming…" : "Claim Rewards"}
            </Button>

            <button
              onClick={onClose}
              className="text-xs text-white/25 hover:text-white/45 transition-colors"
            >
              Close without claiming
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
