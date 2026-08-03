import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Tv2, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { PowerUpItem } from "./PowerUpBar";
import { POWER_UP_CONFIG } from "./PowerUpBar";
import { authFetch } from "@/lib/api";

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
          title: `${data.powerup.emoji} ${data.powerup.name} added!`,
          description: "Power-up added to your inventory.",
        });
        await fetchInventory();
      } else {
        toast({ title: "Couldn't get a power-up", variant: "destructive" });
      }
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setWatchingAd(false);
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const themeGradient =
    theme === "blitz"  ? "from-orange-500/20 to-red-500/15 border-orange-500/30" :
    theme === "arena"  ? "from-secondary/20 to-primary/15 border-secondary/30" :
                         "from-violet-500/20 to-primary/15 border-primary/30";

  const themeIcon =
    theme === "blitz" ? "⚡" : theme === "arena" ? "⚔️" : "✨";

  const themeTitle =
    theme === "blitz" ? "Power up your Blitz!" :
    theme === "arena" ? "Arm yourself for Arena!" :
    "Power up before you play!";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={cn("bg-gradient-to-r border-b border-border p-5 text-center relative", themeGradient)}>
          <div className="h-14 w-14 rounded-2xl bg-background/40 border border-white/10 flex items-center justify-center mx-auto mb-3 text-3xl">
            {themeIcon}
          </div>
          <h2 className="text-lg font-black">{themeTitle}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Power-ups activate automatically during the game.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {/* Inventory */}
          {isAuthenticated ? (
            powerUps.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Your Power-Ups
                </p>
                <div className="space-y-2">
                  {powerUps.map(pu => {
                    const cfg = POWER_UP_CONFIG[pu.effect] ?? { label: pu.name, emoji: pu.emoji, description: "", color: "" };
                    return (
                      <div
                        key={pu.effect}
                        className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 p-3"
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
              <div className="rounded-xl border border-dashed border-border p-5 text-center space-y-1">
                <p className="text-2xl">🎒</p>
                <p className="text-sm font-semibold">No power-ups yet</p>
                <p className="text-xs text-muted-foreground">Watch an ad below to get one free!</p>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-border bg-muted/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Sign in to use power-ups.</p>
            </div>
          )}

          {/* Watch Ad */}
          {isAuthenticated && (
            <button
              onClick={handleWatchAd}
              disabled={watchingAd || loading}
              className={cn(
                "w-full rounded-xl p-3 flex items-center gap-3 border transition-all active:scale-[0.98]",
                "border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0">
                <Tv2 className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold">{watchingAd ? "Watching ad…" : "Watch an Ad"}</p>
                <p className="text-xs text-muted-foreground">Get 1 free random power-up</p>
              </div>
              {watchingAd ? (
                <div className="w-14 h-1.5 bg-muted/30 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-indigo-400 transition-all duration-100 rounded-full"
                    style={{ width: `${adProgress}%` }}
                  />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">FREE</span>
              )}
            </button>
          )}

          {/* Marketplace link */}
          <a
            href="/marketplace"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Buy more power-ups in the Marketplace
          </a>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 space-y-2 shrink-0">
          <Button
            onClick={() => onPlay(powerUps)}
            size="lg"
            className="w-full font-black text-base h-12"
          >
            <Zap className="mr-2 h-5 w-5" />
            Play Now
          </Button>
        </div>
      </div>
    </div>
  );
}
