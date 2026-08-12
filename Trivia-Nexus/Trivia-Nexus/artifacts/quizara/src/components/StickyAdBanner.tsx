import { useState } from "react";
import { X } from "lucide-react";
import { AdsterraBanner } from "./AdsterraBanner";
import { useResponsiveBanner } from "@/hooks/useResponsiveBanner";
import { useI18n } from "@/lib/i18n";

const DISMISS_KEY = "quizara-sticky-ad-dismissed";

// Storage throws rather than returning null in blocked contexts (in-app
// webviews, private windows, cookies disabled). This renders on every route, so
// an unguarded read would take the whole app down with a blank page.
function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Non-fatal: the bar returns on the next page load.
  }
}

/**
 * Always-on banner pinned to the bottom of the viewport. Sits above the mobile
 * bottom nav so it never covers navigation, and is dismissible for the session —
 * an ad that cannot be closed reads as forced inventory to a network reviewer.
 */
export function StickyAdBanner() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(readDismissed);
  const banner = useResponsiveBanner();

  if (dismissed) return null;

  const handleClose = () => {
    rememberDismissed();
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-2 pb-[env(safe-area-inset-bottom)] md:bottom-0 md:px-0">
      <div className="relative flex items-center rounded-t-xl border border-b-0 border-white/[0.08] bg-background/95 p-1.5 backdrop-blur-xl">
        <AdsterraBanner
          key={banner.key}
          adKey={banner.key}
          width={banner.width}
          height={banner.height}
        />
        <button
          onClick={handleClose}
          aria-label={t.ads.closeAd}
          className="absolute -top-2 right-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-background text-white/50 hover:bg-white/10 hover:text-white rtl:left-0 rtl:right-auto"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
