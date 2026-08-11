/**
 * Monetag zone ids, kept in one place so placements can be re-pointed without
 * hunting through components.
 *
 * Only non-redirecting formats belong here. OnClick (popunder) and Push zones
 * hijack navigation or nag the user after they leave, which is exactly what
 * this app's ad setup avoids.
 */
export const AD_ZONES = {
  /** In-Page Push — self-positioning; used once, for the bottom anchor bar. */
  anchor: "11500519",
  /**
   * Inline banner slots, in render order. Monetag initialises a given zone once
   * per page, so a reused id only fills the first slot that requests it — each
   * in-content slot needs its own Banner zone to reliably fill. Add ids here as
   * they are created in the dashboard; slots past the end of this list render
   * nothing rather than showing an empty frame.
   */
  inContent: ["11557679", "11557680"] as string[],
  /**
   * Rewarded Interstitial zone. Empty until one is created in the dashboard —
   * while unset the reward modal runs its house creative and earns nothing.
   */
  rewarded: "",
};

export function inContentZone(index: number): string | undefined {
  return AD_ZONES.inContent[index];
}
