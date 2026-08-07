"use client"

import { create } from "zustand"

import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types"
import type { RunStats } from "@/lib/run-context"
import type {
  AdvisorReport,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
  SyntheticReport,
} from "@/lib/thinking-graph/server/types"

import type { SerializedSimulationRun } from "@/lib/thinking-graph/server/types"
import type { ChatUpdatedOpinion, RuntimeNodeStatus, SimulationRun } from "../runtime/runtimeTypes"

export type RecordSimpleRunInput = {
  runId?: string
  prompt: string
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
  summaryReport: RunSummaryReport
  appliedDecisions?: SyntheticPreparedDecision[]
  appliedStructuredClarifications?: SyntheticPreparedClarification[]
  stats?: RunStats
  runtimeSnapshot?: Record<string, RuntimeNodeStatus>
  chatUpdatedOpinions?: Record<string, ChatUpdatedOpinion>
}

export type RecordBranchingRunInput = RecordSimpleRunInput & {
  reason: string
}

function createNextSimpleVersion(history: SimulationRun[]): string {
  return `v${history.length + 1}`
}

function createBranchingDescriptor(input: {
  runId?: string
  history: SimulationRun[]
  activeRunId: string | null
  reason: string
}) {
  const { history, activeRunId, reason } = input
  const newRunId = input.runId ?? `run-${Date.now()}`

  const rawParentId = activeRunId ?? undefined
  const activeRun = rawParentId
    ? history.find((run) => run.id === rawParentId)
    : undefined
  const activeIsRoot = !activeRun?.versionLabel.includes(".")

  const rootRuns = history.filter((run) => !run.versionLabel.includes("."))
  const lastRootId = rootRuns[rootRuns.length - 1]?.id ?? null

  let isHead: boolean
  if (!rawParentId) {
    isHead = false
  } else if (activeIsRoot) {
    isHead = rawParentId === lastRootId
  } else {
    const parentIdOfActive = activeRun?.parentId
    const siblings = history.filter((run) => run.parentId === parentIdOfActive)
    const lastSiblingId = siblings[siblings.length - 1]?.id ?? null
    isHead = rawParentId === lastSiblingId
  }

  let parentId: string | undefined
  let versionLabel: string

  const topLevelCount = rootRuns.length

  if (history.length === 0 || rawParentId === undefined) {
    parentId = undefined
    versionLabel = history.length === 0 ? "v1" : `v${topLevelCount + 1}`
  } else if (isHead && activeIsRoot) {
    parentId = undefined
    versionLabel = `v${topLevelCount + 1}`
  } else if (!isHead && activeIsRoot) {
    parentId = rawParentId
    const childCount = history.filter((run) => run.parentId === rawParentId).length
    versionLabel = `${activeRun!.versionLabel}.${childCount + 1}`
  } else if (isHead && !activeIsRoot) {
    const grandparentId = activeRun!.parentId
    const segments = activeRun!.versionLabel.split(".")
    const grandparentLabel = segments.slice(0, -1).join(".")
    const siblingCount = history.filter(
      (run) => run.parentId === grandparentId,
    ).length
    parentId = grandparentId
    versionLabel = `${grandparentLabel}.${siblingCount + 1}`
  } else {
    parentId = rawParentId
    const childCount = history.filter((run) => run.parentId === rawParentId).length
    versionLabel = `${activeRun!.versionLabel}.${childCount + 1}`
  }

  return {
    id: newRunId,
    versionLabel,
    parentId,
    reason,
  }
}

function cloneSynthetics(synthetics: SyntheticNode[]): SyntheticNode[] {
  return synthetics.map((synthetic) => ({
    ...synthetic,
    layout: { ...synthetic.layout },
    config: { ...synthetic.config },
  }))
}

function cloneEdges(edges: SyntheticEdge[]): SyntheticEdge[] {
  return edges.map((edge) => ({
    ...edge,
    waypoints: edge.waypoints?.map((waypoint) => ({ ...waypoint })),
  }))
}

function cloneOutputs(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): Record<string, SyntheticOutputJson | null> {
  return Object.fromEntries(
    Object.entries(outputsBySyntheticId).map(([key, output]) => [
      key,
      output ? cloneOutput(output) : null,
    ]),
  )
}

function cloneOutput(output: SyntheticOutputJson): SyntheticOutputJson {
  if ("details" in output) {
    const report = output as SyntheticReport
    return {
      ...report,
      keyRisks: [...report.keyRisks],
      upstreamContext: [...report.upstreamContext],
      concernLevels: { ...report.concernLevels },
      model: report.model ? { ...report.model } : report.model,
      raw:
        report.raw && typeof report.raw === "object"
          ? { ...report.raw }
          : report.raw,
      operational: report.operational
        ? {
            ...report.operational,
            acceptedAssumptions: [...report.operational.acceptedAssumptions],
            findings: [...report.operational.findings],
            risks: [...report.operational.risks],
            missingInformation: [...report.operational.missingInformation],
            clarificationRequests: report.operational.clarificationRequests.map((item) => ({ ...item })),
            recommendedDecisions: report.operational.recommendedDecisions.map((item) => ({
              ...item,
              options: [...item.options],
              optionReasons: item.optionReasons ? { ...item.optionReasons } : item.optionReasons,
            })),
            nextSteps: [...report.operational.nextSteps],
            artifactsReady: [...report.operational.artifactsReady],
            readiness: {
              ...report.operational.readiness,
              blockers: [...report.operational.readiness.blockers],
            },
            userFacing: report.operational.userFacing
              ? {
                  ...report.operational.userFacing,
                  whatWeKnow: report.operational.userFacing.whatWeKnow.map((item) => ({ ...item })),
                  whatIsNeededNow: [...report.operational.userFacing.whatIsNeededNow],
                  decisionsNeeded: report.operational.userFacing.decisionsNeeded
                    ? [...report.operational.userFacing.decisionsNeeded]
                    : report.operational.userFacing.decisionsNeeded,
                  questionsNeeded: report.operational.userFacing.questionsNeeded
                    ? [...report.operational.userFacing.questionsNeeded]
                    : report.operational.userFacing.questionsNeeded,
                  options: report.operational.userFacing.options.map((item) => ({
                    ...item,
                    pros: [...item.pros],
                    cons: [...item.cons],
                  })),
                  questions: report.operational.userFacing.questions.map((item) => ({ ...item })),
                  actions: report.operational.userFacing.actions.map((item) => ({ ...item })),
                  pendingDecisions: report.operational.userFacing.pendingDecisions?.map((item) => ({
                    ...item,
                    options: [...item.options],
                    optionReasons: item.optionReasons ? { ...item.optionReasons } : item.optionReasons,
                  })),
                }
              : report.operational.userFacing,
            directedHandoffs: report.operational.directedHandoffs?.map((item) => ({
              ...item,
              facts: [...item.facts],
              constraints: [...item.constraints],
              openDecisions: [...item.openDecisions],
              blockedByUser: [...item.blockedByUser],
              nextFocus: [...item.nextFocus],
            })),
          }
        : report.operational,
      directedHandoffs: report.directedHandoffs?.map((item) => ({
        ...item,
        facts: [...item.facts],
        constraints: [...item.constraints],
        openDecisions: [...item.openDecisions],
        blockedByUser: [...item.blockedByUser],
        nextFocus: [...item.nextFocus],
      })),
      changesFromPrevious: [...report.changesFromPrevious],
      appliedInputs: [...report.appliedInputs],
      ignoredInputs: [...report.ignoredInputs],
    }
  }

  const advisor = output as AdvisorReport
  return {
    ...advisor,
    model: { ...advisor.model },
    strategicOptions: advisor.strategicOptions.map((item) => ({ ...item })),
    conflictResolution: advisor.conflictResolution.map((item) => ({ ...item })),
    raw:
      advisor.raw && typeof advisor.raw === "object"
        ? { ...advisor.raw }
        : advisor.raw,
    tokenUsage: advisor.tokenUsage ? { ...advisor.tokenUsage } : advisor.tokenUsage,
  }
}

function getOutputRecommendationText(
  output: SyntheticOutputJson | null | undefined,
): string | null {
  if (!output) return null
  if ("recommendation" in output) {
    return (
      output.recommendation?.trim() ||
      output.handoff?.trim() ||
      output.summary?.trim() ||
      null
    )
  }
  return output.topRecommendation?.trim() || null
}

function cloneSummaryReport(summaryReport: RunSummaryReport): RunSummaryReport {
  return {
    executiveBrief: summaryReport.executiveBrief.map((b) => ({ ...b, sourceIds: [...b.sourceIds] })),
    actionItems: [...summaryReport.actionItems],
    biggestConflict: summaryReport.biggestConflict
      ? { ...summaryReport.biggestConflict }
      : null,
    decisionFamilies: summaryReport.decisionFamilies.map((family) => ({
      ...family,
      contributorSyntheticIds: [...family.contributorSyntheticIds],
      contributorSyntheticNames: [...family.contributorSyntheticNames],
      options: family.options.map((row) => ({
        ...row,
        contributorSyntheticIds: [...row.contributorSyntheticIds],
        contributorSyntheticNames: [...row.contributorSyntheticNames],
      })),
    })),
    decisionMatrix: summaryReport.decisionMatrix.map((row) => ({ ...row })),
    conflictMap: summaryReport.conflictMap.map((conflict) => ({ ...conflict })),
    domainGates: summaryReport.domainGates.map((gate) => ({ ...gate })),
    overallVerdict: summaryReport.overallVerdict,
    overallCondition: summaryReport.overallCondition,
  }
}

function buildRecommendationDigest(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): string[] {
  return synthetics.flatMap((synthetic) => {
    const output = outputsBySyntheticId[synthetic.id]
    const recommendation = getOutputRecommendationText(output)

    if (!recommendation) {
      return []
    }

    return [`${synthetic.name}: ${recommendation}`]
  })
}

function composeIterationPrompt(input: {
  basePrompt: string
  recommendationDigest: string[]
}): string {
  const sections = [input.basePrompt.trim()]

  if (input.recommendationDigest.length > 0) {
    sections.push(
      [
        "Integrate the following synthetic recommendations into the next iteration:",
        ...input.recommendationDigest.map((line) => `- ${line}`),
      ].join("\n"),
    )
  }

  return sections.filter(Boolean).join("\n\n")
}

// ── Serialization helpers (exported for workspace use) ────────────────────────

export function serializeSimulationRun(run: SimulationRun): SerializedSimulationRun {
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    stats: run.stats
      ? { ...run.stats, completedAt: run.stats.completedAt.toISOString() }
      : undefined,
    runtimeSnapshot: run.runtimeSnapshot as Record<string, string> | undefined,
  }
}

export function deserializeSimulationRun(run: SerializedSimulationRun): SimulationRun {
  return {
    ...run,
    createdAt: new Date(run.createdAt),
    stats: run.stats
      ? { costUsd: null, model: null, ...run.stats, completedAt: new Date(run.stats.completedAt) }
      : undefined,
    runtimeSnapshot: run.runtimeSnapshot as Record<string, RuntimeNodeStatus> | undefined,
  }
}

// ── Store type ────────────────────────────────────────────────────────────────

type ThinkingGraphVersionState = {
  rootPrompt: string
  planGeneratedRunIds: Set<string>
  simulationHistory: SimulationRun[]
  activeRunId: string | null
  setRootPrompt: (prompt: string) => void
  resetVersionState: () => void
  restoreSimulationHistory: (runs: SimulationRun[]) => void
  setActiveRunId: (runId: string | null) => void
  markPlanGenerated: (runId: string) => void
  recordSimpleRun: (input: RecordSimpleRunInput) => SimulationRun | null
  recordBranchingRun: (input: RecordBranchingRunInput) => SimulationRun | null
  createIterationPromptFromRun: (runId: string | null) => string | null
}

export const useThinkingGraphVersionStore = create<ThinkingGraphVersionState>(
  (set, get) => ({
    rootPrompt: "",
    planGeneratedRunIds: new Set(),
    simulationHistory: [],
    activeRunId: null,
    setRootPrompt: (prompt) => {
      const normalizedPrompt = prompt.trim()
      if (!normalizedPrompt) {
        return
      }

      set((state) =>
        state.rootPrompt.trim().length > 0
          ? state
          : { rootPrompt: normalizedPrompt },
      )
    },
    resetVersionState: () =>
      set({
        rootPrompt: "",
        planGeneratedRunIds: new Set(),
        simulationHistory: [],
        activeRunId: null,
      }),
    restoreSimulationHistory: (runs) =>
      set({
        simulationHistory: runs,
        activeRunId: runs.at(-1)?.id ?? null,
        rootPrompt: runs[0]?.basePrompt ?? "",
        planGeneratedRunIds: new Set(),
      }),
    setActiveRunId: (runId) => set({ activeRunId: runId }),
    markPlanGenerated: (runId) =>
      set((state) => ({
        planGeneratedRunIds: new Set([...state.planGeneratedRunIds, runId]),
      })),
    recordSimpleRun: (input) => {
      let createdRun: SimulationRun | null = null

      set((state) => {
        const basePrompt = state.rootPrompt.trim() || input.prompt.trim()
        createdRun = {
          id: input.runId ?? `run-${Date.now()}`,
          versionLabel: createNextSimpleVersion(state.simulationHistory),
          basePrompt,
          iterationPrompt: input.prompt,
          prompt: input.prompt,
          reason:
            state.simulationHistory.length === 0
              ? "Initial simulation"
              : "Re-run with updated idea context",
          createdAt: new Date(),
          synthetics: cloneSynthetics(input.synthetics),
          edges: cloneEdges(input.edges),
          outputsBySyntheticId: cloneOutputs(input.outputsBySyntheticId),
          summaryReport: cloneSummaryReport(input.summaryReport),
          recommendationDigest: buildRecommendationDigest(
            input.synthetics,
            input.outputsBySyntheticId,
          ),
          appliedDecisions: (input.appliedDecisions ?? []).map((decision) => ({
            ...decision,
          })),
          appliedStructuredClarifications: (
            input.appliedStructuredClarifications ?? []
          ).map((clarification) => ({
            ...clarification,
            answers: clarification.answers.map((answer) => ({ ...answer })),
          })),
          stats: input.stats,
          runtimeSnapshot: input.runtimeSnapshot,
          chatUpdatedOpinions: input.chatUpdatedOpinions,
        }

        return {
          rootPrompt: basePrompt,
          simulationHistory: [...state.simulationHistory, createdRun],
          activeRunId: createdRun.id,
        }
      })

      return createdRun
    },
    recordBranchingRun: (input) => {
      let createdRun: SimulationRun | null = null

      set((state) => {
        const descriptor = createBranchingDescriptor({
          runId: input.runId,
          history: state.simulationHistory,
          activeRunId: state.activeRunId,
          reason: input.reason,
        })
        const basePrompt = state.rootPrompt.trim() || input.prompt.trim()

        createdRun = {
          ...descriptor,
          basePrompt,
          iterationPrompt: input.prompt,
          prompt: input.prompt,
          createdAt: new Date(),
          synthetics: cloneSynthetics(input.synthetics),
          edges: cloneEdges(input.edges),
          outputsBySyntheticId: cloneOutputs(input.outputsBySyntheticId),
          summaryReport: cloneSummaryReport(input.summaryReport),
          recommendationDigest: buildRecommendationDigest(
            input.synthetics,
            input.outputsBySyntheticId,
          ),
          appliedDecisions: (input.appliedDecisions ?? []).map((decision) => ({
            ...decision,
          })),
          appliedStructuredClarifications: (
            input.appliedStructuredClarifications ?? []
          ).map((clarification) => ({
            ...clarification,
            answers: clarification.answers.map((answer) => ({ ...answer })),
          })),
          stats: input.stats,
          runtimeSnapshot: input.runtimeSnapshot,
          chatUpdatedOpinions: input.chatUpdatedOpinions,
        }

        return {
          rootPrompt: basePrompt,
          simulationHistory: [...state.simulationHistory, createdRun],
          activeRunId: createdRun.id,
        }
      })

      return createdRun
    },
    createIterationPromptFromRun: (runId) => {
      if (!runId) {
        return null
      }

      const state = get()
      const run = state.simulationHistory.find((item) => item.id === runId)
      if (!run) {
        return null
      }

      const basePrompt = run.basePrompt.trim() || state.rootPrompt.trim()
      if (!basePrompt) {
        return null
      }

      const recommendationDigest =
        run.recommendationDigest.length > 0
          ? run.recommendationDigest
          : buildRecommendationDigest(run.synthetics, run.outputsBySyntheticId)

      return composeIterationPrompt({
        basePrompt,
        recommendationDigest,
      })
    },
  }),
)
