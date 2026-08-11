import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { Translations } from "@/locales/en";

export function getPowerUpConfig(t: Translations): Record<string, { label: string; emoji: string; description: string; color: string }> {
  return {
    fifty_fifty:    { label: t.powerUpBar.fiftyFiftyLabel, emoji: "✂️", description: t.powerUpBar.fiftyFiftyDesc,   color: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20"    },
    extra_time:     { label: t.quiz.extraTime,             emoji: "⏰", description: t.powerUpBar.extraTimeDesc,    color: "text-green-400 border-green-500/40 bg-green-500/10 hover:bg-green-500/20" },
    skip_question:  { label: t.quiz.skip,                  emoji: "⏭️", description: t.powerUpBar.skipDesc,        color: "text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20" },
    double_score:   { label: t.powerUpBar.doubleScoreLabel, emoji: "✖️", description: t.powerUpBar.doubleScoreDesc, color: "text-violet-400 border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20" },
    freeze_timer:   { label: t.quiz.freeze,                emoji: "❄️", description: t.powerUpBar.freezeDesc,      color: "text-sky-400 border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"         },
    shield:         { label: t.powerUpBar.shieldLabel,     emoji: "🛡️", description: t.powerUpBar.shieldDesc,      color: "text-indigo-400 border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20" },
    steal_question: { label: t.powerUpBar.stealLabel,      emoji: "🎯", description: t.powerUpBar.stealDesc,       color: "text-rose-400 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20"     },
  };
}

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
  editorial?: boolean;
}

export default function PowerUpBar({
  powerUps, usedEffects, doubleScoreRemaining, shieldActive, frozenTimer,
  onUse, disabled, allowedEffects, currentQuestionType, editorial = false,
}: PowerUpBarProps) {
  const { t } = useI18n();
  const POWER_UP_CONFIG = getPowerUpConfig(t);
  const visible = powerUps.filter(p =>
    p.quantity > 0 && (!allowedEffects || allowedEffects.includes(p.effect))
  );

  if (visible.length === 0) return null;

  return (
    <div className={editorial ? "flex snap-x items-center justify-start gap-2 overflow-x-auto py-2 sm:flex-wrap sm:overflow-visible" : "flex items-center justify-center gap-2 flex-wrap py-1"}>
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
        const editorialLabel = pu.effect === "extra_time" ? t.quiz.extraTime : pu.effect === "skip_question" ? t.quiz.skip : pu.effect === "freeze_timer" ? t.quiz.freeze : cfg.label;

        return (
          <button
            key={pu.effect}
            title={isFiftyFiftyUnavailable ? t.powerUpBar.notAvailableForQuestionType : cfg.description}
            aria-label={`${editorialLabel}, ${pu.quantity} ${t.quiz.available}`}
            onClick={() => !isDisabled && onUse(pu.itemId, pu.effect)}
            disabled={isDisabled}
            className={cn(
              editorial
                ? "focus-ring relative flex min-h-11 shrink-0 snap-start items-center gap-2 border px-3 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors"
                : "relative flex min-w-[52px] select-none flex-col items-center gap-0.5 rounded-xl border-2 px-3 py-2 text-xs font-bold transition-all",
              editorial
                ? isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : isDisabled
                    ? "cursor-not-allowed border-white/5 text-muted-foreground/25"
                    : "cursor-pointer border-white/15 text-muted-foreground hover:border-primary/50 hover:text-foreground active:bg-primary/10"
                : isActive
                  ? `${cfg.color} ring-2 ring-offset-2 ring-offset-background animate-pulse`
                  : isDisabled
                    ? "border-border/20 bg-muted/5 text-muted-foreground/30 cursor-not-allowed"
                    : `${cfg.color} active:scale-95 cursor-pointer`
            )}
          >
            <span className={editorial ? "text-sm leading-none" : "text-xl leading-none"}>{pu.emoji}</span>
            <span className="leading-none">{editorialLabel}</span>

            {/* quantity badge */}
            {pu.quantity > 0 && !isActive && (
              <span className={editorial ? "ml-1 text-[9px] text-primary rtl:ml-0 rtl:mr-1" : "absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center"}>
                {pu.quantity}
              </span>
            )}
            {/* double-score armed indicator */}
            {isDoubleActive && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-violet-500 text-white text-[9px] font-black flex items-center justify-center">
                ✖
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
