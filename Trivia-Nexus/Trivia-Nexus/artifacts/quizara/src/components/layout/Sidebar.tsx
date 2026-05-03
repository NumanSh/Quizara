import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Home, LayoutGrid, Trophy, User, Settings, Zap, ShoppingBag, Gem, Swords, Layers, Sparkles, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; highlight?: boolean }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/categories", label: "Categories", icon: LayoutGrid },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/blitz", label: "Daily Blitz", icon: Flame, highlight: true },
  { href: "/battlepass", label: "Battle Pass", icon: Layers, highlight: true },
  { href: "/wheel", label: "Lucky Wheel", icon: Sparkles, highlight: true },
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/profile", label: "Profile", icon: User },
];

export function Sidebar() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: profile } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isAuthenticated,
    },
  });

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-16 bottom-0 w-64 bg-card/60 border-r border-white/5 shadow-xl z-40 backdrop-blur-sm">
      {/* User header */}
      <div className="px-6 py-6 border-b border-white/5">
        {isAuthenticated && profile ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary/10 border-2 border-secondary/40 flex items-center justify-center">
              <User className="h-5 w-5 text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-secondary truncate">{profile.username || "Player"}</p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground truncate">
                  {profile.role === "admin" ? "Admin" : `${profile.totalScore ?? 0} pts`}
                </p>
                {profile.role !== "admin" && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-400">
                    <Gem className="h-3 w-3" />{profile.coins ?? 0}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted border border-border flex items-center justify-center">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Guest Player</p>
              <p className="text-xs text-muted-foreground">Sign in to save scores</p>
            </div>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, highlight }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 hover:translate-x-0.5",
                active
                  ? "text-secondary bg-secondary/10 border-r-[3px] border-secondary"
                  : highlight
                    ? "text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active ? "text-secondary" : highlight ? "text-indigo-400" : "")} />
              <span className="flex-1">{label}</span>
              {highlight && !active && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 uppercase tracking-wide">
                  NEW
                </span>
              )}
            </Link>
          );
        })}

        {profile?.role === "admin" && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 hover:translate-x-0.5",
              location.startsWith("/admin")
                ? "text-secondary bg-secondary/10 border-r-[3px] border-secondary"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Settings className="h-5 w-5 shrink-0" />
            Admin
          </Link>
        )}
      </nav>

      {/* Bottom CTA */}
      <div className="px-4 pb-6">
        <div className="rounded-xl bg-gradient-to-br from-secondary/20 to-primary/10 border border-secondary/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">Daily Challenge</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Answer 10 questions to earn your badge</p>
          <Link href="/categories">
            <button className="w-full text-xs font-semibold text-secondary border border-secondary/30 rounded-lg py-2 hover:bg-secondary/10 transition-colors">
              Start Challenge
            </button>
          </Link>
        </div>
      </div>
    </aside>
  );
}
