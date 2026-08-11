import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/api";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Swords, Users, UserPlus, Loader2, Trophy, CheckCircle2,
  Clock, Star, Crown, ArrowLeft, WifiOff, Copy, Check,
  Minus, Plus, Shield, Zap, XCircle, Hourglass,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PowerUpBar, { type PowerUpItem } from "@/components/PowerUpBar";
import PreGamePowerUpModal from "@/components/PreGamePowerUpModal";
import { useI18n } from "@/lib/i18n";

type Phase =
  | "lobby"
  | "room_setup"
  | "searching"
  | "creating_room"
  | "joining_room"
  | "friends_lobby"
  | "category_selection"
  | "waiting_categories"
  | "game"
  | "results";

interface PlayerInfo {
  userId: string;
  username: string;
  profileImageUrl: string | null;
  isReady?: boolean;
  isHost?: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  imageUrl: string | null;
  parentId: string | null;
}

interface ArenaQuestion {
  id: string;
  question: string;
  questionType: string;
  imageUrl: string | null;
  options: string[];
}

// Per-question answer state (reset each question)
interface AnswerState {
  selected: number | null;      // what player clicked
  submitted: boolean;           // sent to server
  waitingForOpponent: boolean;  // answered, waiting for others
  revealed: boolean;            // QUESTION_RESULT received
  correct: boolean | null;      // from ANSWER_ACK
  correctAnswer: number | null; // from QUESTION_RESULT
  pointsEarned: number | null;  // from ANSWER_ACK
}

interface QuestionResult {
  questionIndex: number;
  correctAnswer: number;
  results: Array<{ userId: string; username: string; correct: boolean; points: number; elapsedMs: number }>;
  allScores: Record<string, number>;
}

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/arena/ws`;

const ACCENT_COLORS = [
  "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  "border-violet-500/40 bg-violet-500/10 text-violet-400",
  "border-rose-500/40 bg-rose-500/10 text-rose-400",
  "border-amber-500/40 bg-amber-500/10 text-amber-400",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  "border-sky-500/40 bg-sky-500/10 text-sky-400",
  "border-pink-500/40 bg-pink-500/10 text-pink-400",
  "border-indigo-500/40 bg-indigo-500/10 text-indigo-400",
];

function Avatar({ username, imageUrl, size = "md" }: { username: string; imageUrl?: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const cls =
    size === "sm" ? "h-8 w-8 text-xs" :
    size === "lg" ? "h-16 w-16 text-xl" :
    size === "xl" ? "h-20 w-20 text-2xl" :
    "h-11 w-11 text-sm";
  if (imageUrl) return <img src={imageUrl} alt={username} className={cn(cls, "rounded-full object-cover border-2 border-border")} />;
  return (
    <div className={cn(cls, "rounded-full bg-secondary/20 border-2 border-secondary/30 flex items-center justify-center font-bold text-secondary")}>
      {username?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function freshAnswerState(): AnswerState {
  return { selected: null, submitted: false, waitingForOpponent: false, revealed: false, correct: null, correctAnswer: null, pointsEarned: null };
}

export default function Arena() {
  const { t } = useI18n();
  const { isAuthenticated, login } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: profile } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: isAuthenticated },
  });

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>("lobby");

  // Friends room
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [questionCount, setQuestionCount] = useState(12);
  const [lobbyPlayers, setLobbyPlayers] = useState<PlayerInfo[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [amHost, setAmHost] = useState(false);

  // Opponents
  const [opponents, setOpponents] = useState<PlayerInfo[]>([]);

  // Category selection
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [categoriesProgress, setCategoriesProgress] = useState({ selected: 0, total: 1 });
  const [categoryPicks, setCategoryPicks] = useState<Record<string, string[]>>({});

  // Game state
  const [questions, setQuestions] = useState<ArenaQuestion[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>(freshAnswerState());
  const [opponentAnswered, setOpponentAnswered] = useState(false); // opponent has answered this question
  const [questionResult, setQuestionResult] = useState<QuestionResult | null>(null);
  const [allScores, setAllScores] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(20);
  const [gameResult, setGameResult] = useState<{ winner: string | null; scores: Record<string, number> } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Power-up state ──────────────────────────────────────────────────────────
  const [showArenaPreGame, setShowArenaPreGame] = useState(false);
  const [powerUpInventory, setPowerUpInventory] = useState<PowerUpItem[]>([]);
  const [arenaHiddenOptions, setArenaHiddenOptions] = useState<number[]>([]);
  const [arenaUsedEffects, setArenaUsedEffects] = useState<Set<string>>(new Set());
  const [arenaShieldActive, setArenaShieldActive] = useState(false);
  const [arenaDoubleScore, setArenaDoubleScore] = useState(0);
  // ────────────────────────────────────────────────────────────────────────────

  const sendWs = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(20);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !profile) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      supabase.auth.getSession().then(({ data: { session } }) => {
        ws.send(JSON.stringify({
          type: "INIT",
          token: session?.access_token ?? null,
        }));
      });
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data); } catch { return; }

      switch (msg.type) {
        case "READY":
          break;

        case "QUEUE_JOINED":
          setPhase("searching");
          break;

        case "ROOM_CREATED":
          setRoomCode(msg.code);
          setAmHost(true);
          break;

        case "LOBBY_UPDATE": {
          const players: PlayerInfo[] = msg.players ?? [];
          setLobbyPlayers(players);
          if (profile) {
            const me = players.find(p => p.userId === profile.id);
            if (me) { setIsReady(me.isReady ?? false); setAmHost(me.isHost ?? false); }
          }
          setPhase("friends_lobby");
          break;
        }

        case "MATCH_FOUND": {
          const opps: PlayerInfo[] = msg.opponents ?? [];
          setOpponents(opps);
          setAllScores({});
          setSelectedCats([]);
          setCategoriesProgress({ selected: 0, total: opps.length + 1 });
          break;
        }

        case "CATEGORY_SELECTION": {
          const roomOpponents: PlayerInfo[] = (msg.opponents ?? []).filter((p: PlayerInfo) => p.userId !== profile?.id);
          setOpponents(roomOpponents);
          setCategories(msg.categories ?? []);
          setCategoriesProgress({ selected: 0, total: (msg.opponents?.length ?? 1) });
          setCategoryPicks({});
          setPhase("category_selection");
          break;
        }

        case "CATEGORIES_PROGRESS":
          setCategoriesProgress({ selected: msg.selected, total: msg.total });
          setCategoryPicks(msg.picks ?? {});
          break;

        case "GAME_START": {
          const qs: ArenaQuestion[] = msg.questions ?? [];
          setQuestions(qs);
          setAllScores({});
          setPhase("game");
          // Fetch inventory and show pre-game modal
          if (profile?.id) {
            authFetch("/api/marketplace/inventory")
              .then(r => r.json())
              .then(data => {
                const pus = (Array.isArray(data) ? data : []).filter(
                  (i: any) => i.type === "powerup" && i.quantity > 0 &&
                    ["fifty_fifty", "shield", "steal_question", "double_score"].includes(i.effect)
                );
                setPowerUpInventory(pus.map((i: any) => ({
                  itemId: i.itemId, effect: i.effect, emoji: i.emoji, name: i.name, quantity: i.quantity,
                })));
              }).catch(() => {});
          }
          setShowArenaPreGame(true);
          break;
        }

        // Server tells everyone to start question N simultaneously
        case "QUESTION_START": {
          const qi: number = msg.questionIndex ?? 0;
          setCurrentQIdx(qi);
          setAnswerState(freshAnswerState());
          setOpponentAnswered(false);
          setQuestionResult(null);
          setArenaHiddenOptions([]);
          setArenaUsedEffects(new Set());
          setShowArenaPreGame(false); // dismiss pre-game modal if still open
          startTimer();
          break;
        }

        case "POWER_UP_RESULT": {
          const { effect } = msg;
          if (effect === "fifty_fifty" && msg.eliminatedOptions) {
            setArenaHiddenOptions(msg.eliminatedOptions);
            setArenaUsedEffects(prev => new Set([...prev, effect]));
            setPowerUpInventory(prev => {
              const updated = prev.map(p => p.effect === effect ? { ...p, quantity: p.quantity - 1 } : p);
              return updated.filter(p => p.quantity > 0);
            });
            toast({ title: t.arena.fiftyActivated });
          } else if (effect === "shield" && msg.active) {
            setArenaShieldActive(true);
            setArenaUsedEffects(prev => new Set([...prev, effect]));
            setPowerUpInventory(prev => prev.map(p => p.effect === effect ? { ...p, quantity: p.quantity - 1 } : p).filter(p => p.quantity > 0));
            toast({ title: t.arena.shieldActivated });
          } else if (effect === "steal_question") {
            if (msg.success) {
              setAllScores(prev => ({ ...prev, [profile?.id ?? ""]: msg.newScore }));
              setPowerUpInventory(prev => prev.map(p => p.effect === effect ? { ...p, quantity: p.quantity - 1 } : p).filter(p => p.quantity > 0));
              toast({ title: t.arena.stoleFrom.replace("{points}", String(msg.pointsStolen)).replace("{username}", msg.targetUsername) });
            } else {
              const reason = msg.reason === "blocked" ? t.arena.shieldBlockedSteal : msg.reason === "no_points" ? t.arena.opponentNoPoints : t.arena.stealFailedGeneric;
              toast({ title: t.arena.stealFailedTitle, description: reason, variant: "destructive" });
            }
          }
          break;
        }

        case "SHIELD_TRIGGERED":
          setArenaShieldActive(false);
          toast({ title: t.arena.shieldBlockedTitle.replace("{username}", msg.fromUsername) });
          break;

        case "POWER_UP_RECEIVED":
          if (msg.effect === "steal_question") {
            toast({ title: t.arena.stolenFromYou.replace("{username}", msg.fromUsername).replace("{points}", String(msg.pointsStolen)), variant: "destructive" });
          }
          break;

        // Server acks our answer — we wait for opponent
        case "ANSWER_ACK": {
          stopTimer();
          setAnswerState(prev => ({
            ...prev,
            waitingForOpponent: true,
            correct: msg.correct ?? null,
            pointsEarned: msg.points ?? 0,
          }));
          break;
        }

        // Opponent has submitted their answer for this question
        case "OPPONENT_ANSWERED_Q": {
          setOpponentAnswered(true);
          break;
        }

        // All players answered (or timer expired) — reveal results for this question
        case "QUESTION_RESULT": {
          stopTimer();
          const result: QuestionResult = {
            questionIndex: msg.questionIndex,
            correctAnswer: msg.correctAnswer,
            results: msg.results ?? [],
            allScores: msg.allScores ?? {},
          };
          setQuestionResult(result);
          setAllScores(msg.allScores ?? {});
          setAnswerState(prev => ({
            ...prev,
            revealed: true,
            correctAnswer: msg.correctAnswer,
            // If we didn't answer in time, mark as wrong
            correct: prev.submitted ? prev.correct : false,
            pointsEarned: prev.submitted ? prev.pointsEarned : 0,
          }));
          break;
        }

        case "GAME_END":
          stopTimer();
          setGameResult({ winner: msg.winner ?? null, scores: msg.scores ?? {} });
          setPhase("results");
          break;

        case "OPPONENT_LEFT":
          toast({ title: t.arena.playerDisconnected.replace("{username}", msg.username ?? t.arena.aPlayer), variant: "destructive" });
          if (phase === "friends_lobby") {
            setLobbyPlayers(prev => prev.filter(p => p.userId !== msg.userId));
          } else {
            setPhase("lobby");
            setOpponents([]);
            stopTimer();
          }
          break;

        case "ERROR":
          toast({ title: t.arena.error, description: msg.message, variant: "destructive" });
          if (phase === "joining_room" || phase === "searching") setPhase("lobby");
          break;
      }
    };

    return () => {
      ws.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAuthenticated, profile?.id]);

  const handleSelectCat = (id: string) => {
    setSelectedCats(prev => {
      if (prev.includes(id)) return prev.filter(c => c !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const handleSubmitCategories = () => {
    if (selectedCats.length !== 3) return;
    sendWs({ type: "SELECT_CATEGORIES", categoryIds: selectedCats });
    setPhase("waiting_categories");
  };

  const handleAnswer = (index: number) => {
    if (answerState.submitted || answerState.revealed) return;
    setAnswerState(prev => ({ ...prev, selected: index, submitted: true }));
    sendWs({ type: "ANSWER", questionIndex: currentQIdx, selectedAnswer: index });
  };

  const handleArenaPowerUp = (itemId: string, effect: string) => {
    const q = questions[currentQIdx];
    if (!q) return;
    if (effect === "steal_question") {
      const target = opponents[0];
      if (!target) return;
      sendWs({ type: "USE_POWER_UP", effect, itemId, questionId: q.id, targetUserId: target.userId });
    } else {
      sendWs({ type: "USE_POWER_UP", effect, itemId, questionId: q.id });
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinOnline = () => sendWs({ type: "JOIN_QUEUE" });

  const handleCreateRoom = () => {
    sendWs({ type: "CREATE_ROOM", questionCount });
    setPhase("creating_room");
  };

  const handleJoinRoom = () => {
    if (!joinCode.trim()) return;
    setPhase("joining_room");
    sendWs({ type: "JOIN_ROOM", code: joinCode.trim().toUpperCase() });
  };

  const handleToggleReady = () => {
    if (isReady) {
      sendWs({ type: "PLAYER_UNREADY" });
      setIsReady(false);
    } else {
      sendWs({ type: "PLAYER_READY" });
      setIsReady(true);
    }
  };

  const handleLeave = () => {
    sendWs({ type: "LEAVE" });
    setPhase("lobby");
    setOpponents([]);
    setLobbyPlayers([]);
    setSelectedCats([]);
    setIsReady(false);
    setAmHost(false);
    setRoomCode("");
    setJoinCode("");
    stopTimer();
  };

  const myScore = allScores[profile?.id ?? ""] ?? 0;
  const q = questions[currentQIdx];

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-center px-4">
        <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Swords className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t.arena.signInTitle}</h2>
        <p className="text-muted-foreground max-w-sm">{t.arena.signInDesc}</p>
        <Button onClick={() => login()} size="lg" className="bg-primary text-primary-foreground">{t.arena.signInButton}</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-6 space-y-4">

      {/* Pre-game power-up modal for Arena */}
      <PreGamePowerUpModal
        isOpen={showArenaPreGame && phase === "game"}
        onPlay={(pus) => {
          if (pus.length > 0) setPowerUpInventory(pus);
          setShowArenaPreGame(false);
        }}
        isAuthenticated={!!profile?.id}
        allowedEffects={["fifty_fifty", "shield", "steal_question", "double_score"]}
        theme="arena"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { handleLeave(); setLocation("/"); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t.arena.back}
        </button>
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full", connected ? "bg-green-400" : "bg-red-400")} />
          <span className="text-xs text-muted-foreground">{connected ? t.arena.connected : t.arena.disconnected}</span>
        </div>
      </div>

      {/* ── LOBBY ── */}
      {phase === "lobby" && (
        <div className="space-y-6 py-4">
          <div className="text-center space-y-2">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-secondary/30 to-primary/30 border border-secondary/30 flex items-center justify-center mx-auto">
              <Swords className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">{t.arena.title}</h1>
            <p className="text-muted-foreground text-sm">{t.arena.subtitle}</p>
          </div>

          {!connected && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3 text-sm text-red-400">
              <WifiOff className="h-5 w-5 shrink-0" /> {t.arena.connectingServer}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <button
              disabled={!connected}
              onClick={handleJoinOnline}
              className="group rounded-2xl border-2 border-primary/30 bg-primary/5 hover:border-primary/60 hover:bg-primary/10 p-6 text-left transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg text-foreground">{t.arena.onlineGame}</p>
                  <p className="text-sm text-muted-foreground">{t.arena.onlineGameDesc}</p>
                </div>
              </div>
            </button>

            <div className="rounded-2xl border-2 border-secondary/30 bg-secondary/5 p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0">
                  <UserPlus className="h-7 w-7 text-secondary" />
                </div>
                <div>
                  <p className="font-bold text-lg text-foreground">{t.arena.friendsGame}</p>
                  <p className="text-sm text-muted-foreground">{t.arena.friendsGameDesc}</p>
                </div>
              </div>

              <Button
                disabled={!connected}
                onClick={() => setPhase("room_setup")}
                variant="outline"
                className="border-secondary/40 text-secondary hover:bg-secondary/10 w-full"
              >
                {t.arena.createRoom}
              </Button>

              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={t.arena.enterCode}
                  maxLength={6}
                  className="bg-muted/30 border-border font-mono uppercase tracking-widest text-center"
                  onKeyDown={e => e.key === "Enter" && handleJoinRoom()}
                />
                <Button
                  disabled={!connected || !joinCode.trim()}
                  onClick={handleJoinRoom}
                  className="bg-secondary text-secondary-foreground shrink-0"
                >
                  {t.arena.joinRoomBtn}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
            <h3 className="text-sm font-semibold">{t.arena.howItWorks}</h3>
            <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
              {[
                { icon: "🎯", label: t.arena.step1 },
                { icon: "⚡", label: t.arena.step2 },
                { icon: "🏆", label: t.arena.step3 },
              ].map(({ icon, label }) => (
                <div key={label} className="space-y-1">
                  <div className="text-2xl">{icon}</div>
                  <p>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ROOM SETUP ── */}
      {phase === "room_setup" && (
        <div className="space-y-6 py-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black">{t.arena.roomSetupTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.arena.roomSetupSubtitle}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-semibold">{t.arena.numQuestions}</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuestionCount(q => Math.max(5, q - 5))}
                  className="h-10 w-10 rounded-xl border border-border bg-muted/30 hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-black text-primary">{questionCount}</span>
                  <p className="text-xs text-muted-foreground mt-1">{t.arena.questions}</p>
                </div>
                <button
                  onClick={() => setQuestionCount(q => Math.min(50, q + 5))}
                  className="h-10 w-10 rounded-xl border border-border bg-muted/30 hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[5, 10, 15, 20, 30, 50].map(n => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-semibold border transition-colors",
                      questionCount === n
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-border/70"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/10 p-4 text-sm text-muted-foreground space-y-1">
              <p>• {t.arena.playersLimit}</p>
              <p>• {t.arena.pickCategories}</p>
              <p>• {t.arena.speedBonus}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPhase("lobby")} className="flex-1">{t.arena.back}</Button>
            <Button disabled={!connected} onClick={handleCreateRoom} className="flex-1 bg-secondary text-secondary-foreground">
              {t.arena.createRoom}
            </Button>
          </div>
        </div>
      )}

      {/* ── SEARCHING ── */}
      {phase === "searching" && (
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
          <div className="relative">
            <div className="h-24 w-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Users className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-xl font-bold">{t.arena.findingOpponent}</p>
            <p className="text-muted-foreground text-sm mt-1">{t.arena.matchingOnline}</p>
          </div>
          <Button variant="ghost" onClick={handleLeave} className="text-muted-foreground">{t.arena.cancel}</Button>
        </div>
      )}

      {/* ── JOINING ── */}
      {phase === "joining_room" && (
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
          <div className="relative">
            <div className="h-24 w-24 rounded-full border-4 border-secondary/20 border-t-secondary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <UserPlus className="h-10 w-10 text-secondary" />
            </div>
          </div>
          <p className="text-xl font-bold">{t.arena.joiningRoom}</p>
          <Button variant="ghost" onClick={handleLeave} className="text-muted-foreground">{t.arena.cancel}</Button>
        </div>
      )}

      {/* ── CREATING ROOM ── */}
      {phase === "creating_room" && (
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-secondary" />
          <p className="text-xl font-bold">{t.arena.creatingRoom}</p>
        </div>
      )}

      {/* ── FRIENDS LOBBY ── */}
      {phase === "friends_lobby" && (
        <div className="space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black">{t.arena.waitingRoom}</h2>
            <p className="text-sm text-muted-foreground">{t.arena.waitingRoomSubtitle}</p>
          </div>

          <div className="rounded-2xl border-2 border-secondary/30 bg-secondary/5 p-5 flex flex-col items-center gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{t.arena.roomCode}</p>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-black tracking-[0.3em] text-secondary font-mono">{roomCode}</span>
              <button
                onClick={handleCopyCode}
                className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{lobbyPlayers.length}/6 {t.arena.players}</span>
              <span>·</span>
              <span>{lobbyPlayers.filter(p => p.isReady).length}/{lobbyPlayers.length} {t.arena.ready}</span>
              <span>·</span>
              <span>{questionCount} {t.arena.questions}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-muted/10">
              <p className="text-sm font-semibold">{t.arena.playersLabel}</p>
            </div>
            <div className="divide-y divide-border/30">
              {lobbyPlayers.map(p => (
                <div key={p.userId} className="flex items-center gap-3 px-4 py-3">
                  <div className="relative">
                    <Avatar username={p.username} imageUrl={p.profileImageUrl} size="sm" />
                    {p.isHost && (
                      <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-yellow-500 flex items-center justify-center">
                        <Crown className="h-2.5 w-2.5 text-yellow-950" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.username}</p>
                    <p className="text-xs text-muted-foreground">{p.isHost ? t.arena.host : t.arena.player}</p>
                  </div>
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                    p.isReady
                      ? "bg-green-500/15 text-green-400 border border-green-500/30"
                      : "bg-muted/30 text-muted-foreground border border-border"
                  )}>
                    {p.isReady ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {p.isReady ? t.arena.readyStatus : t.arena.notReady}
                  </div>
                </div>
              ))}
              {Array.from({ length: Math.max(0, 2 - lobbyPlayers.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-3 px-4 py-3 opacity-30">
                  <div className="h-8 w-8 rounded-full border-2 border-dashed border-border flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t.arena.waitingForPlayer}</p>
                </div>
              ))}
            </div>
          </div>

          {lobbyPlayers.length < 2 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center gap-2 text-sm text-amber-400">
              <Shield className="h-4 w-4 shrink-0" />
              {t.arena.needTwoPlayers}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleLeave} className="flex-1">{t.arena.leaveRoom}</Button>
            <Button
              onClick={handleToggleReady}
              disabled={lobbyPlayers.length < 2}
              className={cn(
                "flex-1 font-semibold",
                isReady
                  ? "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                  : "bg-green-600 hover:bg-green-500 text-white"
              )}
            >
              {isReady ? t.arena.unready : t.arena.readyExclaim}
            </Button>
          </div>

          {lobbyPlayers.length >= 2 && lobbyPlayers.every(p => p.isReady) && (
            <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center text-sm text-green-400 font-semibold">
              {t.arena.allReady}
            </div>
          )}
        </div>
      )}

      {/* ── CATEGORY SELECTION ── */}
      {phase === "category_selection" && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-black">{t.arena.pickCategoriesTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {t.arena.confirmedCount.replace("{selected}", String(categoriesProgress.selected)).replace("{total}", String(categoriesProgress.total))}
            </p>
          </div>

          {opponents.length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{t.arena.vs}</span>
                {opponents.map(o => (
                  <div key={o.userId} className="flex items-center gap-1.5">
                    <Avatar username={o.username} imageUrl={o.profileImageUrl} size="sm" />
                    <span className="text-xs font-semibold">{o.username}</span>
                  </div>
                ))}
              </div>
              {opponents.map(o => {
                const picks = categoryPicks[o.userId];
                if (!picks) return null;
                return (
                  <div key={`picks-${o.userId}`} className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-muted-foreground shrink-0">{o.username} {t.arena.picked}</span>
                    {picks.map(catId => {
                      const cat = categories.find(c => c.id === catId);
                      return (
                        <span key={catId} className="px-2 py-0.5 rounded-full bg-muted/40 border border-border text-foreground">
                          {cat?.icon ?? "📚"} {cat?.name ?? t.arena.unknown}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categories.map((cat, i) => {
              const selected = selectedCats.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCat(cat.id)}
                  disabled={!selected && selectedCats.length >= 3}
                  className={cn(
                    "relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all",
                    selected
                      ? "border-primary bg-primary/15 ring-2 ring-primary/40"
                      : selectedCats.length >= 3
                        ? "border-border/30 bg-card/30 opacity-40 cursor-not-allowed"
                        : "border-border bg-card/60 hover:border-border/70",
                  )}
                >
                  {cat.imageUrl && <img src={cat.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />}
                  <div className="relative z-10">
                    <span className="text-2xl">{cat.icon || "📚"}</span>
                    <p className="text-sm font-semibold mt-1 text-foreground leading-tight">{cat.name}</p>
                  </div>
                  {selected && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t.arena.selectedCount.replace("{count}", String(selectedCats.length))}</span>
            <Button onClick={handleSubmitCategories} disabled={selectedCats.length !== 3} className="bg-primary text-primary-foreground">
              {t.arena.confirm}
            </Button>
          </div>
        </div>
      )}

      {/* ── WAITING FOR OTHER CATEGORIES ── */}
      {phase === "waiting_categories" && (
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div>
            <p className="text-xl font-bold">{t.arena.waitingForCategories}</p>
            <p className="text-muted-foreground text-sm mt-1">
              {t.arena.confirmedOf.replace("{selected}", String(categoriesProgress.selected)).replace("{total}", String(categoriesProgress.total))}
            </p>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: categoriesProgress.total }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-3 w-3 rounded-full transition-colors",
                  i < categoriesProgress.selected ? "bg-green-400" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── GAME ── */}
      {phase === "game" && q && (
        <div className="space-y-4">
          {/* Score bar */}
          <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-center min-w-[60px]">
                <p className="text-xs text-muted-foreground">Q{currentQIdx + 1}/{questions.length}</p>
                <div className={cn(
                  "inline-flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded-full mt-0.5",
                  answerState.revealed
                    ? "text-muted-foreground bg-muted/20"
                    : answerState.submitted
                      ? "text-amber-400 bg-amber-500/10"
                      : timeLeft <= 5
                        ? "text-red-400 bg-red-500/10"
                        : "text-muted-foreground"
                )}>
                  {answerState.revealed ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> {t.arena.done}</>
                  ) : answerState.submitted ? (
                    <><Hourglass className="h-3.5 w-3.5" /> {t.arena.waiting}</>
                  ) : (
                    <><Clock className="h-3.5 w-3.5" /> {timeLeft}s</>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-wrap justify-end gap-3">
                {[{ userId: profile?.id ?? "", username: profile?.username || "Me", imageUrl: profile?.profileImageUrl as string | null | undefined }, ...opponents].map(p => (
                  <div key={p.userId} className="flex items-center gap-1.5">
                    <Avatar username={p.username} imageUrl={"imageUrl" in p ? p.imageUrl : null} size="sm" />
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground truncate max-w-[60px]">{p.userId === profile?.id ? t.arena.you : p.username}</p>
                      <p className={cn("text-sm font-black", p.userId === profile?.id ? "text-primary" : "text-secondary")}>
                        {allScores[p.userId] ?? 0}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-secondary to-primary transition-all duration-500"
                style={{ width: `${(currentQIdx / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Opponent status indicator */}
          {!answerState.revealed && (
            <div className={cn(
              "rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-medium transition-all",
              opponentAnswered
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                : "bg-muted/10 border border-border text-muted-foreground"
            )}>
              <div className={cn("h-2 w-2 rounded-full", opponentAnswered ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/40")} />
              {opponentAnswered
                ? t.arena.opponentAnsweredStatus
                : t.arena.opponentThinking}
            </div>
          )}

          {/* Question */}
          <div className="rounded-xl border border-border bg-card/80 p-5 space-y-3">
            {q.imageUrl && (
              <img src={q.imageUrl} alt="" className="w-full h-40 object-cover rounded-lg border border-border" />
            )}
            <p className="text-base font-semibold leading-snug">{q.question}</p>
          </div>

          {/* Power-up bar (only when not yet answered) */}
          {!answerState.submitted && !answerState.revealed && powerUpInventory.length > 0 && (
            <PowerUpBar
              powerUps={powerUpInventory}
              usedEffects={arenaUsedEffects}
              doubleScoreRemaining={arenaDoubleScore}
              shieldActive={arenaShieldActive}
              frozenTimer={false}
              onUse={handleArenaPowerUp}
              disabled={answerState.submitted || answerState.revealed}
              allowedEffects={["fifty_fifty", "shield", "steal_question", "double_score"]}
              currentQuestionType={q.questionType}
            />
          )}

          {/* Options */}
          <div className="grid grid-cols-1 gap-2.5 relative">
            {q.options.map((opt, i) => {
              const isHidden = arenaHiddenOptions.includes(i) && !answerState.revealed;
              if (isHidden) return (
                <div key={i} className="w-full rounded-xl border-2 border-border/20 px-4 py-3.5 opacity-20 cursor-not-allowed select-none">
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold shrink-0">
                      {["A", "B", "C", "D"][i]}
                    </span>
                    <span className="text-transparent">—</span>
                  </div>
                </div>
              );
              const isSelected = answerState.selected === i;
              const isCorrect = answerState.revealed && i === answerState.correctAnswer;
              const isWrong = answerState.revealed && isSelected && !isCorrect;
              return (
                <button
                  key={i}
                  onClick={() => !answerState.submitted && !answerState.revealed && handleAnswer(i)}
                  disabled={answerState.submitted || answerState.revealed}
                  className={cn(
                    "w-full rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all",
                    answerState.revealed
                      ? isCorrect
                        ? "border-green-500 bg-green-500/15 text-green-300"
                        : isWrong
                          ? "border-red-500 bg-red-500/15 text-red-300"
                          : "border-border bg-card/30 text-muted-foreground"
                      : isSelected
                        ? "border-amber-500 bg-amber-500/10 text-amber-200 opacity-80"
                        : answerState.submitted
                          ? "border-border bg-card/20 text-muted-foreground/50 cursor-not-allowed"
                          : "border-border bg-card/60 hover:border-border/70 hover:bg-card"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      answerState.revealed && isCorrect ? "bg-green-500 text-white" :
                        answerState.revealed && isWrong ? "bg-red-500 text-white" :
                          isSelected ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground"
                    )}>
                      {["A", "B", "C", "D"][i]}
                    </span>
                    {opt}
                    {answerState.revealed && isCorrect && <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto shrink-0" />}
                    {answerState.revealed && isWrong && <XCircle className="h-4 w-4 text-red-400 ml-auto shrink-0" />}
                  </div>
                </button>
              );
            })}

            {/* "Waiting for opponent" overlay */}
            {answerState.submitted && !answerState.revealed && (
              <div className="absolute inset-0 rounded-xl bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Hourglass className="h-8 w-8 text-amber-400 animate-pulse" />
                  <p className="text-sm font-bold text-white">{t.arena.waitingForOpponentOverlay}</p>
                  {answerState.correct !== null && (
                    <p className={cn("text-xs font-semibold", answerState.correct ? "text-green-400" : "text-red-400")}>
                      {answerState.correct ? t.arena.correctPts.replace("{points}", String(answerState.pointsEarned)) : t.arena.wrongAnswer}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Question result reveal */}
          {answerState.revealed && questionResult && (
            <div className="rounded-xl border border-border bg-card/80 p-4 space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t.arena.roundResults}</p>
              <div className="space-y-2">
                {questionResult.results.map(r => {
                  const isMe = r.userId === profile?.id;
                  const speedSec = (r.elapsedMs / 1000).toFixed(1);
                  return (
                    <div key={r.userId} className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2",
                      isMe ? "bg-primary/8 border border-primary/15" : "bg-muted/10"
                    )}>
                      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0", r.correct ? "bg-green-500/15" : "bg-red-500/15")}>
                        {r.correct
                          ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                          : <XCircle className="h-4 w-4 text-red-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold", isMe ? "text-primary" : "text-foreground")}>
                          {isMe ? t.arena.you : r.username}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.correct ? t.arena.answeredIn.replace("{sec}", speedSec) : t.arena.noCorrectAnswer}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {r.correct ? (
                          <div className="flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5 text-yellow-400" />
                            <span className="text-sm font-black text-yellow-300">+{r.points}</span>
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">+0</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {currentQIdx + 1 < questions.length && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">{t.arena.nextQuestionComingUp}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RESULTS ── */}
      {phase === "results" && gameResult && (
        <div className="space-y-6 py-4 text-center">
          <div>
            {gameResult.winner === profile?.id ? (
              <>
                <div className="h-24 w-24 rounded-full bg-yellow-500/15 border-2 border-yellow-500/30 flex items-center justify-center mx-auto mb-4">
                  <Crown className="h-12 w-12 text-yellow-400" />
                </div>
                <h2 className="text-3xl font-black text-yellow-400">{t.arena.victory}</h2>
                <p className="text-muted-foreground mt-1">{t.arena.cameOutOnTop}</p>
              </>
            ) : gameResult.winner === null ? (
              <>
                <div className="h-24 w-24 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center mx-auto mb-4">
                  <Star className="h-12 w-12 text-primary" />
                </div>
                <h2 className="text-3xl font-black text-primary">{t.arena.draw}</h2>
                <p className="text-muted-foreground mt-1">{t.arena.perfectlyMatched}</p>
              </>
            ) : (
              <>
                <div className="h-24 w-24 rounded-full bg-muted/20 border-2 border-border flex items-center justify-center mx-auto mb-4">
                  <Trophy className="h-12 w-12 text-muted-foreground" />
                </div>
                <h2 className="text-3xl font-black text-muted-foreground">{t.arena.defeat}</h2>
                <p className="text-muted-foreground mt-1">{t.arena.betterLuckNextTime}</p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-muted/10">
              <p className="text-sm font-semibold">{t.arena.finalScores}</p>
            </div>
            <div className="divide-y divide-border/30">
              {[{ userId: profile?.id ?? "", username: profile?.username || "Me", profileImageUrl: profile?.profileImageUrl ?? null }, ...opponents]
                .map(p => ({ ...p, score: gameResult.scores[p.userId] ?? 0 }))
                .sort((a, b) => b.score - a.score)
                .map((p, rank) => (
                  <div key={p.userId} className={cn("flex items-center gap-3 px-4 py-3", rank === 0 ? "bg-yellow-500/5" : "")}>
                    <span className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-sm font-black shrink-0",
                      rank === 0 ? "bg-yellow-500/20 text-yellow-400" :
                        rank === 1 ? "bg-slate-400/20 text-slate-400" :
                          rank === 2 ? "bg-amber-700/20 text-amber-600" :
                            "bg-muted/30 text-muted-foreground"
                    )}>
                      {rank === 0 ? "👑" : rank + 1}
                    </span>
                    <Avatar username={p.username} imageUrl={p.profileImageUrl} size="sm" />
                    <span className={cn("flex-1 text-sm font-semibold text-left truncate", p.userId === profile?.id ? "text-primary" : "")}>
                      {p.userId === profile?.id ? t.arena.you : p.username}
                      {gameResult.winner === p.userId && <span className="ml-2 text-xs text-yellow-400">{t.arena.winner}</span>}
                    </span>
                    <span className="text-lg font-black text-foreground">{p.score}</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => { setPhase("lobby"); setOpponents([]); setGameResult(null); setLobbyPlayers([]); }}
              className="bg-primary text-primary-foreground"
            >
              {t.arena.playAgain}
            </Button>
            <Button variant="outline" onClick={() => setLocation("/")}>{t.arena.home}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
