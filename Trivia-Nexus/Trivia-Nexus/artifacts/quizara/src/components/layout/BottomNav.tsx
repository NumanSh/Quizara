import { Link, useLocation } from "wouter";
import { Home, Search, Trophy, User, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useI18n();

  const NAV_ITEMS = [
    { href: "/", label: t.bottomNav.home, icon: Home },
    { href: "/categories", label: t.bottomNav.explore, icon: Search },
    { href: "/tasks", label: t.bottomNav.tasks, icon: ClipboardList },
    { href: "/leaderboard", label: t.bottomNav.rankings, icon: Trophy },
    { href: "/profile", label: t.bottomNav.profile, icon: User },
  ];

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] rounded-t-2xl flex justify-around items-center px-2 py-2 pb-safe">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-90",
              active
                ? "text-secondary bg-secondary/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("h-5 w-5", active ? "text-secondary" : "")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
