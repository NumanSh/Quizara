/**
 * Monetag zone ids, kept in one place so placements can be re-pointed without
 * hunting through components.
 *
 * Monetag has no true inline display banner. Every format it offers either
 * positions itself (In-Page Push), takes over the screen (Vignette,
 * Interstitial), or is a bare URL (Direct Link) — so there is nothing to embed
 * in a page-section container. Placements here are therefore site-wide or
 * event-triggered, never in-flow.
 *
 * Redirect-on-click formats (OnClick/popunder, Push Notifications) are
 * deliberately absent.
 */
export const AD_ZONES = {
  /**
   * In-Page Push — renders as a floating unit that positions itself and takes
   * no layout space. Loaded once for the whole app; a second zone on the same
   * page will not reliably fill, since every zone shares one tag.min.js.
   */
  inPagePush: "11557679",

  /**
   * Vignette Banner — full-screen unit shown at a break in play. Fire only on
   * natural transitions (quiz finished), never mid-question, and always behind
   * a frequency cap.
   */
  vignette: "11500522",

  /**
   * Rewarded Interstitial. Empty until one is created in the dashboard — while
   * unset the reward modal runs its house creative and earns nothing.
   */
  rewarded: "",
};

export const AD_TAG_SRC = "https://nap5k.com/tag.min.js";

const VIGNETTE_LAST_SHOWN_KEY = "quizara_vignette_last";
const VIGNETTE_MIN_GAP_MS = 3 * 60 * 1000;

let vignetteLoaded = false;

// Storage throws outright in blocked contexts (in-app webviews, private windows)
// rather than returning null, and an ad helper must never take a page down.
function readLastShown(): number {
  try {
    return Number(localStorage.getItem(VIGNETTE_LAST_SHOWN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function rememberShown(): void {
  try {
    localStorage.setItem(VIGNETTE_LAST_SHOWN_KEY, String(Date.now()));
  } catch {
    // Non-fatal: the cap degrades to once per page load.
  }
}

/**
 * Shows the vignette at a break in play. Loading the tag is what triggers the
 * unit, so it is injected here rather than at app start — that keeps a
 * full-screen ad on a natural transition (a finished quiz) instead of letting it
 * interrupt someone mid-question.
 *
 * Capped to once per {@link VIGNETTE_MIN_GAP_MS}. Uncapped full-screen ads are
 * what ad networks flag as forced impressions.
 */
export function showVignetteAtBreak(): void {
  if (vignetteLoaded || !AD_ZONES.vignette) return;
  if (Date.now() - readLastShown() < VIGNETTE_MIN_GAP_MS) return;

  vignetteLoaded = true;
  rememberShown();

  const script = document.createElement("script");
  script.dataset.zone = AD_ZONES.vignette;
  script.src = AD_TAG_SRC;
  (document.body ?? document.documentElement).appendChild(script);
}
