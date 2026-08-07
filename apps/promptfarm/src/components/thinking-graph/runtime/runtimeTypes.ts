import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types"
import type { RunStats } from "@/lib/run-context"
import type {
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
} from "@/lib/thinking-graph/server/types"

export type RunStatus = "idle" | "running" | "done" | "error"

export type RuntimeNodeStatus =
  | "idle"
  | "running"
  | "done"
  | "conflict"
  | "blocked"
  | "needs_rerun"
  | "needs_rerun_conflict"

export type SyntheticDisplayStatus = RuntimeNodeStatus | "ready"

export type ChatMessage = {
  id: string
  role: "user" | "agent"
  text: string
  pending?: boolean
  includeInNextIteration: boolean
}

export type ChatUpdatedOpinion = {
  summary: string
  recommendation: string
  risks: { color: string; text: string }[]
  updatedAt: number
}

export type SyntheticRunPhase =
  | "queued"
  | "preparing"
  | "generating"
  | "finalizing"
  | "done"
  | "error"

export type SyntheticNodeProgress = {
  phase: SyntheticRunPhase
  label: string
  progressPercent: number
  attempt: number
  streamedChars: number
  completedAgents: number
  totalAgents: number
  updatedAt: number
}

export type SimulationRun = {
  id: string
  versionLabel: string
  parentId?: string
  basePrompt: string
  iterationPrompt: string
  prompt: string
  reason: string
  createdAt: Date
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
  summaryReport: RunSummaryReport
  recommendationDigest: string[]
  appliedDecisions: SyntheticPreparedDecision[]
  appliedStructuredClarifications: SyntheticPreparedClarification[]
  stats?: RunStats
  runtimeSnapshot?: Record<string, RuntimeNodeStatus>
  chatUpdatedOpinions?: Record<string, ChatUpdatedOpinion>
}

export type HistoryView =
  | {
      run: SimulationRun
      mode: "report" | "plan"
    }
  | null

export type LogEntry = {
  id: number
  elapsed: number
  nodeId: string | null
  label: string
  status: "info" | "running" | "done" | "error"
}
