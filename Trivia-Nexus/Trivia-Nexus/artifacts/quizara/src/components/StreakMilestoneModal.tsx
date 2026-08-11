import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface StreakMilestoneModalProps {
  streak: number;
  coinsAwarded: number;
  onClose: () => void;
}

const CONFETTI_COLORS = [
  "#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e",
  "#a78bfa", "#34d399", "#fb923c", "#38bdf8", "#fbbf24",
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  w: number;
  h: number;
  rot: number;
  rotV: number;
  opacity: number;
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 4,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 6,
      opacity: 1,
    }));

    let raf: number;
    let frame = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotV;
        p.vy += 0.05;
        if (frame > 120) p.opacity = Math.max(0, p.opacity - 0.01);

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (particles.some(p => p.opacity > 0)) {
        raf = requestAnimationFrame(draw);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9998 }}
    />
  );
}

export function StreakMilestoneModal({ streak, coinsAwarded, onClose }: StreakMilestoneModalProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const milestoneLabels: Record<number, string> = {
    7: t.streakMilestone.day7,
    30: t.streakMilestone.day30,
    100: t.streakMilestone.day100,
  };
  const label = milestoneLabels[streak] ?? t.streakMilestone.dayMilestone.replace("{day}", String(streak));

  const content = (
    <>
      <ConfettiCanvas />
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", zIndex: 9999 }}
        onClick={onClose}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          style={{
            border: "1px solid rgba(251,191,36,0.3)",
            background: "linear-gradient(160deg, #0c1020 0%, #14111a 100%)",
            transform: visible ? "scale(1)" : "scale(0.85)",
            opacity: visible ? 1 : 0,
            transition: "all 0.3s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          {/* Top glow stripe */}
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)" }} />

          <div className="flex flex-col items-center text-center px-8 py-8 gap-5">
            {/* Big fire emoji with glow */}
            <div
              className="text-7xl animate-bounce"
              style={{ animationDuration: "1.2s", filter: "drop-shadow(0 0 24px rgba(251,191,36,0.6))" }}
            >
              🔥
            </div>

            {/* Streak day badge */}
            <div
              className="px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-wider"
              style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}
            >
              {t.streakMilestone.dayStreak.replace("{day}", String(streak))}
            </div>

            {/* Headline */}
            <div>
              <h2 className="text-white font-black text-2xl leading-tight">{label}</h2>
              <p className="text-white/50 text-sm mt-1.5">{t.streakMilestone.subtitle}</p>
            </div>

            {/* Coin reward */}
            <div
              className="w-full rounded-2xl p-4 flex items-center justify-center gap-3"
              style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}
            >
              <Gem className="h-7 w-7 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
              <div className="text-left">
                <p className="text-amber-300 font-black text-2xl leading-none">{t.streakMilestone.coins.replace("{coins}", String(coinsAwarded))}</p>
                <p className="text-amber-400/60 text-xs mt-0.5">{t.streakMilestone.rewardAdded}</p>
              </div>
            </div>

            {/* Dismiss */}
            <Button
              className="w-full h-12 font-bold text-base rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, #f59e0b, #fbbf24)" }}
              onClick={onClose}
            >
              {t.streakMilestone.dismiss}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
