import React from "react";
import { Link, useLocation } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { ClipboardList, Flame, Gem, Home, Layers, LayoutGrid, Settings, ShoppingBag, Sparkles, Swords, Trophy, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

export function Sidebar() {
  const [location] = useLocation();
  const { isAuthenticated } = useSupabaseAuth();
  const { t } = useI18n();
  const { data: profile, isLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: isAuthenticated },
  });

  const items: { href: string; label: string; icon: React.ElementType; new?: boolean }[] = [
    { href: "/", label: t.nav.home, icon: Home },
    { href: "/categories", label: t.nav.categories, icon: LayoutGrid },
    { href: "/leaderboard", label: t.nav.leaderboard, icon: Trophy },
    { href: "/arena", label: t.nav.arena, icon: Swords },
    { href: "/tasks", label: t.nav.dailyTasks, icon: ClipboardList, new: true },
    { href: "/blitz", label: t.nav.dailyBlitz, icon: Flame, new: true },
    { href: "/battlepass", label: t.nav.battlePass, icon: Layers, new: true },
    { href: "/wheel", label: t.nav.luckyWheel, icon: Sparkles, new: true },
    { href: "/marketplace", label: t.nav.marketplace, icon: ShoppingBag },
    { href: "/profile", label: t.nav.profile, icon: User },
  ];

  const isActive = (href: string) => href === "/" ? location === "/" : location.startsWith(href);

  return (
    <aside className="fixed bottom-0 left-0 top-20 z-40 hidden w-60 flex-col border-r border-white/8 bg-background/72 backdrop-blur-xl md:flex rtl:left-auto rtl:right-0 rtl:border-l rtl:border-r-0">
      <div className="border-b border-white/8 px-6 py-7">
        {!isAuthenticated ? (
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center border border-border bg-muted"><User className="h-4 w-4 text-muted-foreground" /></div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">{t.sidebar.guestPlayer}</p>
              <p className="text-[10px] leading-4 text-muted-foreground">{t.sidebar.signInToSave}</p>
            </div>
          </div>
        ) : isLoading || !profile ? (
          <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-none" /><div className="flex-1 space-y-2"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-2 w-24" /></div></div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center overflow-hidden border border-primary/30 bg-primary/10">
              {profile.profileImageUrl ? <img src={profile.profileImageUrl} alt={profile.username || t.sidebar.player} className="h-full w-full object-cover" /> : <User className="h-4 w-4 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground">{profile.username || t.sidebar.player}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{profile.role === "admin" ? t.nav.admin : `${profile.totalScore ?? 0} ${t.topbar.pts}`}</span>
                {profile.role !== "admin" && <span className="flex shrink-0 items-center gap-0.5 text-secondary"><Gem className="h-2.5 w-2.5" />{profile.coins ?? 0}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-5">
        <p className="mb-3 px-6 text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground/60">{t.sidebar.navigate}</p>
        {items.map(({ href, label, icon: Icon, new: isNew }, index) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "focus-ring group relative flex items-center gap-3 px-6 py-2.5 text-xs font-semibold transition-all duration-300",
                active ? "bg-white/[0.035] text-foreground" : "text-muted-foreground hover:bg-white/[0.025] hover:text-foreground"
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-px bg-primary rtl:left-auto rtl:right-0" />}
              <span className="w-5 text-[9px] tabular-nums text-muted-foreground/45">{String(index + 1).padStart(2, "0")}</span>
              <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5", active && "text-primary")} />
              <span className="flex-1 truncate">{label}</span>
              {isNew && !active && <span className="h-1 w-1 rounded-full bg-secondary" title={t.nav.new} />}
            </Link>
          );
        })}

        {profile?.role === "admin" && (
          <Link href="/admin" className={cn("focus-ring relative flex items-center gap-3 px-6 py-2.5 text-xs font-semibold transition-colors", location.startsWith("/admin") ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <span className="w-5 text-[9px] text-muted-foreground/45">11</span><Settings className="h-4 w-4" />{t.nav.admin}
          </Link>
        )}
      </nav>

      <div className="border-t border-white/8 px-6 pb-7 pt-5">
        <div className="mb-2 flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">{t.sidebar.dailyChallenge}</span></div>
        <p className="mb-4 text-[11px] leading-5 text-muted-foreground">{t.sidebar.dailyChallengeDesc}</p>
        <Link href="/tasks"><button className="focus-ring w-full border border-primary/25 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary transition-colors duration-300 hover:bg-primary hover:text-primary-foreground">{t.sidebar.viewTasks}</button></Link>
      </div>
    </aside>
  );
}
