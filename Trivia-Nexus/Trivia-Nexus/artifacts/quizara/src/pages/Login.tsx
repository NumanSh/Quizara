import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useLocation } from "wouter";
import { LogIn, Compass, Trophy, Zap, Globe, Star } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useEffect } from "react";

export default function Login() {
  const { login, isAuthenticated, isLoading } = useSupabaseAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          <p className="text-xs text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-stretch bg-background relative overflow-hidden">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-gradient-to-br from-[#0d1117] via-[#0f172a] to-[#0d1117] border-r border-white/5 relative overflow-hidden">
        {/* Decorative orbs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="text-3xl font-black bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent">
            Quizara
          </div>
          <p className="text-muted-foreground text-sm mt-1">Challenge yourself, beat the world</p>
        </div>

        {/* Feature highlights */}
        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-black leading-tight">
            Test your knowledge,<br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              challenge the world.
            </span>
          </h2>

          <div className="space-y-4">
            {[
              { icon: Trophy, color: "text-primary", bg: "bg-primary/10 border-primary/20", title: "Climb the Leaderboard", desc: "Compete with players from every country" },
              { icon: Zap, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", title: "Earn Coins & Power-ups", desc: "5 coins per correct answer — spend them in the marketplace" },
              { icon: Globe, color: "text-secondary", bg: "bg-secondary/10 border-secondary/20", title: "Arabic & English", desc: "Every question available in both languages" },
            ].map(({ icon: Icon, color, bg, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom stats */}
        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[
            { value: "500+", label: "Questions" },
            { value: "20+", label: "Categories" },
            { value: "6", label: "Power-ups" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center rounded-xl bg-white/5 border border-white/5 p-3">
              <p className="text-xl font-black text-primary">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Mobile background orbs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-secondary/5 rounded-full blur-3xl lg:hidden" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl lg:hidden" />

        <div className="w-full max-w-sm relative z-10">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="text-3xl font-black bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent">
              Quizara
            </div>
            <p className="text-muted-foreground text-sm mt-1">Challenge yourself, beat the world</p>
          </div>

          <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">
            {/* Top gradient line */}
            <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-secondary/40 to-transparent" />

            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-secondary/20 to-primary/10 border border-secondary/20 flex items-center justify-center">
                <Star className="h-8 w-8 text-secondary" />
              </div>
              <h1 className="text-2xl font-black text-foreground">Welcome back!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sign in to save progress &amp; compete globally
              </p>
            </div>

            {/* What happens after sign-in */}
            <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/10">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">After signing in</p>
              <ul className="space-y-1.5">
                {[
                  "Choose your username & country",
                  "Appear on the global leaderboard",
                  "Earn coins for correct answers",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Sign in button */}
            <button
              onClick={() => login()}
              className="w-full h-13 py-3.5 rounded-2xl bg-white text-gray-900 font-bold text-base hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-3 shadow-lg shadow-black/10 border border-gray-200"
            >
              <FcGoogle className="h-6 w-6" />
              Sign in with Google
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground">or</span>
              </div>
            </div>

            {/* Guest button */}
            <button
              onClick={() => window.location.href = "/categories"}
              className="w-full py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-foreground font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              <Compass className="h-4 w-4 text-muted-foreground" />
              Continue as Guest
            </button>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Guests can play but scores won't be saved
            </p>
          </div>

          {/* Trust note */}
          <p className="text-xs text-muted-foreground text-center mt-4">
            Secured by Supabase Auth — no passwords stored
          </p>
        </div>
      </div>
    </div>
  );
}
