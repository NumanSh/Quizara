import { cn } from "@/lib/utils";

export const POWER_UP_CONFIG: Record<string, { label: string; emoji: string; description: string; color: string }> = {
  fifty_fifty:    { label: "50/50",   emoji: "✂️", description: "Eliminate 2 wrong answers",              color: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20"    },
  extra_time:     { label: "+Time",   emoji: "⏰", description: "Add 15 extra seconds",                   color: "text-green-400 border-green-500/40 bg-green-500/10 hover:bg-green-500/20" },
  skip_question:  { label: "Skip",    emoji: "⏭️", description: "Skip this question without penalty",     color: "text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20" },
  double_score:   { label: "2×",      emoji: "✖️", description: "Double score for 3 questions",           color: "text-violet-400 border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20" },
  freeze_timer:   { label: "Freeze",  emoji: "❄️", description: "Freeze timer for 10 seconds",            color: "text-sky-400 border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"         },
  shield:         { label: "Shield",  emoji: "🛡️", description: "Block opponent's next power-up",         color: "text-indigo-400 border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20" },
  steal_question: { label: "Steal",   emoji: "🎯", description: "Steal opponent's points this round",     color: "text-rose-400 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20"     },
};

export interface PowerUpItem {
  itemId: string;
  effect: string;
  emoji: string;
  name: string;
  quantity: number;
}

interface PowerUpBarProps {
  powerUps: PowerUpItem[];
  usedEffects: Set<string>;
  doubleScoreRemaining: number;
  shieldActive: boolean;
  frozenTimer: boolean;
  onUse: (itemId: string, effect: string) => void;
  disabled: boolean;
  allowedEffects?: string[];
  currentQuestionType?: string;
}

export default function PowerUpBar({
  powerUps, usedEffects, doubleScoreRemaining, shieldActive, frozenTimer,
  onUse, disabled, allowedEffects, currentQuestionType,
}: PowerUpBarProps) {
  const visible = powerUps.filter(p =>
    p.quantity > 0 && (!allowedEffects || allowedEffects.includes(p.effect))
  );

  if (visible.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap py-1">
      {visible.map((pu) => {
        const cfg = POWER_UP_CONFIG[pu.effect] ?? {
          label: pu.name, emoji: pu.emoji, description: "", color: "text-muted-foreground border-border bg-muted/20 hover:bg-muted/40"
        };
        const isFiftyFiftyUnavailable = pu.effect === "fifty_fifty" &&
          (currentQuestionType === "matching" || currentQuestionType === "ordering" || currentQuestionType === "hotspot");
        const isDoubleActive = pu.effect === "double_score" && doubleScoreRemaining > 0;
        const isShieldActive = pu.effect === "shield" && shieldActive;
        const isFreezeActive = pu.effect === "freeze_timer" && frozenTimer;
        const isActive = isDoubleActive || isShieldActive || isFreezeActive;
        const alreadyUsed = usedEffects.has(pu.effect) && !isDoubleActive;
        const isDisabled = disabled || alreadyUsed || isFiftyFiftyUnavailable || (isActive && pu.effect !== "shield" && pu.effect !== "double_score");

        return (
          <button
            key={pu.effect}
            title={isFiftyFiftyUnavailable ? "This power-up isn't available for this question type." : cfg.description}
            onClick={() => !isDisabled && onUse(pu.itemId, pu.effect)}
            disabled={isDisabled}
            className={cn(
              "relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border-2 transition-all text-xs font-bold min-w-[52px] select-none",
              isActive
                ? `${cfg.color} ring-2 ring-offset-2 ring-offset-background animate-pulse`
                : isDisabled
                  ? "border-border/20 bg-muted/5 text-muted-foreground/30 cursor-not-allowed"
                  : `${cfg.color} active:scale-95 cursor-pointer`
            )}
          >
            <span className="text-xl leading-none">{pu.emoji}</span>
            <span className="leading-none">{cfg.label}</span>

            {/* quantity badge */}
            {pu.quantity > 0 && !isActive && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center">
                {pu.quantity}
              </span>
            )}
            {/* double-score remaining counter */}
            {isDoubleActive && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-violet-500 text-white text-[9px] font-black flex items-center justify-center">
                {doubleScoreRemaining}
              </span>
            )}
            {/* freeze indicator */}
            {isFreezeActive && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-sky-500 text-white text-[9px] font-black flex items-center justify-center">
                ❄
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
