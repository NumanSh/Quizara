import { useMemo } from "react";
import { ADSTERRA_INVOKE_HOST } from "@/lib/ads";

interface AdsterraBannerProps {
  adKey: string;
  width: number;
  height: number;
}

/**
 * Adsterra's invoke.js reads a global `atOptions` that must be set immediately
 * before it runs, then writes the creative into the surrounding document. Both
 * halves of that are hostile to React: two banners on one page race over the
 * single global, and document.write into a React-managed tree corrupts it.
 *
 * Giving each unit its own iframe document sidesteps both — the global is
 * scoped to that frame, and the script writes into a document React never
 * touches.
 */
export function AdsterraBanner({ adKey, width, height }: AdsterraBannerProps) {
  const srcDoc = useMemo(
    () =>
      [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        "<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>",
        "</head><body>",
        "<script>atOptions=",
        JSON.stringify({ key: adKey, format: "iframe", height, width, params: {} }),
        ";<\/script>",
        `<script src="${ADSTERRA_INVOKE_HOST}/${adKey}/invoke.js"><\/script>`,
        "</body></html>",
      ].join(""),
    [adKey, width, height],
  );

  return (
    <iframe
      title="Advertisement"
      srcDoc={srcDoc}
      width={width}
      height={height}
      scrolling="no"
      style={{ border: 0, display: "block", width, height, maxWidth: "100%" }}
    />
  );
}
