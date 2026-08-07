import type { SyntheticOutputJson } from "./server/types"
import { assessProjectReadiness } from "./projectReadiness"

export type BuildPlanUiState = {
  specBlocked: boolean
  specNeedsClarification: boolean
  exportDisabled: boolean
  bannerText: string | null
  bannerItems: string[]
}

export function deriveBuildPlanUiState(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): BuildPlanUiState {
  const readiness = assessProjectReadiness(outputsBySyntheticId)
  const specBlocked = readiness.status === "blocked"
  const specNeedsClarification = readiness.status === "needs_clarification"

  return {
    specBlocked,
    specNeedsClarification,
    exportDisabled: specBlocked,
    bannerText: specBlocked
      ? "working context is blocked by missing inputs"
      : specNeedsClarification
        ? "working context needs user input before planning can continue cleanly"
        : null,
    bannerItems: specBlocked
      ? readiness.blockers
      : specNeedsClarification
        ? readiness.clarificationQuestions
        : [],
  }
}
