import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const DISMISS_KEY = "monetag-anchor-dismissed";

export function MonetagBanner() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  useEffect(() => {
    if (dismissed || !containerRef.current) return;

    // In-Page Push zone, rendered in-flow as a fixed anchor bar (not a
    // popunder/redirect format) so it never hijacks clicks elsewhere on the page.
    const script = document.createElement("script");
    script.dataset.zone = "11500519";
    script.src = "https://nap5k.com/tag.min.js";

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [dismissed]);

  if (dismissed) return null;

  const handleClose = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] md:bottom-0 md:px-0">
      <div className="relative flex w-full max-w-[728px] flex-col items-center rounded-t-xl border border-b-0 border-white/[0.08] bg-background/95 py-2 backdrop-blur-xl md:rounded-t-2xl">
        <button
          onClick={handleClose}
          aria-label={t.monetag.closeAd}
          className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
        <span className="text-[9px] text-white/35 uppercase tracking-widest font-semibold mb-1">{t.monetag.sponsoredContent}</span>
        <div
          ref={containerRef}
          className="w-full min-h-[50px] flex items-center justify-center overflow-hidden"
        />
      </div>
    </div>
  );
}
