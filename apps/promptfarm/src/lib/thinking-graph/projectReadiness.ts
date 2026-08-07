import type { SyntheticOutputJson, SyntheticReport } from "./server/types"

export type ProjectReadinessStatus =
  | "ready"
  | "needs_clarification"
  | "blocked"
  | "partial"
  | "unknown"

export type ProjectReadinessAssessment = {
  status: ProjectReadinessStatus
  blockers: string[]
  clarificationQuestions: string[]
  artifactsReady: string[]
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function assessProjectReadiness(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null | undefined>,
): ProjectReadinessAssessment {
  const outputs = Object.values(outputsBySyntheticId).filter(
    (output): output is SyntheticOutputJson => Boolean(output),
  )

  const operationalOutputs = outputs.filter(
    (output): output is SyntheticReport & { operational: NonNullable<SyntheticReport["operational"]> } =>
      "details" in output && Boolean(output.operational),
  )

  if (operationalOutputs.length === 0) {
    return {
      status: "unknown",
      blockers: [],
      clarificationQuestions: [],
      artifactsReady: [],
    }
  }

  const blockers = uniqueNonEmpty(
    operationalOutputs.flatMap((output) => output.operational.readiness.blockers),
  )
  const clarificationQuestions = uniqueNonEmpty(
    operationalOutputs.flatMap((output) =>
      output.operational.clarificationRequests.map((item) => item.question),
    ),
  )
  const artifactsReady = uniqueNonEmpty(
    operationalOutputs.flatMap((output) => output.operational.artifactsReady),
  )

  if (operationalOutputs.some((output) => output.operational.readiness.blocked)) {
    return {
      status: "blocked",
      blockers,
      clarificationQuestions,
      artifactsReady,
    }
  }

  if (
    operationalOutputs.some(
      (output) => output.operational.readiness.status === "needs_clarification",
    ) ||
    clarificationQuestions.length > 0
  ) {
    return {
      status: "needs_clarification",
      blockers,
      clarificationQuestions,
      artifactsReady,
    }
  }

  if (
    operationalOutputs.some(
      (output) => output.operational.readiness.status === "partial_progress",
    )
  ) {
    return {
      status: "partial",
      blockers,
      clarificationQuestions,
      artifactsReady,
    }
  }

  if (
    operationalOutputs.every(
      (output) =>
        output.operational.readiness.canContinue &&
        output.operational.readiness.status === "ready_for_next_node",
    )
  ) {
    return {
      status: "ready",
      blockers,
      clarificationQuestions,
      artifactsReady,
    }
  }

  return {
    status: "partial",
    blockers,
    clarificationQuestions,
    artifactsReady,
  }
}
