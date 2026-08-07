const AVATAR_COLORS = [
  "#a78bfa", "#34d399", "#fb923c", "#60a5fa", "#f472b6",
  "#facc15", "#4ade80", "#38bdf8", "#c084fc", "#f87171",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

function avatarLetters(title: string): string {
  return title.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}


export { avatarColor, avatarLetters };