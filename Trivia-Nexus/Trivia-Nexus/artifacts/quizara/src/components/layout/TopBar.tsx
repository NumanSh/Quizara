import { Link } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Globe, Bell, Settings, User, LogOut, Shield, Gem, Check } from "lucide-react";
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
  const { user, isAuthenticated, login, logout } = useSupabaseAuth();
  const { t, lang, setLang } = useI18n();

  const { data: profile } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      enabled: isAuthenticated,
    },
  });

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/80 backdrop-blur-xl border-b border-white/10 shadow-[0_2px_30px_rgba(99,102,241,0.08)]">
      <div className="flex items-center justify-between px-6 h-full max-w-screen-2xl mx-auto">
        {/* Brand */}
        <Link href="/" className="text-2xl font-black bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent tracking-tight select-none">
          Quizara
        </Link>

        {/* Desktop center nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t.nav.home}
          </Link>
          <Link href="/categories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t.topbar.explore}
          </Link>
          <Link href="/leaderboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t.topbar.rankings}
          </Link>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1 text-secondary">
          {isAuthenticated && profile && (
            <Link href="/marketplace" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/20 hover:bg-amber-500/20 transition-colors mr-1 rtl:mr-0 rtl:ml-1">
              <Gem className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-300">{(profile.coins ?? 0).toLocaleString()}</span>
            </Link>
          )}

          {/* Language switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 w-9 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors" title="Change language">
                <Globe className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 border-border bg-card">
              <DropdownMenuItem
                onClick={() => setLang("en")}
                className="cursor-pointer flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">🇬🇧</span>
                  <span className="text-sm font-medium">English</span>
                </span>
                {lang === "en" && <Check className="h-3.5 w-3.5 text-secondary shrink-0" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLang("ar")}
                className="cursor-pointer flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">🇸🇦</span>
                  <span className="text-sm font-medium">العربية</span>
                </span>
                {lang === "ar" && <Check className="h-3.5 w-3.5 text-secondary shrink-0" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button className="h-9 w-9 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors">
            <Bell className="h-5 w-5" />
          </button>

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-2 rtl:ml-0 rtl:mr-2 h-8 w-8 rounded-full border border-secondary/30 bg-secondary/10 flex items-center justify-center hover:bg-secondary/20 transition-colors overflow-hidden">
                  {profile?.profileImageUrl ? (
                    <img src={profile.profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-secondary" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-border bg-card">
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{profile?.username || user?.user_metadata?.full_name || user?.user_metadata?.name || "Player"}</p>
                    {profile && <RankBadge totalXp={(profile as any).totalXp ?? 0} size="xs" />}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-muted-foreground">{profile?.totalScore ?? 0} {t.topbar.pts}</p>
                    <span className="text-xs text-amber-400 flex items-center gap-0.5"><Gem className="h-3 w-3" />{profile?.coins ?? 0} {t.topbar.coins}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer flex items-center gap-2">
                    <User className="h-4 w-4" /> {t.topbar.profile}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/marketplace" className="cursor-pointer flex items-center gap-2">
                    <Gem className="h-4 w-4 text-amber-400" /> {t.topbar.marketplace}
                  </Link>
                </DropdownMenuItem>
                {profile?.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer flex items-center gap-2">
                      <Shield className="h-4 w-4" /> {t.topbar.adminPanel}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive cursor-pointer flex items-center gap-2">
                  <LogOut className="h-4 w-4" /> {t.topbar.logOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => login()} size="sm" className="ml-2 rtl:ml-0 rtl:mr-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
              {t.topbar.signIn}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
