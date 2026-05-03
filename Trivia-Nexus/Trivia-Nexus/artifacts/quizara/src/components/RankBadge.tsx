import { getRankDef, getXpProgress } from "@/lib/xpRank";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface XpRankBadgeProps {
  totalXp: number;
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  showProgress?: boolean;
  className?: string;
}

export function RankBadge({ totalXp, size = "sm", showLabel = true, showProgress = false, className }: XpRankBadgeProps) {
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
      {showLabel && <span>{rank.title}</span>}
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
                  {progress.xpNeededForNext} XP to {progress.next.emoji} {progress.next.title}
                </span>
              </div>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <p className="font-bold">{rank.emoji} {rank.title}</p>
            <p className="text-muted-foreground">Total XP: {totalXp.toLocaleString()}</p>
            {progress.next ? (
              <p className="text-muted-foreground">
                {progress.xpNeededForNext} XP until {progress.next.emoji} {progress.next.title}
              </p>
            ) : (
              <p className="text-yellow-400 font-semibold">Maximum rank achieved! 👑</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { RankBadge as XpRankBadge };
