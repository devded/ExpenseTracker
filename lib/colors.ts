// Client-safe mapping of Notion select colors to warm, kami-toned pill styles.

export const NOTION_COLORS = [
  "default", "gray", "brown", "orange", "yellow",
  "green", "blue", "purple", "pink", "red",
] as const;

export type NotionColor = (typeof NOTION_COLORS)[number];

// Pill background + text for a given Notion color.
const PILL: Record<string, { bg: string; fg: string }> = {
  default: { bg: "#eef2f7", fg: "#1b365d" },
  gray: { bg: "#ecebe4", fg: "#504e49" },
  brown: { bg: "#f0ece2", fg: "#7a5a2e" },
  orange: { bg: "#f3e8db", fg: "#8a5a2e" },
  yellow: { bg: "#f2ecd6", fg: "#7a6a2e" },
  green: { bg: "#e8eee9", fg: "#3f6b4f" },
  blue: { bg: "#e7edf4", fg: "#1b365d" },
  purple: { bg: "#ece8ef", fg: "#5a4a7a" },
  pink: { bg: "#f0e6ec", fg: "#7a3d5a" },
  red: { bg: "#efe8e8", fg: "#8a3d3d" },
};

// Solid swatch dot color for the category editor.
const SWATCH: Record<string, string> = {
  default: "#9aa7b8",
  gray: "#8f8d84",
  brown: "#a9814f",
  orange: "#c07f43",
  yellow: "#c0a94a",
  green: "#5f8a6d",
  blue: "#3a6099",
  purple: "#7d6aa0",
  pink: "#b06d8c",
  red: "#b05a5a",
};

export function pillStyle(color: string | undefined): { background: string; color: string } {
  const c = PILL[color || "default"] || PILL.default;
  return { background: c.bg, color: c.fg };
}

export function swatchColor(color: string | undefined): string {
  return SWATCH[color || "default"] || SWATCH.default;
}
