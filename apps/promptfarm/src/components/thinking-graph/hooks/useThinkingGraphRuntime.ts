import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import type { SyntheticEdge } from "@/lib/planning/types"
import type { RunStats } from "@/lib/run-context"
import {
  deleteThinkingGraphChatMessage,
  setThinkingGraphChatMessageIterationUsage,
  streamThinkingGraphChat,
  streamThinkingGraphIdeaChat,
  streamThinkingGraphSession,
} from "@/lib/thinking-graph/client"
import type {
  SyntheticConversationMessage,
  SyntheticGraphPayload,
  SyntheticOutputJson,
  ThinkingGraphChatProgressEvent,
  ThinkingGraphRunProgressEvent,
} from "@/lib/thinking-graph/server/types"
import type {
  ChatMessage,
  ChatUpdatedOpinion,
  RunStatus,
  SyntheticNodeProgress,
  RuntimeNodeStatus,
} from "../runtime/runtimeTypes"
import { useThinkingGraphUiStore } from "../state/useThinkingGraphUiStore"

type UseThinkingGraphRuntimeInput = {
  sessionPayload: SyntheticGraphPayload | null
  onSessionPayloadChange: (payload: SyntheticGraphPayload) => void
  onRevisionEdgesChange: (edges: SyntheticEdge[]) => void
  onCompletedAgentCountChange: (count: number) => void
  onRunStatsChange: (stats: RunStats | null) => void
}

export type RunExecutionResult = {
  runId: string | null
  payload: SyntheticGraphPayload
  runtimeSnapshot: Record<string, RuntimeNodeStatus>
  stats: RunStats
  agentsRun: number
}

export type ExecuteRunInput = {
  sessionId: string
  projectId?: string | null
  ideaPrompt: string
  syntheticNodeIds: string[]
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
  edges?: SyntheticEdge[]
}

type OutputTokenUsage = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

// Pricing per 1M tokens (USD) — update when model or tier changes
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-6":         { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-opus-4-7":           { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80,  outputPer1M: 4.00  },
}

function calculateCostUsd(
  model: string | null | undefined,
  usage: OutputTokenUsage,
): number | null {
  if (!model) return null
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"]
  const input = usage.promptTokens ?? 0
  const output = usage.completionTokens ?? 0
  return (input * pricing.inputPer1M + output * pricing.outputPer1M) / 1_000_000
}

function extractOutputTokenUsage(output: SyntheticOutputJson | null | undefined): OutputTokenUsage {
  const raw = output?.raw
  if (!raw || typeof raw !== "object") {
    return { promptTokens: null, completionTokens: null, totalTokens: null }
  }

  const usage = (raw as { tokenUsage?: unknown }).tokenUsage
  if (!usage || typeof usage !== "object") {
    return { promptTokens: null, completionTokens: null, totalTokens: null }
  }

  const candidate = usage as {
    promptTokens?: unknown
    completionTokens?: unknown
    totalTokens?: unknown
  }
  const promptTokens =
    typeof candidate.promptTokens === "number" ? candidate.promptTokens : null
  const completionTokens =
    typeof candidate.completionTokens === "number"
      ? candidate.completionTokens
      : null
  const totalTokens =
    typeof candidate.totalTokens === "number"
      ? candidate.totalTokens
      : promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null

  return { promptTokens, completionTokens, totalTokens }
}

function accumulateTokenUsage(outputsBySyntheticId: Record<string, SyntheticOutputJson | null>) {
  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0
  let hasPromptTokens = false
  let hasCompletionTokens = false
  let hasTotalTokens = false

  for (const output of Object.values(outputsBySyntheticId)) {
    const usage = extractOutputTokenUsage(output)
    if (usage.promptTokens !== null) {
      promptTokens += usage.promptTokens
      hasPromptTokens = true
    }
    if (usage.completionTokens !== null) {
      completionTokens += usage.completionTokens
      hasCompletionTokens = true
    }
    if (usage.totalTokens !== null) {
      totalTokens += usage.totalTokens
      hasTotalTokens = true
    }
  }

  return {
    promptTokens: hasPromptTokens ? promptTokens : null,
    completionTokens: hasCompletionTokens ? completionTokens : null,
    totalTokens: hasTotalTokens ? totalTokens : null,
  }
}

function createSequentialPendingSnapshot(
  syntheticNodeIds: string[],
): Record<string, RuntimeNodeStatus> {
  return Object.fromEntries(
    syntheticNodeIds.map((nodeId) => [nodeId, "idle"]),
  ) as Record<string, RuntimeNodeStatus>
}

function createNodeProgress(input: {
  phase: SyntheticNodeProgress["phase"]
  label: string
  progressPercent: number
  attempt?: number
  streamedChars?: number
  completedAgents?: number
  totalAgents?: number
}): SyntheticNodeProgress {
  return {
    phase: input.phase,
    label: input.label,
    progressPercent: input.progressPercent,
    attempt: input.attempt ?? 1,
    streamedChars: input.streamedChars ?? 0,
    completedAgents: input.completedAgents ?? 0,
    totalAgents: input.totalAgents ?? 0,
    updatedAt: Date.now(),
  }
}

function createInitialProgressSnapshot(
  syntheticNodeIds: string[],
): Record<string, SyntheticNodeProgress> {
  return Object.fromEntries(
    syntheticNodeIds.map((nodeId) => [
      nodeId,
      createNodeProgress({
        phase: "queued",
        label: "Queued",
        progressPercent: 4,
      }),
    ]),
  )
}

function applyProgressEventToNodeProgress(input: {
  current: Record<string, SyntheticNodeProgress>
  event: ThinkingGraphRunProgressEvent
}): Record<string, SyntheticNodeProgress> {
  const { current, event } = input

  if (event.type === "run_started") {
    return Object.fromEntries(
      Object.entries(current).map(([syntheticId, progress]) => [
        syntheticId,
        createNodeProgress({
          phase: progress.phase,
          label: progress.label,
          progressPercent: progress.progressPercent,
          attempt: progress.attempt,
          streamedChars: progress.streamedChars,
          completedAgents: event.completedAgents,
          totalAgents: event.totalAgents,
        }),
      ]),
    )
  }

  if (event.type === "agent_started") {
    return {
      ...current,
      [event.syntheticId]: createNodeProgress({
        phase: "preparing",
        label: "Preparing role context",
        progressPercent: 18,
        streamedChars: current[event.syntheticId]?.streamedChars ?? 0,
        completedAgents: event.completedAgents,
        totalAgents: event.totalAgents,
      }),
    }
  }

  if (event.type === "agent_chunk") {
    const previous = current[event.syntheticId]
    const streamedChars =
      (previous?.streamedChars ?? 0) + event.textDelta.length
    const progressPercent = Math.min(78, 30 + Math.floor(streamedChars / 18))

    return {
      ...current,
      [event.syntheticId]: createNodeProgress({
        phase: "generating",
        label: "Generating live draft",
        progressPercent,
        streamedChars,
        completedAgents: previous?.completedAgents ?? 0,
        totalAgents: previous?.totalAgents ?? 0,
      }),
    }
  }

  if (event.type === "agent_completed") {
    return {
      ...current,
      [event.syntheticId]: createNodeProgress({
        phase: "finalizing",
        label: "Finalizing structured report",
        progressPercent: 88,
        streamedChars: current[event.syntheticId]?.streamedChars ?? 0,
        completedAgents: event.completedAgents,
        totalAgents: event.totalAgents,
      }),
    }
  }

  if (event.type === "run_completed") {
    return Object.fromEntries(
      Object.entries(current).map(([syntheticId, progress]) => [
        syntheticId,
        createNodeProgress({
          phase: "done",
          label: "Structured report ready",
          progressPercent: 100,
          streamedChars: progress.streamedChars,
          completedAgents: event.completedAgents,
          totalAgents: event.totalAgents,
        }),
      ]),
    )
  }

  if (event.type === "run_failed") {
    return Object.fromEntries(
      Object.entries(current).map(([syntheticId, progress]) => [
        syntheticId,
        createNodeProgress({
          phase: "error",
          label: "Run failed",
          progressPercent: progress.progressPercent,
          streamedChars: progress.streamedChars,
          completedAgents: event.completedAgents ?? progress.completedAgents,
          totalAgents: event.totalAgents ?? progress.totalAgents,
        }),
      ]),
    )
  }

  if (event.type === "aggregator_started") {
    return {
      ...current,
      __aggregator__: createNodeProgress({
        phase: "preparing",
        label: "Synthesizing cross-agent insights",
        progressPercent: 10,
      }),
    }
  }

  if (event.type === "aggregator_chunk") {
    const previous = current.__aggregator__
    const streamedChars = (previous?.streamedChars ?? 0) + event.textDelta.length
    return {
      ...current,
      __aggregator__: createNodeProgress({
        phase: "generating",
        label: "Generating cross-agent report",
        progressPercent: Math.min(85, 15 + Math.floor(streamedChars / 18)),
        streamedChars,
      }),
    }
  }

  if (event.type === "aggregator_completed") {
    return {
      ...current,
      __aggregator__: createNodeProgress({
        phase: "done",
        label: "Cross-agent report ready",
        progressPercent: 100,
      }),
    }
  }

  return current
}

function applyProgressEventToRuntimeSnapshot(
  current: Record<string, RuntimeNodeStatus>,
  event: ThinkingGraphRunProgressEvent,
): Record<string, RuntimeNodeStatus> {
  if (event.type === "agent_started") {
    return {
      ...current,
      [event.syntheticId]: "running",
    }
  }

  if (event.type === "agent_completed") {
    return {
      ...current,
      [event.syntheticId]: "done",
    }
  }

  return current
}

function applyRunChunkToUpdatedOpinion(input: {
  current: Record<string, ChatUpdatedOpinion>
  syntheticId: string
  textDelta: string
}): Record<string, ChatUpdatedOpinion> {
  const previous = input.current[input.syntheticId]
  const nextRecommendation = `${previous?.recommendation ?? ""}${input.textDelta}`.trim()

  return {
    ...input.current,
    [input.syntheticId]: {
      summary: previous?.summary ?? "Model response streaming...",
      recommendation:
        nextRecommendation || "Model response streaming...",
      risks: previous?.risks ?? [
        { color: "#60a5fa", text: "Live model output in progress" },
        { color: "#fbbf24", text: "Structured JSON will appear after completion" },
        { color: "#34d399", text: "Current synthetic is still running" },
      ],
      updatedAt: Date.now(),
    },
  }
}

function toChatMessages(
  messages: SyntheticConversationMessage[],
): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "agent",
    text: message.text,
    includeInNextIteration: message.includeInNextIteration,
  }))
}

function applyChatProgressEventToMessages(
  current: ChatMessage[],
  optimisticAgentMessageId: string,
  event: ThinkingGraphChatProgressEvent,
): ChatMessage[] {
  if (event.type !== "assistant_chunk") {
    return current
  }

  return current.map((message) =>
    message.id === optimisticAgentMessageId
      ? {
          ...message,
          text: `${message.text}${event.textDelta}`,
          pending: true,
        }
      : message,
  )
}

function toChatUpdatedOpinion(
  output: SyntheticOutputJson | null | undefined,
): ChatUpdatedOpinion | null {
  if (!output) {
    return null
  }

  const report = "recommendation" in output ? output : null
  const summary =
    "summary" in output &&
    typeof output.summary === "string" &&
    output.summary.trim().length > 0
      ? output.summary
      : "topRecommendation" in output &&
          typeof output.topRecommendation === "string" &&
          output.topRecommendation.trim().length > 0
        ? output.topRecommendation
      : "Analysis updated after chat."
  const recommendation =
    typeof report?.recommendation === "string" &&
    report.recommendation.trim().length > 0
      ? report.recommendation
      : typeof report?.handoff === "string" && report.handoff.trim().length > 0
        ? report.handoff
        : "Re-run the graph to propagate the updated context."
  const risks = Array.isArray(report?.keyRisks)
    ? report.keyRisks
        .filter((risk): risk is string => typeof risk === "string")
        .slice(0, 3)
        .map((risk, index) => ({
          color:
            index === 0 ? "#f87171" : index === 1 ? "#fb923c" : "#60a5fa",
          text: risk,
        }))
    : []

  return {
    summary,
    recommendation,
    risks:
      risks.length > 0
        ? risks
        : [
            { color: "#34d399", text: "Server-side synthetic response recorded" },
            { color: "#fbbf24", text: "Downstream nodes may need a re-run" },
            { color: "#60a5fa", text: "Latest JSON output is shown above the chat" },
          ],
    updatedAt: Date.now(),
  }
}

export function useThinkingGraphRuntime({
  sessionPayload,
  onSessionPayloadChange,
  onRevisionEdgesChange,
  onCompletedAgentCountChange,
  onRunStatsChange,
}: UseThinkingGraphRuntimeInput) {
  const [runStatus, setRunStatus] = useState<RunStatus>("idle")
  const [runtimeByNodeId, setRuntimeByNodeId] = useState<
    Record<string, RuntimeNodeStatus>
  >({})
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null)
  const [chatsByNodeId, setChatsByNodeId] = useState<Record<string, ChatMessage[]>>(
    {},
  )
  const [chatDraftByNodeId, setChatDraftByNodeId] = useState<
    Record<string, string>
  >({})
  const [chatUpdatedNodeIds, setChatUpdatedNodeIds] = useState<Set<string>>(
    new Set(),
  )
  const [chatUpdatedOpinions, setChatUpdatedOpinions] = useState<
    Record<string, ChatUpdatedOpinion>
  >({})
  const [syntheticProgressByNodeId, setSyntheticProgressByNodeId] = useState<
    Record<string, SyntheticNodeProgress>
  >({})
  const [currentRunTotalAgents, setCurrentRunTotalAgents] = useState(0)
  // IDs of synthetics that actually ran (not skipped) in the most recent run.
  // Used to compute "stale upstream context" badges on nodes whose peers were skipped.
  const [lastRunSyntheticIds, setLastRunSyntheticIds] = useState<Set<string>>(new Set())
  const dirtyNodesSessionIdRef = useRef<string | null>(null)

  const [viewingRunOutputs, setViewingRunOutputs] = useState<Record<string, SyntheticOutputJson | null> | null>(null)

  const outputsBySyntheticId = useMemo(
    () => viewingRunOutputs ?? sessionPayload?.outputsBySyntheticId ?? {},
    [viewingRunOutputs, sessionPayload],
  )

  useEffect(() => {
    if (!sessionPayload) {
      return
    }

    setChatsByNodeId(
      Object.fromEntries(
        Object.entries(sessionPayload.conversationsBySyntheticId).map(
          ([nodeId, messages]) => [nodeId, toChatMessages(messages)],
        ),
      ),
    )
  }, [sessionPayload])

  useEffect(() => {
    if (!sessionPayload) {
      dirtyNodesSessionIdRef.current = null
      setChatUpdatedNodeIds(new Set())
      return
    }

    const nextDirtyNodes = new Set(
      Object.entries(sessionPayload.conversationsBySyntheticId)
        .filter(([, messages]) =>
          messages.some((message) => message.includeInNextIteration),
        )
        .map(([syntheticId]) => syntheticId),
    )

    const isNewSession = dirtyNodesSessionIdRef.current !== sessionPayload.sessionId
    dirtyNodesSessionIdRef.current = sessionPayload.sessionId
    if (isNewSession) {
      setChatUpdatedNodeIds(nextDirtyNodes)
      return
    }

    // Do not overwrite non-chat dirty markers (e.g. applied decisions from report).
    setChatUpdatedNodeIds((prev) => {
      const merged = new Set(prev)
      nextDirtyNodes.forEach((syntheticId) => merged.add(syntheticId))
      return merged
    })
  }, [sessionPayload])

  const resetRuntimeState = useCallback(() => {
    setRunStatus("idle")
    setRuntimeByNodeId({})
    setRunErrorMessage(null)
    setChatsByNodeId({})
    setChatDraftByNodeId({})
    setChatUpdatedNodeIds(new Set())
    setChatUpdatedOpinions({})
    setSyntheticProgressByNodeId({})
    setCurrentRunTotalAgents(0)
    setLastRunSyntheticIds(new Set())
    onCompletedAgentCountChange(0)
    onRunStatsChange(null)
    useThinkingGraphUiStore.getState().clearReportTabChatUpdatedSyntheticIds()
  }, [onCompletedAgentCountChange, onRunStatsChange])

  const executeRun = useCallback(
    async (input: {
      sessionId: string
      projectId?: string | null
      ideaPrompt: string
      syntheticNodeIds: string[]
      rerunMode?: "full" | "single_node" | "from_node_downstream"
      targetSyntheticId?: string
      dirtySyntheticIds?: string[]
      edges?: SyntheticEdge[]
    }) => {
      const startedAt = Date.now()
      const { syntheticNodeIds } = input
      const affectedNodeIdSet = new Set(
        input.rerunMode === "full"
          ? syntheticNodeIds
          : (input.dirtySyntheticIds ?? []).length > 0
            ? input.dirtySyntheticIds
            : syntheticNodeIds,
      )

      setViewingRunOutputs(null)
      setRunStatus("running")
      setRunErrorMessage(null)
      useThinkingGraphUiStore.getState().clearStreamingText()
      useThinkingGraphUiStore.getState().clearReportTabChatUpdatedSyntheticIds()
      setRuntimeByNodeId((prev) => {
        const next = { ...prev }
        const pendingSnapshot = createSequentialPendingSnapshot(
          syntheticNodeIds.filter((nodeId) => affectedNodeIdSet.has(nodeId)),
        )

        syntheticNodeIds.forEach((nodeId) => {
          next[nodeId] = affectedNodeIdSet.has(nodeId)
            ? (pendingSnapshot[nodeId] ?? "idle")
            : (prev[nodeId] ?? "done")
        })

        return next
      })
      setSyntheticProgressByNodeId((prev) => {
        const next = { ...prev }
        const initialProgress = createInitialProgressSnapshot(
          syntheticNodeIds.filter((nodeId) => affectedNodeIdSet.has(nodeId)),
        )

        syntheticNodeIds.forEach((nodeId) => {
          if (affectedNodeIdSet.has(nodeId)) {
            next[nodeId] = initialProgress[nodeId]
          } else if (prev[nodeId]) {
            next[nodeId] = prev[nodeId]
          }
        })

        return next
      })
      setChatUpdatedNodeIds(new Set())
      setChatUpdatedOpinions({})
      setCurrentRunTotalAgents(affectedNodeIdSet.size)
      onCompletedAgentCountChange(0)
      onRunStatsChange(null)

      try {
        let completedRunId: string | null = null
        const nextPayload = await streamThinkingGraphSession(input, (event) => {
          setSyntheticProgressByNodeId((prev) =>
            applyProgressEventToNodeProgress({
              current: prev,
              event,
            }),
          )

          if (event.type === "run_started") {
            setCurrentRunTotalAgents(event.totalAgents)
            onCompletedAgentCountChange(event.completedAgents)
            return
          }

          if (event.type === "agent_started") {
            setRuntimeByNodeId((prev) =>
              applyProgressEventToRuntimeSnapshot(prev, event),
            )
            onCompletedAgentCountChange(event.completedAgents)
            return
          }

          if (event.type === "agent_chunk") {
            setChatUpdatedOpinions((prev) =>
              applyRunChunkToUpdatedOpinion({
                current: prev,
                syntheticId: event.syntheticId,
                textDelta: event.textDelta,
              }),
            )
            useThinkingGraphUiStore.getState().appendStreamingText(event.syntheticId, event.textDelta)
            return
          }

          if (event.type === "agent_completed") {
            setRuntimeByNodeId((prev) =>
              applyProgressEventToRuntimeSnapshot(prev, event),
            )
            setChatUpdatedOpinions((prev) => {
              const next = { ...prev }
              const updatedOpinion = toChatUpdatedOpinion(event.output)
              if (updatedOpinion) {
                next[event.syntheticId] = updatedOpinion
              } else {
                delete next[event.syntheticId]
              }
              return next
            })
            onCompletedAgentCountChange(event.completedAgents)
            return
          }

          if (event.type === "run_completed") {
            completedRunId = event.runId
            setCurrentRunTotalAgents(event.totalAgents)
            onCompletedAgentCountChange(event.completedAgents)
            setRuntimeByNodeId((prev) => {
              const next = { ...prev }
              for (const syntheticId of input.syntheticNodeIds) {
                if (affectedNodeIdSet.has(syntheticId)) {
                  next[syntheticId] = "done"
                }
              }
              return next
            })
          }
        })
        onSessionPayloadChange(nextPayload)

        const runtimeSnapshot = Object.fromEntries(
          nextPayload.synthetics.map((synthetic) => [
            synthetic.id,
            nextPayload.outputsBySyntheticId[synthetic.id]
              ? "done"
              : "blocked",
          ]),
        ) as Record<string, RuntimeNodeStatus>
        setRuntimeByNodeId(runtimeSnapshot)

        const totalAgentsInRun = affectedNodeIdSet.size
        const agentsRun = nextPayload.synthetics.filter(
          (synthetic) =>
            affectedNodeIdSet.has(synthetic.id) &&
            nextPayload.outputsBySyntheticId[synthetic.id],
        ).length
        const tokenUsage = accumulateTokenUsage(
          Object.fromEntries(
            Object.entries(nextPayload.outputsBySyntheticId).filter(([syntheticId]) =>
              affectedNodeIdSet.has(syntheticId),
            ),
          ),
        )
        const model = nextPayload.provider?.model ?? null
        const stats: RunStats = {
          durationMs: Date.now() - startedAt,
          agentsRun,
          totalAgents: totalAgentsInRun,
          tokenUsage,
          costUsd: calculateCostUsd(model, tokenUsage),
          model,
          completedAt: new Date(),
        }

        onCompletedAgentCountChange(agentsRun)
        setCurrentRunTotalAgents(totalAgentsInRun)
        onRunStatsChange(stats)
        setSyntheticProgressByNodeId((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([nodeId, progress]) => [
              nodeId,
              createNodeProgress({
                phase: nextPayload.outputsBySyntheticId[nodeId] ? "done" : "error",
                label: nextPayload.outputsBySyntheticId[nodeId]
                  ? "Structured report ready"
                  : "No structured report returned",
                progressPercent: nextPayload.outputsBySyntheticId[nodeId] ? 100 : 0,
                streamedChars: progress.streamedChars,
                completedAgents: agentsRun,
                totalAgents: totalAgentsInRun,
              }),
            ]),
          ),
        )
        setRunStatus("done")
        setRunErrorMessage(null)
        setLastRunSyntheticIds(new Set(affectedNodeIdSet))

        return {
          runId: completedRunId,
          payload: nextPayload,
          runtimeSnapshot,
          stats,
          agentsRun,
        } satisfies RunExecutionResult
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Thinking graph run failed."

        setRunStatus("error")
        setCurrentRunTotalAgents(0)
        setRunErrorMessage(message)
        setSyntheticProgressByNodeId((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([nodeId, progress]) => [
              nodeId,
              createNodeProgress({
                phase: "error",
                label: "Run failed",
                progressPercent: progress.progressPercent,
                streamedChars: progress.streamedChars,
                completedAgents: progress.completedAgents,
                totalAgents: progress.totalAgents,
              }),
            ]),
          ),
        )
        setRuntimeByNodeId((prev) =>
          Object.fromEntries(
            syntheticNodeIds.map((nodeId) => [
              nodeId,
              prev[nodeId] === "done"
                ? "done"
                : ("blocked" as RuntimeNodeStatus),
            ]),
          ),
        )
        toast.error(message)
        return null
      }
    },
    [
      onCompletedAgentCountChange,
      onRevisionEdgesChange,
      onRunStatsChange,
      onSessionPayloadChange,
    ],
  )

  const sendChatMessage = useCallback(
    async (input: {
      sessionId: string
      ideaPrompt?: string
      syntheticId: string
      userMessage: string
    }) => {
      const optimisticMessageSeed = Date.now()
      const optimisticUserMessageId = `local-user-${optimisticMessageSeed}`
      const optimisticAgentMessageId = `local-agent-${optimisticMessageSeed}`

      setChatsByNodeId((prev) => ({
        ...prev,
        [input.syntheticId]: [
          ...(prev[input.syntheticId] ?? []),
          {
            id: optimisticUserMessageId,
            role: "user",
            text: input.userMessage,
            includeInNextIteration: false,
          },
          {
            id: optimisticAgentMessageId,
            role: "agent",
            text: "",
            pending: true,
            includeInNextIteration: false,
          },
        ],
      }))
      setChatDraftByNodeId((prev) => ({
        ...prev,
        [input.syntheticId]: "",
      }))

      try {
        const nextPayload = await streamThinkingGraphChat(input, (event) => {
          if (event.type === "assistant_chunk") {
            setChatsByNodeId((prev) => ({
              ...prev,
              [input.syntheticId]: applyChatProgressEventToMessages(
                prev[input.syntheticId] ?? [],
                optimisticAgentMessageId,
                event,
              ),
            }))
          }
        })
        onSessionPayloadChange(nextPayload)

        return nextPayload
      } catch (error) {
        setChatsByNodeId((prev) => ({
          ...prev,
          [input.syntheticId]: (prev[input.syntheticId] ?? []).filter(
            (message) =>
              message.id !== optimisticUserMessageId &&
              message.id !== optimisticAgentMessageId,
          ),
        }))
        const message =
          error instanceof Error ? error.message : "Thinking graph chat failed."

        toast.error(message)
        return null
      }
    },
    [onSessionPayloadChange],
  )

  const IDEA_ID = "__idea__"

  const sendIdeaChatMessage = useCallback(
    async (input: { sessionId: string; ideaPrompt?: string; userMessage: string }) => {
      const optimisticSeed = Date.now()
      const optimisticUserId = `local-user-${optimisticSeed}`
      const optimisticAgentId = `local-agent-${optimisticSeed}`

      setChatsByNodeId((prev) => ({
        ...prev,
        [IDEA_ID]: [
          ...(prev[IDEA_ID] ?? []),
          { id: optimisticUserId, role: "user", text: input.userMessage, includeInNextIteration: false },
          { id: optimisticAgentId, role: "agent", text: "", pending: true, includeInNextIteration: false },
        ],
      }))
      setChatDraftByNodeId((prev) => ({ ...prev, [IDEA_ID]: "" }))

      try {
        const nextPayload = await streamThinkingGraphIdeaChat(
          { sessionId: input.sessionId, ideaPrompt: input.ideaPrompt, userMessage: input.userMessage },
          (event) => {
            if (event.type === "assistant_chunk") {
              setChatsByNodeId((prev) => ({
                ...prev,
                [IDEA_ID]: applyChatProgressEventToMessages(
                  prev[IDEA_ID] ?? [],
                  optimisticAgentId,
                  event,
                ),
              }))
            }
          },
        )
        onSessionPayloadChange(nextPayload)
        return nextPayload
      } catch (error) {
        setChatsByNodeId((prev) => ({
          ...prev,
          [IDEA_ID]: (prev[IDEA_ID] ?? []).filter(
            (m) => m.id !== optimisticUserId && m.id !== optimisticAgentId,
          ),
        }))
        const message = error instanceof Error ? error.message : "Idea chat failed."
        toast.error(message)
        return null
      }
    },
    [onSessionPayloadChange],
  )

  const toggleChatMessageIterationUsage = useCallback(
    async (input: {
      sessionId: string
      syntheticId: string
      messageId: string
      includeInNextIteration: boolean
    }) => {
      let previousMessages: ChatMessage[] = []
      let nextMessages: ChatMessage[] = []

      setChatsByNodeId((prev) => {
        previousMessages = prev[input.syntheticId] ?? []
        nextMessages = previousMessages.map((message) =>
          message.id === input.messageId
            ? {
                ...message,
                includeInNextIteration: input.includeInNextIteration,
              }
            : message,
        )

        return {
          ...prev,
          [input.syntheticId]: nextMessages,
        }
      })

      setChatUpdatedNodeIds((prev) => {
        const next = new Set(prev)
        if (nextMessages.some((message) => message.includeInNextIteration)) {
          next.add(input.syntheticId)
        } else {
          next.delete(input.syntheticId)
        }
        return next
      })

      try {
        const nextPayload = await setThinkingGraphChatMessageIterationUsage(input)
        onSessionPayloadChange(nextPayload)
        return nextPayload
      } catch (error) {
        setChatsByNodeId((prev) => ({
          ...prev,
          [input.syntheticId]: previousMessages,
        }))
        setChatUpdatedNodeIds((prev) => {
          const next = new Set(prev)
          if (previousMessages.some((message) => message.includeInNextIteration)) {
            next.add(input.syntheticId)
          } else {
            next.delete(input.syntheticId)
          }
          return next
        })

        const message =
          error instanceof Error
            ? error.message
            : "Failed to update chat iteration usage."

        toast.error(message)
        return null
      }
    },
    [onSessionPayloadChange],
  )

  const removeChatMessage = useCallback(
    async (input: {
      sessionId: string
      syntheticId: string
      messageId: string
    }) => {
      try {
        const nextPayload = await deleteThinkingGraphChatMessage(input)
        onSessionPayloadChange(nextPayload)
        return nextPayload
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to delete chat message."

        toast.error(message)
        return null
      }
    },
    [onSessionPayloadChange],
  )

  return {
    runStatus,
    setRunStatus,
    runtimeByNodeId,
    setRuntimeByNodeId,
    runErrorMessage,
    setRunErrorMessage,
    chatsByNodeId,
    setChatsByNodeId,
    chatDraftByNodeId,
    setChatDraftByNodeId,
    chatUpdatedNodeIds,
    setChatUpdatedNodeIds,
    chatUpdatedOpinions,
    setChatUpdatedOpinions,
    syntheticProgressByNodeId,
    setSyntheticProgressByNodeId,
    currentRunTotalAgents,
    outputsBySyntheticId,
    setViewingRunOutputs,
    resetRuntimeState,
    lastRunSyntheticIds,
    executeRun,
    sendChatMessage,
    sendIdeaChatMessage,
    toggleChatMessageIterationUsage,
    removeChatMessage,
  }
}
