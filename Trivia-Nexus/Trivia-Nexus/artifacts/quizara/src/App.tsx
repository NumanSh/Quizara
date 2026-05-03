import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ProfileSetupModal } from "@/components/ProfileSetupModal";

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

const queryClient = new QueryClient();

function ForceDarkMode() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <ForceDarkMode />

      {/* Fixed top bar */}
      <TopBar />

      {/* Fixed sidebar — desktop only */}
      <Sidebar />

      {/* Main content: offset for topbar + sidebar */}
      <main className="pt-16 md:ml-64 min-h-screen flex flex-col pb-16 md:pb-0">
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
          <Route component={NotFound} />
        </Switch>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Profile setup wizard — shown automatically after first login */}
      <ProfileSetupModal />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppLayout />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
