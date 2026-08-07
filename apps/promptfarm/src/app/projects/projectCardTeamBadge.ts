import type { PromptProjectSummary, TeamPresetSummary } from "@/lib/db-client";

export function resolveProjectTeamBadge(
  project: PromptProjectSummary,
  teams: TeamPresetSummary[],
): string | null {
  if (project.selectedTeamId) {
    return teams.find((team) => team.id === project.selectedTeamId)?.name ?? "Selected team";
  }

  if (project.hasLatestRun) {
    return "Synthetic team";
  }

  return project.status === "draft" ? null : "Auto team";
}
