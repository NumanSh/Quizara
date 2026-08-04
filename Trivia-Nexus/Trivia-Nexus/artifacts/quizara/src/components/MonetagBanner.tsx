import { useEffect, useRef } from "react";

export function MonetagBanner() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically inject the Monetag tag
    const script = document.createElement("script");
    script.dataset.zone = "11500519";
    script.src = "https://nap5k.com/tag.min.js";

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center my-6 w-full">
      <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mb-2">Sponsored Content</span>
      <div
        ref={containerRef}
        className="w-full max-w-[728px] min-h-[90px] rounded-xl overflow-hidden flex items-center justify-center bg-white/[0.02] border border-white/[0.08]"
      />
    </div>
  );
}
