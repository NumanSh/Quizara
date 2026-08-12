import { useEffect } from "react";
import { AD_TAG_SRC, AD_ZONES } from "@/lib/ads";

let loaded = false;

/**
 * Loads the site-wide In-Page Push zone. Renders nothing: this format positions
 * its own floating unit and occupies no layout space, so there is no container
 * to place and nothing to reserve room for.
 *
 * Mounted once at the app root. The tag is loaded a single time per page load —
 * re-injecting it does not produce a second ad.
 */
export function MonetagAds() {
  useEffect(() => {
    if (loaded || !AD_ZONES.inPagePush) return;
    loaded = true;

    const script = document.createElement("script");
    script.dataset.zone = AD_ZONES.inPagePush;
    script.src = AD_TAG_SRC;
    (document.body ?? document.documentElement).appendChild(script);
  }, []);

  return null;
}
