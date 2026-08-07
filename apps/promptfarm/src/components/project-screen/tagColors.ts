export const TAG_COLORS: Record<string, string> = {
  Business: "#a78bfa", SaaS: "#a78bfa", Startup: "#a78bfa", "B2B": "#a78bfa", "B2C": "#a78bfa",
  GameDev: "#34d399", "Open Source": "#34d399",
  Health: "#60a5fa", Mobile: "#38bdf8",
  Education: "#fb923c", "E-commerce": "#fb923c",
  "AI / ML": "#f472b6",
  Fintech: "#4ade80",
  Social: "#f59e0b", Marketplace: "#f59e0b",
};

export function tagColor(tag: string) { return TAG_COLORS[tag] ?? "#a78bfa"; }

export function hexRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const PRESET_TAGS = [
  "Business", "SaaS", "GameDev", "Health", "Education",
  "Mobile", "AI / ML", "Fintech", "E-commerce", "Social",
  "Marketplace", "B2B", "B2C", "Open Source",
];
