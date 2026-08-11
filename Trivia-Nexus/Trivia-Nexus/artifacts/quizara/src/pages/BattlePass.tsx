import { useEffect, useState, useCallback } from "react";
import { Zap, Crown, Lock, Check, Gem, Heart, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { WatchAdModal } from "@/components/WatchAdModal";
import { useQueryClient } from "@tanstack/react-query";
import { getGetProfileQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const XP_PER_TIER = 200;
const PREMIUM_COST = 1500;
const AD_XP = 50;

interface TierReward {
  type: "coins" | "hearts" | "item";
  amount?: number;
  effect?: string;
  emoji: string;
  label: string;
}

interface TierDef {
  tier: number;
  xpRequired: number;
  free: TierReward;
  premium: TierReward;
}

interface BattlePassData {
  seasonName: string;
  seasonXp: number;
  currentTier: number;
  isPremium: boolean;
  claimedFreeTiers: number[];
  claimedPremiumTiers: number[];
  premiumCost: number;
  tiers: TierDef[];
}

function RewardDisplay({ reward, dim }: { reward: TierReward; dim?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", dim && "opacity-40")}>
      <span className="text-2xl leading-none">{reward.emoji}</span>
      <span className="text-[10px] font-semibold text-white/70 leading-tight">{reward.label}</span>
    </div>
  );
}

function TierCard({
  tier,
  xp,
  currentTier,
  isPremium,
  claimedFree,
  claimedPremium,
  onClaim,
  claiming,
}: {
  tier: TierDef;
  xp: number;
  currentTier: number;
  isPremium: boolean;
  claimedFree: boolean;
  claimedPremium: boolean;
  onClaim: (tierNum: number, type: "free" | "premium") => void;
  claiming: string | null;
}) {
  const { t } = useI18n();
  const unlocked = tier.tier <= currentTier;
  const isCurrent = tier.tier === currentTier + 1;
  const progressToNext = isCurrent ? Math.round(((xp - currentTier * XP_PER_TIER) / XP_PER_TIER) * 100) : 0;

  const milestonesTiers = [10, 15, 25, 30];
  const isMilestone = milestonesTiers.includes(tier.tier);

  return (
    <div
      className={cn(
        "relative rounded-2xl border transition-all duration-200 overflow-hidden",
        unlocked && !isCurrent
          ? "border-white/10 bg-card/60"
          : isCurrent
            ? "border-indigo-500/50 bg-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
            : "border-white/5 bg-card/20 opacity-60",
        isMilestone && unlocked && "border-amber-400/30 bg-amber-500/5"
      )}
    >
      {/* Milestone badge */}
      {isMilestone && (
        <div className="absolute top-0 right-0">
          <div className="bg-amber-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-bl-lg rounded-tr-2xl">
            {t.battlePassPage.bonus}
          </div>
        </div>
      )}

      {/* Tier header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b",
        isCurrent ? "border-indigo-500/20 bg-indigo-500/10" : "border-white/5"
      )}>
        <div className="flex items-center gap-1.5">
          {unlocked ? (
            <div className={cn(
              "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black",
              isMilestone ? "bg-amber-500 text-black" : "bg-indigo-600 text-white"
            )}>
              {tier.tier}
            </div>
          ) : (
            <div className="h-5 w-5 rounded-full bg-white/5 flex items-center justify-center">
              <Lock className="h-2.5 w-2.5 text-white/25" />
            </div>
          )}
          <span className={cn("text-[10px] font-bold uppercase tracking-wide", isCurrent ? "text-indigo-300" : unlocked ? "text-white/60" : "text-white/25")}>
            {t.battlePassPage.tier.replace("{n}", String(tier.tier))}
          </span>
        </div>
        {isCurrent && (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-12 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progressToNext}%` }} />
            </div>
            <span className="text-[9px] text-indigo-300">{progressToNext}%</span>
          </div>
        )}
      </div>

      {/* Rewards section */}
      <div className="p-3 flex flex-col gap-2">
        {/* Free reward */}
        <div className={cn(
          "rounded-xl p-2.5 flex items-center justify-between gap-2",
          "bg-white/[0.04] border border-white/[0.07]"
        )}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest min-w-[28px]">{t.battlePassPage.free}</span>
            <RewardDisplay reward={tier.free} dim={!unlocked} />
          </div>
          {unlocked && !claimedFree ? (
            <Button
              size="sm"
              className="h-6 px-2 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white rounded-lg"
              disabled={claiming === `${tier.tier}-free`}
              onClick={() => onClaim(tier.tier, "free")}
            >
              {claiming === `${tier.tier}-free` ? "…" : t.battlePassPage.claim}
            </Button>
          ) : claimedFree ? (
            <Check className="h-4 w-4 text-green-400 shrink-0" />
          ) : null}
        </div>

        {/* Premium reward */}
        <div className={cn(
          "rounded-xl p-2.5 flex items-center justify-between gap-2",
          isPremium
            ? "bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-400/20"
            : "bg-white/[0.02] border border-white/[0.04]"
        )}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 min-w-[28px]">
              <Crown className={cn("h-2.5 w-2.5", isPremium ? "text-amber-400" : "text-white/20")} />
              <span className={cn("text-[9px] font-black uppercase tracking-widest", isPremium ? "text-amber-400" : "text-white/20")}>{t.battlePassPage.pro}</span>
            </div>
            <RewardDisplay reward={tier.premium} dim={!isPremium || !unlocked} />
          </div>
          {isPremium && unlocked && !claimedPremium ? (
            <Button
              size="sm"
              className="h-6 px-2 text-[10px] font-bold rounded-lg text-black"
              style={{ background: "linear-gradient(135deg, #f59e0b, #fbbf24)" }}
              disabled={claiming === `${tier.tier}-premium`}
              onClick={() => onClaim(tier.tier, "premium")}
            >
              {claiming === `${tier.tier}-premium` ? "…" : t.battlePassPage.claim}
            </Button>
          ) : isPremium && claimedPremium ? (
            <Check className="h-4 w-4 text-amber-400 shrink-0" />
          ) : !isPremium ? (
            <Lock className="h-3 w-3 text-white/15 shrink-0" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function BattlePass() {
  const { t } = useI18n();
  const { isAuthenticated, login } = useSupabaseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [data, setData] = useState<BattlePassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdModal, setShowAdModal] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await authFetch("/api/battlepass", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleWatchAd = () => {
    if (!isAuthenticated) { login(); return; }
    setShowAdModal(true);
  };

  const handleAdComplete = async () => {
    const res = await authFetch("/api/battlepass/watch-ad-xp", { method: "POST", credentials: "include" });
    if (res.ok) {
      toast({ title: t.battlePassPage.xpAddedToast.replace("{xp}", String(AD_XP)), description: t.battlePassPage.xpAddedDesc });
      await fetchData();
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
    }
  };

  const handleClaim = async (tierNum: number, rewardType: "free" | "premium") => {
    if (!isAuthenticated) { login(); return; }
    const key = `${tierNum}-${rewardType}`;
    setClaiming(key);
    try {
      const res = await authFetch("/api/battlepass/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierNum, rewardType }),
      });
      const d = await res.json();
      if (res.ok) {
        toast({ title: t.battlePassPage.rewardClaimed, description: t.battlePassPage.rewardClaimedDesc.replace("{emoji}", d.reward.emoji).replace("{label}", d.reward.label) });
        await fetchData();
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      } else {
        toast({ title: t.battlePassPage.oops, description: d.error ?? t.battlePassPage.claimFailed, variant: "destructive" });
      }
    } finally {
      setClaiming(null);
    }
  };

  const handleUpgrade = async () => {
    if (!isAuthenticated) { login(); return; }
    setUpgrading(true);
    try {
      const res = await authFetch("/api/battlepass/premium", { method: "POST", credentials: "include" });
      const d = await res.json();
      if (res.ok) {
        toast({ title: t.battlePassPage.premiumUnlocked, description: t.battlePassPage.premiumUnlockedDesc.replace("{coins}", String(d.coinsSpent)) });
        await fetchData();
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      } else {
        toast({ title: t.battlePassPage.notEnoughCoins, description: t.battlePassPage.needCoinsForPremium.replace("{amount}", String(PREMIUM_COST)), variant: "destructive" });
      }
    } finally {
      setUpgrading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">⚔️</div>
        <h2 className="text-2xl font-black text-white">{t.battlePassPage.title}</h2>
        <p className="text-muted-foreground max-w-xs">{t.battlePassPage.signInDesc}</p>
        <Button className="bg-primary text-white font-bold px-8" onClick={login}>{t.battlePassPage.signInBtn}</Button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">{t.battlePassPage.loading}</span>
        </div>
      </div>
    );
  }

  const { seasonXp, currentTier, isPremium, claimedFreeTiers, claimedPremiumTiers, tiers } = data;
  const xpForNextTier = (currentTier + 1) * XP_PER_TIER;
  const xpInCurrentTier = seasonXp - currentTier * XP_PER_TIER;
  const progressPercent = currentTier >= 30 ? 100 : Math.round((xpInCurrentTier / XP_PER_TIER) * 100);
  const claimableCount = tiers.filter(t => {
    const unlocked = t.tier <= currentTier;
    const hasUnclaimedFree = unlocked && !claimedFreeTiers.includes(t.tier);
    const hasUnclaimedPremium = isPremium && unlocked && !claimedPremiumTiers.includes(t.tier);
    return hasUnclaimedFree || hasUnclaimedPremium;
  }).length;

  return (
    <div className="flex-1 w-full">
      {/* Sticky header */}
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-4">
          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg">
                <span className="text-lg">⚔️</span>
              </div>
              <div>
                <h1 className="text-xl font-black text-white leading-none">{t.battlePassPage.title}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{t.battlePassPage.seasonTiers.replace("{season}", data.seasonName)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {claimableCount > 0 && (
                <div className="px-2 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-bold">
                  {t.battlePassPage.toClaim.replace("{count}", String(claimableCount))}
                </div>
              )}
              <div className="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-300">{seasonXp.toLocaleString()} XP</span>
              </div>
            </div>
          </div>

          {/* XP bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 font-mono w-10 text-right shrink-0">T{currentTier}</span>
            <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg, #6366f1, #06b6d4)" }}
              />
              {progressPercent > 10 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/70">
                  {progressPercent}%
                </span>
              )}
            </div>
            <span className="text-xs text-white/40 font-mono w-10 shrink-0">T{Math.min(30, currentTier + 1)}</span>
          </div>

          {/* Watch Ad + Premium row */}
          <div className="flex items-center gap-2 mt-3">
            {/* Watch Ad for XP */}
            <button
              onClick={handleWatchAd}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-500/25 bg-indigo-500/8 hover:bg-indigo-500/15 transition-colors text-left"
            >
              <div className="h-7 w-7 rounded-lg bg-indigo-600/30 flex items-center justify-center shrink-0">
                <Zap className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-300 leading-none">{t.battlePassPage.watchAdXp.replace("{xp}", String(AD_XP))}</p>
                <p className="text-[10px] text-white/35 mt-0.5">{t.battlePassPage.watchAdXpDesc}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-indigo-400/50 shrink-0" />
            </button>

            {/* Premium upgrade */}
            {!isPremium ? (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-500/8 hover:bg-amber-500/15 transition-colors shrink-0"
              >
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                <div className="text-left">
                  <p className="text-[10px] font-black text-amber-300 leading-none">{t.battlePassPage.premium}</p>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <Gem className="h-2.5 w-2.5 text-amber-400" />
                    <span className="text-[9px] text-amber-400/70 font-bold">{PREMIUM_COST.toLocaleString()}</span>
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-400/30 bg-amber-500/8 shrink-0">
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[10px] font-black text-amber-300">{t.battlePassPage.premium}</span>
                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* XP Sources Guide */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {[
            { emoji: "✅", label: t.battlePassPage.correctAnswer, xp: "+10 XP" },
            { emoji: "🏁", label: t.battlePassPage.quizComplete, xp: "+25 XP" },
            { emoji: "🔥", label: t.battlePassPage.dailyStreak, xp: "+20 XP" },
            { emoji: "📺", label: t.battlePassPage.watchAd, xp: "+50 XP" },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 flex flex-col gap-1">
              <span className="text-lg">{item.emoji}</span>
              <p className="text-[10px] text-white/50 font-medium">{item.label}</p>
              <p className="text-xs font-black text-indigo-300">{item.xp}</p>
            </div>
          ))}
        </div>

        {/* Tier grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {tiers.map(tier => (
            <TierCard
              key={tier.tier}
              tier={tier}
              xp={seasonXp}
              currentTier={currentTier}
              isPremium={isPremium}
              claimedFree={claimedFreeTiers.includes(tier.tier)}
              claimedPremium={claimedPremiumTiers.includes(tier.tier)}
              onClaim={handleClaim}
              claiming={claiming}
            />
          ))}
        </div>

        {currentTier >= 30 && (
          <div className="mt-8 text-center py-8 rounded-2xl border border-amber-400/30 bg-amber-500/5">
            <div className="text-4xl mb-2">🏆</div>
            <h3 className="text-xl font-black text-amber-300">{t.battlePassPage.seasonComplete}</h3>
            <p className="text-white/50 text-sm mt-1">{t.battlePassPage.seasonCompleteDesc}</p>
          </div>
        )}
      </div>

      {showAdModal && (
        <WatchAdModal
          xpMode={AD_XP}
          onComplete={async () => {
            await handleAdComplete();
            setShowAdModal(false);
          }}
          onClose={() => setShowAdModal(false)}
        />
      )}
    </div>
  );
}
