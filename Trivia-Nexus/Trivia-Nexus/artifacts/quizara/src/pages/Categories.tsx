import { useState } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useListCategories, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { Search, X, ChevronRight, Map, Link2, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";

const CATEGORY_IMAGES: Record<string, string> = {
  "anime": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&q=80",
  "anime & manga": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&q=80",
  "geography": "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=600&q=80",
  "cinema": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80",
  "cinema & tv": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80",
  "science": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80",
  "history": "https://images.unsplash.com/photo-1564419320461-6870880221ad?w=600&q=80",
  "sports": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&q=80",
  "pop culture": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80",
  "general knowledge": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80",
  "technology": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80",
  "tech": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80",
  "music": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80",
  "art": "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=600&q=80",
  "food": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80",
  "nature": "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&q=80",
  "politics": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&q=80",
  "literature": "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&q=80",
};

const GRADIENT_FALLBACKS = [
  "from-indigo-900 to-indigo-950",
  "from-cyan-900 to-cyan-950",
  "from-rose-900 to-rose-950",
  "from-amber-900 to-amber-950",
  "from-emerald-900 to-emerald-950",
  "from-violet-900 to-violet-950",
  "from-sky-900 to-sky-950",
  "from-pink-900 to-pink-950",
];

const ACCENT_COLORS = [
  "hover:border-indigo-500/60",
  "hover:border-cyan-500/60",
  "hover:border-rose-500/60",
  "hover:border-amber-500/60",
  "hover:border-emerald-500/60",
  "hover:border-violet-500/60",
  "hover:border-sky-500/60",
  "hover:border-pink-500/60",
];

const EXPLORE_TEXT_COLORS = [
  "text-indigo-400", "text-cyan-400", "text-rose-400", "text-amber-400",
  "text-emerald-400", "text-violet-400", "text-sky-400", "text-pink-400",
];

function getCategoryImage(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, url] of Object.entries(CATEGORY_IMAGES)) {
    if (lower.includes(key) || key.includes(lower)) return url;
  }
  return null;
}

interface WorldCardProps {
  category: any;
  index: number;
  onClick: () => void;
  onChallenge: (e: React.MouseEvent) => void;
  challenging: boolean;
}

function WorldCard({ category, index, onClick, onChallenge, challenging }: WorldCardProps) {
  const imageUrl = getCategoryImage(category.name);
  const gradient = GRADIENT_FALLBACKS[index % GRADIENT_FALLBACKS.length];
  const accentClass = ACCENT_COLORS[index % ACCENT_COLORS.length];
  const exploreColor = EXPLORE_TEXT_COLORS[index % EXPLORE_TEXT_COLORS.length];

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/8 bg-card cursor-pointer",
        "transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:-translate-y-0.5",
        accentClass
      )}
    >
      {/* Top half — photo */}
      <div className="relative h-40 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={category.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className={cn("w-full h-full bg-gradient-to-br", gradient, "flex items-center justify-center")}>
            <span className="text-5xl opacity-40 select-none">{category.icon || "📚"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

        {index === 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm border border-indigo-500/40 text-indigo-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Trending
          </div>
        )}

        {/* World badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-background/70 backdrop-blur-sm border border-white/10 text-[10px] font-semibold px-2 py-0.5 rounded-full text-muted-foreground">
          <Map className="h-2.5 w-2.5" />
          World
        </div>
      </div>

      {/* Bottom */}
      <div className="px-5 py-4 flex flex-col gap-1">
        <h3 className="font-bold text-lg text-foreground leading-tight group-hover:text-white transition-colors">
          {category.name}
        </h3>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/8">
          <span className="text-xs text-muted-foreground font-medium">
            {category.questionCount > 0
              ? `${Math.floor(category.questionCount / 3)} levels`
              : "Explore levels"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onChallenge}
              disabled={challenging}
              title="Challenge a Friend"
              className="flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 px-1.5 py-0.5 rounded hover:bg-indigo-500/10"
            >
              {challenging
                ? <span className="w-3 h-3 border border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                : <Link2 className="h-3 w-3" />}
              Challenge
            </button>
            <span className={cn(
              "text-xs font-semibold flex items-center gap-0.5 opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0",
              exploreColor
            )}>
              Enter <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Categories() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Get parentId from query string
  const searchParams = new URLSearchParams(window.location.search);
  const parentId = searchParams.get("parent") || undefined;

  const { data: allCategories, isLoading } = useListCategories(
    { parentId },
    { 
      query: { 
        queryKey: getListCategoriesQueryKey({ parentId }),
        // Re-fetch when parentId changes
        enabled: true 
      } 
    }
  );

  const handleChallenge = async (e: React.MouseEvent, categoryId: string, categoryName: string) => {
    e.stopPropagation();
    setChallengingId(categoryId);
    try {
      const res = await authFetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryId, questionCount: 10 }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const url = `${window.location.origin}${import.meta.env.BASE_URL}challenge/${data.code}`.replace(/([^:])\/\//g, "$1/");
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({
        title: `${categoryName} challenge created!`,
        description: `Link copied — share it with your friends. Code: ${data.code}`,
      });
      setLocation(`/challenge/${data.code}`);
    } catch {
      toast({ title: "Could not create challenge", variant: "destructive" });
    } finally {
      setChallengingId(null);
    }
  };

  const filtered = (allCategories || []).filter(c =>
    searchQuery === "" ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 w-full">
      <div className="fixed top-1/4 left-1/3 w-96 h-96 bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-primary/4 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 relative">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {parentId && (
                <button 
                  onClick={() => setLocation("/categories")}
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                  Back to Worlds
                </button>
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              {parentId ? "Explore Subcategories" : "Choose Your World"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {parentId 
                ? "Select a specific topic to begin your quest" 
                : "Each world is a journey — conquer levels to master the topic"}
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search worlds..."
              className="w-full h-10 bg-card border border-white/10 rounded-xl pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[230px] rounded-2xl" />
              ))
            : filtered.length === 0
              ? (
                <div className="col-span-full py-24 text-center">
                  <p className="text-2xl mb-2">🔍</p>
                  <p className="font-semibold text-foreground">No worlds found</p>
                  <p className="text-sm text-muted-foreground mt-1">Try a different search term</p>
                </div>
              )
              : filtered.map((category, i) => (
                <WorldCard
                  key={category.id}
                  category={category}
                  index={i}
                  onClick={() => setLocation(`/worlds/${category.id}`)}
                  onChallenge={e => handleChallenge(e, category.id, category.name)}
                  challenging={challengingId === category.id}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
