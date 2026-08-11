import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  useGetAdminStats, getGetAdminStatsQueryKey,
  useAdminListCategories, getAdminListCategoriesQueryKey,
  useAdminCreateCategory, useAdminUpdateCategory, useAdminDeleteCategory,
  useAdminListQuestions, getAdminListQuestionsQueryKey,
  useAdminCreateQuestion, useAdminUpdateQuestion, useAdminDeleteQuestion,
  useGetProfile, getGetProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Shield, LayoutGrid, HelpCircle, Trash2, Plus, Pencil, Users, Trophy,
  Tag, ChevronRight, ChevronDown, Image, AlignLeft, ToggleLeft,
  CheckCircle2, Search, BarChart3, ArrowUp, ArrowDown, Layers,
  ListOrdered, Shuffle, Music, Crosshair, GripVertical, Settings, Eye, EyeOff, KeyRound,
  UserCheck, UserX, Crown, UserRound, Medal, Gamepad2, Gem, Heart, ShoppingBag, ToggleRight,
  ClipboardList, Zap, Target, Upload, Download, AlertTriangle, Loader2, Coins, Film,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { authFetch } from "@/lib/api";
import { isSafeMediaUrl, isVideoMediaUrl } from "@/lib/media";

type QuestionType = "multiple_choice" | "true_false" | "image" | "fill_blank" | "ordering" | "matching" | "audio" | "hotspot";
type AdminSection = "overview" | "categories" | "questions" | "users" | "settings" | "badges" | "marketplace" | "daily-tasks" | "economy";

const ECONOMY_MODE_LABELS: Record<string, string> = {
  quiz: "Quiz (Solo)",
  worlds: "Worlds / Levels",
  blitz: "Blitz",
  arena: "Arena (1v1 Ranked)",
  streak_checkin: "Streak Check-in",
  streak_ad: "Streak Ad Bonus",
  hearts_bonus: "Hearts Fail-Bonus Ad",
  wheel: "Daily Wheel",
};

const ECONOMY_METRIC_LABELS: Record<string, string> = {
  coinsPerCorrect: "Coins per Correct Answer",
  scorePerCorrect: "Score per Correct Answer",
  xpPerCorrect: "Battle Pass XP per Correct Answer",
  xpOnComplete: "Battle Pass XP on Completion",
  coinsPerCorrectBase: "Coins per Correct (before difficulty ×)",
  scorePerCorrectBase: "Score per Correct (before difficulty ×)",
  xpPerCorrectOnComplete: "Battle Pass XP per Correct (on completion)",
  xpCompleteMinimum: "Minimum Battle Pass XP on Completion",
  coinsPerWin: "Coins per Win",
  coinsLostPerLoss: "Coins Lost per Loss",
  scorePerWin: "Score per Win",
  xpPerWin: "Battle Pass XP per Win",
  milestone7Coins: "7-Day Milestone Coins",
  milestone30Coins: "30-Day Milestone Coins",
  milestone100Coins: "100-Day Milestone Coins",
  xpPerCheckin: "Battle Pass XP per Check-in",
  coins: "Coins per Ad Watch",
  scoreMultiplier: "Score Multiplier (× session score)",
  coins_50: "Wheel Segment: 50-Coin Slot",
  coins_100: "Wheel Segment: 100-Coin Slot",
  coins_200: "Wheel Segment: 200-Coin Slot",
  jackpot: "Wheel Segment: Jackpot Coins",
  powerup_fallback: "Wheel: Power-up Fallback Coins",
  xp_100: "Wheel Segment: XP Amount",
};

function economyMetricLabel(metric: string): string {
  return ECONOMY_METRIC_LABELS[metric] ?? metric;
}

const QUESTION_TYPE_CONFIG: Record<QuestionType, { label: string; icon: any; color: string; description: string }> = {
  multiple_choice: { label: "Multiple Choice", icon: CheckCircle2, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30", description: "4 answer options, one correct" },
  true_false: { label: "True / False", icon: ToggleLeft, color: "text-green-400 bg-green-500/10 border-green-500/30", description: "Two options: True or False" },
  image: { label: "Image Question", icon: Image, color: "text-violet-400 bg-violet-500/10 border-violet-500/30", description: "Show an image with the question" },
  fill_blank: { label: "Fill in the Blank", icon: AlignLeft, color: "text-amber-400 bg-amber-500/10 border-amber-500/30", description: "Player types the correct answer" },
  ordering: { label: "Ordering", icon: ListOrdered, color: "text-orange-400 bg-orange-500/10 border-orange-500/30", description: "Arrange items in correct order" },
  matching: { label: "Matching Pairs", icon: Shuffle, color: "text-pink-400 bg-pink-500/10 border-pink-500/30", description: "Match items from two columns" },
  audio: { label: "Audio Question", icon: Music, color: "text-sky-400 bg-sky-500/10 border-sky-500/30", description: "Play a sound clip and answer" },
  hotspot: { label: "Hotspot", icon: Crosshair, color: "text-rose-400 bg-rose-500/10 border-rose-500/30", description: "Click the correct region on an image" },
};

const DIFFICULTY_CONFIG = [
  { value: 1, label: "Easy", color: "text-green-400 bg-green-500/10 border-green-500/30" },
  { value: 2, label: "Medium", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  { value: 3, label: "Hard", color: "text-red-400 bg-red-500/10 border-red-500/30" },
];

const BLANK_CAT = { name: "", icon: "", color: "#6366f1", imageUrl: "", parentId: "" };
const BLANK_Q = {
  categoryId: "",
  questionType: "multiple_choice" as QuestionType,
  question: "",
  imageUrl: "",
  options: ["", "", "", ""] as string[],
  correctAnswer: 0,
  explanation: "",
  difficulty: 1,
};

function WorldMediaPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const value = url.trim();
  const isVideo = isVideoMediaUrl(value);

  useEffect(() => setFailed(false), [value]);

  if (!value) return null;
  if (!isSafeMediaUrl(value)) {
    return <p className="flex items-center gap-2 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" />Enter a valid HTTP(S) or site-relative media URL.</p>;
  }
  if (failed) {
    return <p className="flex items-center gap-2 border border-destructive/25 bg-destructive/5 px-3 py-3 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />The media could not be loaded. Check that the URL is public and allows browser playback.</p>;
  }

  return (
    <div className="relative mt-2 h-44 overflow-hidden border border-border bg-background">
      {isVideo ? (
        <video src={value} autoPlay loop muted playsInline controls preload="metadata" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <img src={value} alt="World background preview" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
      <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 bg-background/90 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-primary backdrop-blur-sm rtl:left-auto rtl:right-3">
        {isVideo ? <Film className="h-3 w-3" /> : <Image className="h-3 w-3" />}
        {isVideo ? "Looping video" : "Image / animated image"}
      </span>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/55 via-transparent to-transparent" />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-3xl font-black">{value ?? 0}</p>
    </div>
  );
}

function QuestionTypeBadge({ type }: { type: QuestionType }) {
  const cfg = QUESTION_TYPE_CONFIG[type] ?? QUESTION_TYPE_CONFIG.multiple_choice;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: number }) {
  const cfg = DIFFICULTY_CONFIG[difficulty - 1] ?? DIFFICULTY_CONFIG[0];
  return (
    <span className={cn("inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium", cfg.color)}>
      {cfg.label}
    </span>
  );
}

export default function Admin() {
  const { isAuthenticated } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: profileLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), enabled: isAuthenticated },
  });

  const isAdmin = profile?.role === "admin";

  const { data: stats, isLoading: statsLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), enabled: isAdmin },
  });

  const { data: allCategories, isLoading: catsLoading } = useAdminListCategories({
    query: { queryKey: getAdminListCategoriesQueryKey(), enabled: isAdmin },
  });

  const [section, setSection] = useState<AdminSection>("overview");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [qTypeFilter, setQTypeFilter] = useState<QuestionType | "all">("all");
  const [qCatFilter, setQCatFilter] = useState<string>("all");
  const [qSearch, setQSearch] = useState("");
  const [qOffset, setQOffset] = useState(0);
  const QUESTIONS_PAGE_SIZE = 200;

  const qQueryParams = {
    offset: qOffset,
    limit: QUESTIONS_PAGE_SIZE,
    ...(qCatFilter !== "all" ? { categoryId: qCatFilter } : {}),
  };
  const { data: questionsData, isLoading: qsLoading } = useAdminListQuestions(
    qQueryParams,
    { query: { queryKey: getAdminListQuestionsQueryKey(qQueryParams), enabled: isAdmin } }
  );

  const questions = (questionsData as any)?.questions ?? [];
  const questionsTotal = (questionsData as any)?.total ?? questions.length;
  const rootCategories = (allCategories || []).filter((c: any) => !c.parentId);
  const subCategories = (allCategories || []).filter((c: any) => c.parentId);

  const [catDialog, setCatDialog] = useState<{ mode: "create" | "edit"; item?: any; forParent?: string } | null>(null);
  const [catForm, setCatForm] = useState({ ...BLANK_CAT });

  const [qDialog, setQDialog] = useState<{ mode: "create" | "edit"; item?: any } | null>(null);
  const [qForm, setQForm] = useState({ ...BLANK_Q, options: ["", "", "", ""] });

  // Excel bulk import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);

  const closeImportDialog = () => {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportPreview(null);
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await authFetch("/api/admin/questions/import/template");
      if (!res.ok) throw new Error("Failed to download template");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "questions_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to download template", variant: "destructive" });
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) return;
    setImportPreviewing(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await authFetch("/api/admin/questions/import/preview", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setImportPreview(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to preview import", variant: "destructive" });
    } finally {
      setImportPreviewing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview?.importId) return;
    setImportCommitting(true);
    try {
      const res = await authFetch("/api/admin/questions/import/commit", {
        method: "POST",
        body: JSON.stringify({ importId: importPreview.importId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast({
        title: "Import complete",
        description: `${data.questionsImported} question(s) imported${data.categoriesCreated > 0 ? `, ${data.categoriesCreated} categor${data.categoriesCreated === 1 ? "y" : "ies"} created` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ offset: 0, limit: 200 }) });
      queryClient.invalidateQueries({ queryKey: getAdminListCategoriesQueryKey() });
      closeImportDialog();
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to commit import", variant: "destructive" });
    } finally {
      setImportCommitting(false);
    }
  };

  // Complex type state
  const [orderingItems, setOrderingItems] = useState<string[]>(["", "", "", ""]);
  const [matchingPairs, setMatchingPairs] = useState<{ left: string; right: string }[]>([
    { left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" },
  ]);
  const [hotspotBox, setHotspotBox] = useState({ x1: 20, y1: 20, x2: 80, y2: 80 });

  // Users state
  const [usersData, setUsersData] = useState<any[] | null>(null);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [rolePending, setRolePending] = useState<string | null>(null);
  const [coinsEditor, setCoinsEditor] = useState<{ userId: string; value: string } | null>(null);
  const [coinsPending, setCoinsPending] = useState<string | null>(null);
  const [heartsEditor, setHeartsEditor] = useState<{ userId: string; value: string } | null>(null);
  const [heartsPending, setHeartsPending] = useState<string | null>(null);

  // Badges state
  const TRIGGER_TYPES = [
    { value: "manual", label: "Manual (admin award only)", hasValue: false },
    { value: "first_arena_win", label: "First Arena Win", hasValue: false },
    { value: "perfect_quiz", label: "Perfect Quiz (100% correct)", hasValue: false },
    { value: "speed_answer", label: "Speed Answer (under X ms)", hasValue: true, placeholder: "e.g. 3000" },
    { value: "streak_days", label: "Streak Days (>= X days)", hasValue: true, placeholder: "e.g. 7" },
    { value: "total_arena_wins", label: "Total Arena Wins (>= X)", hasValue: true, placeholder: "e.g. 10" },
    { value: "games_played", label: "Games Played (>= X)", hasValue: true, placeholder: "e.g. 1" },
    { value: "total_score", label: "Total Score (>= X)", hasValue: true, placeholder: "e.g. 10000" },
  ];
  const BLANK_BADGE = { name: "", description: "", icon: "🏆", imageUrl: "", coinReward: 50, triggerType: "manual", triggerValue: "" as string, isActive: true, sortOrder: 0 };
  const [badgesList, setBadgesList] = useState<any[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [badgeDialog, setBadgeDialog] = useState<{ mode: "create" | "edit"; item?: any } | null>(null);
  const [badgeForm, setBadgeForm] = useState({ ...BLANK_BADGE });
  const [badgeDeletePending, setBadgeDeletePending] = useState<string | null>(null);

  const fetchUsers = async (search = "") => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0", ...(search ? { search } : {}) });
      const res = await authFetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setUsersData(data.users ?? []);
      setUsersTotal(data.total ?? 0);
    } catch {
      toast({ title: "Error", description: "Could not load users", variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  };

  const setUserRole = async (userId: string, role: "admin" | "player") => {
    setRolePending(userId);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      setUsersData(prev => prev?.map(u => u.id === userId ? { ...u, role } : u) ?? null);
      toast({
        title: role === "player" ? "Admin revoked" : "Admin granted",
        description: role === "player" ? "User has been demoted to player." : "User has been promoted to admin.",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to update role", variant: "destructive" });
    } finally {
      setRolePending(null);
    }
  };

  const adjustCoins = async (userId: string, delta: number) => {
    setCoinsPending(userId);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/coins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coins: delta }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      const data = await res.json();
      setUsersData(prev => prev?.map(u => u.id === userId ? { ...u, coins: data.coins } : u) ?? null);
      setCoinsEditor(null);
      toast({
        title: delta >= 0 ? `+${delta} coins added` : `${Math.abs(delta)} coins removed`,
        description: `New balance: ${data.coins} coins`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to adjust coins", variant: "destructive" });
    } finally {
      setCoinsPending(null);
    }
  };

  const adjustHearts = async (userId: string, delta: number) => {
    setHeartsPending(userId);
    try {
      const res = await authFetch(`/api/admin/users/${userId}/hearts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hearts: delta }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      const data = await res.json();
      setUsersData(prev => prev?.map(u => u.id === userId ? { ...u, hearts: data.hearts } : u) ?? null);
      setHeartsEditor(null);
      toast({
        title: delta >= 0 ? `+${delta} heart${delta !== 1 ? "s" : ""} added` : `${Math.abs(delta)} heart${Math.abs(delta) !== 1 ? "s" : ""} removed`,
        description: `New balance: ${data.hearts} / 6 hearts`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to adjust hearts", variant: "destructive" });
    } finally {
      setHeartsPending(null);
    }
  };

  const fetchBadges = async () => {
    setBadgesLoading(true);
    try {
      const res = await authFetch("/api/admin/badges");
      const data = await res.json();
      setBadgesList(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Could not load badges", variant: "destructive" });
    } finally {
      setBadgesLoading(false);
    }
  };

  const saveBadge = async () => {
    const isCreate = badgeDialog?.mode === "create";
    const url = isCreate ? "/api/admin/badges" : `/api/admin/badges/${badgeDialog?.item?.id}`;
    try {
      const res = await authFetch(url, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...badgeForm,
          triggerValue: badgeForm.triggerValue !== "" ? Number(badgeForm.triggerValue) : null,
          coinReward: Number(badgeForm.coinReward),
          sortOrder: Number(badgeForm.sortOrder),
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      await fetchBadges();
      setBadgeDialog(null);
      toast({ title: isCreate ? "Badge created" : "Badge updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to save badge", variant: "destructive" });
    }
  };

  const deleteBadge = async (id: string) => {
    setBadgeDeletePending(id);
    try {
      await authFetch(`/api/admin/badges/${id}`, { method: "DELETE" });
      await fetchBadges();
      toast({ title: "Badge deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete badge", variant: "destructive" });
    } finally {
      setBadgeDeletePending(null);
    }
  };

  const toggleBadgeActive = async (badge: any) => {
    try {
      await authFetch(`/api/admin/badges/${badge.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !badge.isActive }),
      });
      await fetchBadges();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const openBadgeCreate = () => {
    setBadgeForm({ ...BLANK_BADGE });
    setBadgeDialog({ mode: "create" });
  };

  const openBadgeEdit = (item: any) => {
    setBadgeForm({
      name: item.name,
      description: item.description,
      icon: item.icon || "🏆",
      imageUrl: item.imageUrl || "",
      coinReward: item.coinReward ?? 0,
      triggerType: item.triggerType,
      triggerValue: item.triggerValue != null ? String(item.triggerValue) : "",
      isActive: item.isActive !== false,
      sortOrder: item.sortOrder ?? 0,
    });
    setBadgeDialog({ mode: "edit", item });
  };

  // Marketplace state
  const BLANK_MKT = { name: "", description: "", type: "cosmetic", effect: "", emoji: "✨", price: 300, isActive: true };
  const COSMETIC_EFFECT_OPTIONS = [
    { group: "Avatar Frames", options: [
      { value: "frame_gold", label: "👑 Gold Crown" }, { value: "frame_fire", label: "🔥 Fire Ring" },
      { value: "frame_ice", label: "❄️ Ice Crystal" }, { value: "frame_diamond", label: "💎 Diamond Aura" },
      { value: "frame_neon", label: "⚡ Neon Glow" }, { value: "frame_rainbow", label: "🌈 Rainbow" },
      { value: "frame_dark", label: "🌑 Dark Void" }, { value: "frame_royal", label: "👸 Royal Purple" },
    ]},
    { group: "Profile Backgrounds", options: [
      { value: "bg_sunset", label: "🌅 Sunset" }, { value: "bg_ocean", label: "🌊 Ocean Depths" },
      { value: "bg_galaxy", label: "🌌 Galaxy" }, { value: "bg_forest", label: "🌲 Forest" },
      { value: "bg_cyberpunk", label: "🤖 Cyberpunk" }, { value: "bg_midnight", label: "🌙 Midnight" },
      { value: "bg_aurora", label: "🌠 Aurora" }, { value: "bg_lava", label: "🌋 Lava" },
    ]},
    { group: "Username Colors", options: [
      { value: "color_gold", label: "🟡 Gold" }, { value: "color_cyan", label: "🔵 Cyan" },
      { value: "color_purple", label: "🟣 Purple" }, { value: "color_rose", label: "🔴 Rose" },
      { value: "color_emerald", label: "🟢 Emerald" }, { value: "color_orange", label: "🟠 Orange" },
      { value: "color_rainbow", label: "🌈 Rainbow Text" },
    ]},
    { group: "Powerup Effects", options: [
      { value: "fifty_fifty", label: "✂️ 50/50" }, { value: "freeze_timer", label: "❄️ Freeze Timer" },
      { value: "extra_time", label: "⏰ Extra Time" }, { value: "skip_question", label: "⏭️ Skip Question" },
      { value: "double_score", label: "✖️ Double Score" }, { value: "lucky_wheel", label: "🎰 Lucky Wheel" },
    ]},
  ];
  const [mktItems, setMktItems] = useState<any[]>([]);
  const [mktLoading, setMktLoading] = useState(false);
  const [mktDialog, setMktDialog] = useState<{ mode: "create" | "edit"; item?: any } | null>(null);
  const [mktForm, setMktForm] = useState({ ...BLANK_MKT });
  const [mktSaving, setMktSaving] = useState(false);
  const [mktDeletePending, setMktDeletePending] = useState<string | null>(null);

  const fetchMktItems = async () => {
    setMktLoading(true);
    try {
      const res = await authFetch("/api/admin/marketplace");
      const data = await res.json();
      setMktItems(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Could not load marketplace items", variant: "destructive" });
    } finally {
      setMktLoading(false);
    }
  };

  const saveMktItem = async () => {
    setMktSaving(true);
    const isCreate = mktDialog?.mode === "create";
    const url = isCreate ? "/api/admin/marketplace" : `/api/admin/marketplace/${mktDialog?.item?.id}`;
    try {
      const res = await authFetch(url, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...mktForm, price: Number(mktForm.price) }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      await fetchMktItems();
      setMktDialog(null);
      toast({ title: isCreate ? "Item created" : "Item updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to save item", variant: "destructive" });
    } finally {
      setMktSaving(false);
    }
  };

  const deleteMktItem = async (id: string) => {
    setMktDeletePending(id);
    try {
      await authFetch(`/api/admin/marketplace/${id}`, { method: "DELETE" });
      await fetchMktItems();
      toast({ title: "Item deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    } finally {
      setMktDeletePending(null);
    }
  };

  const toggleMktActive = async (item: any) => {
    try {
      await authFetch(`/api/admin/marketplace/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await fetchMktItems();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  // Daily Tasks state
  const BLANK_TASK = { title: "", description: "", type: "quiz_count", targetValue: 3, coinReward: 50, xpReward: 100, categoryId: "", isActive: true };
  const [taskItems, setTaskItems] = useState<any[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ mode: "create" | "edit"; item?: any } | null>(null);
  const [taskForm, setTaskForm] = useState({ ...BLANK_TASK });
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskDeletePending, setTaskDeletePending] = useState<string | null>(null);

  const fetchTaskItems = async () => {
    setTaskLoading(true);
    try {
      const res = await authFetch("/api/admin/daily-tasks");
      const data = await res.json();
      setTaskItems(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Could not load daily tasks", variant: "destructive" });
    } finally {
      setTaskLoading(false);
    }
  };

  const saveTaskItem = async () => {
    setTaskSaving(true);
    const isCreate = taskDialog?.mode === "create";
    const url = isCreate ? "/api/admin/daily-tasks" : `/api/admin/daily-tasks/${taskDialog?.item?.id}`;
    try {
      const payload: any = { ...taskForm, targetValue: Number(taskForm.targetValue), coinReward: Number(taskForm.coinReward), xpReward: Number(taskForm.xpReward) };
      if (!payload.categoryId) delete payload.categoryId;
      const res = await authFetch(url, { method: isCreate ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      await fetchTaskItems();
      setTaskDialog(null);
      toast({ title: isCreate ? "Task created" : "Task updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to save task", variant: "destructive" });
    } finally {
      setTaskSaving(false);
    }
  };

  const deleteTaskItem = async (id: string) => {
    setTaskDeletePending(id);
    try {
      await authFetch(`/api/admin/daily-tasks/${id}`, { method: "DELETE" });
      await fetchTaskItems();
      toast({ title: "Task deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    } finally {
      setTaskDeletePending(null);
    }
  };

  const toggleTaskActive = async (item: any) => {
    try {
      await authFetch(`/api/admin/daily-tasks/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !item.isActive }) });
      await fetchTaskItems();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  // Economy state
  const [economyRates, setEconomyRates] = useState<Record<string, Record<string, number>>>({});
  const [economyDrafts, setEconomyDrafts] = useState<Record<string, Record<string, string>>>({});
  const [economyLoading, setEconomyLoading] = useState(false);
  const [economySavingMode, setEconomySavingMode] = useState<string | null>(null);

  const fetchEconomy = async () => {
    setEconomyLoading(true);
    try {
      const res = await authFetch("/api/admin/economy");
      const data = await res.json();
      setEconomyRates(data);
      const drafts: Record<string, Record<string, string>> = {};
      for (const [mode, metrics] of Object.entries(data as Record<string, Record<string, number>>)) {
        drafts[mode] = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, String(v)]));
      }
      setEconomyDrafts(drafts);
    } catch {
      toast({ title: "Error", description: "Could not load economy settings", variant: "destructive" });
    } finally {
      setEconomyLoading(false);
    }
  };

  const setEconomyDraftValue = (mode: string, metric: string, value: string) => {
    setEconomyDrafts(prev => ({ ...prev, [mode]: { ...prev[mode], [metric]: value } }));
  };

  const saveEconomyMode = async (mode: string) => {
    setEconomySavingMode(mode);
    try {
      const draft = economyDrafts[mode] ?? {};
      const updates: Record<string, number> = {};
      for (const [metric, raw] of Object.entries(draft)) {
        const n = Number(raw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
          throw new Error(`"${economyMetricLabel(metric)}" must be a non-negative whole number`);
        }
        updates[metric] = n;
      }
      const res = await authFetch(`/api/admin/economy/${mode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      setEconomyRates(prev => ({ ...prev, [mode]: updates }));
      toast({ title: `${ECONOMY_MODE_LABELS[mode] ?? mode} rates updated` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to save economy rates", variant: "destructive" });
    } finally {
      setEconomySavingMode(null);
    }
  };

  // Settings state
  const [currentAdminCode, setCurrentAdminCode] = useState<string | null>(null);
  const [newAdminCode, setNewAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);

  const fetchAdminCode = async () => {
    setSettingsLoading(true);
    try {
      const res = await authFetch("/api/admin/settings");
      const data = await res.json();
      setCurrentAdminCode(data.adminCode ?? "");
    } catch {
      toast({ title: "Error", description: "Could not load settings", variant: "destructive" });
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveAdminCode = async () => {
    if (!newAdminCode.trim() || newAdminCode.trim().length < 4) {
      toast({ title: "Code too short", description: "Admin code must be at least 4 characters.", variant: "destructive" });
      return;
    }
    setCodeLoading(true);
    try {
      const res = await authFetch("/api/admin/settings/admin-code", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminCode: newAdminCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      const data = await res.json();
      setCurrentAdminCode(data.adminCode);
      setNewAdminCode("");
      toast({ title: "Admin code updated", description: "The new code is now active." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to update code", variant: "destructive" });
    } finally {
      setCodeLoading(false);
    }
  };

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: getAdminListCategoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ offset: 0, limit: 200 }) });
    queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
  };

  const createCat = useAdminCreateCategory({ mutation: { onSuccess: () => { refetchAll(); setCatDialog(null); toast({ title: "Category created" }); } } });
  const updateCat = useAdminUpdateCategory({ mutation: { onSuccess: () => { refetchAll(); setCatDialog(null); toast({ title: "Category updated" }); } } });
  const deleteCat = useAdminDeleteCategory({ mutation: { onSuccess: () => { refetchAll(); toast({ title: "Category deleted" }); } } });
  const createQ = useAdminCreateQuestion({ mutation: { onSuccess: () => { refetchAll(); setQDialog(null); toast({ title: "Question created" }); }, onError: (err: any) => { toast({ title: err?.status === 409 ? "Duplicate question" : "Error", description: err?.status === 409 ? "This question already exists in the selected category." : err?.message, variant: "destructive" }); } } });
  const updateQ = useAdminUpdateQuestion({ mutation: { onSuccess: () => { refetchAll(); setQDialog(null); toast({ title: "Question updated" }); }, onError: (err: any) => { toast({ title: err?.status === 409 ? "Duplicate question" : "Error", description: err?.status === 409 ? "This question already exists in the selected category." : err?.message, variant: "destructive" }); } } });
  const deleteQ = useAdminDeleteQuestion({ mutation: { onSuccess: () => { refetchAll(); toast({ title: "Question deleted" }); } } });

  const openCatCreate = (forParent?: string) => {
    setCatForm({ ...BLANK_CAT, parentId: forParent ?? "" });
    setCatDialog({ mode: "create", forParent });
  };
  const openCatEdit = (item: any) => {
    setCatForm({ name: item.name, icon: item.icon || "", color: item.color || "#6366f1", imageUrl: item.imageUrl || "", parentId: item.parentId || "" });
    setCatDialog({ mode: "edit", item });
  };
  const saveCat = () => {
    const backgroundMediaUrl = catForm.imageUrl.trim();
    if (!isSafeMediaUrl(backgroundMediaUrl)) {
      toast({ title: "Invalid background URL", description: "Use an HTTP(S) URL or a site-relative path.", variant: "destructive" });
      return;
    }
    const data: any = { name: catForm.name, nameAr: catForm.name, icon: catForm.icon, color: catForm.color, parentId: catForm.parentId || null };
    data.imageUrl = backgroundMediaUrl;
    if (catDialog?.mode === "create") createCat.mutate({ data });
    else updateCat.mutate({ categoryId: catDialog!.item.id, data });
  };

  const openQCreate = (categoryId?: string) => {
    setQForm({ ...BLANK_Q, options: ["", "", "", ""], categoryId: categoryId ?? "" });
    setOrderingItems(["", "", "", ""]);
    setMatchingPairs([{ left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }]);
    setHotspotBox({ x1: 20, y1: 20, x2: 80, y2: 80 });
    setQDialog({ mode: "create" });
  };

  const openQEdit = (item: any) => {
    const type: QuestionType = item.questionType ?? "multiple_choice";
    let opts = item.options ?? [];

    if (type === "ordering") {
      while (opts.length < 4) opts = [...opts, ""];
      setOrderingItems(opts);
    } else if (type === "matching") {
      const pairs = opts.map((o: string) => {
        const [left, right] = o.split(":::");
        return { left: left?.trim() ?? "", right: right?.trim() ?? "" };
      });
      while (pairs.length < 4) pairs.push({ left: "", right: "" });
      setMatchingPairs(pairs.slice(0, 4));
    } else if (type === "hotspot") {
      const parts = (opts[0] ?? "20,20,80,80").split(",").map(Number);
      setHotspotBox({ x1: parts[0] ?? 20, y1: parts[1] ?? 20, x2: parts[2] ?? 80, y2: parts[3] ?? 80 });
    } else if (type === "multiple_choice" || type === "image" || type === "audio") {
      while (opts.length < 4) opts = [...opts, ""];
      opts = opts.slice(0, 4);
    } else if (type === "true_false") {
      opts = ["True", "False"];
    }

    setQForm({
      categoryId: item.categoryId,
      questionType: type,
      question: item.question,
      imageUrl: item.imageUrl ?? "",
      options: type === "ordering" || type === "matching" || type === "hotspot" ? [] : opts,
      correctAnswer: item.correctAnswer ?? 0,
      explanation: item.explanation ?? "",
      difficulty: item.difficulty ?? 1,
    });
    setQDialog({ mode: "edit", item });
  };

  const handleTypeChange = (type: QuestionType) => {
    let opts = qForm.options;
    if (type === "true_false") opts = ["True", "False"];
    else if (type === "fill_blank") opts = [opts[0] ?? ""];
    else if (type === "multiple_choice" || type === "image" || type === "audio") {
      while (opts.length < 4) opts = [...opts, ""];
      opts = opts.slice(0, 4);
    } else if (type === "ordering") {
      if (orderingItems.every(i => i === "")) setOrderingItems(["", "", "", ""]);
    } else if (type === "matching") {
      if (matchingPairs.every(p => p.left === "" && p.right === "")) {
        setMatchingPairs([{ left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }]);
      }
    }
    setQForm(f => ({ ...f, questionType: type, options: opts, correctAnswer: 0 }));
  };

  const buildQPayload = () => {
    const type = qForm.questionType;
    let options: string[] = [];
    let correctAnswer = 0;
    let imageUrl: string | undefined = undefined;

    if (type === "ordering") {
      options = orderingItems.filter(i => i.trim() !== "");
      correctAnswer = 0;
    } else if (type === "matching") {
      options = matchingPairs
        .filter(p => p.left.trim() !== "" && p.right.trim() !== "")
        .map(p => `${p.left.trim()}:::${p.right.trim()}`);
      correctAnswer = 0;
    } else if (type === "hotspot") {
      options = [`${hotspotBox.x1},${hotspotBox.y1},${hotspotBox.x2},${hotspotBox.y2}`];
      imageUrl = qForm.imageUrl || undefined;
      correctAnswer = 0;
    } else if (type === "true_false") {
      options = ["True", "False"];
      correctAnswer = Number(qForm.correctAnswer);
    } else if (type === "fill_blank") {
      options = [qForm.options[0] ?? ""];
      correctAnswer = 0;
    } else {
      options = qForm.options.slice(0, 4);
      correctAnswer = Number(qForm.correctAnswer);
      if ((type === "image" || type === "audio") && qForm.imageUrl) imageUrl = qForm.imageUrl;
    }

    return { options, correctAnswer, imageUrl };
  };

  const saveQ = () => {
    const { options, correctAnswer, imageUrl } = buildQPayload();
    const data: any = {
      categoryId: qForm.categoryId,
      questionType: qForm.questionType,
      question: qForm.question,
      options,
      optionsAr: options,
      correctAnswer,
      explanation: qForm.explanation || undefined,
      difficulty: Number(qForm.difficulty),
    };
    if (imageUrl) data.imageUrl = imageUrl;
    if (qDialog?.mode === "create") createQ.mutate({ data });
    else updateQ.mutate({ questionId: qDialog!.item.id, data });
  };

  const toggleExpand = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredQs = questions.filter((q: any) => {
    if (qTypeFilter !== "all" && (q.questionType ?? "multiple_choice") !== qTypeFilter) return false;
    if (qCatFilter !== "all" && q.categoryId !== qCatFilter) return false;
    if (qSearch && !q.question.toLowerCase().includes(qSearch.toLowerCase())) return false;
    return true;
  });

  const getCategoryName = (id: string) => allCategories?.find((c: any) => c.id === id)?.name ?? id;

  useEffect(() => {
    if (section === "badges" && isAdmin) fetchBadges();
    if (section === "marketplace" && isAdmin) fetchMktItems();
    if (section === "daily-tasks" && isAdmin) fetchTaskItems();
    if (section === "economy" && isAdmin) fetchEconomy();
  }, [section, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setQOffset(0);
  }, [qCatFilter]);

  const moveOrderingItem = (idx: number, dir: -1 | 1) => {
    const next = [...orderingItems];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrderingItems(next);
  };

  if (!isAuthenticated || profileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-center px-4">
        <Shield className="h-16 w-16 text-muted-foreground opacity-30" />
        <h2 className="text-2xl font-bold">Admin Access Required</h2>
        <p className="text-muted-foreground max-w-sm">
          You don't have admin privileges. Enter an admin code in your profile to gain access.
        </p>
        <Button onClick={() => setLocation("/profile")} variant="outline">Go to Profile</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center shrink-0">
            <Shield className="h-6 w-6 text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Manage content, categories and questions</p>
          </div>
        </div>

        {/* Inner Nav */}
        <div className="flex gap-2 border-b border-border pb-0">
          {[
            { id: "overview", label: "Overview", icon: BarChart3 },
            { id: "categories", label: "Categories", icon: Layers },
            { id: "questions", label: "Questions", icon: HelpCircle },
            { id: "users", label: "Users", icon: Users },
            { id: "settings", label: "Settings", icon: Settings },
            { id: "badges", label: "Badges", icon: Medal },
            { id: "marketplace", label: "Marketplace", icon: ShoppingBag },
            { id: "daily-tasks", label: "Daily Tasks", icon: ClipboardList },
            { id: "economy", label: "Economy", icon: Coins },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id as AdminSection)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                section === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Overview Section */}
        {section === "overview" && (
          <div className="space-y-6">
            {statsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Total Users" value={(stats as any)?.totalUsers ?? 0} color="bg-primary/10 text-primary" />
                <StatCard icon={Trophy} label="Quiz Sessions" value={(stats as any)?.totalGamesPlayed ?? 0} color="bg-yellow-500/10 text-yellow-400" />
                <StatCard icon={Tag} label="Categories" value={(stats as any)?.totalCategories ?? 0} color="bg-secondary/10 text-secondary" />
                <StatCard icon={HelpCircle} label="Questions" value={(stats as any)?.totalQuestions ?? 0} color="bg-green-500/10 text-green-400" />
              </div>
            )}

            {!statsLoading && (stats as any)?.topCategories?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  Top Categories by Games Played
                </h3>
                <div className="space-y-3">
                  {(stats as any).topCategories.map((cat: any, i: number) => (
                    <div key={cat.categoryId} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{cat.name}</span>
                          <span className="text-xs text-muted-foreground">{cat.gamesPlayed} games</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, (cat.gamesPlayed / ((stats as any).topCategories[0]?.gamesPlayed || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setSection("categories")} className="p-6 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="font-semibold">Manage Categories</p>
                    <p className="text-xs text-muted-foreground">Add, edit or delete categories</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
                  Go to Categories <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
              <button onClick={() => setSection("questions")} className="p-6 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <HelpCircle className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold">Manage Questions</p>
                    <p className="text-xs text-muted-foreground">8 question types supported</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
                  Go to Questions <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Categories Section */}
        {section === "categories" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Categories</h2>
                <p className="text-sm text-muted-foreground">
                  {rootCategories.length} main categories · {subCategories.length} subcategories
                </p>
              </div>
              <Button onClick={() => openCatCreate()} className="bg-primary text-primary-foreground">
                <Plus className="mr-2 h-4 w-4" /> Add Category
              </Button>
            </div>

            {catsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : rootCategories.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground rounded-xl border border-border bg-card">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No categories yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rootCategories.map((cat: any) => {
                  const subs = subCategories.filter((s: any) => s.parentId === cat.id);
                  const isExpanded = expandedCats.has(cat.id);
                  return (
                    <div key={cat.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        <button
                          onClick={() => toggleExpand(cat.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors shrink-0"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg shrink-0 border border-white/10" style={{ backgroundColor: cat.color ? cat.color + "22" : "#6366f122" }}>
                          {cat.icon || "📚"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{cat.name}</p>
                          <p className="text-xs text-muted-foreground">{subs.length} subcategories · {cat.questionCount ?? 0} questions</p>
                        </div>
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5 shrink-0">Main</Badge>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-8 px-3 text-xs text-primary hover:text-primary" onClick={() => openCatCreate(cat.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Sub
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openCatEdit(cat)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCat.mutate({ categoryId: cat.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border bg-muted/10">
                          {subs.length === 0 ? (
                            <div className="px-6 py-4 text-sm text-muted-foreground flex items-center gap-2">
                              <span>No subcategories yet.</span>
                              <button className="text-primary underline underline-offset-2 text-sm" onClick={() => openCatCreate(cat.id)}>Add one</button>
                            </div>
                          ) : (
                            <div className="divide-y divide-border/50">
                              {subs.map((sub: any) => (
                                <div key={sub.id} className="flex items-center gap-3 pl-14 pr-4 py-3 hover:bg-muted/20 transition-colors">
                                  <div className="h-8 w-8 rounded-lg flex items-center justify-center text-base shrink-0 border border-white/5" style={{ backgroundColor: sub.color ? sub.color + "22" : "#6366f122" }}>
                                    {sub.icon || "•"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{sub.name}</p>
                                    <p className="text-xs text-muted-foreground">{sub.questionCount ?? 0} questions</p>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-400 hover:text-green-400 hover:bg-green-500/10" onClick={() => { openQCreate(sub.id); setSection("questions"); }}>
                                      <Plus className="h-3 w-3 mr-1" /> Question
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openCatEdit(sub)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCat.mutate({ categoryId: sub.id })}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Questions Section */}
        {section === "questions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Questions</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredQs.length} shown (page {qOffset + 1}-{qOffset + questions.length} of {questionsTotal} in this category)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Import from Excel
                </Button>
                <Button onClick={() => openQCreate()} className="bg-primary text-primary-foreground">
                  <Plus className="mr-2 h-4 w-4" /> Add Question
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search questions..." value={qSearch} onChange={e => setQSearch(e.target.value)} className="pl-9 bg-muted/30 border-border" />
              </div>
              <Select value={qCatFilter} onValueChange={setQCatFilter}>
                <SelectTrigger className="w-full sm:w-52 bg-muted/30 border-border">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(allCategories || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.parentId ? `  ↳ ${c.name}` : c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter Chips */}
            <div className="flex flex-wrap gap-2">
              {[{ id: "all", label: "All Types" }, ...Object.entries(QUESTION_TYPE_CONFIG).map(([id, cfg]) => ({ id, label: cfg.label }))].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setQTypeFilter(id as any)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                    qTypeFilter === id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Question List */}
            {qsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : filteredQs.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground rounded-xl border border-border bg-card">
                <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No questions found.</p>
                {qSearch && <p className="text-sm mt-1">Try clearing the search filter.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQs.map((q: any) => (
                  <div key={q.id} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:border-border/80 hover:bg-muted/10 transition-colors">
                    {(q.questionType === "image" || q.questionType === "audio" || q.questionType === "hotspot") && q.imageUrl && (
                      <img src={q.imageUrl} alt="" className="h-12 w-16 rounded-lg object-cover shrink-0 border border-border" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-relaxed line-clamp-2">{q.question}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <QuestionTypeBadge type={q.questionType ?? "multiple_choice"} />
                        <DifficultyBadge difficulty={q.difficulty} />
                        <span className="text-xs text-muted-foreground">{getCategoryName(q.categoryId)}</span>
                        {(q.questionType === "multiple_choice" || q.questionType === "image" || q.questionType === "audio") && q.options?.[q.correctAnswer] && (
                          <span className="text-xs text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {q.options[q.correctAnswer]}
                          </span>
                        )}
                        {q.questionType === "ordering" && (
                          <span className="text-xs text-orange-400 flex items-center gap-1">
                            <ListOrdered className="h-3 w-3" />
                            {q.options?.length ?? 0} items
                          </span>
                        )}
                        {q.questionType === "matching" && (
                          <span className="text-xs text-pink-400 flex items-center gap-1">
                            <Shuffle className="h-3 w-3" />
                            {q.options?.length ?? 0} pairs
                          </span>
                        )}
                        {q.questionType === "hotspot" && (
                          <span className="text-xs text-rose-400 flex items-center gap-1">
                            <Crosshair className="h-3 w-3" />
                            Region: {q.options?.[0] ?? "—"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openQEdit(q)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteQ.mutate({ questionId: q.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {questionsTotal > QUESTIONS_PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={qOffset === 0}
                  onClick={() => setQOffset(o => Math.max(0, o - QUESTIONS_PAGE_SIZE))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Rows {qOffset + 1}-{qOffset + questions.length} of {questionsTotal}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={qOffset + QUESTIONS_PAGE_SIZE >= questionsTotal}
                  onClick={() => setQOffset(o => o + QUESTIONS_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Users Section */}
        {section === "users" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Users</h2>
                <p className="text-sm text-muted-foreground">
                  {usersData ? `${usersData.length} of ${usersTotal} users` : "Manage user roles and access"}
                </p>
              </div>
              <Button
                onClick={() => fetchUsers(usersSearch)}
                disabled={usersLoading}
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                {usersData ? "Refresh" : "Load Users"}
              </Button>
            </div>

            {usersData !== null && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={usersSearch}
                  onChange={e => {
                    setUsersSearch(e.target.value);
                    fetchUsers(e.target.value);
                  }}
                  placeholder="Search by name, username or email…"
                  className="pl-9 bg-muted/30 border-border"
                />
              </div>
            )}

            {usersLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            )}

            {!usersLoading && usersData === null && (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold mb-1">User Management</p>
                <p className="text-sm text-muted-foreground mb-4">
                  View all registered users, see their roles, and promote or revoke admin access.
                </p>
                <Button onClick={() => fetchUsers()} className="bg-primary text-primary-foreground">
                  Load Users
                </Button>
              </div>
            )}

            {!usersLoading && usersData !== null && usersData.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No users found.
              </div>
            )}

            {!usersLoading && usersData !== null && usersData.length > 0 && (
              <div className="space-y-2">
                {usersData.map((user: any) => {
                  const isAdmin = user.role === "admin";
                  const isSelf = user.id === profile?.id;
                  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email || "Anonymous";
                  const isEditingCoins = coinsEditor?.userId === user.id;
                  const isEditingHearts = heartsEditor?.userId === user.id;
                  return (
                    <div key={user.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
                      <div className="flex items-center gap-3">
                        {user.profileImageUrl ? (
                          <img src={user.profileImageUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <UserRound className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{displayName}</span>
                            {isAdmin && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium text-yellow-400 bg-yellow-500/10 border-yellow-500/30 shrink-0">
                                <Crown className="h-3 w-3" /> Admin
                              </span>
                            )}
                            {isSelf && <span className="text-xs text-muted-foreground shrink-0">(you)</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            {user.email && <span className="truncate">{user.email}</span>}
                            <span className="flex items-center gap-1 shrink-0 font-semibold text-primary">
                              <Medal className="h-3 w-3" />{user.totalScore} pts
                            </span>
                            <span className="flex items-center gap-1 shrink-0 text-amber-400 font-semibold">
                              <Gem className="h-3 w-3" />{user.coins ?? 0} coins
                            </span>
                            <span className="flex items-center gap-1 shrink-0 text-red-400 font-semibold">
                              <Heart className="h-3 w-3 fill-red-400" />{user.hearts ?? 6}/6 hearts
                            </span>
                            <span className="flex items-center gap-1 shrink-0"><Gamepad2 className="h-3 w-3" />{user.gamesPlayed} games</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCoinsEditor(isEditingCoins ? null : { userId: user.id, value: "" })}
                            className={cn(
                              "border-amber-500/30 text-amber-400 hover:bg-amber-500/10",
                              isEditingCoins && "bg-amber-500/10"
                            )}
                          >
                            <Gem className="h-3.5 w-3.5 mr-1.5" />
                            Coins
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setHeartsEditor(isEditingHearts ? null : { userId: user.id, value: "" })}
                            className={cn(
                              "border-red-500/30 text-red-400 hover:bg-red-500/10",
                              isEditingHearts && "bg-red-500/10"
                            )}
                          >
                            <Heart className="h-3.5 w-3.5 mr-1.5 fill-red-400" />
                            Hearts
                          </Button>
                          {!isSelf && (
                            isAdmin ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rolePending === user.id}
                                onClick={() => setUserRole(user.id, "player")}
                                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                              >
                                <UserX className="h-3.5 w-3.5 mr-1.5" />
                                {rolePending === user.id ? "…" : "Revoke Admin"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rolePending === user.id}
                                onClick={() => setUserRole(user.id, "admin")}
                                className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/50"
                              >
                                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                                {rolePending === user.id ? "…" : "Make Admin"}
                              </Button>
                            )
                          )}
                        </div>
                      </div>

                      {isEditingCoins && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                          <p className="text-xs text-muted-foreground font-medium">
                            Adjust coins for <span className="text-foreground">{displayName}</span> — current balance: <span className="text-amber-400 font-bold">{user.coins ?? 0} 🪙</span>
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {[50, 100, 500, 1000].map(preset => (
                              <Button
                                key={preset}
                                size="sm"
                                variant="outline"
                                disabled={coinsPending === user.id}
                                onClick={() => adjustCoins(user.id, preset)}
                                className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs h-7 px-2"
                              >
                                +{preset.toLocaleString()}
                              </Button>
                            ))}
                            {[-50, -100, -500].map(preset => (
                              <Button
                                key={preset}
                                size="sm"
                                variant="outline"
                                disabled={coinsPending === user.id}
                                onClick={() => adjustCoins(user.id, preset)}
                                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7 px-2"
                              >
                                {preset.toLocaleString()}
                              </Button>
                            ))}
                          </div>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="number"
                              placeholder="Custom amount (e.g. 200 or -200)"
                              value={coinsEditor?.value ?? ""}
                              onChange={e => setCoinsEditor(p => p ? { ...p, value: e.target.value } : p)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  const val = parseInt(coinsEditor?.value ?? "");
                                  if (!isNaN(val) && val !== 0) adjustCoins(user.id, val);
                                }
                              }}
                              className="bg-muted/30 border-border h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              disabled={coinsPending === user.id || !coinsEditor?.value || isNaN(parseInt(coinsEditor.value)) || parseInt(coinsEditor.value) === 0}
                              onClick={() => {
                                const val = parseInt(coinsEditor?.value ?? "");
                                if (!isNaN(val) && val !== 0) adjustCoins(user.id, val);
                              }}
                              className="bg-amber-500 text-white hover:bg-amber-400 shrink-0 h-8"
                            >
                              {coinsPending === user.id ? "…" : "Apply"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setCoinsEditor(null)}
                              className="shrink-0 h-8 text-muted-foreground"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {isEditingHearts && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                          <p className="text-xs text-muted-foreground font-medium">
                            Adjust hearts for <span className="text-foreground">{displayName}</span> — current: <span className="text-red-400 font-bold">{user.hearts ?? 6} ❤️ / 6</span>
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {[1, 2, 3].map(preset => (
                              <Button
                                key={preset}
                                size="sm"
                                variant="outline"
                                disabled={heartsPending === user.id}
                                onClick={() => adjustHearts(user.id, preset)}
                                className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs h-7 px-2"
                              >
                                +{preset} ❤️
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={heartsPending === user.id}
                              onClick={() => adjustHearts(user.id, 6)}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7 px-2 font-semibold"
                            >
                              Full ❤️❤️❤️❤️❤️❤️
                            </Button>
                            {[-1, -2, -3].map(preset => (
                              <Button
                                key={preset}
                                size="sm"
                                variant="outline"
                                disabled={heartsPending === user.id}
                                onClick={() => adjustHearts(user.id, preset)}
                                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7 px-2"
                              >
                                {preset} ❤️
                              </Button>
                            ))}
                          </div>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="number"
                              placeholder="Custom delta (e.g. 3 or -2)"
                              value={heartsEditor?.value ?? ""}
                              onChange={e => setHeartsEditor(p => p ? { ...p, value: e.target.value } : p)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  const val = parseInt(heartsEditor?.value ?? "");
                                  if (!isNaN(val) && val !== 0) adjustHearts(user.id, val);
                                }
                              }}
                              className="bg-muted/30 border-border h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              disabled={heartsPending === user.id || !heartsEditor?.value || isNaN(parseInt(heartsEditor.value)) || parseInt(heartsEditor.value) === 0}
                              onClick={() => {
                                const val = parseInt(heartsEditor?.value ?? "");
                                if (!isNaN(val) && val !== 0) adjustHearts(user.id, val);
                              }}
                              className="bg-red-500 text-white hover:bg-red-400 shrink-0 h-8"
                            >
                              {heartsPending === user.id ? "…" : "Apply"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setHeartsEditor(null)}
                              className="shrink-0 h-8 text-muted-foreground"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Settings Section */}
        {section === "settings" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-bold">Settings</h2>
              <p className="text-sm text-muted-foreground">Manage global app configuration</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <p className="font-semibold">Admin Access Code</p>
                  <p className="text-xs text-muted-foreground">Users enter this code on their Profile page to gain admin access</p>
                </div>
              </div>

              {currentAdminCode === null ? (
                <Button
                  variant="outline"
                  onClick={fetchAdminCode}
                  disabled={settingsLoading}
                  className="border-secondary/40 text-secondary hover:bg-secondary/10"
                >
                  {settingsLoading ? "Loading..." : "View current code"}
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">Current code</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-sm bg-muted/40 border border-border rounded-lg px-4 py-2.5 tracking-widest">
                        {showAdminCode ? currentAdminCode : "•".repeat(currentAdminCode.length)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowAdminCode(v => !v)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        {showAdminCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newCode">Set a new code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="newCode"
                        value={newAdminCode}
                        onChange={e => setNewAdminCode(e.target.value)}
                        placeholder="Enter new admin code (min 4 chars)"
                        className="bg-muted/30 border-border font-mono"
                      />
                      <Button
                        onClick={saveAdminCode}
                        disabled={codeLoading || !newAdminCode.trim()}
                        className="bg-primary text-primary-foreground shrink-0"
                      >
                        {codeLoading ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Anyone with the new code can instantly become an admin.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Economy Section ── */}
        {section === "economy" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Economy</h2>
              <p className="text-sm text-muted-foreground">
                Coins, score, and Battle Pass XP rates for every mode. Changes take effect immediately for new plays.
              </p>
            </div>

            {economyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(economyDrafts).map(([mode, metrics]) => (
                  <div key={mode} className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Coins className="h-4 w-4 text-amber-400" />
                      </div>
                      <p className="font-semibold text-sm">{ECONOMY_MODE_LABELS[mode] ?? mode}</p>
                    </div>

                    <div className="space-y-3">
                      {Object.entries(metrics).map(([metric, value]) => (
                        <div key={metric} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{economyMetricLabel(metric)}</Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={value}
                            onChange={e => setEconomyDraftValue(mode, metric, e.target.value)}
                            className="bg-muted/30 border-border"
                          />
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={() => saveEconomyMode(mode)}
                      disabled={economySavingMode === mode}
                      className="w-full bg-primary text-primary-foreground"
                    >
                      {economySavingMode === mode ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Badges Section ── */}
        {section === "badges" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Achievement Badges</h2>
                <p className="text-sm text-muted-foreground">
                  {badgesList.length} badges · {badgesList.filter(b => b.isActive).length} active
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchBadges} disabled={badgesLoading} className="border-border text-muted-foreground">
                  {badgesLoading ? "Loading..." : "Refresh"}
                </Button>
                <Button onClick={openBadgeCreate} className="bg-primary text-primary-foreground">
                  <Plus className="mr-2 h-4 w-4" /> Add Badge
                </Button>
              </div>
            </div>

            {badgesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : badgesList.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground rounded-xl border border-border bg-card">
                <Medal className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="mb-3">No badges yet. They will be seeded automatically on first load.</p>
                <Button onClick={fetchBadges} variant="outline" className="border-primary/40 text-primary">
                  Load Badges
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {badgesList.map((badge: any) => (
                  <div
                    key={badge.id}
                    className={cn(
                      "rounded-xl border p-4 flex items-start gap-4 transition-all",
                      badge.isActive ? "border-border bg-card" : "border-border/40 bg-muted/5 opacity-60"
                    )}
                  >
                    <span className="text-3xl shrink-0 leading-none mt-0.5">{badge.icon}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{badge.name}</p>
                        {!badge.isActive && (
                          <span className="text-[10px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-full border border-border">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{badge.description}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">
                          {TRIGGER_TYPES.find((t: any) => t.value === badge.triggerType)?.label ?? badge.triggerType}
                          {badge.triggerValue != null ? ` (${badge.triggerValue})` : ""}
                        </span>
                        <span className="text-xs text-amber-400">🪙 {badge.coinReward}</span>
                        <span className="text-xs text-muted-foreground">· {badge.earnedCount ?? 0} earned</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => toggleBadgeActive(badge)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        title={badge.isActive ? "Deactivate" : "Activate"}
                      >
                        {badge.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => openBadgeEdit(badge)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => deleteBadge(badge.id)}
                        disabled={badgeDeletePending === badge.id}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive/70"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Badge Dialog */}
      <Dialog open={!!badgeDialog} onOpenChange={(open) => !open && setBadgeDialog(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-yellow-400" />
              {badgeDialog?.mode === "create" ? "Create Badge" : "Edit Badge"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-3">
              <div className="space-y-2 w-20 shrink-0">
                <Label>Icon</Label>
                <Input
                  value={badgeForm.icon}
                  onChange={e => setBadgeForm(f => ({ ...f, icon: e.target.value }))}
                  placeholder="🏆"
                  className="bg-muted/30 border-border text-2xl text-center"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label>Name</Label>
                <Input
                  value={badgeForm.name}
                  onChange={e => setBadgeForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Badge name..."
                  className="bg-muted/30 border-border"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={badgeForm.description}
                onChange={e => setBadgeForm(f => ({ ...f, description: e.target.value }))}
                placeholder="How to earn this badge..."
                className="bg-muted/30 border-border min-h-[60px] resize-none text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Trigger Type</Label>
                <Select value={badgeForm.triggerType} onValueChange={v => setBadgeForm(f => ({ ...f, triggerType: v, triggerValue: "" }))}>
                  <SelectTrigger className="bg-muted/30 border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((t: any) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {TRIGGER_TYPES.find((t: any) => t.value === badgeForm.triggerType)?.hasValue && (
                <div className="space-y-2">
                  <Label>Threshold Value</Label>
                  <Input
                    type="number"
                    value={badgeForm.triggerValue}
                    onChange={e => setBadgeForm(f => ({ ...f, triggerValue: e.target.value }))}
                    placeholder={(TRIGGER_TYPES.find((t: any) => t.value === badgeForm.triggerType) as any)?.placeholder ?? ""}
                    className="bg-muted/30 border-border"
                    min={0}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Coin Reward</Label>
                <Input
                  type="number"
                  value={badgeForm.coinReward}
                  onChange={e => setBadgeForm(f => ({ ...f, coinReward: Number(e.target.value) }))}
                  min={0}
                  className="bg-muted/30 border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={badgeForm.sortOrder}
                  onChange={e => setBadgeForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                  min={0}
                  className="bg-muted/30 border-border"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Image URL <span className="text-muted-foreground font-normal text-xs">(optional, overrides icon)</span></Label>
              <Input
                value={badgeForm.imageUrl}
                onChange={e => setBadgeForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://..."
                className="bg-muted/30 border-border text-sm"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setBadgeForm(f => ({ ...f, isActive: !f.isActive }))}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-colors",
                  badgeForm.isActive ? "bg-primary border-primary" : "bg-muted border-border"
                )}
              >
                <span className={cn("inline-block h-3 w-3 rounded-full bg-white transition-transform", badgeForm.isActive ? "translate-x-4" : "translate-x-0.5")} />
              </button>
              <Label
                className="cursor-pointer select-none"
                onClick={() => setBadgeForm(f => ({ ...f, isActive: !f.isActive }))}
              >
                Active (visible to players)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBadgeDialog(null)}>Cancel</Button>
            <Button
              onClick={saveBadge}
              disabled={!badgeForm.name || !badgeForm.description}
              className="bg-primary text-primary-foreground"
            >
              {badgeDialog?.mode === "create" ? "Create Badge" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={!!catDialog} onOpenChange={(open) => !open && setCatDialog(null)}>
        <DialogContent className="sm:max-w-lg border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {catDialog?.mode === "create"
                ? catDialog?.forParent ? `Add Subcategory under "${getCategoryName(catDialog.forParent)}"` : "Add Main Category"
                : "Edit Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Attack on Titan" className="bg-muted/30 border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon (emoji)</Label>
                <Input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="e.g. ⚔️" className="bg-muted/30 border-border text-xl" />
              </div>
              <div className="space-y-2">
                <Label>Accent Color</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))} className="bg-muted/30 border-border h-10 w-14 p-1 cursor-pointer" />
                  <span className="text-xs text-muted-foreground font-mono">{catForm.color}</span>
                </div>
              </div>
            </div>
            {!catForm.parentId && (
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="world-background-media">Animated Map Background <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">World only</span>
                </div>
                <Input
                  id="world-background-media"
                  type="url"
                  inputMode="url"
                  maxLength={2048}
                  value={catForm.imageUrl}
                  onChange={e => setCatForm(f => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://cdn.example.com/world-background.webm"
                  aria-describedby="world-background-media-help"
                  aria-invalid={!isSafeMediaUrl(catForm.imageUrl)}
                  className={cn("bg-muted/30 border-border", !isSafeMediaUrl(catForm.imageUrl) && "border-destructive focus-visible:ring-destructive")}
                />
                <p id="world-background-media-help" className="text-[11px] leading-5 text-muted-foreground">Supports MP4, WebM, GIF, animated WebP, AVIF, and normal images. Video plays muted and loops behind the checkpoints. Use compressed media for smooth mobile performance.</p>
                <WorldMediaPreview url={catForm.imageUrl} />
              </div>
            )}
            {!catDialog?.forParent && (
              <div className="space-y-2">
                <Label>Parent Category</Label>
                <Select value={catForm.parentId || "none"} onValueChange={v => setCatForm(f => ({ ...f, parentId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="bg-muted/30 border-border">
                    <SelectValue placeholder="None (main category)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (main category)</SelectItem>
                    {rootCategories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatDialog(null)}>Cancel</Button>
            <Button onClick={saveCat} disabled={!catForm.name || !isSafeMediaUrl(catForm.imageUrl) || createCat.isPending || updateCat.isPending} className="bg-primary text-primary-foreground">
              {catDialog?.mode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marketplace Section */}
      {section === "marketplace" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Marketplace Items</h2>
              <p className="text-sm text-muted-foreground">Manage power-ups and cosmetics available for purchase</p>
            </div>
            <Button onClick={() => { setMktForm({ ...BLANK_MKT }); setMktDialog({ mode: "create" }); }} className="bg-primary text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Add Item
            </Button>
          </div>

          {mktLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : mktItems.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground rounded-xl border border-border bg-card">
              <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No marketplace items found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {["cosmetic", "powerup"].map(typeGroup => {
                const groupItems = mktItems.filter(i => i.type === typeGroup);
                if (groupItems.length === 0) return null;
                return (
                  <div key={typeGroup}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2 mt-4">
                      {typeGroup === "cosmetic" ? "🎨 Cosmetics" : "⚡ Power-Ups"}
                    </p>
                    <div className="space-y-2">
                      {groupItems.map((item: any) => (
                        <div key={item.id} className={cn("rounded-xl border border-border bg-card p-4 flex items-center gap-4", !item.isActive && "opacity-50")}>
                          <span className="text-2xl shrink-0">{item.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm truncate">{item.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">{item.effect}</Badge>
                              {!item.isActive && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-red-500/40 text-red-400">Hidden</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                          </div>
                          <div className="flex items-center gap-1 text-amber-400 shrink-0">
                            <Gem className="h-3.5 w-3.5" />
                            <span className="text-sm font-bold">{item.price}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => toggleMktActive(item)} title={item.isActive ? "Hide" : "Show"}>
                              {item.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setMktForm({ name: item.name, description: item.description || "", type: item.type, effect: item.effect, emoji: item.emoji, price: item.price, isActive: item.isActive }); setMktDialog({ mode: "edit", item }); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteMktItem(item.id)} disabled={mktDeletePending === item.id}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Marketplace Item Dialog */}
      <Dialog open={!!mktDialog} onOpenChange={(open) => !open && setMktDialog(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>{mktDialog?.mode === "create" ? "Add Marketplace Item" : "Edit Marketplace Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Item Name *</Label>
                <Input value={mktForm.name} onChange={e => setMktForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Gold Crown" className="bg-muted/30 border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Emoji *</Label>
                <Input value={mktForm.emoji} onChange={e => setMktForm(f => ({ ...f, emoji: e.target.value }))} placeholder="e.g. 👑" className="bg-muted/30 border-border" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={mktForm.description} onChange={e => setMktForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description..." className="bg-muted/30 border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type *</Label>
                <Select value={mktForm.type} onValueChange={v => setMktForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-muted/30 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cosmetic">Cosmetic</SelectItem>
                    <SelectItem value="powerup">Power-Up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price (coins) *</Label>
                <Input type="number" min={0} value={mktForm.price} onChange={e => setMktForm(f => ({ ...f, price: Number(e.target.value) }))} className="bg-muted/30 border-border" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Effect Key *</Label>
              <Select value={mktForm.effect} onValueChange={v => setMktForm(f => ({ ...f, effect: v }))}>
                <SelectTrigger className="bg-muted/30 border-border">
                  <SelectValue placeholder="Select effect key" />
                </SelectTrigger>
                <SelectContent>
                  {COSMETIC_EFFECT_OPTIONS.map(group => (
                    <div key={group.group}>
                      <div className="px-2 py-1 text-xs text-muted-foreground font-semibold">{group.group}</div>
                      {group.options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </div>
                  ))}
                  <div className="px-2 py-1 text-xs text-muted-foreground font-semibold">Custom</div>
                  <SelectItem value="custom">— Enter custom key below —</SelectItem>
                </SelectContent>
              </Select>
              {(mktForm.effect === "custom" || (!COSMETIC_EFFECT_OPTIONS.flatMap(g => g.options).find(o => o.value === mktForm.effect) && mktForm.effect !== "")) && (
                <Input value={mktForm.effect === "custom" ? "" : mktForm.effect} onChange={e => setMktForm(f => ({ ...f, effect: e.target.value }))} placeholder="e.g. frame_custom or color_pink" className="bg-muted/30 border-border mt-1.5" />
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMktForm(f => ({ ...f, isActive: !f.isActive }))}
                className={cn("h-6 w-11 rounded-full transition-colors relative", mktForm.isActive ? "bg-primary" : "bg-muted")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow", mktForm.isActive ? "translate-x-5" : "translate-x-0.5")} />
              </button>
              <span className="text-sm">{mktForm.isActive ? "Visible in marketplace" : "Hidden from players"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMktDialog(null)}>Cancel</Button>
            <Button onClick={saveMktItem} disabled={!mktForm.name || !mktForm.effect || !mktForm.emoji || mktSaving} className="bg-primary text-primary-foreground">
              {mktSaving ? "Saving..." : mktDialog?.mode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Tasks Section */}
      {section === "daily-tasks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Daily Tasks</h2>
              <p className="text-sm text-muted-foreground">Tasks shown to players each day — resets at midnight</p>
            </div>
            <Button onClick={() => { setTaskForm({ ...BLANK_TASK }); setTaskDialog({ mode: "create" }); }} className="bg-primary text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" /> Add Task
            </Button>
          </div>

          {taskLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : taskItems.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground rounded-xl border border-border bg-card">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No daily tasks yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {taskItems.map((item: any) => {
                const typeLabel: Record<string, string> = { quiz_count: "Complete Quizzes", score_target: "Score Target", category_quiz: "Category Quiz", correct_answers: "Correct Answers" };
                const typeIcon: Record<string, any> = { quiz_count: ClipboardList, score_target: Target, category_quiz: Layers, correct_answers: CheckCircle2 };
                const TypeIcon = typeIcon[item.type] ?? ClipboardList;
                return (
                  <div key={item.id} className={cn("rounded-xl border border-border bg-card p-4 flex items-center gap-4", !item.isActive && "opacity-50")}>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <TypeIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{item.title}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">{typeLabel[item.type] ?? item.type}</Badge>
                        {!item.isActive && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-red-500/40 text-red-400 shrink-0">Hidden</Badge>}
                        {item.isAutoGenerated && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-500/40 text-blue-400 shrink-0">Auto</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.description || `Target: ${item.targetValue}`}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Gem className="h-3 w-3 text-amber-400" />{item.coinReward}</span>
                      <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-violet-400" />{item.xpReward} XP</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => toggleTaskActive(item)} title={item.isActive ? "Hide" : "Show"}>
                        {item.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setTaskForm({ title: item.title, description: item.description || "", type: item.type, targetValue: item.targetValue, coinReward: item.coinReward, xpReward: item.xpReward, categoryId: item.categoryId || "", isActive: item.isActive }); setTaskDialog({ mode: "edit", item }); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => deleteTaskItem(item.id)} disabled={taskDeletePending === item.id}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Daily Task Dialog */}
      <Dialog open={!!taskDialog} onOpenChange={(open) => !open && setTaskDialog(null)}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>{taskDialog?.mode === "create" ? "Add Daily Task" : "Edit Daily Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Quiz Champion" className="bg-muted/30 border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description shown to players..." className="bg-muted/30 border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Task Type *</Label>
                <Select value={taskForm.type} onValueChange={v => setTaskForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-muted/30 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quiz_count">Complete Quizzes</SelectItem>
                    <SelectItem value="score_target">Score Target</SelectItem>
                    <SelectItem value="category_quiz">Category Quiz</SelectItem>
                    <SelectItem value="correct_answers">Correct Answers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Target Value *</Label>
                <Input type="number" min={1} value={taskForm.targetValue} onChange={e => setTaskForm(f => ({ ...f, targetValue: Number(e.target.value) }))} className="bg-muted/30 border-border" />
              </div>
            </div>
            {(taskForm.type === "category_quiz") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Category (optional)</Label>
                <Select value={taskForm.categoryId || "_none"} onValueChange={v => setTaskForm(f => ({ ...f, categoryId: v === "_none" ? "" : v }))}>
                  <SelectTrigger className="bg-muted/30 border-border"><SelectValue placeholder="Any category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Any category</SelectItem>
                    {(allCategories || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Reward Coins</Label>
                <Input type="number" min={0} value={taskForm.coinReward} onChange={e => setTaskForm(f => ({ ...f, coinReward: Number(e.target.value) }))} className="bg-muted/30 border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reward XP</Label>
                <Input type="number" min={0} value={taskForm.xpReward} onChange={e => setTaskForm(f => ({ ...f, xpReward: Number(e.target.value) }))} className="bg-muted/30 border-border" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTaskForm(f => ({ ...f, isActive: !f.isActive }))}
                className={cn("h-6 w-11 rounded-full transition-colors relative", taskForm.isActive ? "bg-primary" : "bg-muted")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow", taskForm.isActive ? "translate-x-5" : "translate-x-0.5")} />
              </button>
              <span className="text-sm">{taskForm.isActive ? "Visible to players" : "Hidden from players"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTaskDialog(null)}>Cancel</Button>
            <Button onClick={saveTaskItem} disabled={!taskForm.title || !taskForm.type || taskSaving} className="bg-primary text-primary-foreground">
              {taskSaving ? "Saving..." : taskDialog?.mode === "create" ? "Create Task" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Dialog */}
      <Dialog open={!!qDialog} onOpenChange={(open) => !open && setQDialog(null)}>
        <DialogContent className="sm:max-w-2xl border-border bg-card max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {qDialog?.mode === "create" ? "Add Question" : "Edit Question"}
              {qForm.questionType && (
                <QuestionTypeBadge type={qForm.questionType} />
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">

            {/* Question Type Selector */}
            <div className="space-y-2">
              <Label>Question Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(QUESTION_TYPE_CONFIG) as [QuestionType, any][]).map(([type, cfg]) => {
                  const Icon = cfg.icon;
                  const isSelected = qForm.questionType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                        isSelected ? "border-primary bg-primary/10" : "border-border bg-muted/10 hover:border-border/70"
                      )}
                    >
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center border shrink-0", cfg.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{cfg.label}</p>
                        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{cfg.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={qForm.categoryId} onValueChange={v => setQForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger className="bg-muted/30 border-border">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {(allCategories || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.parentId ? `  ↳ ${c.name}` : `${c.icon || "📚"} ${c.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Image URL (image / hotspot types) */}
            {(qForm.questionType === "image" || qForm.questionType === "hotspot") && (
              <div className="space-y-2">
                <Label>Image URL</Label>
                <Input value={qForm.imageUrl} onChange={e => setQForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://example.com/image.jpg" className="bg-muted/30 border-border" />
                {qForm.imageUrl && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-border">
                    <img src={qForm.imageUrl} alt="Preview" className="w-full max-h-48 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
              </div>
            )}

            {/* Audio URL */}
            {qForm.questionType === "audio" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Music className="h-4 w-4 text-sky-400" /> Audio URL</Label>
                <Input value={qForm.imageUrl} onChange={e => setQForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://example.com/audio.mp3" className="bg-muted/30 border-border" />
                {qForm.imageUrl && (
                  <audio controls src={qForm.imageUrl} className="w-full mt-2 rounded-lg" />
                )}
              </div>
            )}

            {/* Question Text */}
            <div className="space-y-2">
              <Label>
                {qForm.questionType === "fill_blank" ? "Question (use ___ for the blank)"
                  : qForm.questionType === "ordering" ? "Instruction (e.g. Arrange in chronological order)"
                  : qForm.questionType === "matching" ? "Instruction (e.g. Match each country to its capital)"
                  : qForm.questionType === "hotspot" ? "Instruction (e.g. Click on the Eiffel Tower)"
                  : "Question"}
              </Label>
              <Textarea
                value={qForm.question}
                onChange={e => setQForm(f => ({ ...f, question: e.target.value }))}
                placeholder={
                  qForm.questionType === "fill_blank" ? "e.g. The capital of France is ___."
                  : qForm.questionType === "ordering" ? "e.g. Arrange these events in chronological order:"
                  : qForm.questionType === "matching" ? "e.g. Match each country to its capital city:"
                  : qForm.questionType === "hotspot" ? "e.g. Click on the location of Tokyo on the map."
                  : "e.g. What is the largest planet in the Solar System?"
                }
                className="bg-muted/30 border-border min-h-[80px] resize-none"
              />
            </div>

            {/* ORDERING — item list */}
            {qForm.questionType === "ordering" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-orange-400" />
                  Items in Correct Order
                  <span className="text-muted-foreground font-normal text-xs">(top = first)</span>
                </Label>
                <div className="space-y-2">
                  {orderingItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-bold text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                      <Input
                        value={item}
                        onChange={e => {
                          const next = [...orderingItems];
                          next[i] = e.target.value;
                          setOrderingItems(next);
                        }}
                        placeholder={`Item ${i + 1}`}
                        className="bg-muted/30 border-border flex-1"
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => moveOrderingItem(i, -1)} disabled={i === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => moveOrderingItem(i, 1)} disabled={i === orderingItems.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      {orderingItems.length > 2 && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setOrderingItems(prev => prev.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={() => setOrderingItems(prev => [...prev, ""])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>
            )}

            {/* MATCHING — pair list */}
            {qForm.questionType === "matching" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Shuffle className="h-4 w-4 text-pink-400" />
                  Matching Pairs
                </Label>
                <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                  <span className="text-xs text-muted-foreground font-semibold px-1">Left Column</span>
                  <span />
                  <span className="text-xs text-muted-foreground font-semibold px-1">Right Column</span>
                  <span />
                  {matchingPairs.map((pair, i) => (
                    <>
                      <Input
                        key={`l${i}`}
                        value={pair.left}
                        onChange={e => {
                          const next = [...matchingPairs];
                          next[i] = { ...next[i], left: e.target.value };
                          setMatchingPairs(next);
                        }}
                        placeholder={`Left ${i + 1}`}
                        className="bg-muted/30 border-border"
                      />
                      <span key={`arr${i}`} className="text-muted-foreground text-center px-1">→</span>
                      <Input
                        key={`r${i}`}
                        value={pair.right}
                        onChange={e => {
                          const next = [...matchingPairs];
                          next[i] = { ...next[i], right: e.target.value };
                          setMatchingPairs(next);
                        }}
                        placeholder={`Right ${i + 1}`}
                        className="bg-muted/30 border-border"
                      />
                      <Button
                        key={`del${i}`}
                        size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => matchingPairs.length > 2 && setMatchingPairs(prev => prev.filter((_, j) => j !== i))}
                        disabled={matchingPairs.length <= 2}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="border-pink-500/30 text-pink-400 hover:bg-pink-500/10" onClick={() => setMatchingPairs(prev => [...prev, { left: "", right: "" }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Pair
                </Button>
              </div>
            )}

            {/* HOTSPOT — bounding box */}
            {qForm.questionType === "hotspot" && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-rose-400" />
                  Correct Region (% of image dimensions)
                </Label>
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Left edge (X1 %)</Label>
                      <Input type="number" min={0} max={100} value={hotspotBox.x1} onChange={e => setHotspotBox(b => ({ ...b, x1: Number(e.target.value) }))} className="bg-muted/30 border-border" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Top edge (Y1 %)</Label>
                      <Input type="number" min={0} max={100} value={hotspotBox.y1} onChange={e => setHotspotBox(b => ({ ...b, y1: Number(e.target.value) }))} className="bg-muted/30 border-border" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Right edge (X2 %)</Label>
                      <Input type="number" min={0} max={100} value={hotspotBox.x2} onChange={e => setHotspotBox(b => ({ ...b, x2: Number(e.target.value) }))} className="bg-muted/30 border-border" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Bottom edge (Y2 %)</Label>
                      <Input type="number" min={0} max={100} value={hotspotBox.y2} onChange={e => setHotspotBox(b => ({ ...b, y2: Number(e.target.value) }))} className="bg-muted/30 border-border" />
                    </div>
                  </div>
                  {qForm.imageUrl && (
                    <div className="relative rounded-lg overflow-hidden border border-border mt-2">
                      <img src={qForm.imageUrl} alt="Hotspot preview" className="w-full max-h-48 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div
                        className="absolute border-2 border-rose-500 bg-rose-500/20 pointer-events-none"
                        style={{
                          left: `${hotspotBox.x1}%`,
                          top: `${hotspotBox.y1}%`,
                          width: `${hotspotBox.x2 - hotspotBox.x1}%`,
                          height: `${hotspotBox.y2 - hotspotBox.y1}%`,
                        }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Encoded as: <code className="bg-muted px-1 rounded">{hotspotBox.x1},{hotspotBox.y1},{hotspotBox.x2},{hotspotBox.y2}</code></p>
                </div>
              </div>
            )}

            {/* MC / Image / Audio — 4 options */}
            {(qForm.questionType === "multiple_choice" || qForm.questionType === "image" || qForm.questionType === "audio") && (
              <div className="space-y-2">
                <Label>Answer Options <span className="text-muted-foreground font-normal">(click letter to mark correct)</span></Label>
                <div className="space-y-2.5">
                  {qForm.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setQForm(f => ({ ...f, correctAnswer: i }))}
                        className={cn(
                          "h-9 w-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all shrink-0",
                          qForm.correctAnswer === i
                            ? "bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/30"
                            : "border-border text-muted-foreground hover:border-green-400/60 hover:text-green-400"
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </button>
                      <Input
                        value={opt}
                        onChange={e => {
                          const opts = [...qForm.options];
                          opts[i] = e.target.value;
                          setQForm(f => ({ ...f, options: opts }));
                        }}
                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        className={cn("bg-muted/30 border-border flex-1", qForm.correctAnswer === i && "border-green-500/40 bg-green-500/5")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* True/False */}
            {qForm.questionType === "true_false" && (
              <div className="space-y-2">
                <Label>Correct Answer</Label>
                <div className="flex gap-3">
                  {["True", "False"].map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setQForm(f => ({ ...f, correctAnswer: i }))}
                      className={cn(
                        "flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all",
                        qForm.correctAnswer === i
                          ? i === 0 ? "bg-green-500/20 border-green-500 text-green-400" : "bg-red-500/20 border-red-500 text-red-400"
                          : "border-border text-muted-foreground hover:border-border/70"
                      )}
                    >
                      {i === 0 ? "✓ True" : "✗ False"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fill in the blank */}
            {qForm.questionType === "fill_blank" && (
              <div className="space-y-2">
                <Label>Correct Answer</Label>
                <Input
                  value={qForm.options[0] ?? ""}
                  onChange={e => setQForm(f => ({ ...f, options: [e.target.value] }))}
                  placeholder="Type the exact correct answer..."
                  className="bg-muted/30 border-green-500/30 border focus:border-green-500"
                />
              </div>
            )}

            {/* Difficulty + Explanation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <div className="flex gap-2">
                  {DIFFICULTY_CONFIG.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setQForm(f => ({ ...f, difficulty: d.value }))}
                      className={cn("flex-1 py-2 rounded-lg border text-sm font-medium transition-all", qForm.difficulty === d.value ? d.color : "border-border text-muted-foreground hover:border-border/70")}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Explanation <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea
                  value={qForm.explanation}
                  onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))}
                  placeholder="Why is this the correct answer?"
                  className="bg-muted/30 border-border min-h-[72px] resize-none text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setQDialog(null)}>Cancel</Button>
            <Button
              onClick={saveQ}
              disabled={!qForm.question || !qForm.categoryId || createQ.isPending || updateQ.isPending}
              className="bg-primary text-primary-foreground"
            >
              {qDialog?.mode === "create" ? "Create Question" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => !open && closeImportDialog()}>
        <DialogContent className="sm:max-w-2xl border-border bg-card max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Questions from Excel</DialogTitle>
          </DialogHeader>

          {!importPreview ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-sm text-primary hover:underline flex items-center gap-1.5"
              >
                <Download className="h-4 w-4" /> Download the .xlsx template
              </button>

              <div className="space-y-1.5">
                <Label className="text-xs">Select file (.xlsx)</Label>
                <Input
                  type="file"
                  accept=".xlsx"
                  onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  className="bg-muted/30 border-border"
                />
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={closeImportDialog}>Cancel</Button>
                <Button onClick={handlePreviewImport} disabled={!importFile || importPreviewing} className="bg-primary text-primary-foreground">
                  {importPreviewing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : "Upload & Preview"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Valid rows</p>
                  <p className="text-2xl font-black text-green-400">{importPreview.validCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-card/60 p-3">
                  <p className="text-xs text-muted-foreground">Rows with errors</p>
                  <p className="text-2xl font-black text-red-400">{importPreview.errors?.length ?? 0}</p>
                </div>
              </div>

              {importPreview.newSubjects?.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> New subjects will be created
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {importPreview.newSubjects.map((s: string) => (
                      <Badge key={s} variant="outline">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {importPreview.newSubcategories?.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> New subcategories will be created
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {importPreview.newSubcategories.map((s: { subject: string; subcategory: string }) => (
                      <Badge key={`${s.subject}-${s.subcategory}`} variant="outline">{s.subject} → {s.subcategory}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {importPreview.duplicateWarnings?.length > 0 && (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-yellow-400 mb-1">Possible duplicates (will still be imported)</p>
                  {importPreview.duplicateWarnings.map((d: { row: number; question: string }) => (
                    <p key={d.row} className="text-xs text-muted-foreground">Row {d.row}: "{d.question}"</p>
                  ))}
                </div>
              )}

              {importPreview.errors?.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-400 mb-1">Rows that will be skipped</p>
                  {importPreview.errors.map((e: { row: number; column?: string; message: string }, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      Row {e.row}{e.column ? ` (${e.column})` : ""}: {e.message}
                    </p>
                  ))}
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setImportPreview(null)}>Back</Button>
                <Button
                  onClick={handleCommitImport}
                  disabled={importCommitting || importPreview.validCount === 0}
                  className="bg-primary text-primary-foreground"
                >
                  {importCommitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : `Confirm Import (${importPreview.validCount})`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
