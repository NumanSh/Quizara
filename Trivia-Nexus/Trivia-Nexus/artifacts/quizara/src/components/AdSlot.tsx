import { useEffect, useRef, useState } from "react";
import { inContentZone } from "@/lib/ads";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface AdSlotProps {
  /** Position among the page's in-content slots; selects the matching zone id. */
  index: number;
  className?: string;
}

/**
 * An in-flow, clearly-labelled banner placed between page sections. Unlike the
 * bottom anchor it scrolls away with the content, so it never covers controls.
 */
export function AdSlot({ index, className }: AdSlotProps) {
  const { t } = useI18n();
  const zone = inContentZone(index);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  // Load the tag only once the slot is near the viewport. A slot the user never
  // scrolls to costs a request and earns nothing, and unviewed impressions drag
  // the zone's CTR down.
  useEffect(() => {
    if (!zone || inView || !containerRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [zone, inView]);

  useEffect(() => {
    if (!inView || !zone || !containerRef.current) return;

    const script = document.createElement("script");
    script.dataset.zone = zone;
    script.src = "https://nap5k.com/tag.min.js";
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [inView, zone]);

  if (!zone) return null;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1440px] flex-col items-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16",
        className,
      )}
    >
      <span className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-white/35">
        {t.monetag.sponsoredContent}
      </span>
      <div
        ref={containerRef}
        className="flex min-h-[100px] w-full max-w-[728px] items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]"
      />
    </div>
  );
}
