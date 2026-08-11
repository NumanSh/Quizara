import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Tv2, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { PowerUpItem } from "./PowerUpBar";
import { getPowerUpConfig } from "./PowerUpBar";
import { authFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface PreGamePowerUpModalProps {
  isOpen: boolean;
  onPlay: (powerUps: PowerUpItem[]) => void;
  isAuthenticated: boolean;
  allowedEffects?: string[];
  theme?: "default" | "blitz" | "arena";
}

export default function PreGamePowerUpModal({
  isOpen, onPlay, isAuthenticated, allowedEffects,
  theme = "default",
}: PreGamePowerUpModalProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [powerUps, setPowerUps] = useState<PowerUpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [adProgress, setAdProgress] = useState(0);

  useEffect(() => {
    if (isOpen && isAuthenticated) fetchInventory();
  }, [isOpen, isAuthenticated]);

  async function fetchInventory() {
    try {
      const res = await authFetch("/api/marketplace/inventory", { credentials: "include" });
      const data = await res.json();
      const pus = (Array.isArray(data) ? data : []).filter(
        (item: any) => item.type === "powerup" && item.quantity > 0
          && (!allowedEffects || allowedEffects.includes(item.effect))
      );
      setPowerUps(pus.map((item: any) => ({
        itemId: item.itemId, effect: item.effect, emoji: item.emoji,
        name: item.name, quantity: item.quantity,
      })));
    } catch {}
  }

  async function handleWatchAd() {
    setWatchingAd(true);
    setAdProgress(0);
    await new Promise<void>((resolve) => {
      let p = 0;
      const iv = setInterval(() => {
        p += 4;
        setAdProgress(Math.min(p, 100));
        if (p >= 100) { clearInterval(iv); resolve(); }
      }, 120);
    });
    try {
      setLoading(true);
      const res = await authFetch("/api/powerups/watch-ad", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.powerup) {
        toast({
          title: `${data.powerup.emoji} ${t.quiz.powerUpAdded}`,
          description: t.quiz.powerUpAddedHint,
        });
        await fetchInventory();
      } else {
        toast({ title: t.quiz.powerUpError, variant: "destructive" });
      }
    } catch {
      toast({ title: t.quiz.pleaseTryAgain, variant: "destructive" });
    } finally {
      setWatchingAd(false);
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const themeIcon =
    theme === "blitz" ? "⚡" : theme === "arena" ? "⚔️" : "✨";

  const themeTitle =
    theme === "blitz" ? t.powerUpBar.blitzTheme :
    theme === "arena" ? t.powerUpBar.arenaTheme :
    t.quiz.powerUpTitle;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/88 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="power-up-title" className="flex max-h-[92vh] w-full flex-col overflow-hidden border border-white/15 bg-background sm:max-w-lg">
        {/* Header */}
        <div className="relative grid grid-cols-[auto_1fr] gap-4 border-b border-white/10 p-5 text-left rtl:text-right sm:p-6">
          <div className="grid h-12 w-12 place-items-center border border-primary/30 text-2xl text-primary">{themeIcon}</div>
          <div><p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-primary">{t.powerUpBar.loadoutLabel}</p><h2 id="power-up-title" className="text-2xl font-black tracking-[-0.04em]">{themeTitle}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{t.quiz.powerUpHint}</p></div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Inventory */}
          {isAuthenticated ? (
            powerUps.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  {t.quiz.yourPowerUps}
                </p>
                <div className="space-y-2">
                  {powerUps.map(pu => {
                    const cfg = getPowerUpConfig(t)[pu.effect] ?? { label: pu.name, emoji: pu.emoji, description: "", color: "" };
                    return (
                      <div
                        key={pu.effect}
                        className="flex items-center gap-3 border-b border-white/10 p-3 last:border-b-0"
                      >
                        <span className="text-2xl shrink-0 leading-none">{pu.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-tight">{cfg.label} — {pu.name}</p>
                          <p className="text-xs text-muted-foreground leading-snug">{cfg.description}</p>
                        </div>
                        <span className="text-sm font-black text-primary shrink-0">×{pu.quantity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1 border border-dashed border-white/15 p-5 text-center">
                <p className="text-2xl">🎒</p>
                <p className="text-sm font-semibold">{t.quiz.noPowerUps}</p>
                <p className="text-xs text-muted-foreground">{t.quiz.noPowerUpsHint}</p>
              </div>
            )
          ) : (
            <div className="border border-white/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">{t.quiz.signInPowerUps}</p>
            </div>
          )}

          {/* Watch Ad */}
          {isAuthenticated && (
            <button
              onClick={handleWatchAd}
              disabled={watchingAd || loading}
              className={cn(
                "focus-ring flex min-h-14 w-full items-center gap-3 border p-3 transition-colors active:bg-primary/10",
                "border-white/15 hover:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center border border-primary/30">
                <Tv2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold">{watchingAd ? t.quiz.watchingAd : t.quiz.watchAdPowerUp}</p>
                <p className="text-xs text-muted-foreground">{t.quiz.freePowerUp}</p>
              </div>
              {watchingAd ? (
                <div className="w-14 h-1.5 bg-muted/30 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-indigo-400 transition-all duration-100 rounded-full"
                    style={{ width: `${adProgress}%` }}
                  />
                </div>
              ) : (
                <span className="shrink-0 text-xs text-primary">{t.quiz.free}</span>
              )}
            </button>
          )}

          {/* Marketplace link */}
          <a
            href="/marketplace"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            {t.quiz.marketplacePowerUps}
          </a>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 space-y-2 shrink-0">
          <Button
            onClick={() => onPlay(powerUps)}
            size="lg"
            className="h-12 w-full rounded-none text-base font-black"
          >
            <Zap className="mr-2 h-5 w-5" />
            {t.quiz.playNow}
          </Button>
        </div>
      </div>
    </div>
  );
}
