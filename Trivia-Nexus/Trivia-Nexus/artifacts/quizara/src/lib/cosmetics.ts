import type { CSSProperties } from "react";
import type { Translations } from "@/locales/en";

// ─── Avatar Frames ────────────────────────────────────────────────────────────
export interface FrameDef {
  label: string;
  emoji: string;
  border: string;
  shadow: string;
  /** optional: background behind avatar for rainbow */
  avatarBg?: string;
}

export const FRAME_DEFS: Record<string, FrameDef> = {
  frame_gold:    { label: "Gold Crown",   emoji: "👑", border: "3px solid #F59E0B",  shadow: "0 0 18px 3px rgba(245,158,11,0.75)" },
  frame_fire:    { label: "Fire Ring",    emoji: "🔥", border: "3px solid #F97316",  shadow: "0 0 22px 4px rgba(249,115,22,0.85)" },
  frame_ice:     { label: "Ice Crystal",  emoji: "❄️",  border: "3px solid #67E8F9",  shadow: "0 0 20px 3px rgba(103,232,249,0.75)" },
  frame_diamond: { label: "Diamond Aura", emoji: "💎", border: "3px solid #BAE6FD",  shadow: "0 0 28px 6px rgba(186,230,253,0.9)" },
  frame_neon:    { label: "Neon Glow",    emoji: "⚡", border: "3px solid #4ADE80",  shadow: "0 0 24px 4px rgba(74,222,128,0.85)" },
  frame_rainbow: { label: "Rainbow",      emoji: "🌈", border: "3px solid transparent", shadow: "0 0 22px 4px rgba(139,92,246,0.6)", avatarBg: "linear-gradient(#0d1117,#0d1117) padding-box, linear-gradient(135deg,#F59E0B,#EC4899,#8B5CF6,#06B6D4) border-box" },
  frame_dark:    { label: "Dark Void",    emoji: "🌑", border: "3px solid #7C3AED",  shadow: "0 0 18px 4px rgba(124,58,237,0.6), inset 0 0 14px rgba(0,0,0,0.7)" },
  frame_royal:   { label: "Royal Purple", emoji: "👸", border: "3px solid #A855F7",  shadow: "0 0 20px 3px rgba(168,85,247,0.75)" },
};

export function getFrameStyle(effectKey: string | null | undefined): CSSProperties {
  if (!effectKey) return {};
  const def = FRAME_DEFS[effectKey];
  if (!def) return {};
  const style: CSSProperties = {
    boxShadow: def.shadow,
  };
  if (def.avatarBg) {
    (style as any).background = def.avatarBg;
    (style as any).borderColor = "transparent";
    (style as any).borderWidth = "3px";
    (style as any).borderStyle = "solid";
  } else {
    style.border = def.border;
  }
  return style;
}

// ─── Profile Backgrounds ─────────────────────────────────────────────────────
export interface BgDef {
  label: string;
  emoji: string;
  gradient: string;
  previewColors: string[]; // for swatch
}

export const BG_DEFS: Record<string, BgDef> = {
  bg_sunset:    { label: "Sunset",       emoji: "🌅", gradient: "linear-gradient(135deg,rgba(249,115,22,0.18) 0%,rgba(239,68,68,0.12) 50%,transparent 100%)",    previewColors: ["#F97316","#EF4444"] },
  bg_ocean:     { label: "Ocean Depths", emoji: "🌊", gradient: "linear-gradient(135deg,rgba(6,182,212,0.18) 0%,rgba(59,130,246,0.12) 50%,transparent 100%)",    previewColors: ["#06B6D4","#3B82F6"] },
  bg_galaxy:    { label: "Galaxy",       emoji: "🌌", gradient: "linear-gradient(135deg,rgba(139,92,246,0.22) 0%,rgba(30,27,75,0.3) 50%,transparent 100%)",       previewColors: ["#8B5CF6","#1E1B4B"] },
  bg_forest:    { label: "Forest",       emoji: "🌲", gradient: "linear-gradient(135deg,rgba(34,197,94,0.18) 0%,rgba(16,185,129,0.12) 50%,transparent 100%)",     previewColors: ["#22C55E","#10B981"] },
  bg_cyberpunk: { label: "Cyberpunk",    emoji: "🤖", gradient: "linear-gradient(135deg,rgba(236,72,153,0.22) 0%,rgba(139,92,246,0.16) 50%,transparent 100%)",   previewColors: ["#EC4899","#8B5CF6"] },
  bg_midnight:  { label: "Midnight",     emoji: "🌙", gradient: "linear-gradient(135deg,rgba(30,41,59,0.45) 0%,rgba(15,23,42,0.35) 50%,transparent 100%)",       previewColors: ["#1E293B","#0F172A"] },
  bg_aurora:    { label: "Aurora",       emoji: "🌠", gradient: "linear-gradient(135deg,rgba(20,184,166,0.22) 0%,rgba(139,92,246,0.16) 50%,transparent 100%)",   previewColors: ["#14B8A6","#8B5CF6"] },
  bg_lava:      { label: "Lava",         emoji: "🌋", gradient: "linear-gradient(135deg,rgba(239,68,68,0.22) 0%,rgba(249,115,22,0.16) 50%,transparent 100%)",    previewColors: ["#EF4444","#F97316"] },
};

export function getBgStyle(effectKey: string | null | undefined): CSSProperties {
  if (!effectKey) return {};
  const def = BG_DEFS[effectKey];
  if (!def) return {};
  return { background: def.gradient };
}

// ─── Username Colors ──────────────────────────────────────────────────────────
export interface ColorDef {
  label: string;
  emoji: string;
  color?: string; // solid hex
  gradient?: string; // for rainbow
  previewColor: string; // single color for swatches
}

export const COLOR_DEFS: Record<string, ColorDef> = {
  color_gold:    { label: "Gold",         emoji: "🟡", color: "#F59E0B", previewColor: "#F59E0B" },
  color_cyan:    { label: "Cyan",         emoji: "🔵", color: "#06B6D4", previewColor: "#06B6D4" },
  color_purple:  { label: "Purple",       emoji: "🟣", color: "#8B5CF6", previewColor: "#8B5CF6" },
  color_rose:    { label: "Rose",         emoji: "🔴", color: "#F43F5E", previewColor: "#F43F5E" },
  color_emerald: { label: "Emerald",      emoji: "🟢", color: "#10B981", previewColor: "#10B981" },
  color_orange:  { label: "Orange",       emoji: "🟠", color: "#F97316", previewColor: "#F97316" },
  color_rainbow: { label: "Rainbow Text", emoji: "🌈", gradient: "linear-gradient(90deg,#F59E0B,#EC4899,#8B5CF6,#06B6D4)", previewColor: "#EC4899" },
};

export function getUsernameStyle(effectKey: string | null | undefined): CSSProperties {
  if (!effectKey) return {};
  const def = COLOR_DEFS[effectKey];
  if (!def) return {};
  if (def.gradient) {
    return {
      background: def.gradient,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    } as CSSProperties;
  }
  return { color: def.color };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getCosmeticSubtype(effectKey: string): "frame" | "bg" | "color" | null {
  if (effectKey.startsWith("frame_")) return "frame";
  if (effectKey.startsWith("bg_")) return "bg";
  if (effectKey.startsWith("color_")) return "color";
  return null;
}

export const ALL_COSMETIC_EFFECTS = [
  ...Object.keys(FRAME_DEFS),
  ...Object.keys(BG_DEFS),
  ...Object.keys(COLOR_DEFS),
];

export function cosmeticLabel(t: Translations, effectKey: string): string {
  return (t.cosmetics as Record<string, string>)[effectKey] ?? effectKey;
}
