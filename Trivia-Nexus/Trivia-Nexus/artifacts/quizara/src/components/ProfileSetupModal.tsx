import { useState, useEffect } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  useGetProfile,
  useUpdateProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, User, Check, ChevronRight, Trophy, Gem, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const COUNTRIES = [
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "IQ", name: "Iraq", flag: "🇮🇶" },
  { code: "IE", name: "Ireland", flag: "🇮🇪" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "LY", name: "Libya", flag: "🇱🇾" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "NO", name: "Norway", flag: "🇳🇴" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "PS", name: "Palestine", flag: "🇵🇸" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "SN", name: "Senegal", flag: "🇸🇳" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "SO", name: "Somalia", flag: "🇸🇴" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "SD", name: "Sudan", flag: "🇸🇩" },
  { code: "SE", name: "Sweden", flag: "🇸🇪" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "SY", name: "Syria", flag: "🇸🇾" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "YE", name: "Yemen", flag: "🇾🇪" },
];

const STEPS = ["welcome", "username", "country", "done"] as const;
type Step = (typeof STEPS)[number];

export function ProfileSetupModal() {
  const { t } = useI18n();
  const { isAuthenticated, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("welcome");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [countrySearch, setCountrySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: profile, isLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: isAuthenticated },
  });

  const updateProfile = useUpdateProfile();

  const needsSetup =
    isAuthenticated &&
    !isLoading &&
    profile &&
    (!profile.username || !profile.country);

  const show = needsSetup && !dismissed;

  useEffect(() => {
    if (profile?.username) setUsername(profile.username);
    if (profile?.country) setSelectedCountry(profile.country);
  }, [profile]);

  if (!show) return null;

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const validateUsername = (val: string) => {
    if (val.length < 3) return t.profileSetup.usernameTooShort;
    if (val.length > 20) return t.profileSetup.usernameTooLong;
    if (!/^[a-zA-Z0-9_]+$/.test(val)) return t.profileSetup.usernameInvalidChars;
    return "";
  };

  const handleUsernameNext = () => {
    const err = validateUsername(username);
    if (err) { setUsernameError(err); return; }
    setUsernameError("");
    setStep("country");
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        data: {
          username: username || undefined,
          country: selectedCountry || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      setStep("done");
      setTimeout(() => setDismissed(true), 2200);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const progressPct =
    step === "welcome" ? 10
    : step === "username" ? 40
    : step === "country" ? 70
    : 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-[#0d1117] border border-white/10 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Top gradient bar */}
        <div className="h-1 bg-gradient-to-r from-secondary via-primary to-amber-400" />

        {/* Progress */}
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-8">
          {/* WELCOME STEP */}
          {step === "welcome" && (
            <div className="text-center flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-secondary/30 to-primary/20 border border-secondary/30 flex items-center justify-center text-4xl">
                  🏆
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-sm">
                  👋
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-black text-foreground mb-1">
                  {t.profileSetup.welcomeTitle}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t.profileSetup.hey.replace("{name}", user?.user_metadata?.full_name || user?.user_metadata?.name || "Player")}
                </p>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                {t.profileSetup.intro}
              </p>

              <div className="grid grid-cols-3 gap-3 w-full text-center text-xs">
                {[
                  { icon: Trophy, label: t.profileSetup.leaderboard, color: "text-primary" },
                  { icon: Gem, label: t.profileSetup.earnCoins, color: "text-amber-400" },
                  { icon: Zap, label: t.profileSetup.dailyQuizzes, color: "text-yellow-400" },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="rounded-xl bg-white/5 border border-white/5 p-3 flex flex-col items-center gap-1.5">
                    <Icon className={cn("h-5 w-5", color)} />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-secondary to-primary text-white hover:opacity-90 transition-opacity"
                onClick={() => setStep("username")}
              >
                {t.profileSetup.getStarted} <ChevronRight className="ml-1 h-4 w-4" />
              </Button>

              <button
                onClick={() => setDismissed(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t.profileSetup.skipForNow}
              </button>
            </div>
          )}

          {/* USERNAME STEP */}
          {step === "username" && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center mb-4">
                  <User className="h-7 w-7 text-secondary" />
                </div>
                <h2 className="text-xl font-black">{t.profileSetup.chooseUsername}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t.profileSetup.usernameHint}</p>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium select-none">
                    @
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.replace(/\s/g, ""));
                      setUsernameError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleUsernameNext()}
                    placeholder={t.profileSetup.usernamePlaceholder}
                    maxLength={20}
                    autoFocus
                    className={cn(
                      "w-full h-12 pl-8 pr-4 rounded-xl border bg-white/5 text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 transition-all",
                      usernameError
                        ? "border-destructive focus:ring-destructive/30"
                        : "border-white/10 focus:ring-primary/30 focus:border-primary/50"
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {username.length}/20
                  </span>
                </div>
                {usernameError && (
                  <p className="text-xs text-destructive">{usernameError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t.profileSetup.usernameRules}
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("welcome")} className="flex-1 border-white/10 hover:bg-white/5">
                  {t.profileSetup.back}
                </Button>
                <Button
                  onClick={handleUsernameNext}
                  disabled={username.length < 3}
                  className="flex-1 bg-secondary hover:bg-secondary/90 text-white font-bold"
                >
                  {t.profileSetup.next} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* COUNTRY STEP */}
          {step === "country" && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Globe className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-xl font-black">{t.profileSetup.whereFrom}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t.profileSetup.flagHint}</p>
              </div>

              {/* Search */}
              <Input
                placeholder={t.profileSetup.searchCountry}
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="bg-white/5 border-white/10 focus-visible:ring-primary/30"
                autoFocus
              />

              {/* Country list */}
              <div className="max-h-52 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                {filteredCountries.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4">{t.profileSetup.noCountryFound}</p>
                ) : (
                  filteredCountries.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setSelectedCountry(c.name)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                        selectedCountry === c.name
                          ? "bg-primary/20 border border-primary/40 text-foreground"
                          : "hover:bg-white/5 border border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="text-xl">{c.flag}</span>
                      <span className="font-medium">{c.name}</span>
                      {selectedCountry === c.name && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("username")} className="flex-1 border-white/10 hover:bg-white/5">
                  {t.profileSetup.back}
                </Button>
                <Button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-secondary to-primary text-white font-bold hover:opacity-90 transition-opacity"
                >
                  {saving ? t.profileSetup.saving : selectedCountry ? t.profileSetup.finish : t.profileSetup.skipCountry}
                </Button>
              </div>
            </div>
          )}

          {/* DONE STEP */}
          {step === "done" && (
            <div className="text-center flex flex-col items-center gap-5 py-4">
              <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
                <Check className="h-10 w-10 text-green-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-green-400">{t.profileSetup.allSet}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedCountry && `${COUNTRIES.find(c => c.name === selectedCountry)?.flag} `}
                  {t.profileSetup.welcomeUser.replace("{username}", username)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t.profileSetup.startQuiz}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
