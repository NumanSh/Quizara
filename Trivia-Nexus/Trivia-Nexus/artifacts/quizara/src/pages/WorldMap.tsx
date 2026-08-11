import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Check, Clock3, Compass, Flag, LockKeyhole, Play, Target, Trophy, Zap } from "lucide-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useHearts } from "@/hooks/useHearts";
import { HeartsDisplay } from "@/components/HeartsDisplay";
import { authFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isPotentiallyAnimatedMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { useI18n } from "@/lib/i18n";

const CATEGORY_IMAGES: Record<string, string> = {
  anime: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&q=85",
  "anime & manga": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1600&q=85",
  geography: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1600&q=85",
  cinema: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&q=85",
  "cinema & tv": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1600&q=85",
  science: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=85",
  "science & technology": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=85",
  history: "https://images.unsplash.com/photo-1461360370896-9a2f70c4e6d9?w=1600&q=85",
  sports: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1600&q=85",
  "pop culture": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&q=85",
  "general knowledge": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1600&q=85",
  technology: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=85",
  music: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&q=85",
  art: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1600&q=85",
  food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&q=85",
  nature: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1600&q=85",
  literature: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1600&q=85",
};

function getWorldImage(name: string, imageUrl: string | null) {
  if (imageUrl) return imageUrl;
  const normalized = name.toLowerCase();
  return Object.entries(CATEGORY_IMAGES).find(([key]) => normalized.includes(key) || key.includes(normalized))?.[1] ?? null;
}

function WorldBackgroundMedia({ src, fallbackSrc = null, className, reducedMotion }: { src: string | null; fallbackSrc?: string | null; className?: string; reducedMotion: boolean | null }) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [src, fallbackSrc]);

  let activeSrc = primaryFailed && fallbackSrc && fallbackSrc !== src ? fallbackSrc : src;
  if (reducedMotion && activeSrc && isPotentiallyAnimatedMediaUrl(activeSrc)) {
    activeSrc = fallbackSrc && !isPotentiallyAnimatedMediaUrl(fallbackSrc) ? fallbackSrc : null;
  }
  const usingFallback = Boolean(activeSrc && activeSrc === fallbackSrc && activeSrc !== src);
  if (!activeSrc || (usingFallback && fallbackFailed) || (primaryFailed && !usingFallback)) return null;
  const handleError = () => usingFallback ? setFallbackFailed(true) : setPrimaryFailed(true);

  if (isVideoMediaUrl(activeSrc)) {
    return (
      <video
        key={activeSrc}
        src={activeSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        onError={handleError}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <motion.img
      key={activeSrc}
      src={activeSrc}
      alt=""
      aria-hidden="true"
      onError={handleError}
      className={cn("h-full w-full object-cover", className)}
      animate={reducedMotion ? undefined : { scale: [1, 1.055, 1], x: ["0%", "-1.5%", "0%"] }}
      transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
    />
  );
}

interface LevelNode {
  levelNumber: number;
  isCompleted: boolean;
  isUnlocked: boolean;
}

interface WorldData {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  imageUrl: string | null;
  totalLevels: number;
  completedLevels: number;
  totalQuestions: number;
  levels: LevelNode[];
}

type LevelState = "complete" | "current" | "locked";

function statusFor(level: LevelNode): LevelState {
  if (level.isCompleted) return "complete";
  if (level.isUnlocked) return "current";
  return "locked";
}

export default function WorldMap() {
  const { t } = useI18n();
  const { categoryId } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useSupabaseAuth();
  const reduceMotion = useReducedMotion();
  const currentRef = useRef<HTMLDivElement>(null);

  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<number | null>(null);
  const [lockedTip, setLockedTip] = useState<number | null>(null);
  const [noHeartsTip, setNoHeartsTip] = useState(false);

  const isGuest = !user?.id;
  const { hearts, maxHearts, nextRefillMs, canPlay, watchAd } = useHearts(!!user?.id);

  useEffect(() => {
    if (!categoryId) return;
    setLoading(true);
    setError(null);
    authFetch(`/api/quiz/worlds/${categoryId}`, { credentials: "include" })
      .then(response => response.json())
      .then((data: WorldData & { error?: string }) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        if (!isGuest) {
          setWorldData(data);
          return;
        }
        try {
          const local: number[] = JSON.parse(localStorage.getItem(`quizara_levels_${categoryId}`) ?? "[]");
          const levels = data.levels.map(level => ({
            ...level,
            isCompleted: local.includes(level.levelNumber),
            isUnlocked: level.levelNumber === 1 || local.includes(level.levelNumber - 1),
          }));
          setWorldData({ ...data, levels, completedLevels: local.length });
        } catch {
          setWorldData(data);
        }
      })
      .catch(() => setError(t.worldMap.failedToLoad))
      .finally(() => setLoading(false));
  }, [categoryId, isGuest]);

  useEffect(() => {
    if (!worldData || !currentRef.current) return;
    const currentLevel = worldData.levels.find(level => level.isUnlocked && !level.isCompleted);
    if (!currentLevel || currentLevel.levelNumber <= 2) return;
    const timeout = window.setTimeout(() => {
      currentRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }, reduceMotion ? 0 : 450);
    return () => window.clearTimeout(timeout);
  }, [worldData, reduceMotion]);

  const handleLevelClick = async (level: LevelNode) => {
    if (!level.isUnlocked) {
      setLockedTip(level.levelNumber);
      window.setTimeout(() => setLockedTip(null), 2500);
      return;
    }
    if (!canPlay && !level.isCompleted) {
      setNoHeartsTip(true);
      window.setTimeout(() => setNoHeartsTip(false), 3000);
      return;
    }
    if (starting !== null) return;
    setStarting(level.levelNumber);
    try {
      const response = await authFetch("/api/quiz/levels/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ worldId: categoryId, levelNumber: level.levelNumber }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        window.alert(data.error ?? t.worldMap.startLevelFailed);
        return;
      }
      const params = new URLSearchParams({ levelNum: String(level.levelNumber), worldId: categoryId!, worldName: worldData?.name ?? "" });
      setLocation(`/quiz/${data.sessionId}?${params.toString()}`);
    } catch {
      window.alert(t.worldMap.startLevelFailedRetry);
    } finally {
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <div className="editorial-grid flex min-h-[calc(100vh-5rem)] flex-1 items-center justify-center">
        <div className="flex items-center gap-5">
          <motion.span className="h-10 w-10 border border-primary" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }} />
          <div><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">{t.worldMap.preparingExpedition}</p><p className="mt-2 text-sm text-muted-foreground">{t.worldMap.loadingRoute}</p></div>
        </div>
      </div>
    );
  }

  if (error || !worldData) {
    return (
      <div className="editorial-grid flex min-h-[calc(100vh-5rem)] flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <Compass className="h-8 w-8 text-primary" />
        <p className="text-2xl font-extrabold tracking-[-0.04em]">{error ?? t.worldMap.worldNotFound}</p>
        <button onClick={() => setLocation("/categories")} className="focus-ring border-b border-primary pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.worldMap.backToWorlds}</button>
      </div>
    );
  }

  const fallbackImage = getWorldImage(worldData.name, null);
  const backgroundMedia = worldData.imageUrl?.trim() || fallbackImage;
  const heroMedia = backgroundMedia && isVideoMediaUrl(backgroundMedia) ? fallbackImage : backgroundMedia;
  const progress = worldData.totalLevels ? Math.round((worldData.completedLevels / worldData.totalLevels) * 100) : 0;
  const routeProgress = worldData.totalLevels > 1 ? Math.min(100, (worldData.completedLevels / (worldData.totalLevels - 1)) * 100) : progress;
  const nextLevel = worldData.levels.find(level => level.isUnlocked && !level.isCompleted)?.levelNumber ?? worldData.totalLevels;

  return (
    <div className="relative flex-1 overflow-x-hidden">
      <div className="fixed left-0 right-0 top-20 z-30 flex min-h-16 items-center justify-between border-b border-white/8 bg-background/92 px-4 backdrop-blur-xl sm:px-7 md:left-60 md:rtl:left-0 md:rtl:right-60">
        <button onClick={() => setLocation("/categories")} className="focus-ring group flex h-10 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1" /><span className="hidden sm:inline">{t.worldMap.allWorlds}</span>
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 text-center"><p className="text-[8px] font-bold uppercase tracking-[0.24em] text-primary">{t.worldMap.worldExpedition}</p><p className="mt-1 max-w-36 truncate text-xs font-extrabold sm:max-w-60">{worldData.name}</p></div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden items-center gap-2 text-[10px] font-bold tabular-nums sm:flex"><Trophy className="h-3.5 w-3.5 text-secondary" />{worldData.completedLevels}/{worldData.totalLevels}</div>
          <HeartsDisplay hearts={hearts} maxHearts={maxHearts} nextRefillMs={nextRefillMs} size="sm" dark watchAd={watchAd} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/8"><motion.div className="h-px bg-primary" initial={{ scaleX: reduceMotion ? 1 : 0 }} animate={{ scaleX: progress / 100 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: "left" }} /></div>
      </div>
      <div className="h-16" aria-hidden="true" />

      <header className="relative min-h-[430px] overflow-hidden border-b border-white/8">
        {heroMedia && <WorldBackgroundMedia src={heroMedia} fallbackSrc={fallbackImage} reducedMotion={reduceMotion} className="absolute inset-0 object-center grayscale saturate-50 opacity-35" />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background))_0%,hsl(var(--background)/0.94)_42%,hsl(var(--background)/0.45)_100%)] rtl:bg-[linear-gradient(270deg,hsl(var(--background))_0%,hsl(var(--background)/0.94)_42%,hsl(var(--background)/0.45)_100%)]" />
        <div className="editorial-grid absolute inset-0 opacity-55" />
        <div className="relative mx-auto flex min-h-[430px] max-w-[1320px] items-center px-5 py-16 sm:px-8 lg:px-14">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }} className="max-w-3xl">
            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground"><span className="text-primary">{t.worldMap.route.replace("{n}", String(nextLevel).padStart(2, "0"))}</span><span className="h-px w-8 bg-white/15" />{t.worldMap.knowledgeExpedition}</div>
            <h1 className="mt-8 text-[clamp(3.4rem,8vw,7.4rem)] font-extrabold leading-[0.87] tracking-[-0.075em]">{worldData.name}</h1>
            <div className="mt-9 flex flex-wrap gap-x-8 gap-y-4 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="flex items-center gap-2"><Flag className="h-3.5 w-3.5 text-primary" />{worldData.totalLevels} {t.worldMap.checkpoints}</span>
              <span className="flex items-center gap-2"><Target className="h-3.5 w-3.5 text-primary" />{worldData.totalQuestions} {t.worldMap.questions}</span>
              <span className="flex items-center gap-2"><Trophy className="h-3.5 w-3.5 text-secondary" />{progress}{t.worldMap.mastered}</span>
            </div>
          </motion.div>
        </div>
        <div className="absolute bottom-0 right-0 hidden w-64 border-l border-t border-white/10 bg-background/75 p-6 backdrop-blur-md md:block rtl:left-0 rtl:right-auto rtl:border-l-0 rtl:border-r">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t.worldMap.currentObjective}</p><p className="mt-3 text-xl font-extrabold tracking-[-0.04em]">{t.worldMap.reachCheckpoint.replace("{n}", String(nextLevel).padStart(2, "0"))}</p>
        </div>
      </header>

      {isGuest && (
        <div className="border-b border-primary/15 bg-primary/[0.035] px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[1120px] items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><Zap className="h-3.5 w-3.5 shrink-0 text-primary" />{t.worldMap.signInHint}</div>
        </div>
      )}

      {worldData.totalLevels === 0 ? (
        <section className="editorial-grid flex min-h-[480px] items-center justify-center px-5 py-24 text-center">
          <div className="max-w-md"><Compass className="mx-auto h-8 w-8 text-primary" /><p className="mt-7 text-3xl font-extrabold tracking-[-0.05em]">{t.worldMap.uncharted}</p><p className="mt-4 text-sm leading-7 text-muted-foreground">{t.worldMap.unchartedDesc}</p><button onClick={() => setLocation("/categories")} className="focus-ring mt-8 border-b border-primary pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.worldMap.backToWorlds}</button></div>
        </section>
      ) : (
        <section className="relative isolate mx-auto max-w-[1120px] overflow-clip px-5 py-20 sm:px-8 lg:py-28">
          <div className="editorial-grid absolute inset-0 -z-20 opacity-50" />
          {backgroundMedia && (
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="sticky top-36 h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden">
                <WorldBackgroundMedia src={backgroundMedia} fallbackSrc={fallbackImage} reducedMotion={reduceMotion} className="opacity-[0.22] grayscale saturate-[0.72]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--background)/0.78),hsl(var(--background)/0.42)_38%,hsl(var(--background)/0.88))]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background)/0.72)_78%)]" />
              </div>
            </div>
          )}
          <div className="mb-16 flex flex-col justify-between gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
            <div><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">{t.worldMap.expeditionMap}</p><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.05em] sm:text-4xl">{t.worldMap.advanceThroughField}</h2></div>
            <p className="max-w-sm text-xs leading-6 text-muted-foreground">{t.worldMap.checkpointDesc}</p>
          </div>

          <div className="relative">
            <div className="absolute bottom-24 left-[37px] top-24 w-px bg-white/10 lg:left-1/2 lg:-translate-x-1/2" />
            <motion.div
              className="absolute left-[37px] top-24 w-px bg-primary lg:left-1/2 lg:-translate-x-1/2"
              initial={{ scaleY: reduceMotion ? 1 : 0 }}
              animate={{ scaleY: routeProgress / 100 }}
              transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ bottom: 96, transformOrigin: "top" }}
            />

            {worldData.levels.map((level, index) => {
              const state = statusFor(level);
              const isCurrent = state === "current";
              const isComplete = state === "complete";
              const isLocked = state === "locked";
              const even = index % 2 === 0;
              return (
                <div key={level.levelNumber} ref={isCurrent ? currentRef : undefined} className="relative grid min-h-52 grid-cols-[76px_1fr] items-center lg:grid-cols-[1fr_112px_1fr]">
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("relative col-start-2 row-start-1", even ? "lg:col-start-1 lg:items-end lg:text-right rtl:lg:text-left" : "lg:col-start-3")}
                  >
                    <button
                      onClick={() => handleLevelClick(level)}
                      disabled={starting === level.levelNumber}
                      className={cn(
                        "focus-ring group flex w-full flex-col border p-5 text-left transition-all duration-300 sm:p-6 rtl:text-right",
                        even && "lg:ml-auto lg:text-right rtl:lg:mr-auto rtl:lg:text-left",
                        isCurrent && "border-primary bg-primary text-primary-foreground hover:-translate-y-1",
                        isComplete && "border-white/16 bg-card/60 hover:border-primary/45",
                        isLocked && "cursor-not-allowed border-white/7 bg-white/[0.015] text-muted-foreground/55",
                        starting === level.levelNumber && "cursor-wait opacity-70"
                      )}
                      aria-label={t.worldMap.levelStateAria.replace("{n}", String(level.levelNumber)).replace("{state}", isComplete ? t.worldMap.stateComplete : isCurrent ? t.worldMap.stateCurrent : t.worldMap.stateLocked)}
                    >
                      <span className={cn("text-[9px] font-bold uppercase tracking-[0.2em]", isCurrent ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {isComplete ? t.worldMap.checkpointCleared : isCurrent ? t.worldMap.readyToBegin : t.worldMap.routeLocked}
                      </span>
                      <span className="mt-7 flex w-full items-end justify-between gap-4">
                        <span><span className="block text-2xl font-extrabold tracking-[-0.04em]">{t.worldMap.level.replace("{n}", String(level.levelNumber).padStart(2, "0"))}</span><span className={cn("mt-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em]", isCurrent ? "text-primary-foreground/65" : "text-muted-foreground")}><Clock3 className="h-3 w-3" />{t.worldMap.questionsPerLevel}</span></span>
                        {isCurrent ? <ArrowUpRight className="h-5 w-5 shrink-0 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" /> : isComplete ? <Check className="h-5 w-5 shrink-0 text-primary" /> : <LockKeyhole className="h-4 w-4 shrink-0" />}
                      </span>
                      {starting === level.levelNumber && <span className="mt-5 text-[9px] font-bold uppercase tracking-[0.18em]">{t.worldMap.openingCheckpoint}</span>}
                    </button>

                    <AnimatePresence>
                      {lockedTip === level.levelNumber && (
                        <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute -bottom-8 left-0 text-[10px] font-semibold text-secondary lg:left-auto lg:right-0 rtl:left-auto rtl:right-0">{t.worldMap.completeLevelToContinue.replace("{n}", String(level.levelNumber - 1))}</motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <div className="relative z-10 col-start-1 row-start-1 grid place-items-center lg:col-start-2">
                    {isCurrent && !reduceMotion && <motion.span className="absolute h-16 w-16 border border-primary/35" animate={{ opacity: [0.8, 0], scale: [1, 1.5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} />}
                    <button
                      onClick={() => handleLevelClick(level)}
                      disabled={starting === level.levelNumber}
                      tabIndex={-1}
                      aria-hidden="true"
                      className={cn(
                        "grid h-14 w-14 place-items-center border text-xs font-extrabold tabular-nums transition-transform active:scale-95",
                        isCurrent && "border-primary bg-primary text-primary-foreground",
                        isComplete && "border-primary bg-background text-primary",
                        isLocked && "border-white/10 bg-background text-muted-foreground/45"
                      )}
                    >
                      {isLocked ? <LockKeyhole className="h-4 w-4" /> : String(level.levelNumber).padStart(2, "0")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 grid min-h-48 place-items-center border border-dashed border-white/10 text-center">
            <div><Flag className="mx-auto h-5 w-5 text-primary" /><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em]">{t.worldMap.endOfRoute}</p><p className="mt-2 text-xs text-muted-foreground">{t.worldMap.endOfRouteDesc}</p></div>
          </div>
        </section>
      )}

      <AnimatePresence>
        {noHeartsTip && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="pointer-events-none fixed left-1/2 top-28 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border border-destructive/40 bg-background/95 px-5 py-4 text-center text-xs font-bold shadow-2xl backdrop-blur-xl">
            {t.worldMap.noHeartsLeft}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
