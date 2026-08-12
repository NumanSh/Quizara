import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

import { I18nProvider } from "@/lib/i18n";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ProfileSetupModal } from "@/components/ProfileSetupModal";
import { MonetagAds } from "@/components/MonetagAds";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Categories from "@/pages/Categories";
import WorldMap from "@/pages/WorldMap";
import Quiz from "@/pages/Quiz";
import Results from "@/pages/Results";
import Leaderboard from "@/pages/Leaderboard";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Marketplace from "@/pages/Marketplace";
import Arena from "@/pages/Arena";
import BattlePass from "@/pages/BattlePass";
import Challenge from "@/pages/Challenge";
import LuckyWheel from "@/pages/LuckyWheel";
import Blitz from "@/pages/Blitz";
import DailyTasks from "@/pages/DailyTasks";

const queryClient = new QueryClient();

function ForceDarkMode() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function AppLayout() {
  const [location] = useLocation();
  const isImmersiveRoute = location.startsWith("/quiz/") || location.startsWith("/results/");

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary selection:text-primary-foreground">
      <ForceDarkMode />

      {!isImmersiveRoute && <TopBar />}
      {!isImmersiveRoute && <Sidebar />}

      <main className={isImmersiveRoute ? "min-h-screen flex flex-col" : "pt-20 md:ml-60 md:rtl:ml-0 md:rtl:mr-60 min-h-screen flex flex-col pb-20 md:pb-0"}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/login" component={Login} />
          <Route path="/categories" component={Categories} />
          <Route path="/worlds/:categoryId" component={WorldMap} />
          <Route path="/quiz/:sessionId" component={Quiz} />
          <Route path="/results/:sessionId" component={Results} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/marketplace" component={Marketplace} />
          <Route path="/profile" component={Profile} />
          <Route path="/admin" component={Admin} />
          <Route path="/arena" component={Arena} />
          <Route path="/battlepass" component={BattlePass} />
          <Route path="/challenge/:code" component={Challenge} />
          <Route path="/wheel" component={LuckyWheel} />
          <Route path="/blitz" component={Blitz} />
          <Route path="/tasks" component={DailyTasks} />
          <Route component={NotFound} />
        </Switch>
      </main>

      {!isImmersiveRoute && <BottomNav />}
      {!isImmersiveRoute && <MonetagAds />}
      <ProfileSetupModal />
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppLayout />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

export default App;
