import { Link, useLocation } from "wouter";
import { ClipboardList, Home, Search, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useI18n();
  const items = [
    { href: "/", label: t.bottomNav.home, icon: Home },
    { href: "/categories", label: t.bottomNav.explore, icon: Search },
    { href: "/tasks", label: t.bottomNav.tasks, icon: ClipboardList },
    { href: "/leaderboard", label: t.bottomNav.rankings, icon: Trophy },
    { href: "/profile", label: t.bottomNav.profile, icon: User },
  ];
  const isActive = (href: string) => href === "/" ? location === "/" : location.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid h-20 grid-cols-5 items-center border-t border-white/10 bg-background/92 px-2 backdrop-blur-xl md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link key={href} href={href} className={cn("focus-ring relative flex min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-2 text-[9px] font-bold uppercase tracking-[0.12em] transition-all active:scale-95", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {active && <span className="absolute -top-2 h-px w-8 bg-primary" />}
            <Icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
