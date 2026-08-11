import { Heart, Tv2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { WatchAdModal } from "./WatchAdModal";
import { useI18n } from "@/lib/i18n";

interface HeartsDisplayProps {
  hearts: number;
  maxHearts: number;
  nextRefillMs: number;
  size?: "sm" | "md";
  className?: string;
  dark?: boolean;
  watchAd?: () => Promise<void>;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HeartsDisplay({
  hearts,
  maxHearts,
  nextRefillMs,
  size = "md",
  className,
  dark = false,
  watchAd,
}: HeartsDisplayProps) {
  const { t } = useI18n();
  const [countdown, setCountdown] = useState(nextRefillMs);
  const [showAd, setShowAd] = useState(false);

  useEffect(() => {
    setCountdown(nextRefillMs);
    if (nextRefillMs <= 0) return;
    const id = setInterval(() => setCountdown(prev => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(id);
  }, [nextRefillMs]);

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const gap = size === "sm" ? "gap-0.5" : "gap-1";
  const textCls = size === "sm" ? "text-[10px]" : "text-xs";
  const dimText = dark ? "text-white/50" : "text-muted-foreground";
  const needsRefill = hearts < maxHearts;

  const handleAdComplete = async () => {
    if (watchAd) await watchAd();
    setShowAd(false);
  };

  return (
    <>
      <div className={cn("flex flex-col items-center gap-0.5", className)}>
        {/* Heart icons */}
        <div className={cn("flex items-center", gap)}>
          {Array.from({ length: maxHearts }).map((_, i) => (
            <Heart
              key={i}
              className={cn(
                iconSize,
                "transition-all duration-300",
                i < hearts
                  ? "text-red-500 fill-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.55)]"
                  : dark
                    ? "text-white/15 fill-white/8"
                    : "text-muted-foreground/30 fill-muted-foreground/10"
              )}
            />
          ))}
        </div>

        {/* Watch Ad button */}
        {needsRefill && watchAd && (
          <button
            onClick={() => setShowAd(true)}
            className={cn(
              "flex items-center gap-1 font-semibold transition-all rounded-full",
              "hover:opacity-80 active:scale-95",
              size === "sm"
                ? "text-[10px] px-2 py-0.5 mt-0.5"
                : "text-xs px-3 py-1 mt-1",
              dark
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25"
                : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
            )}
          >
            <Tv2 className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {size === "sm" ? "+1❤" : t.hearts.watchAd}
          </button>
        )}

        {/* Slow background refill countdown (secondary info) */}
        {needsRefill && !watchAd && countdown > 0 && (
          <span className={cn(textCls, dimText, "font-mono tabular-nums leading-none")}>
            +❤ {formatCountdown(countdown)}
          </span>
        )}
        {needsRefill && !watchAd && countdown <= 0 && hearts === 0 && (
          <span className={cn(textCls, "text-red-400 font-semibold leading-none")}>{t.hearts.noHearts}</span>
        )}
      </div>

      {showAd && (
        <WatchAdModal
          onComplete={handleAdComplete}
          onClose={() => setShowAd(false)}
        />
      )}
    </>
  );
}
