export function getTeamSaveLabel(
  state: "idle" | "saving" | "saved" | "error",
): string | null {
  if (state === "saving") return "Saving team...";
  if (state === "saved") return "Team saved";
  if (state === "error") return "Team save failed";
  return null;
}
