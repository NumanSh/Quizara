import { useState } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  useListMarketplaceItems,
  useGetInventory,
  usePurchaseItem,
  useGetProfile,
  getGetProfileQueryKey,
  getGetInventoryQueryKey,
  getListMarketplaceItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Gem, ShoppingBag, Package, Check, AlertCircle, Zap, Tv2,
  User, Palette, Sparkles, Frame, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { WatchAdModal } from "@/components/WatchAdModal";
import {
  FRAME_DEFS, BG_DEFS, COLOR_DEFS,
  getFrameStyle, getBgStyle, getUsernameStyle,
} from "@/lib/cosmetics";
import { authFetch } from "@/lib/api";

// ─── Power-up metadata ────────────────────────────────────────────────────────
const EFFECT_LABELS: Record<string, string> = {
  fifty_fifty:   "Eliminates 2 wrong answers",
  freeze_timer:  "Freezes the timer for 10 seconds",
  extra_time:    "Adds 15 extra seconds",
  skip_question: "Skip any question penalty-free",
  double_score:  "Doubles points for one question",
  lucky_wheel:   "Spin for a random bonus",
  streak_freeze: "Protects your streak for one missed day",
};
const EFFECT_COLORS: Record<string, string> = {
  fifty_fifty:   "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
  freeze_timer:  "from-sky-500/20 to-blue-500/20 border-sky-500/30",
  extra_time:    "from-green-500/20 to-emerald-500/20 border-green-500/30",
  skip_question: "from-orange-500/20 to-amber-500/20 border-orange-500/30",
  double_score:  "from-purple-500/20 to-indigo-500/20 border-purple-500/30",
  lucky_wheel:   "from-pink-500/20 to-rose-500/20 border-pink-500/30",
  streak_freeze: "from-cyan-500/20 to-teal-500/20 border-cyan-500/30",
};
const COINS_PER_AD = 75;

// ─── Avatar frame preview ────────────────────────────────────────────────────
function FramePreview({ effectKey, size = 56 }: { effectKey: string; size?: number }) {
  const style = getFrameStyle(effectKey);
  return (
    <div
      style={{ width: size, height: size, borderRadius: "50%", background: "hsl(var(--muted)/0.4)", display: "flex", alignItems: "center", justifyContent: "center", ...style }}
    >
      <User style={{ width: size * 0.45, height: size * 0.45, color: "hsl(var(--muted-foreground))" }} />
    </div>
  );
}

// ─── Background preview ──────────────────────────────────────────────────────
function BgPreview({ effectKey }: { effectKey: string }) {
  const def = BG_DEFS[effectKey];
  if (!def) return null;
  return (
    <div
      className="w-full h-16 rounded-xl border border-border overflow-hidden relative"
      style={{ background: def.gradient || "hsl(var(--muted)/0.2)" }}
    >
      <div className="absolute inset-0 flex items-center justify-center gap-2">
        {def.previewColors.map((c, i) => (
          <div key={i} className="h-4 w-4 rounded-full border border-white/20" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

// ─── Color preview ───────────────────────────────────────────────────────────
function ColorPreview({ effectKey }: { effectKey: string }) {
  const def = COLOR_DEFS[effectKey];
  if (!def) return null;
  const style = getUsernameStyle(effectKey);
  return (
    <span className="text-xl font-black" style={style}>
      Quizara
    </span>
  );
}

// ─── Cosmetic card ───────────────────────────────────────────────────────────
function CosmeticCard({
  item, owned, equipped, canAfford, purchasing, equipping,
  onBuy, onEquip, onUnequip,
}: {
  item: any;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  purchasing: boolean;
  equipping: boolean;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}) {
  const isFrame = item.effect?.startsWith("frame_");
  const isBg = item.effect?.startsWith("bg_");
  const isColor = item.effect?.startsWith("color_");

  return (
    <div className={cn(
      "relative rounded-2xl border bg-card p-4 flex flex-col gap-3 transition-all duration-200 hover:shadow-lg hover:shadow-black/20",
      equipped
        ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
        : "border-border hover:border-border/80"
    )}>
      {equipped && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px] px-1.5 py-0 h-4">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Equipped
          </Badge>
        </div>
      )}

      {/* Visual Preview */}
      <div className="flex items-center justify-center py-2">
        {isFrame && <FramePreview effectKey={item.effect} size={64} />}
        {isBg && <BgPreview effectKey={item.effect} />}
        {isColor && <ColorPreview effectKey={item.effect} />}
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-lg leading-none">{item.emoji}</span>
          <h3 className="font-bold text-sm leading-tight">{item.name}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
      </div>

      {/* Price + Actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
        <div className="flex items-center gap-1">
          <Gem className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-black text-sm text-amber-300">{item.price.toLocaleString()}</span>
        </div>

        {owned ? (
          equipped ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onUnequip}
              disabled={equipping}
              className="h-7 text-xs px-2.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              {equipping ? "..." : "Unequip"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onEquip}
              disabled={equipping}
              className="h-7 text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {equipping ? "..." : "Equip"}
            </Button>
          )
        ) : (
          <Button
            size="sm"
            disabled={!canAfford || purchasing}
            onClick={onBuy}
            className={cn(
              "h-7 text-xs px-2.5 font-bold",
              canAfford ? "bg-amber-500 hover:bg-amber-400 text-black" : "opacity-50 cursor-not-allowed"
            )}
          >
            {purchasing ? "..." : !canAfford ? "Need coins" : "Buy"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Marketplace() {
  const { isAuthenticated, login } = useSupabaseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [showCoinAd, setShowCoinAd] = useState(false);
  const [adClaiming, setAdClaiming] = useState(false);

  const { data: profile } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: isAuthenticated },
  });
  const { data: items = [], isLoading: itemsLoading } = useListMarketplaceItems({
    query: { queryKey: getListMarketplaceItemsQueryKey() },
  });
  const { data: inventory = [], isLoading: inventoryLoading } = useGetInventory({
    query: { queryKey: getGetInventoryQueryKey(), enabled: isAuthenticated },
  });

  const purchaseMutation = usePurchaseItem();

  const coins = profile?.coins ?? 0;
  const activeFrame = (profile as any)?.activeAvatarFrame ?? null;
  const activeBg = (profile as any)?.activeProfileBg ?? null;
  const activeColor = (profile as any)?.activeUsernameColor ?? null;

  const ownedIds = new Set(inventory.map((i) => i.itemId));
  const getInventoryQty = (itemId: string) => inventory.find((i) => i.itemId === itemId)?.quantity ?? 0;

  const powerups = items.filter((i) => i.type === "powerup");
  const frames   = items.filter((i) => i.effect?.startsWith("frame_"));
  const bgs      = items.filter((i) => i.effect?.startsWith("bg_"));
  const colors   = items.filter((i) => i.effect?.startsWith("color_"));

  const handlePurchase = async (item: any) => {
    if (!isAuthenticated) { login(); return; }
    if (coins < item.price) {
      toast({ title: "Not enough coins", description: `You need ${item.price - coins} more coins.`, variant: "destructive" });
      return;
    }
    setPurchasing(item.id);
    try {
      const result = await purchaseMutation.mutateAsync({ data: { itemId: item.id } });
      toast({ title: "Purchase successful!", description: `You bought ${result.itemName}. ${result.remainingCoins} coins remaining.` });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventoryQueryKey() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Purchase failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setPurchasing(null);
    }
  };

  const handleEquip = async (item: any, unequip = false) => {
    if (!isAuthenticated) { login(); return; }
    setEquipping(item.id);
    try {
      const res = await authFetch("/api/marketplace/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemId: item.id, unequip }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to equip");
      }
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      toast({
        title: unequip ? "Cosmetic unequipped" : `${item.name} equipped!`,
        description: unequip ? "Removed from your profile." : "Your profile now shows this cosmetic.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setEquipping(null);
    }
  };

  const handleWatchAdForCoins = () => {
    if (!isAuthenticated) { login(); return; }
    setShowCoinAd(true);
  };
  const handleCoinAdComplete = async () => {
    setAdClaiming(true);
    try {
      const res = await authFetch("/api/streak/watch-ad-coins", { method: "POST", credentials: "include" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        toast({ title: `+${COINS_PER_AD} Coins!`, description: "Coins added to your balance." });
      }
    } finally {
      setAdClaiming(false);
      setShowCoinAd(false);
    }
  };

  const isItemEquipped = (item: any) => {
    if (item.effect?.startsWith("frame_")) return activeFrame === item.effect;
    if (item.effect?.startsWith("bg_"))    return activeBg === item.effect;
    if (item.effect?.startsWith("color_")) return activeColor === item.effect;
    return false;
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <ShoppingBag className="h-8 w-8 text-primary" />
              Marketplace
            </h1>
            <p className="text-muted-foreground mt-1">
              Power-ups, avatar frames, profile themes & username colors
            </p>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500/10 border border-amber-400/20 self-start sm:self-center">
            <Gem className="h-6 w-6 text-amber-400" />
            <div>
              <p className="text-xs text-amber-300/70 leading-none">Your Balance</p>
              <p className="text-2xl font-black text-amber-300 leading-tight">{coins.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Watch Ad banner */}
        <div className="mt-4 rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-500/10 to-yellow-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-11 w-11 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Tv2 className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">Watch an Ad → Earn Free Coins</p>
              <p className="text-xs text-muted-foreground">
                +{COINS_PER_AD} coins per ad · <span className="text-amber-400 font-semibold">∞ Unlimited</span>
              </p>
            </div>
          </div>
          <Button
            onClick={handleWatchAdForCoins}
            disabled={adClaiming}
            className="font-bold shrink-0 gap-2 bg-amber-500 hover:bg-amber-400 text-black"
          >
            <Tv2 className="h-4 w-4" />
            Watch Ad (+{COINS_PER_AD} coins)
          </Button>
        </div>

        <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>
            <strong className="text-foreground">Earn 5 coins</strong> per correct answer. Cosmetics are <strong className="text-foreground">pure flair</strong> — no pay-to-win advantage.
          </span>
        </div>
      </div>

      <Tabs defaultValue="frames">
        <TabsList className="mb-6 bg-card border border-border flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="frames" className="gap-1.5 text-xs sm:text-sm">
            <Frame className="h-3.5 w-3.5" /> Avatar Frames
          </TabsTrigger>
          <TabsTrigger value="backgrounds" className="gap-1.5 text-xs sm:text-sm">
            <Palette className="h-3.5 w-3.5" /> Backgrounds
          </TabsTrigger>
          <TabsTrigger value="colors" className="gap-1.5 text-xs sm:text-sm">
            <Sparkles className="h-3.5 w-3.5" /> Name Colors
          </TabsTrigger>
          <TabsTrigger value="powerups" className="gap-1.5 text-xs sm:text-sm">
            <Zap className="h-3.5 w-3.5" /> Power-Ups
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5 text-xs sm:text-sm">
            <Package className="h-3.5 w-3.5" /> Inventory
            {inventory.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 h-4">
                {inventory.reduce((s, i) => s + i.quantity, 0)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── AVATAR FRAMES ── */}
        <TabsContent value="frames">
          <CosmeticSectionHeader
            icon="🖼️"
            title="Avatar Frames"
            desc="Equip a frame around your profile avatar — visible on leaderboards and your profile."
            active={activeFrame}
            activeLabel={activeFrame ? (FRAME_DEFS[activeFrame]?.label ?? activeFrame) : null}
            activeEmoji={activeFrame ? FRAME_DEFS[activeFrame]?.emoji : null}
          />
          {itemsLoading ? <CosmeticSkeleton /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {frames.map((item) => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  owned={ownedIds.has(item.id)}
                  equipped={isItemEquipped(item)}
                  canAfford={coins >= item.price}
                  purchasing={purchasing === item.id}
                  equipping={equipping === item.id}
                  onBuy={() => handlePurchase(item)}
                  onEquip={() => handleEquip(item)}
                  onUnequip={() => handleEquip(item, true)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── BACKGROUNDS ── */}
        <TabsContent value="backgrounds">
          <CosmeticSectionHeader
            icon="🌅"
            title="Profile Backgrounds"
            desc="A subtle gradient overlay on your profile page — personalise your space."
            active={activeBg}
            activeLabel={activeBg ? (BG_DEFS[activeBg]?.label ?? activeBg) : null}
            activeEmoji={activeBg ? BG_DEFS[activeBg]?.emoji : null}
          />
          {itemsLoading ? <CosmeticSkeleton /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {bgs.map((item) => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  owned={ownedIds.has(item.id)}
                  equipped={isItemEquipped(item)}
                  canAfford={coins >= item.price}
                  purchasing={purchasing === item.id}
                  equipping={equipping === item.id}
                  onBuy={() => handlePurchase(item)}
                  onEquip={() => handleEquip(item)}
                  onUnequip={() => handleEquip(item, true)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── NAME COLORS ── */}
        <TabsContent value="colors">
          <CosmeticSectionHeader
            icon="✨"
            title="Username Colors"
            desc="Make your display name pop with a custom color — shown everywhere your name appears."
            active={activeColor}
            activeLabel={activeColor ? (COLOR_DEFS[activeColor]?.label ?? activeColor) : null}
            activeEmoji={activeColor ? COLOR_DEFS[activeColor]?.emoji : null}
          />
          {itemsLoading ? <CosmeticSkeleton /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {colors.map((item) => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  owned={ownedIds.has(item.id)}
                  equipped={isItemEquipped(item)}
                  canAfford={coins >= item.price}
                  purchasing={purchasing === item.id}
                  equipping={equipping === item.id}
                  onBuy={() => handlePurchase(item)}
                  onEquip={() => handleEquip(item)}
                  onUnequip={() => handleEquip(item, true)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── POWER-UPS ── */}
        <TabsContent value="powerups">
          {itemsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-52 rounded-2xl bg-card animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {powerups.map((item) => {
                const owned = getInventoryQty(item.id);
                const canAfford = coins >= item.price;
                const gradientClass = EFFECT_COLORS[item.effect] ?? "from-gray-500/20 to-gray-600/20 border-gray-500/30";
                const isPurchasing = purchasing === item.id;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "relative rounded-2xl border bg-gradient-to-br p-5 flex flex-col gap-3 transition-all duration-200",
                      gradientClass, "hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-4xl">{item.emoji}</span>
                      {owned > 0 && (
                        <Badge className="text-xs border bg-white/10 text-white border-white/20">
                          <Check className="h-3 w-3 mr-1" /> Owned ×{owned}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">{item.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">
                      {EFFECT_LABELS[item.effect] ?? item.description}
                    </p>
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-1.5">
                        <Gem className="h-4 w-4 text-amber-400" />
                        <span className="font-black text-lg text-amber-300">{item.price.toLocaleString()}</span>
                      </div>
                      <Button
                        size="sm"
                        disabled={!isAuthenticated || !canAfford || isPurchasing}
                        onClick={() => handlePurchase(item)}
                        className={cn("font-bold transition-all", canAfford && isAuthenticated ? "bg-primary text-primary-foreground hover:bg-primary/90" : "opacity-50 cursor-not-allowed")}
                      >
                        {!isAuthenticated ? "Sign in" : !canAfford ? "Need coins" : isPurchasing ? "..." : "Buy"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── INVENTORY ── */}
        <TabsContent value="inventory">
          {!isAuthenticated ? (
            <div className="text-center py-20">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">Sign in to view your inventory</p>
              <Button onClick={() => login()}>Sign in</Button>
            </div>
          ) : inventoryLoading ? (
            <CosmeticSkeleton />
          ) : inventory.length === 0 ? (
            <div className="text-center py-20">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-xl font-bold mb-2">Your inventory is empty</p>
              <p className="text-muted-foreground mb-6">Buy power-ups or cosmetics to see them here!</p>
              <div className="flex items-center justify-center gap-2 text-amber-400">
                <Gem className="h-5 w-5" />
                <span className="font-bold">{coins} coins available</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {inventory.map((item) => {
                const isCos = item.type === "cosmetic";
                const equipped = isItemEquipped(item);
                const gradientClass = EFFECT_COLORS[item.effect] ?? (isCos ? "from-violet-500/20 to-purple-500/20 border-violet-500/30" : "from-gray-500/20 to-gray-600/20 border-gray-500/30");
                return (
                  <div key={item.id} className={cn("rounded-2xl border bg-gradient-to-br p-5 flex flex-col gap-3", gradientClass, equipped && "ring-1 ring-primary/40")}>
                    <div className="flex items-center justify-between">
                      <span className="text-4xl">{item.emoji}</span>
                      <div className="flex items-center gap-1.5">
                        {equipped && <Badge className="bg-primary/20 text-primary border-primary/40 text-xs">Equipped</Badge>}
                        {item.quantity > 1 && <Badge className="bg-white/10 text-white border-white/20 text-sm font-bold">×{item.quantity}</Badge>}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{item.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground flex-1">{EFFECT_LABELS[item.effect] ?? item.description}</p>
                    {isCos && (
                      <div className="flex gap-2 mt-auto pt-2 border-t border-white/10">
                        {equipped ? (
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleEquip(item, true)} disabled={equipping === item.id}>
                            {equipping === item.id ? "..." : "Unequip"}
                          </Button>
                        ) : (
                          <Button size="sm" className="flex-1 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleEquip(item)} disabled={equipping === item.id}>
                            {equipping === item.id ? "..." : "Equip"}
                          </Button>
                        )}
                      </div>
                    )}
                    {!isCos && (
                      <div className="flex items-center gap-1 mt-auto pt-1 border-t border-white/10">
                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Used automatically during quizzes</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showCoinAd && (
        <WatchAdModal
          coinsMode={COINS_PER_AD}
          onComplete={handleCoinAdComplete}
          onClose={() => setShowCoinAd(false)}
        />
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function CosmeticSectionHeader({ icon, title, desc, active, activeLabel, activeEmoji }: {
  icon: string; title: string; desc: string;
  active: string | null; activeLabel: string | null; activeEmoji: string | null | undefined;
}) {
  return (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <span>{icon}</span> {title}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
      {active && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary shrink-0">
          {activeEmoji && <span>{activeEmoji}</span>}
          Equipped: {activeLabel}
        </div>
      )}
    </div>
  );
}

function CosmeticSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => <div key={i} className="h-44 rounded-2xl bg-card animate-pulse" />)}
    </div>
  );
}
