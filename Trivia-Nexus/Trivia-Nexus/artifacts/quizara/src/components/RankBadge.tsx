import { getRankDef, getXpProgress, type RankTitle } from "@/lib/xpRank";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import type { Translations } from "@/locales/en";

export function rankTitleLabel(t: Translations, title: RankTitle): string {
  const map: Record<RankTitle, string> = {
    Rookie: t.ranks.rookie,
    Scholar: t.ranks.scholar,
    Expert: t.ranks.expert,
    Master: t.ranks.master,
    Legend: t.ranks.legend,
  };
  return map[title];
}

export interface XpRankBadgeProps {
  totalXp: number;
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  showProgress?: boolean;
  className?: string;
}

export function RankBadge({ totalXp, size = "sm", showLabel = true, showProgress = false, className }: XpRankBadgeProps) {
  const { t } = useI18n();
  const rank = getRankDef(totalXp);
  const progress = getXpProgress(totalXp);

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.5 gap-0.5",
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-2.5 py-1 gap-1",
    lg: "text-base px-3 py-1.5 gap-1.5",
  };

  const badge = (
    <span
      className={cn(
        "inline-flex items-center font-bold rounded-full border transition-all",
        rank.bgColor,
        rank.borderColor,
        rank.textColor,
        sizeClasses[size],
        className
      )}
    >
      <span>{rank.emoji}</span>
      {showLabel && <span>{rankTitleLabel(t, rank.title)}</span>}
    </span>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex flex-col gap-1 cursor-default">
            {badge}
            {showProgress && progress.next && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress.progressPct}%`,
                      background: rank.title === "Legend"
                        ? "#facc15"
                        : rank.title === "Master"
                        ? "#fb923c"
                        : rank.title === "Expert"
                        ? "#a78bfa"
                        : rank.title === "Scholar"
                        ? "#60a5fa"
                        : "#94a3b8",
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {progress.xpNeededForNext} {t.ranks.xpTo} {progress.next.emoji} {rankTitleLabel(t, progress.next.title)}
                </span>
              </div>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <p className="font-bold">{rank.emoji} {rankTitleLabel(t, rank.title)}</p>
            <p className="text-muted-foreground">{t.ranks.totalXp} {totalXp.toLocaleString()}</p>
            {progress.next ? (
              <p className="text-muted-foreground">
                {progress.xpNeededForNext} {t.ranks.xpUntil} {progress.next.emoji} {rankTitleLabel(t, progress.next.title)}
              </p>
            ) : (
              <p className="text-yellow-400 font-semibold">{t.ranks.maxRank}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { RankBadge as XpRankBadge };
