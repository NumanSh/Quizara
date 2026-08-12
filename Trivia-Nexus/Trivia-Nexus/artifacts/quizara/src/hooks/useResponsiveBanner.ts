import { useEffect, useState } from "react";
import { ADSTERRA_BANNERS } from "@/lib/ads";

const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Picks the banner creative that fits the current viewport. Rendering only the
 * matching size matters for billing as much as layout — mounting both would
 * request two creatives for one visible ad.
 */
export function useResponsiveBanner() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isDesktop ? ADSTERRA_BANNERS.desktop : ADSTERRA_BANNERS.mobile;
}
