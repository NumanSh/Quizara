import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Flame, Globe2, Heart, Play, Radio, Sparkles, Swords, Target, Trophy, UserPlus, Users, Zap } from "lucide-react";
import { getGetLeaderboardQueryKey, getListCategoriesQueryKey, useGetLeaderboard, useListCategories } from "@workspace/api-client-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useStreak } from "@/hooks/useStreak";
import { usePlayerLibrary } from "@/hooks/usePlayerLibrary";
import { AdSlot } from "@/components/AdSlot";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MILESTONE_COINS: Record<number, number> = { 7: 50, 30: 200, 100: 500 };

function Eyebrow({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
      <span className="text-primary">{index}</span><span className="h-px w-8 bg-white/15" />{children}
    </div>
  );
}

function OrbitStage({ labels }: { labels: string[] }) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const positions = ["left-[5%] top-[19%]", "right-[2%] top-[29%]", "left-[2%] bottom-[24%]", "right-[8%] bottom-[13%]"];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[560px]" aria-hidden="true">
      <div className="absolute inset-[5%] rounded-full border border-white/8" />
      <motion.div
        className="absolute inset-[18%] rounded-full border border-dashed border-primary/25"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 36, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-[30%] rounded-full border border-white/10"
        animate={reduceMotion ? undefined : { rotate: -360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-secondary" />
      </motion.div>

      <div className="absolute inset-[28%] grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_80px_hsl(75_100%_68%/0.12)]">
        <motion.span
          className="text-[clamp(4rem,9vw,7rem)] font-extrabold leading-none tracking-[-0.08em]"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.8, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          Q
        </motion.span>
        <span className="absolute bottom-[20%] text-[8px] font-extrabold uppercase tracking-[0.28em]">{t.home.playLearnRise}</span>
      </div>

      {positions.map((position, index) => (
        <motion.div
          key={position}
          className={cn("absolute max-w-[42%] border border-white/12 bg-background/88 px-3 py-2 backdrop-blur-md", position)}
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.6 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="mr-2 text-[9px] text-primary rtl:ml-2 rtl:mr-0">0{index + 1}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">{labels[index] || t.home.orbitDefault}</span>
        </motion.div>
      ))}

      <div className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <Radio className="h-3 w-3 text-primary" /> {t.home.liveFeed}
      </div>
    </div>
  );
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  const { isAuthenticated } = useSupabaseAuth();
  const { data: streak } = useStreak(isAuthenticated);
  const { t, lang } = useI18n();
  const { data: playerLibrary, isLoading: libraryLoading } = usePlayerLibrary(isAuthenticated);
  const { data: categories, isLoading: catsLoading } = useListCategories(undefined, { query: { queryKey: getListCategoriesQueryKey() } });
  const { data: leaderboard, isLoading: lbLoading } = useGetLeaderboard(
    { period: "all_time" },
    { query: { queryKey: getGetLeaderboardQueryKey({ period: "all_time" }) } }
  );

  const allRootCategories = categories?.filter(category => !category.parentId) || [];
  const rootCategories = allRootCategories.slice(0, 6);
  const favoriteIdSet = new Set(playerLibrary?.favoriteCategoryIds ?? []);
  const favoriteCategories = allRootCategories.filter(category => favoriteIdSet.has(category.id)).slice(0, 4);
  const continuePlaying = playerLibrary?.continuePlaying ?? null;
  const continueName = continuePlaying ? (lang === "ar" ? continuePlaying.nameAr : continuePlaying.name) : "";
  const continueProgress = continuePlaying?.activeSession
    ? Math.round(((continuePlaying.activeSession.currentQuestionNumber - 1) / continuePlaying.activeSession.totalQuestions) * 100)
    : continuePlaying?.totalLevels
      ? Math.round((continuePlaying.completedLevels / continuePlaying.totalLevels) * 100)
      : 0;
  const topPlayers = leaderboard?.slice(0, 3) || [];
  const orbitLabels = rootCategories.slice(0, 4).map(category => category.name);
  const reveal = {
    initial: reduceMotion ? false : { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.2 },
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  };

  return (
    <div className="flex-1 overflow-hidden">
      <section className="editorial-grid relative border-b border-white/8">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background pointer-events-none" />
        <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1440px] items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:px-12 lg:py-12 xl:px-16">
          <motion.div
            className="relative z-10 max-w-2xl"
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } }}>
              <Eyebrow index="01">{t.home.eyebrow01}</Eyebrow>
            </motion.div>
            <motion.h1
              variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } } }}
              className="mt-8 text-[clamp(3.6rem,7.4vw,7.8rem)] font-extrabold leading-[0.86] tracking-[-0.075em]"
            >
              {t.home.hero.title}
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.7 } } }}
              className="mt-8 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base"
            >
              {t.home.hero.subtitle}
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.7 } } }} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={continuePlaying?.href ?? "/categories"} className="focus-ring group inline-flex min-h-14 items-center justify-between gap-8 bg-primary px-6 text-sm font-extrabold text-primary-foreground transition-transform duration-300 hover:-translate-y-1 sm:min-w-52">
                <span className="flex items-center gap-3"><Play className="h-4 w-4 fill-current" />{continuePlaying ? t.home.library.title : t.home.hero.quickPlay}</span>
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 rtl:group-hover:-translate-x-1" />
              </Link>
              <Link href="/arena" className="focus-ring group inline-flex min-h-14 items-center justify-between gap-8 border border-white/18 px-6 text-sm font-bold transition-colors duration-300 hover:border-white/40 sm:min-w-52">
                <span className="flex items-center gap-3"><Swords className="h-4 w-4 text-secondary" />{t.home.hero.onlineGame}</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
              </Link>
            </motion.div>
          </motion.div>

          <OrbitStage labels={orbitLabels} />

          <div className="absolute bottom-6 left-5 right-5 hidden items-center justify-between text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/65 sm:flex lg:left-12 lg:right-12 xl:left-16 xl:right-16">
            <span>{t.home.arabicEnglish}</span><span>{t.home.soloLiveFriends}</span><span>{t.home.season01}</span>
          </div>
        </div>
      </section>

      {isAuthenticated && (
        <section className="border-b border-white/8 bg-card/20">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[1.35fr_0.65fr]">
            <div className="editorial-grid border-b border-white/8 px-5 py-10 sm:px-8 lg:border-b-0 lg:border-r lg:px-12 lg:py-12 rtl:lg:border-l rtl:lg:border-r-0 xl:px-16">
              {libraryLoading ? (
                <div className="space-y-5"><Skeleton className="h-3 w-36 rounded-none" /><Skeleton className="h-12 w-72 max-w-full rounded-none" /><Skeleton className="h-px w-full rounded-none" /></div>
              ) : continuePlaying ? (
                <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                  <div className="flex items-center justify-between gap-4">
                    <Eyebrow index="NOW">{t.home.library.resumeRoute}</Eyebrow>
                    <span className="text-2xl" aria-hidden="true">{continuePlaying.icon}</span>
                  </div>
                  <div className="mt-7 flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
                    <div>
                      <h2 className="text-[clamp(2.3rem,5vw,4.7rem)] font-extrabold leading-[0.9] tracking-[-0.065em]">{continueName}</h2>
                      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">
                        {continuePlaying.activeSession
                          ? `${t.home.library.checkpoint} ${String(continuePlaying.activeSession.levelNumber).padStart(2, "0")} / ${continuePlaying.activeSession.currentQuestionNumber} of ${continuePlaying.activeSession.totalQuestions} ${t.home.library.questions}`
                          : continuePlaying.state === "complete"
                            ? t.home.library.reviewWorld
                            : `${t.home.library.checkpoint} ${String(continuePlaying.nextLevel).padStart(2, "0")} / ${continuePlaying.completedLevels} of ${continuePlaying.totalLevels} ${t.home.library.complete}`}
                      </p>
                    </div>
                    <Link href={continuePlaying.href} className="focus-ring group inline-flex min-h-12 shrink-0 items-center justify-between gap-8 border border-primary px-5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                      {continuePlaying.state === "resume_quiz" ? t.home.library.resumeQuiz : continuePlaying.state === "complete" ? t.home.library.reviewWorld : t.home.library.continueWorld}
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 rtl:group-hover:-translate-x-1" />
                    </Link>
                  </div>
                  <div className="mt-8">
                    <div className="flex justify-between text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground"><span>{t.home.library.title}</span><span className="text-primary">{continueProgress}%</span></div>
                    <div className="mt-3 h-px bg-white/12"><motion.div initial={reduceMotion ? false : { scaleX: 0 }} animate={{ scaleX: continueProgress / 100 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="h-px bg-primary" style={{ transformOrigin: lang === "ar" ? "right" : "left" }} /></div>
                  </div>
                </motion.div>
              ) : (
                <div className="max-w-xl">
                  <Eyebrow index="NOW">{t.home.library.title}</Eyebrow>
                  <h2 className="mt-7 text-3xl font-extrabold tracking-[-0.05em]">{t.home.library.noJourney}</h2>
                  <Link href="/categories" className="focus-ring mt-7 inline-flex items-center gap-3 border-b border-primary pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.home.library.explore}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
                </div>
              )}
            </div>

            <aside className="px-5 py-10 sm:px-8 lg:px-9 lg:py-12">
              <div className="flex items-center justify-between gap-4"><Eyebrow index="SAVE">{t.home.library.favorites}</Eyebrow><Heart className="h-4 w-4 text-primary" /></div>
              {libraryLoading ? (
                <div className="mt-6 space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 rounded-none" />)}</div>
              ) : favoriteCategories.length > 0 ? (
                <div className="mt-5 border-t border-white/10">
                  {favoriteCategories.map(category => (
                    <Link key={category.id} href={`/worlds/${category.id}`} className="focus-ring group flex min-h-14 items-center justify-between gap-3 border-b border-white/8 py-3 text-sm font-extrabold transition-colors hover:text-primary">
                      <span className="min-w-0 truncate"><span className="mr-3 text-base rtl:ml-3 rtl:mr-0" aria-hidden="true">{category.icon}</span>{lang === "ar" ? category.nameAr : category.name}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    </Link>
                  ))}
                  <Link href="/categories" className="focus-ring mt-5 inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{t.home.library.viewAll}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
                </div>
              ) : (
                <div className="mt-7">
                  <p className="text-sm leading-7 text-muted-foreground">{t.home.library.noFavorites}</p>
                  <Link href="/categories" className="focus-ring mt-6 inline-flex items-center gap-2 border-b border-primary pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{t.home.library.explore}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}

      <section className="border-b border-white/8">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 md:grid-cols-3">
          {[
            { index: "01", icon: Play, title: t.home.hero.quickPlay, copy: t.home.howToPlay.step1.desc, href: "/categories" },
            { index: "02", icon: Swords, title: t.home.hero.onlineGame, copy: t.arena.subtitle, href: "/arena" },
            { index: "03", icon: UserPlus, title: t.home.hero.friendsGame, copy: t.home.howToPlay.step3.desc, href: "/arena" },
          ].map(({ index, icon: Icon, title, copy, href }) => (
            <Link key={index} href={href} className="focus-ring group relative min-h-56 border-b border-white/8 p-7 transition-colors duration-500 hover:bg-primary hover:text-primary-foreground md:border-b-0 md:border-r last:md:border-r-0 rtl:md:border-l rtl:md:border-r-0 last:rtl:md:border-l-0 sm:p-9">
              <div className="flex items-start justify-between"><span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground group-hover:text-primary-foreground/60">{t.home.modeLabel.replace("{n}", index)}</span><Icon className="h-5 w-5 text-primary transition-transform duration-500 group-hover:rotate-6 group-hover:text-primary-foreground" /></div>
              <h2 className="mt-12 text-2xl font-extrabold tracking-[-0.04em]">{title}</h2>
              <p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground group-hover:text-primary-foreground/70">{copy}</p>
              <ArrowUpRight className="absolute bottom-8 right-8 h-5 w-5 opacity-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:opacity-100 rtl:left-8 rtl:right-auto rtl:group-hover:-translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      <motion.section {...reveal} className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28 xl:px-16">
        <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-7 sm:flex-row sm:items-end">
          <div><Eyebrow index="02">{t.home.exploreField}</Eyebrow><h2 className="mt-5 text-4xl font-extrabold tracking-[-0.055em] sm:text-5xl">{t.home.categories.title}</h2></div>
          <Link href="/categories" className="focus-ring group flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t.home.categories.viewAll}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" /></Link>
        </div>

        <div className="mt-2">
          {catsLoading ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="my-2 h-20 rounded-none" />) : rootCategories.map((category, index) => (
            <Link key={category.id} href={`/worlds/${category.id}`} className="focus-ring group grid grid-cols-[3rem_1fr_auto] items-center gap-3 border-b border-white/8 py-6 transition-colors hover:text-primary sm:grid-cols-[5rem_1fr_auto] sm:py-8">
              <span className="text-[10px] font-bold tabular-nums tracking-[0.2em] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <div><h3 className="text-xl font-extrabold tracking-[-0.035em] sm:text-3xl">{category.name}</h3><span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{category.questionCount ? t.home.questionsCount.replace("{count}", String(category.questionCount)) : t.home.openField}</span></div>
              <span className="grid h-11 w-11 place-items-center border border-white/12 transition-all duration-300 group-hover:rotate-45 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"><ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-45" /></span>
            </Link>
          ))}
        </div>
      </motion.section>

      <section className="border-y border-white/8 bg-card/35">
        <div className="mx-auto grid max-w-[1440px] grid-cols-3 divide-x divide-white/8 rtl:divide-x-reverse">
          {[
            { icon: Users, value: "2,400+", label: t.home.stats.playersOnline },
            { icon: Zap, value: "18,900+", label: t.home.stats.questionsToday },
            { icon: Globe2, value: "80+", label: t.home.stats.countries },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="px-3 py-9 text-center sm:py-12"><Icon className="mx-auto mb-4 h-4 w-4 text-primary" /><p className="text-xl font-extrabold tracking-[-0.04em] sm:text-3xl">{value}</p><p className="mt-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">{label}</p></div>
          ))}
        </div>
      </section>

      <AdSlot className="border-b border-white/8" />

      <motion.section {...reveal} className="mx-auto grid max-w-[1440px] gap-16 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-28 xl:px-16">
        <div>
          <Eyebrow index="03">{t.home.consistencyCompounds}</Eyebrow>
          <div className="mt-8 flex items-end gap-5"><span className="text-[clamp(5rem,11vw,9rem)] font-extrabold leading-none tracking-[-0.08em] text-secondary">{streak?.currentStreak ?? 0}</span><div className="pb-4"><Flame className="mb-3 h-6 w-6 text-secondary" /><p className="max-w-40 text-sm font-bold">{t.home.streak.dayStreak}</p></div></div>
          <p className="mt-7 max-w-lg text-sm leading-7 text-muted-foreground">{t.home.streak.playDaily}</p>
          {streak?.nextMilestone && <div className="mt-8"><div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.14em]"><span>{t.home.streak.nextMilestone}</span><span className="text-secondary">{streak.nextMilestone} / +{MILESTONE_COINS[streak.nextMilestone] ?? "?"}</span></div><div className="mt-3 h-px bg-white/12"><div className="h-px bg-secondary" style={{ width: `${Math.min(100, (streak.currentStreak / streak.nextMilestone) * 100)}%` }} /></div></div>}
          <Link href="/categories" className="focus-ring mt-9 inline-flex items-center gap-3 border-b border-primary pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary"><Target className="h-4 w-4" />{streak?.checkedInToday ? t.home.streak.checkedIn : t.home.streak.playToKeep}</Link>
        </div>

        <div>
          <div className="flex items-center justify-between"><Eyebrow index="04">{t.home.globalRanking}</Eyebrow><Trophy className="h-5 w-5 text-primary" /></div>
          <div className="mt-8 border-t border-white/10">
            {lbLoading ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="my-2 h-20 rounded-none" />) : topPlayers.length === 0 ? <div className="py-16 text-sm text-muted-foreground">{t.home.topPlayers.noPlayers} — {t.home.topPlayers.beFirst}</div> : topPlayers.map((player, index) => (
              <div key={player.userId} className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-b border-white/8 py-6"><span className={cn("text-xs font-bold", index === 0 ? "text-primary" : "text-muted-foreground")}>0{index + 1}</span><div><p className="text-base font-extrabold">{player.username || t.home.topPlayers.anonymous}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{t.home.globalPlayer}</p></div><span className="text-xs font-bold tabular-nums">{player.totalScore.toLocaleString()} {t.home.topPlayers.pts}</span></div>
            ))}
          </div>
          <Link href="/leaderboard" className="focus-ring mt-7 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t.home.topPlayers.viewFull}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
        </div>
      </motion.section>

      <AdSlot className="border-t border-white/8" />

      <motion.section {...reveal} className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28 xl:px-16">
        <Eyebrow index="05">{t.home.howToPlay.title}</Eyebrow>
        <div className="mt-9 grid gap-10 md:grid-cols-3">
          {[t.home.howToPlay.step1, t.home.howToPlay.step2, t.home.howToPlay.step3].map((step, index) => (
            <div key={step.title} className="relative border-t border-white/12 pt-7"><span className="text-[10px] font-bold text-primary">0{index + 1}</span><h3 className="mt-10 text-2xl font-extrabold tracking-[-0.04em]">{step.title}</h3><p className="mt-4 text-sm leading-7 text-muted-foreground">{step.desc}</p>{index < 2 && <Sparkles className="absolute right-0 top-6 h-3.5 w-3.5 text-muted-foreground/30 rtl:left-0 rtl:right-auto" />}</div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
