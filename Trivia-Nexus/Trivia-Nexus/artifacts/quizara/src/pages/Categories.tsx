import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronRight, Heart, Link2, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListCategoriesQueryKey, useListCategories } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { PLAYER_LIBRARY_QUERY_KEY, type PlayerLibrary, updateCategoryFavorite, usePlayerLibrary } from "@/hooks/usePlayerLibrary";
import { authFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const CATEGORY_IMAGES: Record<string, string> = {
  "anime": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&q=85",
  "anime & manga": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&q=85",
  "geography": "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=1000&q=85",
  "cinema": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1000&q=85",
  "cinema & tv": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1000&q=85",
  "science": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1000&q=85",
  "history": "https://images.unsplash.com/photo-1564419320461-6870880221ad?w=1000&q=85",
  "sports": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1000&q=85",
  "pop culture": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1000&q=85",
  "general knowledge": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1000&q=85",
  "technology": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&q=85",
  "tech": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&q=85",
  "music": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1000&q=85",
  "art": "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1000&q=85",
  "food": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1000&q=85",
  "nature": "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1000&q=85",
  "politics": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1000&q=85",
  "literature": "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1000&q=85",
};

function getCategoryImage(name: string) {
  const normalized = name.toLowerCase();
  const match = Object.entries(CATEGORY_IMAGES).find(([key]) => normalized.includes(key) || key.includes(normalized));
  return match?.[1] ?? null;
}

interface WorldCardProps {
  category: any;
  index: number;
  onOpen: () => void;
  onChallenge: (event: React.MouseEvent) => void;
  onFavorite: (event: React.MouseEvent) => void;
  challenging: boolean;
  favoritePending: boolean;
  isFavorite: boolean;
  allowFavorite: boolean;
  reducedMotion: boolean | null;
  favoriteActionLabel: string;
}

function WorldCard({ category, index, onOpen, onChallenge, onFavorite, challenging, favoritePending, isFavorite, allowFavorite, reducedMotion, favoriteActionLabel }: WorldCardProps) {
  const { t } = useI18n();
  const imageUrl = getCategoryImage(category.name);
  const questionCount = Number(category.questionCount ?? 0);
  const levelCount = Math.floor(questionCount / 3);

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: (index % 6) * 0.035, ease: [0.16, 1, 0.3, 1] }}
      className="group relative min-h-[156px] overflow-hidden border border-white/10 bg-card sm:min-h-[172px]"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[0.55] transition duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.045] group-hover:saturate-90" loading="lazy" />
      ) : (
        <div className="editorial-grid absolute inset-0 grid place-items-center text-6xl font-extrabold text-white/8">{category.icon || String(index + 1).padStart(2, "0")}</div>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,hsl(var(--background)/0.35),hsl(var(--background)/0.92)_78%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent" />

      <button type="button" onClick={onOpen} aria-label={t.categoriesLibrary.openLabel.replace("{name}", category.name)} className="focus-ring absolute inset-0 z-10 cursor-pointer">
        <span className="sr-only">{t.categoriesLibrary.openSr.replace("{name}", category.name)}</span>
      </button>

      <div className="pointer-events-none relative z-0 flex min-h-[156px] flex-col justify-between p-3.5 sm:min-h-[172px] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="bg-primary px-2 py-1 text-[8px] font-bold uppercase tracking-[0.18em] text-primary-foreground">{t.categoriesLibrary.world.replace("{n}", String(index + 1).padStart(2, "0"))}</span>
          {!allowFavorite && <span className="grid h-9 w-9 place-items-center border border-white/20 bg-background/45 text-foreground backdrop-blur-sm transition-all duration-300 group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"><ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-45" /></span>}
        </div>
        <div className="pr-10 rtl:pl-10 rtl:pr-0">
          <h2 className="line-clamp-2 text-lg font-extrabold leading-[1.02] tracking-[-0.045em] transition-colors group-hover:text-primary sm:text-2xl">{category.name}</h2>
          <p className="mt-2 text-[8px] font-bold uppercase tracking-[0.14em] text-white/55 sm:text-[9px]">{questionCount > 0 ? t.categoriesLibrary.levelsQuestions.replace("{levels}", String(levelCount)).replace("{questions}", String(questionCount)) : t.categoriesLibrary.openField}</p>
        </div>
      </div>

      {allowFavorite && (
        <button type="button" onClick={onFavorite} disabled={favoritePending} aria-label={`${favoriteActionLabel} ${category.name}`} aria-pressed={isFavorite} className={`focus-ring absolute right-2 top-2 z-20 grid h-11 w-11 place-items-center border backdrop-blur-sm transition-all sm:right-3 sm:top-3 rtl:left-2 rtl:right-auto sm:rtl:left-3 ${isFavorite ? "border-primary bg-primary text-primary-foreground" : "border-white/20 bg-background/55 text-white/65 hover:border-primary hover:text-primary"}`}>
          {favoritePending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" /> : <Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />}
        </button>
      )}

      <button type="button" onClick={onChallenge} disabled={challenging} aria-label={t.categoriesLibrary.challengeAria.replace("{name}", category.name)} className="focus-ring absolute bottom-2 right-2 z-20 grid h-11 w-11 place-items-center text-white/60 transition-colors hover:text-secondary disabled:opacity-50 sm:bottom-3 sm:right-3 rtl:left-2 rtl:right-auto sm:rtl:left-3">
        {challenging ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" /> : <Link2 className="h-3.5 w-3.5" />}
      </button>
    </motion.article>
  );
}

export default function Categories() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"all" | "favorites">("all");
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();
  const { isAuthenticated } = useSupabaseAuth();
  const parentId = new URLSearchParams(window.location.search).get("parent") || undefined;
  const { data: playerLibrary, isLoading: libraryLoading } = usePlayerLibrary(isAuthenticated && !parentId);
  const { data: allCategories, isLoading } = useListCategories(
    { parentId },
    { query: { queryKey: getListCategoriesQueryKey({ parentId }), enabled: true } }
  );
  const favoriteIds = useMemo(() => new Set(playerLibrary?.favoriteCategoryIds ?? []), [playerLibrary?.favoriteCategoryIds]);

  const handleFavorite = async (event: React.MouseEvent, categoryId: string, categoryName: string) => {
    event.stopPropagation();
    if (!isAuthenticated) {
      toast({ title: t.categoriesLibrary.signInTitle, description: t.categoriesLibrary.signInDescription });
      return;
    }

    const wasFavorite = favoriteIds.has(categoryId);
    const previousLibrary = queryClient.getQueryData<PlayerLibrary>(PLAYER_LIBRARY_QUERY_KEY);
    setFavoritePendingId(categoryId);
    queryClient.setQueryData<PlayerLibrary>(PLAYER_LIBRARY_QUERY_KEY, current => ({
      favoriteCategoryIds: wasFavorite
        ? (current?.favoriteCategoryIds ?? []).filter(id => id !== categoryId)
        : Array.from(new Set([categoryId, ...(current?.favoriteCategoryIds ?? [])])),
      continuePlaying: current?.continuePlaying ?? null,
    }));

    try {
      await updateCategoryFavorite(categoryId, !wasFavorite);
      toast({ title: wasFavorite ? t.categoriesLibrary.removedFromFavorites : t.categoriesLibrary.addedToFavorites, description: categoryName });
    } catch {
      queryClient.setQueryData(PLAYER_LIBRARY_QUERY_KEY, previousLibrary);
      toast({ title: t.categoriesLibrary.couldNotUpdateFavorites, description: t.categoriesLibrary.tryAgain, variant: "destructive" });
    } finally {
      setFavoritePendingId(null);
      queryClient.invalidateQueries({ queryKey: PLAYER_LIBRARY_QUERY_KEY });
    }
  };

  const handleChallenge = async (event: React.MouseEvent, categoryId: string, categoryName: string) => {
    event.stopPropagation();
    setChallengingId(categoryId);
    try {
      const response = await authFetch("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ categoryId, questionCount: 10 }) });
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      const url = `${window.location.origin}${import.meta.env.BASE_URL}challenge/${data.code}`.replace(/([^:])\/\//g, "$1/");
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: t.categoriesLibrary.challengeCreated.replace("{name}", categoryName), description: t.categoriesLibrary.linkCopiedShare.replace("{code}", data.code) });
      setLocation(`/challenge/${data.code}`);
    } catch {
      toast({ title: t.categoriesLibrary.couldNotCreateChallenge, variant: "destructive" });
    } finally {
      setChallengingId(null);
    }
  };

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return [...(allCategories || [])]
      .filter(category => !normalizedQuery || category.name.toLocaleLowerCase().includes(normalizedQuery))
      .filter(category => view === "all" || favoriteIds.has(category.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [allCategories, favoriteIds, searchQuery, view]);

  return (
    <div className="flex-1">
      <header className="editorial-grid border-b border-white/8">
        <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-9 lg:px-12 xl:px-16">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground sm:text-[10px]"><span className="text-primary">01</span><span className="h-px w-8 bg-white/15" />{t.categoriesLibrary.knowledgeIndex}</div>
              {parentId && <button onClick={() => setLocation("/categories")} className="focus-ring flex min-h-11 items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-primary"><ChevronRight className="h-3 w-3 rotate-180 rtl:rotate-0" />{t.categoriesLibrary.backToWorlds}</button>}
            </div>
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
              <div>
                <h1 className="max-w-4xl text-[clamp(2.35rem,5vw,4.8rem)] font-extrabold leading-[0.9] tracking-[-0.07em]">{parentId ? t.categoriesLibrary.exploreSubcategories : t.categoriesLibrary.chooseYourWorld}</h1>
                <p className="mt-3 max-w-2xl text-xs leading-6 text-muted-foreground sm:text-sm">{t.categoriesLibrary.indexDesc}</p>
              </div>
              <div className="relative w-full"><Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-primary rtl:left-auto rtl:right-0" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder={t.categoriesLibrary.searchPlaceholder} className="focus-ring h-11 w-full border-b border-white/18 bg-transparent px-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary rtl:text-right" />{searchQuery && <button onClick={() => setSearchQuery("")} aria-label={t.categoriesLibrary.clearSearch} className="focus-ring absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-muted-foreground rtl:left-0 rtl:right-auto"><X className="h-4 w-4" /></button>}</div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-8 sm:py-6 lg:px-12 xl:px-16">
        <div className="mb-4 flex min-h-11 items-center justify-between gap-3 border-b border-white/10 pb-3 text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:text-[9px]">
          <span>{t.categoriesLibrary.fieldsAvailable.replace("{count}", String(filtered.length))}</span>
          {!parentId && (
            <div className="flex items-center border border-white/10 p-0.5" aria-label={t.categoriesLibrary.view}>
              <button type="button" onClick={() => setView("all")} aria-pressed={view === "all"} className={`focus-ring min-h-9 px-3 transition-colors ${view === "all" ? "bg-primary text-primary-foreground" : "hover:text-foreground"}`}>{t.categoriesLibrary.all}</button>
              <button type="button" onClick={() => setView("favorites")} aria-pressed={view === "favorites"} className={`focus-ring flex min-h-9 items-center gap-1.5 px-3 transition-colors ${view === "favorites" ? "bg-primary text-primary-foreground" : "hover:text-foreground"}`}><Heart className={`h-3 w-3 ${view === "favorites" ? "fill-current" : ""}`} />{t.categoriesLibrary.favorites} {isAuthenticated && !libraryLoading ? favoriteIds.size : ""}</button>
            </div>
          )}
          <span className="hidden sm:inline">{t.categoriesLibrary.azSelectExplore}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-4">
          {isLoading ? Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} className="h-[156px] rounded-none sm:h-[172px]" />) : filtered.length === 0 ? (
            <div className="col-span-full py-24 text-center">
              {view === "favorites" ? <Heart className="mx-auto h-7 w-7 text-primary" /> : <Search className="mx-auto h-7 w-7 text-primary" />}
              <p className="mt-6 text-3xl font-extrabold tracking-[-0.04em]">{view === "favorites" ? t.categoriesLibrary.noFavorites : t.categoriesLibrary.noWorldsFound}</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">{view === "favorites" ? isAuthenticated ? t.categoriesLibrary.favoriteHint : t.categoriesLibrary.guestHint : t.categoriesLibrary.tryDifferentSearch}</p>
              {view === "favorites" && <button type="button" onClick={() => isAuthenticated ? setView("all") : setLocation("/login")} className="focus-ring mt-7 border-b border-primary pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{isAuthenticated ? t.categoriesLibrary.browseAll : t.categoriesLibrary.signIn}</button>}
            </div>
          ) : filtered.map((category, index) => (
            <div key={category.id}>
              <WorldCard category={category} index={index} onOpen={() => setLocation(`/worlds/${category.id}`)} onChallenge={event => handleChallenge(event, category.id, category.name)} onFavorite={event => handleFavorite(event, category.id, category.name)} challenging={challengingId === category.id} favoritePending={favoritePendingId === category.id || (isAuthenticated && libraryLoading)} isFavorite={favoriteIds.has(category.id)} allowFavorite={!parentId} reducedMotion={reduceMotion} favoriteActionLabel={favoriteIds.has(category.id) ? t.categoriesLibrary.removeFavorite : t.categoriesLibrary.addFavorite} />
            </div>
          ))}
        </div>
      </main>

    </div>
  );
}
