import { useEffect, useRef, useState } from "react";
import { AdsterraBanner } from "./AdsterraBanner";
import { useResponsiveBanner } from "@/hooks/useResponsiveBanner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface AdSlotProps {
  className?: string;
}

/**
 * A labelled banner placed between page sections. Unlike the sticky bar this
 * scrolls away with the content, so it never sits near navigation or answer
 * buttons where a mis-tap would look like fraud to the network.
 */
export function AdSlot({ className }: AdSlotProps) {
  const { t } = useI18n();
  const banner = useResponsiveBanner();
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  // Request the creative only once the slot is near the viewport. A slot the
  // user never scrolls to would otherwise burn an impression it can't earn on,
  // dragging the unit's click-through rate down.
  useEffect(() => {
    if (inView || !containerRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [inView]);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1440px] flex-col items-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16",
        className,
      )}
    >
      <span className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-white/35">
        {t.ads.sponsored}
      </span>
      <div
        ref={containerRef}
        className="flex w-full items-center justify-center overflow-hidden"
        style={{ minHeight: banner.height }}
      >
        {inView && (
          <AdsterraBanner
            key={banner.key}
            adKey={banner.key}
            width={banner.width}
            height={banner.height}
          />
        )}
      </div>
    </div>
  );
}
