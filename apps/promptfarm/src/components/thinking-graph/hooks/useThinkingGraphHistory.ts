import { useCallback, useMemo } from "react"

import { useThinkingGraphVersionStore } from "../state/useThinkingGraphVersionStore"
import type { SimulationRun } from "../runtime/runtimeTypes"

type BuildRestoreStateInput = {
  run: SimulationRun
  baseSyntheticIds: string[]
}

export function useThinkingGraphHistory() {
  const rootPrompt = useThinkingGraphVersionStore((state) => state.rootPrompt)
  const planGeneratedRunIds = useThinkingGraphVersionStore(
    (state) => state.planGeneratedRunIds,
  )
  const simulationHistory = useThinkingGraphVersionStore(
    (state) => state.simulationHistory,
  )
  const activeRunId = useThinkingGraphVersionStore((state) => state.activeRunId)
  const setRootPrompt = useThinkingGraphVersionStore(
    (state) => state.setRootPrompt,
  )
  const setActiveRunId = useThinkingGraphVersionStore(
    (state) => state.setActiveRunId,
  )
  const resetHistoryState = useThinkingGraphVersionStore(
    (state) => state.resetVersionState,
  )
  const markPlanGenerated = useThinkingGraphVersionStore(
    (state) => state.markPlanGenerated,
  )
  const recordSimpleRun = useThinkingGraphVersionStore(
    (state) => state.recordSimpleRun,
  )
  const recordBranchingRun = useThinkingGraphVersionStore(
    (state) => state.recordBranchingRun,
  )
  const createIterationPromptFromRun = useThinkingGraphVersionStore(
    (state) => state.createIterationPromptFromRun,
  )

  const activeRunHasPlan = useMemo(
    () => activeRunId !== null && planGeneratedRunIds.has(activeRunId),
    [activeRunId, planGeneratedRunIds],
  )

  const createIterationPromptFromActiveRun = useCallback(
    () => createIterationPromptFromRun(activeRunId),
    [activeRunId, createIterationPromptFromRun],
  )

  const buildRestoreState = useCallback(
    ({ run, baseSyntheticIds }: BuildRestoreStateInput) => {
      const baseIds = new Set(baseSyntheticIds)
      const runSyntheticIds = new Set(run.synthetics.map((synthetic) => synthetic.id))
      const toRemove = [...baseIds].filter((id) => !runSyntheticIds.has(id))
      const toAdd = run.synthetics.filter((synthetic) => !baseIds.has(synthetic.id))

      return {
        toRemove,
        toAdd,
      }
    },
    [],
  )

  return {
    rootPrompt,
    planGeneratedRunIds,
    simulationHistory,
    activeRunId,
    activeRunHasPlan,
    setRootPrompt,
    setActiveRunId,
    resetHistoryState,
    markPlanGenerated,
    recordSimpleRun,
    recordBranchingRun,
    createIterationPromptFromRun,
    createIterationPromptFromActiveRun,
    buildRestoreState,
  }
}
