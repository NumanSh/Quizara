import { Link, useLocation } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { ArrowUpRight, Check, Gem, Globe, LogOut, Shield, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { RankBadge } from "@/components/RankBadge";
import { useI18n } from "@/lib/i18n";

export function TopBar() {
  const [location] = useLocation();
  const { user, isAuthenticated, login, logout } = useSupabaseAuth();
  const { t, lang, setLang } = useI18n();

  const { data: profile } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isAuthenticated,
    },
  });

  const topLinks = [
    ["/", t.nav.home],
    ["/categories", t.topbar.explore],
    ["/leaderboard", t.topbar.rankings],
  ] as const;

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-20 border-b border-white/8 bg-background/88 backdrop-blur-xl">
      <div className="grid h-full grid-cols-[auto_1fr_auto] items-center px-4 md:px-0">
        <Link href="/" className="focus-ring flex select-none items-center gap-3 md:w-60 md:px-7">
          <span className="grid h-9 w-9 place-items-center bg-primary text-sm font-extrabold text-primary-foreground">Q</span>
          <span className="text-lg font-extrabold tracking-[-0.04em]">QUIZARA</span>
        </Link>

        <nav className="hidden items-center justify-center gap-9 md:flex">
          {topLinks.map(([href, label]) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`focus-ring relative py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
                {active && <span className="absolute inset-x-0 -bottom-[23px] h-px bg-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-1 text-foreground md:pr-5">
          {isAuthenticated && profile && (
            <Link
              href="/marketplace"
              className="focus-ring mr-1 flex items-center gap-1.5 border border-white/10 px-3 py-2 transition-colors hover:border-primary/40 rtl:ml-1 rtl:mr-0"
            >
              <Gem className="h-3.5 w-3.5 text-secondary" />
              <span className="text-xs font-bold">{(profile.coins ?? 0).toLocaleString()}</span>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus-ring flex h-9 w-9 items-center justify-center transition-colors hover:bg-white/5" title={t.topbar.changeLanguage}>
                <Globe className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 border-border bg-card">
              <DropdownMenuItem onClick={() => setLang("en")} className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-sm font-medium">English</span>
                {lang === "en" && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLang("ar")} className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-sm font-medium">العربية</span>
                {lang === "ar" && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus-ring ml-2 flex h-9 w-9 items-center justify-center overflow-hidden border border-white/12 bg-white/5 transition-colors hover:border-primary/40 rtl:ml-0 rtl:mr-2">
                  {profile?.profileImageUrl ? (
                    <img src={profile.profileImageUrl} alt={t.topbar.profileAlt} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-primary" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-border bg-card">
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{profile?.username || user?.user_metadata?.full_name || user?.user_metadata?.name || t.sidebar.player}</p>
                    {profile && <RankBadge totalXp={(profile as any).totalXp ?? 0} size="xs" />}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{profile?.totalScore ?? 0} {t.topbar.pts}</span>
                    <span className="flex items-center gap-1 text-secondary"><Gem className="h-3 w-3" />{profile?.coins ?? 0}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/profile" className="flex cursor-pointer items-center gap-2"><User className="h-4 w-4" />{t.topbar.profile}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/marketplace" className="flex cursor-pointer items-center gap-2"><Gem className="h-4 w-4 text-secondary" />{t.topbar.marketplace}</Link></DropdownMenuItem>
                {profile?.role === "admin" && <DropdownMenuItem asChild><Link href="/admin" className="flex cursor-pointer items-center gap-2"><Shield className="h-4 w-4" />{t.topbar.adminPanel}</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"><LogOut className="h-4 w-4" />{t.topbar.logOut}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => login()} size="sm" className="focus-ring ml-1 h-10 rounded-none bg-primary px-3 font-bold text-primary-foreground hover:bg-primary/85 md:ml-2 md:px-5 rtl:ml-0 rtl:mr-2">
              <span className="hidden sm:inline">{t.topbar.signIn}</span>
              <ArrowUpRight className="h-4 w-4 sm:ml-2 rtl:sm:ml-0 rtl:sm:mr-2" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
