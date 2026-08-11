import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface GameShellProps {
  children: ReactNode;
  index: string;
  label: string;
  exitLabel: string;
  onExit: () => void;
  footer?: ReactNode;
  compact?: boolean;
}

export function GameShell({ children, index, label, exitLabel, onExit, footer, compact = false }: GameShellProps) {
  const reduceMotion = useReducedMotion();
  const { lang } = useI18n();
  const ExitIcon = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="editorial-grid pointer-events-none absolute inset-0 opacity-55" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[18rem] top-[18%] h-[38rem] w-[38rem] rounded-full border border-primary/10 rtl:-left-[18rem] rtl:right-auto"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 48, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-primary/80" />
        <span className="absolute bottom-[15%] left-[12%] h-1.5 w-1.5 rounded-full bg-white/35" />
      </motion.div>

      <header className="relative z-20 flex min-h-16 items-center justify-between border-b border-white/10 px-4 sm:min-h-20 sm:px-8 lg:px-12">
        <button type="button" onClick={onExit} className="focus-ring group flex min-h-11 items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
          <span className="grid h-9 w-9 place-items-center border border-white/15 transition-colors group-hover:border-primary group-hover:text-primary"><ExitIcon className="h-4 w-4" /></span>
          <span className="hidden sm:inline">{exitLabel}</span>
        </button>

        <div className="flex items-center gap-3" aria-label="Quizara">
          <span className="grid h-8 w-8 place-items-center bg-primary text-sm font-black text-primary-foreground">Q</span>
          <div className="text-right rtl:text-left">
            <p className="text-[8px] font-bold uppercase tracking-[0.28em] text-primary">{index}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">{label}</p>
          </div>
        </div>
      </header>

      <motion.main
        id="game-content"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className={compact ? "relative z-10 mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10" : "relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-8 sm:py-8 lg:px-12"}
      >
        {children}
      </motion.main>

      {footer && <div className="relative z-20 border-t border-white/10 bg-background/94 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-8">{footer}</div>}
    </div>
  );
}
