import type {
  SyntheticEdge,
  SyntheticNode,
  TranscriptEntry,
} from "../../planning/types"

export type SyntheticPersona = {
  id: string
  title: string
  weight: number
  description: string
  domain: string
  sourcePath: string
}

export type SyntheticBackendDescriptor = {
  kind: string
  label: string
  model?: string
  baseUrl?: string
}

export type SyntheticComplexity = "low" | "medium" | "high"

export type TokenUsage = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

/**
 * Extracts a `TokenUsage` from whatever shape the LLM provider puts in `raw`.
 * Returns `null` when no token data is present.
 */
export function normalizeTokenUsage(
  raw: unknown,
): TokenUsage | null {
  if (!raw || typeof raw !== "object") return null
  const u = (raw as Record<string, unknown>).tokenUsage
  if (!u || typeof u !== "object") return null
  const tu = u as Record<string, unknown>
  const promptTokens = typeof tu.promptTokens === "number" ? tu.promptTokens : null
  const completionTokens = typeof tu.completionTokens === "number" ? tu.completionTokens : null
  const totalTokens =
    typeof tu.totalTokens === "number"
      ? tu.totalTokens
      : promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null
  if (promptTokens === null && completionTokens === null && totalTokens === null) return null
  return { promptTokens, completionTokens, totalTokens }
}


/**
 * Concern-level scores for a synthetic agent output.
 *
 * `feasibility` and `risk` are numeric (0–100) — higher feasibility is better,
 * higher risk is worse.
 *
 * `complexityLabel` is categorical ("low" | "medium" | "high") and intentionally
 * NOT numeric — implementation complexity is an ordinal concept, not a linear scale.
 * Use `isSyntheticComplexity` to validate incoming values.
 */
export type SyntheticConcernLevels = {
  feasibility: number
  risk: number
  complexityLabel: SyntheticComplexity
}

export type SyntheticClarificationRequest = {
  id: string
  question: string
  whyItMatters: string
  required: boolean
  /**
   * Ordering hint for the orchestration layer and UI.
   * 1 = highest priority (ask immediately), 2 = normal, 3 = low / deferred.
   * Defaults to 2 when omitted. Required clarifications with priority 1 are
   * surfaced first in `buildUserInputRequiredUserFacing`.
   */
  priority?: 1 | 2 | 3
}

export type SyntheticRecommendedDecision = {
  id: string
  title: string
  options: string[]
  recommendedOption: string | null
  reason: string
  /**
   * Per-option trade-off notes, keyed by option label.
   * When present, each entry provides a reason specific to that option.
   * Non-recommended options fall back to an empty summary when this map
   * has no entry for them — the global `reason` is NOT applied to
   * non-recommended options to avoid misleading copy.
   */
  optionReasons?: Record<string, string>
  /**
   * How urgently this decision needs to be resolved.
   * - `"blocking"` — gates further progress; must be resolved before the next run
   * - `"important"` — should be resolved soon but does not block
   * - `"optional"` — can be deferred without impact
   * Defaults to `"important"` when omitted.
   */
  urgency?: "blocking" | "important" | "optional"
}

export type SyntheticReadinessStatus =
  | "ready_for_next_node"
  | "needs_clarification"
  | "waiting_for_upstream"
  | "blocked"
  | "partial_progress"

export type SyntheticReadiness = {
  canContinue: boolean
  blocked: boolean
  blockers: string[]
  status: SyntheticReadinessStatus
}

export type SyntheticUserFacingState =
  | "ready"
  | "decision_required"
  | "user_input_required"
  | "conflict"

export type SyntheticUserFacingFact = {
  label: string
  value: string
}

export type SyntheticUserFacingOption = {
  id: string
  label: string
  summary: string
  pros: string[]
  cons: string[]
  recommended: boolean
}

export type SyntheticUserFacingQuestion = {
  id: string
  label: string
  question: string
  whyItMatters: string
  suggestedAnswer: string | null
  required: boolean
}

export type SyntheticUserFacingAction =
  | {
      type: "continue"
      label: string
    }
  | {
      type: "accept_defaults"
      label: string
    }
  | {
      type: "choose_option"
      label: string
      optionId: string
    }
  | {
      type: "answer_questions"
      label: string
    }
  | {
      type: "resolve_conflict"
      label: string
      optionId: string
    }

/**
 * A secondary decision that could not be surfaced as the primary `options`
 * block because another decision or clarification took priority.
 * Queued in `SyntheticUserFacingBlock.pendingDecisions` for sequential resolution.
 */
export type SyntheticPendingDecision = {
  id: string
  title: string
  options: string[]
  recommendedOption: string | null
  reason: string
  optionReasons?: Record<string, string>
  urgency?: "blocking" | "important" | "optional"
  /** Edge that triggered this decision (e.g. a tension edge between two agents). */
  relatedEdgeId?: string | null
  /** The other synthetic node on that edge — counterpart in a conflict or oversight. */
  relatedNodeId?: string | null
  /** Display name of the counterpart node, for UI rendering without a lookup. */
  relatedNodeName?: string | null
}

export type SyntheticUserFacingBlock = {
  state: SyntheticUserFacingState
  title: string
  summary: string
  whatWeKnow: SyntheticUserFacingFact[]
  /** Combined flat list kept for backward compatibility. Prefer decisionsNeeded + questionsNeeded for display. */
  whatIsNeededNow: string[]
  /** Decision titles — things the user must choose between. Subset of whatIsNeededNow. */
  decisionsNeeded?: string[]
  /** Clarification questions — things that must be known before proceeding. Subset of whatIsNeededNow. */
  questionsNeeded?: string[]
  whoActsNext: "system" | "user"
  nextStep: string | null
  options: SyntheticUserFacingOption[]
  questions: SyntheticUserFacingQuestion[]
  actions: SyntheticUserFacingAction[]
  /**
   * Secondary decisions that exist beyond the primary one surfaced in `options`.
   * Consumers should resolve these after the primary decision is closed.
   * Each entry carries the full decision payload so the UI can render them
   * as queued steps without re-querying the agent.
   */
  pendingDecisions?: SyntheticPendingDecision[]
  /** Edge that triggered this decision — set by structureAssembler from graph context. */
  relatedEdgeId?: string | null
  /** The other synthetic node on that edge — counterpart in a conflict or oversight. */
  relatedNodeId?: string | null
  /** Display name of the counterpart node, for UI rendering without a lookup. */
  relatedNodeName?: string | null
}

export type SyntheticPreparedInputSource = "defaults" | "manual_edit"

// ---------------------------------------------------------------------------
// Spec & Plan generation types
// ---------------------------------------------------------------------------

export type ClosedDecision = {
  decisionId: string
  title: string
  chosenOption: string
  chosenBy: "user" | "ai_default"
}

export type SpecSection = {
  agentId: string
  agentName: string
  /** Decisions that have been closed — either by user selection or AI default fill */
  decisions: ClosedDecision[]
  /** Clarification questions that still have no answer */
  openQuestions: string[]
  /** Field labels filled by AI because user did not provide them */
  filledByAI: string[]
  /** Prose summary for this section */
  content: string
  /** True when all clarificationRequests are answered and decisions are closed */
  readyForPlan: boolean
}

export type ProjectSpec = {
  ideaPrompt: string
  sections: SpecSection[]
  generatedAt: string
  /** True when every section has no openQuestions */
  allClosed: boolean
}

export type SyntheticPreparedDecision = {
  syntheticId: string
  decisionTitle: string
  optionId: string
  optionLabel: string
  optionDescription: string
  appliedAt: string
  source?: SyntheticPreparedInputSource
  /** Edge that triggered this decision — preserved so staged/applied panels can show which relation it resolved. */
  relatedEdgeId?: string | null
  /** Display name of the counterpart node — stored so panels can show it without a separate lookup. */
  relatedNodeName?: string | null
}

export type SyntheticPreparedClarification = {
  syntheticId: string
  syntheticName: string
  answers: {
    questionId: string
    questionLabel: string
    answer: string
  }[]
  appliedAt: string
  source?: SyntheticPreparedInputSource
}

export type RecommendedSolution = {
  id: string
  syntheticId: string
  syntheticName: string
  riskDescription: string
  solution: string
  proposedAt: string
  evaluatedInRunId?: string
  priorRisk?: number
  postRisk?: number
}

export type ProposedImprovement = {
  id: string
  syntheticId: string
  syntheticName: string
  riskDescription: string
  proposal: string
  priorRisk: number
  expectedTargetRisk: number
  addedAt: string
}

export type SyntheticPreparedInputs = {
  decisions: SyntheticPreparedDecision[]
  clarifications: SyntheticPreparedClarification[]
}

export type SyntheticDirectedHandoff = {
  toSyntheticId: string
  facts: string[]
  constraints: string[]
  openDecisions: string[]
  blockedByUser: string[]
  nextFocus: string[]
}

/**
 * The authoritative, agent-computed output for one synthetic node.
 *
 * **Source-of-truth contract:**
 * `SyntheticOperationalReport` is the single source of truth for all data
 * produced by the agent. When `operational` is present on a
 * `SyntheticReport`, always prefer `operational.X` over the root-level
 * mirror fields listed below.
 *
 * Root-level mirrors kept for backward compatibility:
 * - `SyntheticReport.syntheticId`   → mirrors `operational.syntheticId`
 * - `SyntheticReport.syntheticName` → mirrors `operational.syntheticName`
 * - `SyntheticReport.summary`       → mirrors `operational.summary`
 * - `SyntheticReport.handoff`       → mirrors `operational.handoff`
 * - `SyntheticReport.directedHandoffs` → mirrors `operational.directedHandoffs`
 *
 * Long-term: root-level `handoff` and `directedHandoffs` will be deprecated
 * once all consumers read exclusively from `operational`.
 */
export type SyntheticOperationalReport = {
  syntheticId: string
  syntheticName: string
  domain: string
  summary: string
  acceptedAssumptions: string[]
  findings: string[]
  risks: string[]
  missingInformation: string[]
  clarificationRequests: SyntheticClarificationRequest[]
  recommendedDecisions: SyntheticRecommendedDecision[]
  nextSteps: string[]
  readiness: SyntheticReadiness
  artifactsReady: string[]
  handoff: string | null
  directedHandoffs?: SyntheticDirectedHandoff[]
  userFacing?: SyntheticUserFacingBlock | null
}

/**
 * Serialized output for one synthetic agent node, as stored and transmitted
 * throughout the system.
 *
 * ## Envelope vs. Operational contract
 *
 * This type has two layers:
 *
 * **Envelope fields** (root level) — used for routing, display, and
 * backward-compatible consumption. They are cheap to read without
 * deserialising the full operational report.
 *
 * **`operational`** — the single source of truth for all agent-computed
 * content. When `operational` is non-null, always prefer `operational.X`
 * over the corresponding root-level mirror. The root fields below are kept
 * only for backward compatibility with callers that predate the operational
 * layer:
 *
 * | Root field         | Canonical source              | Notes                          |
 * |--------------------|-------------------------------|--------------------------------|
 * | `syntheticId`      | `operational.syntheticId`     | Always equal; root is safe     |
 * | `syntheticName`    | `operational.syntheticName`   | Always equal; root is safe     |
 * | `summary`          | `operational.summary`         | Always equal; root is safe     |
 * | `handoff`          | `operational.handoff`         | **Deprecated at root** — read from `operational` |
 * | `directedHandoffs` | `operational.directedHandoffs`| **Deprecated at root** — read from `operational` |
 *
 * `details`, `recommendation`, `keyRisks`, `concernLevels`, `appliedInputs`,
 * `ignoredInputs`, `changesFromPrevious`, `upstreamContext` exist only at the
 * root level and have no operational mirror.
 */
export type SyntheticReport = {
  /** @see SyntheticOperationalReport.syntheticId */
  syntheticId: string
  /** @see SyntheticOperationalReport.syntheticName */
  syntheticName: string
  /** @see SyntheticOperationalReport.summary */
  summary: string
  details: string
  recommendation: string
  changesFromPrevious: string[]
  appliedInputs: string[]
  ignoredInputs: string[]
  keyRisks: string[]
  concernLevels: SyntheticConcernLevels
  /**
   * @deprecated Read from `operational.handoff` when `operational` is present.
   * Kept at root for backward compatibility.
   */
  handoff: string | null
  upstreamContext: string[]
  /**
   * @deprecated Read from `operational.directedHandoffs` when `operational` is present.
   * Kept at root for backward compatibility.
   */
  directedHandoffs?: SyntheticDirectedHandoff[]
  /**
   * Agent-computed content. When present, this is the authoritative source
   * for all fields that overlap with root-level mirrors.
   * @see SyntheticOperationalReport
   */
  operational?: SyntheticOperationalReport | null
  /**
   * Typed quality signal extracted from raw.quality at serialization time.
   * Present on all outputs produced after the shadow-validator was introduced.
   * Use this instead of casting `raw` to read validation metadata.
   */
  outputQuality?: {
    validationAttempts: number
    validationStatus: "pass" | "fail"
    usedLegacyCompatibilityFallback: boolean
  }
  model: {
    provider: string
    model: string
  }
  tokenUsage?: TokenUsage | null
  raw: unknown | null
}

// ---------------------------------------------------------------------------
// Advisor / Strategist output — produced by the last-in-pipeline Advisor node
// ---------------------------------------------------------------------------

export type AdvisorStrategicOption = {
  /** Short label for this path (e.g. "Launch MVP in 8 weeks") */
  label: string
  /** Why this option makes sense given the current agent findings */
  rationale: string
  /** What you give up or risk by choosing this option */
  tradeoff: string
  /**
   * Intent category emitted by the Advisor LLM.
   * Used by the UI to set owner/recommendedMode without the keyword heuristic.
   * Values: "decide" | "research" | "build" | "validate" | "defer"
   */
  category?: string | null
}

export type AdvisorConflictResolution = {
  /** The conflictId this resolution addresses (matches RunSummaryConflictEdge context) */
  conflictId: string
  /** The concrete path forward that resolves or defuses the conflict */
  suggestedPath: string
  /** The reasoning behind choosing this path over alternatives */
  whyThisPath: string
}

/**
 * Output produced by an Advisor/Strategist node.
 * Discriminated from SyntheticReport by `kind: "advisor"`.
 */
export type AdvisorReport = {
  kind: "advisor"
  syntheticId: string
  syntheticName: string
  /** The single most important action the user should take right now */
  topRecommendation: string
  /** 2–3 strategic paths the user can choose between */
  strategicOptions: AdvisorStrategicOption[]
  /** Resolution guidance for each active conflict between agents */
  conflictResolution: AdvisorConflictResolution[]
  model: {
    provider: string
    model: string
  }
  tokenUsage?: TokenUsage | null
  raw: unknown | null
}

export type SyntheticOutputJson = SyntheticReport | AdvisorReport

export type RunSummaryConflict = {
  title: string
  description: string
  raisedBy: string | null
  suggestion: string
}

export type RunSummaryMatrixRow = {
  familyId: string
  familyTitle: string
  optionId: string
  optionLabel: string
  contributorSyntheticIds: string[]
  contributorSyntheticNames: string[]
  recommended: boolean
  profileNote: string
  feasibility: number
  risk: number
  timePressure: number
  userValue: number
  costPressure: number
}

export type RunSummaryDecisionFamily = {
  familyId: string
  familyTitle: string
  recommendedOptionId: string | null
  recommendedOptionLabel: string | null
  contributorSyntheticIds: string[]
  contributorSyntheticNames: string[]
  options: RunSummaryMatrixRow[]
  /**
   * Highest urgency seen across all contributing agents for this family.
   * "blocking" > "important" > "optional". Defaults to "important" when no
   * agent specified urgency.
   */
  urgency: "blocking" | "important" | "optional"
}

export type RunSummaryConflictEdge = {
  fromSyntheticId: string
  toSyntheticId: string
  title: string
  description: string
  suggestion: string
  severity: "medium" | "high"
}

// ---------------------------------------------------------------------------
// Attributed executive brief
// ---------------------------------------------------------------------------

/**
 * A single sentence in the executive brief with agent source attribution.
 * `sourceIds` contains the syntheticId values of agents whose findings
 * drove this sentence. Empty when attribution is unavailable (fallback path).
 */
export type BriefSentence = {
  sentence: string
  sourceIds: string[]
}

// ---------------------------------------------------------------------------
// Go / No-Go verdict types
// ---------------------------------------------------------------------------

/** Per-domain gate signal produced deterministically from agent concern levels. */
export type DomainVerdict = "go" | "conditional" | "no_go"

/**
 * Verdict for a single synthetic agent domain.
 * - "go"          — agent can continue, nothing blocking
 * - "conditional" — agent can continue but has stated conditions that should be resolved
 * - "no_go"       — agent is explicitly blocked; condition describes what is missing
 */
export type DomainGateResult = {
  syntheticId: string
  syntheticName: string
  syntheticCode: string
  verdict: DomainVerdict
  /** null for "go"; a one-sentence description of the blocker or condition for all others */
  condition: string | null
  /** Risk value used for verdict: taken directly from concernLevels.risk */
  effectiveRisk: number
  /** Context completeness metrics (imported from reportSummary.ts) */
  contextCompleteness?: {
    totalItems: number
    requiredItems: number
    answeredItems: number
    completenessPercent: number
    requiredCompleteness: number
    missingRequired: Array<{ question: string; priority: number }>
  }
}

export type RunSummaryReport = {
  /** Executive brief sentences with per-sentence agent attribution. */
  executiveBrief: BriefSentence[]
  actionItems: string[]
  biggestConflict: RunSummaryConflict | null
  decisionFamilies: RunSummaryDecisionFamily[]
  decisionMatrix: RunSummaryMatrixRow[]
  conflictMap: RunSummaryConflictEdge[]
  /** Per-domain Go/No-Go gate signals, derived deterministically from concern levels. */
  domainGates: DomainGateResult[]
  /** Rolled-up verdict across all domains. "no_go" if any domain is blocked. */
  overallVerdict: DomainVerdict
  /** Condition for the overall verdict, or null when all domains are "go". */
  overallCondition: string | null
}

export type SyntheticConversationRole = "system" | "user" | "synthetic"

export type SyntheticConversationMessage = {
  id: string
  syntheticId: string
  role: SyntheticConversationRole
  text: string
  createdAt: string
  includeInNextIteration: boolean
}

export type SyntheticMemoryState = {
  conversation: SyntheticConversationMessage[]
  upstreamContext: string[]
  latestOutput?: SyntheticOutputJson
}

// ---------------------------------------------------------------------------
// Intake questions types
// ---------------------------------------------------------------------------

export type SyntheticIntakeQuestion = {
  id: string
  question: string
  whyItMatters: string
  required: boolean
  suggestedAnswer: string | null
  /** "intake" = generated before first run; "agent" = raised by a synthetic during a run */
  source: "intake" | "agent"
  /** null for intake questions; syntheticId of the agent that raised it */
  syntheticId: string | null
}

export type SyntheticIntakeAnswer = {
  questionId: string
  answer: string
  answeredAt: string
}

// ---------------------------------------------------------------------------
// Persistent items — accumulate across runs until explicitly closed
// ---------------------------------------------------------------------------

/** How a persistent item was resolved */
export type PersistentItemClosedHow =
  | "user-answered"
  | "resolved-decision"
  | "agent-confirmed"
  | "user-dismissed"

/**
 * An open issue that survives across simulation runs until the user or an
 * agent explicitly closes it. Three subtypes:
 * - `clarification` — a question that needs a user answer before the agent
 *   can make a confident assessment
 * - `risk-fact` — a factual risk (e.g. "no ToS for UGC") that an agent must
 *   acknowledge or explain away on each subsequent run
 * - `missing-info` — a data gap that blocks a confident recommendation
 */
export type PersistentItem = {
  id: string
  type: "clarification" | "risk-fact" | "missing-info"
  text: string
  /** syntheticId of the agent that raised it, or "system" for intake */
  raisedBy: string
  /** Display name of the agent (or "Intake") */
  raisedByName: string
  raisedInRunId: string
  /** Undefined while still open */
  closedInRunId?: string
  closedHow?: PersistentItemClosedHow
}

export type SyntheticSession = {
  id: string
  createdAt: string
  updatedAt: string
  ideaPrompt: string
  selectedPersonaIds: string[]
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  transcript: TranscriptEntry[]
  memoryBySyntheticId: Record<string, SyntheticMemoryState>
  preparedInputs: SyntheticPreparedInputs
  /** Decisions permanently resolved by the user — never cleared between runs */
  resolvedDecisions: SyntheticPreparedDecision[]
  /** Questions generated before the first run or raised by agents during runs */
  intakeQuestions: SyntheticIntakeQuestion[]
  /** User's answers to intake questions (by questionId) */
  intakeAnswers: SyntheticIntakeAnswer[]
  /** Risk mitigations proposed by the user for specific synthetic agents */
  recommendedSolutions: RecommendedSolution[]
  /** User-proposed improvements to the idea — accumulated across runs to improve risk scores */
  proposedImprovements: ProposedImprovement[]
  provider: SyntheticBackendDescriptor
  orchestrator: SyntheticBackendDescriptor
  /** Director phase output — stored after analysis, used to restore on reload */
  directorOutput?: DirectorOutput | null
  /** Cross-agent synthesis report produced by the aggregation step after a run */
  runSummary?: RunSummaryReport | null
  /** Open issues that accumulate across runs until explicitly closed */
  persistentItems?: PersistentItem[]
}

export type SyntheticGraphPayload = {
  sessionId: string
  ideaPrompt: string
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  transcript: TranscriptEntry[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
  conversationsBySyntheticId: Record<string, SyntheticConversationMessage[]>
  preparedInputs: SyntheticPreparedInputs
  provider: SyntheticBackendDescriptor
  orchestrator: SyntheticBackendDescriptor
  projectSpec: ProjectSpec | null
  /** All intake questions for this session (intake + agent-raised) */
  intakeQuestions: SyntheticIntakeQuestion[]
  /** User answers to intake questions */
  intakeAnswers: SyntheticIntakeAnswer[]
  /** Questions that have no answer yet — gate for the next run */
  pendingIntakeQuestions: SyntheticIntakeQuestion[]
  /** Risk mitigations proposed by the user for specific synthetic agents */
  recommendedSolutions: RecommendedSolution[]
  /** User-proposed improvements to the idea — accumulated across runs to improve risk scores */
  proposedImprovements: ProposedImprovement[]
  /** Director analysis output — available after the analysis phase completes */
  directorOutput?: DirectorOutput | null
  /** Tracks whether the user acted on the director's suggestions so reload restores the right phase */
  directorStatus?: "pending" | "confirmed" | "skipped"
  /** Cross-agent synthesis report produced by the aggregation step after a run */
  runSummary: RunSummaryReport | null
  /** Ordered list of simulation runs — persisted so history survives page reload */
  runHistory?: SerializedSimulationRun[]
  /** Open issues that accumulate across runs until explicitly closed */
  persistentItems?: PersistentItem[]
}

/**
 * JSON-safe snapshot of a SimulationRun. Identical to SimulationRun except
 * `createdAt` is an ISO string (Date is not JSON-serializable) and
 * `runtimeSnapshot` values are plain strings rather than the typed union.
 */
export type SerializedSimulationRun = {
  id: string
  versionLabel: string
  parentId?: string
  basePrompt: string
  iterationPrompt: string
  prompt: string
  reason: string
  createdAt: string
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
  summaryReport: RunSummaryReport
  recommendationDigest: string[]
  appliedDecisions: SyntheticPreparedDecision[]
  appliedStructuredClarifications: SyntheticPreparedClarification[]
  stats?: {
    durationMs: number
    agentsRun: number
    totalAgents: number
    tokenUsage: {
      promptTokens: number | null
      completionTokens: number | null
      totalTokens: number | null
    }
    completedAt: string
  }
  runtimeSnapshot?: Record<string, string>
  chatUpdatedOpinions?: Record<string, {
    summary: string
    recommendation: string
    risks: { color: string; text: string }[]
    updatedAt: number
  }>
}

export type SimulationRequest = {
  sessionId?: string
  ideaPrompt: string
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
  edges?: import("../../planning/types").SyntheticEdge[]
}

export type SimulationResult = SyntheticGraphPayload & {
  runId: string
  completedAt: string
}

export type ThinkingGraphRunProgressEvent =
  | {
      type: "run_started"
      sessionId: string
      totalAgents: number
      completedAgents: number
    }
  | {
      type: "agent_started"
      sessionId: string
      syntheticId: string
      totalAgents: number
      completedAgents: number
    }
  | {
      type: "agent_chunk"
      sessionId: string
      syntheticId: string
      textDelta: string
    }
  | {
      type: "agent_completed"
      sessionId: string
      syntheticId: string
      totalAgents: number
      completedAgents: number
      output: SyntheticOutputJson
    }
  | {
      type: "run_completed"
      sessionId: string
      runId: string
      completedAt: string
      totalAgents: number
      completedAgents: number
      payload: SyntheticGraphPayload
    }
  | {
      type: "run_failed"
      sessionId?: string
      totalAgents?: number
      completedAgents?: number
      error: string
    }
  | {
      type: "aggregator_started"
      sessionId: string
    }
  | {
      type: "aggregator_chunk"
      sessionId: string
      textDelta: string
    }
  | {
      type: "aggregator_completed"
      sessionId: string
      runSummary: RunSummaryReport
    }
  | {
      // Keep-alive ping only — schema-constrained LLM calls can go 20-40s+
      // with zero bytes written to the SSE stream, which risks the
      // connection being treated as idle and dropped before "run_completed"
      // arrives. Carries no state; clients should ignore it.
      type: "heartbeat"
      sessionId: string
    }

export type ThinkingGraphChatProgressEvent =
  | {
      type: "assistant_chunk"
      sessionId: string
      syntheticId: string
      textDelta: string
    }
  | {
      type: "chat_completed"
      sessionId: string
      syntheticId: string
      payload: SyntheticGraphPayload
    }
  | {
      type: "chat_failed"
      sessionId?: string
      syntheticId?: string
      error: string
    }

/**
 * What the LLM generates in the new two-layer architecture.
 * Structural fields (userFacing, readiness, directedHandoffs, handoff,
 * details, recommendation) are NOT generated by the LLM — they are
 * assembled deterministically by structureAssembler.ts.
 */
export type SyntheticLlmContent = {
  syntheticId: string
  syntheticName: string
  summary: string
  domain: string
  acceptedAssumptions: string[]
  findings: string[]
  risks: string[]
  missingInformation: string[]
  clarificationRequests: SyntheticClarificationRequest[]
  recommendedDecisions: SyntheticRecommendedDecision[]
  nextSteps: string[]
  appliedInputs: string[]
  ignoredInputs: string[]
  changesFromPrevious: string[]
  keyRisks: string[]
  concernLevels: SyntheticConcernLevels
  artifactsReady: string[]
  /**
   * Facts the LLM wants to pass to downstream recipients.
   * The assembler routes them into directedHandoffs per the graph edges.
   */
  handoffFacts: string[]
}

/** Context the assembler needs to build structural fields. */
export type AssemblerContext = {
  syntheticId: string
  syntheticName: string
  ideaPrompt: string
  /** Downstream recipients derived from graph edges (non-conflict). */
  downstreamRecipients: Array<{ id: string; name: string }>
  /** Inherited upstream context strings already computed by orchestrator. */
  upstreamContext: string[]
  provider: string
  model: string
  /** Edges involving this synthetic that carry decision-relevant context (tension, oversight). */
  relatedEdges?: Array<{ edgeId: string; counterpartId: string; counterpartName: string }>
}

// ---------------------------------------------------------------------------
// Director types
// ---------------------------------------------------------------------------

export type PersonaSuggestion = {
  personaId: string
  name: string
  domain: string
  reason: string
  confidence: number
}

export type DirectorOutput = {
  identifiedDomain: string
  domainSummary: string
  personaSuggestions: PersonaSuggestion[]
  /**
   * Full roster of every available persona across all domains.
   * The panel uses this so users can add roles beyond what the Director suggested
   * before confirming the first run.
   */
  personaRoster: PersonaSuggestion[]
  groundedQuestions: SyntheticIntakeQuestion[]
  raw: unknown
}

export const DEFAULT_GAMEDEV_PERSONA_IDS = [
  "game_designer",
  "ux_designer",
  "game_programmer",
] as const

export type DefaultGameDevPersonaId =
  (typeof DEFAULT_GAMEDEV_PERSONA_IDS)[number]

export function isSyntheticComplexity(value: unknown): value is SyntheticComplexity {
  return value === "low" || value === "medium" || value === "high"
}

export function isSyntheticReadinessStatus(
  value: unknown,
): value is SyntheticReadinessStatus {
  return (
    value === "ready_for_next_node" ||
    value === "needs_clarification" ||
    value === "waiting_for_upstream" ||
    value === "blocked" ||
    value === "partial_progress"
  )
}

export function isSyntheticUserFacingState(
  value: unknown,
): value is SyntheticUserFacingState {
  return (
    value === "ready" ||
    value === "decision_required" ||
    value === "user_input_required" ||
    value === "conflict"
  )
}

function isSyntheticUserFacingAction(
  value: unknown,
): value is SyntheticUserFacingAction {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticUserFacingAction>
  if (typeof candidate.label !== "string") {
    return false
  }

  if (candidate.type === "continue" || candidate.type === "accept_defaults") {
    return true
  }

  if (candidate.type === "answer_questions") {
    return true
  }

  if (
    (candidate.type === "choose_option" ||
      candidate.type === "resolve_conflict") &&
    typeof (candidate as { optionId?: unknown }).optionId === "string"
  ) {
    return true
  }

  return false
}

function isSyntheticPreparedDecision(
  value: unknown,
): value is SyntheticPreparedDecision {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticPreparedDecision>
  return (
    typeof candidate.syntheticId === "string" &&
    typeof candidate.decisionTitle === "string" &&
    typeof candidate.optionId === "string" &&
    typeof candidate.optionLabel === "string" &&
    typeof candidate.optionDescription === "string" &&
    typeof candidate.appliedAt === "string" &&
    (candidate.source === undefined ||
      candidate.source === "defaults" ||
      candidate.source === "manual_edit")
  )
}

function isSyntheticPreparedClarification(
  value: unknown,
): value is SyntheticPreparedClarification {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticPreparedClarification>
  return (
    typeof candidate.syntheticId === "string" &&
    typeof candidate.syntheticName === "string" &&
    Array.isArray(candidate.answers) &&
    candidate.answers.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { questionId?: unknown }).questionId === "string" &&
        typeof (item as { questionLabel?: unknown }).questionLabel === "string" &&
        typeof (item as { answer?: unknown }).answer === "string",
    ) &&
    typeof candidate.appliedAt === "string" &&
    (candidate.source === undefined ||
      candidate.source === "defaults" ||
      candidate.source === "manual_edit")
  )
}

export function isSyntheticPreparedInputs(
  value: unknown,
): value is SyntheticPreparedInputs {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticPreparedInputs>
  return (
    Array.isArray(candidate.decisions) &&
    candidate.decisions.every((item) => isSyntheticPreparedDecision(item)) &&
    Array.isArray(candidate.clarifications) &&
    candidate.clarifications.every((item) =>
      isSyntheticPreparedClarification(item),
    )
  )
}

function isSyntheticDirectedHandoff(
  value: unknown,
): value is SyntheticDirectedHandoff {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticDirectedHandoff>
  return (
    typeof candidate.toSyntheticId === "string" &&
    Array.isArray(candidate.facts) &&
    candidate.facts.every((item) => typeof item === "string") &&
    Array.isArray(candidate.constraints) &&
    candidate.constraints.every((item) => typeof item === "string") &&
    Array.isArray(candidate.openDecisions) &&
    candidate.openDecisions.every((item) => typeof item === "string") &&
    Array.isArray(candidate.blockedByUser) &&
    candidate.blockedByUser.every((item) => typeof item === "string") &&
    Array.isArray(candidate.nextFocus) &&
    candidate.nextFocus.every((item) => typeof item === "string")
  )
}

export function isSyntheticUserFacingBlock(
  value: unknown,
): value is SyntheticUserFacingBlock {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticUserFacingBlock>
  return (
    isSyntheticUserFacingState(candidate.state) &&
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.whatWeKnow) &&
    candidate.whatWeKnow.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { label?: unknown }).label === "string" &&
        typeof (item as { value?: unknown }).value === "string",
    ) &&
    Array.isArray(candidate.whatIsNeededNow) &&
    candidate.whatIsNeededNow.every((item) => typeof item === "string") &&
    (candidate.whoActsNext === "system" || candidate.whoActsNext === "user") &&
    (candidate.nextStep === null || typeof candidate.nextStep === "string") &&
    Array.isArray(candidate.options) &&
    candidate.options.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { label?: unknown }).label === "string" &&
        typeof (item as { summary?: unknown }).summary === "string" &&
        Array.isArray((item as { pros?: unknown }).pros) &&
        ((item as { pros?: unknown[] }).pros ?? []).every(
          (entry) => typeof entry === "string",
        ) &&
        Array.isArray((item as { cons?: unknown }).cons) &&
        ((item as { cons?: unknown[] }).cons ?? []).every(
          (entry) => typeof entry === "string",
        ) &&
        typeof (item as { recommended?: unknown }).recommended === "boolean",
    ) &&
    Array.isArray(candidate.questions) &&
    candidate.questions.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { label?: unknown }).label === "string" &&
        typeof (item as { question?: unknown }).question === "string" &&
        typeof (item as { whyItMatters?: unknown }).whyItMatters === "string" &&
        (((item as { suggestedAnswer?: unknown }).suggestedAnswer === null) ||
          typeof (item as { suggestedAnswer?: unknown }).suggestedAnswer ===
            "string") &&
        typeof (item as { required?: unknown }).required === "boolean",
    ) &&
    Array.isArray(candidate.actions) &&
    candidate.actions.every((item) => isSyntheticUserFacingAction(item))
  )
}

export function isSyntheticOperationalReport(
  value: unknown,
): value is SyntheticOperationalReport {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticOperationalReport>
  return (
    typeof candidate.syntheticId === "string" &&
    typeof candidate.syntheticName === "string" &&
    typeof candidate.domain === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.acceptedAssumptions) &&
    candidate.acceptedAssumptions.every((item) => typeof item === "string") &&
    Array.isArray(candidate.findings) &&
    candidate.findings.every((item) => typeof item === "string") &&
    Array.isArray(candidate.risks) &&
    candidate.risks.every((item) => typeof item === "string") &&
    Array.isArray(candidate.missingInformation) &&
    candidate.missingInformation.every((item) => typeof item === "string") &&
    Array.isArray(candidate.clarificationRequests) &&
    candidate.clarificationRequests.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { question?: unknown }).question === "string" &&
        typeof (item as { whyItMatters?: unknown }).whyItMatters === "string" &&
        typeof (item as { required?: unknown }).required === "boolean",
    ) &&
    Array.isArray(candidate.recommendedDecisions) &&
    candidate.recommendedDecisions.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { title?: unknown }).title === "string" &&
        Array.isArray((item as { options?: unknown }).options) &&
        ((item as { options?: unknown[] }).options ?? []).every(
          (option) => typeof option === "string",
        ) &&
        (((item as { recommendedOption?: unknown }).recommendedOption === null) ||
          typeof (item as { recommendedOption?: unknown }).recommendedOption ===
            "string") &&
        typeof (item as { reason?: unknown }).reason === "string",
    ) &&
    Array.isArray(candidate.nextSteps) &&
    candidate.nextSteps.every((item) => typeof item === "string") &&
    Boolean(candidate.readiness) &&
    typeof candidate.readiness?.canContinue === "boolean" &&
    typeof candidate.readiness?.blocked === "boolean" &&
    Array.isArray(candidate.readiness?.blockers) &&
    candidate.readiness.blockers.every((item) => typeof item === "string") &&
    isSyntheticReadinessStatus(candidate.readiness?.status) &&
    Array.isArray(candidate.artifactsReady) &&
    candidate.artifactsReady.every((item) => typeof item === "string") &&
    (candidate.handoff === null || typeof candidate.handoff === "string") &&
    (candidate.directedHandoffs === undefined ||
      (Array.isArray(candidate.directedHandoffs) &&
        candidate.directedHandoffs.every((item) =>
          isSyntheticDirectedHandoff(item),
        ))) &&
    (candidate.userFacing === null ||
      candidate.userFacing === undefined ||
      isSyntheticUserFacingBlock(candidate.userFacing))
  )
}

export function isAdvisorReport(value: unknown): value is AdvisorReport {
  if (!value || typeof value !== "object") {
    return false
  }
  const c = value as Partial<AdvisorReport>
  return (
    c.kind === "advisor" &&
    typeof c.syntheticId === "string" &&
    typeof c.syntheticName === "string" &&
    typeof c.topRecommendation === "string" &&
    Array.isArray(c.strategicOptions) &&
    Array.isArray(c.conflictResolution)
  )
}

function isSyntheticReport(
  value: unknown,
): value is SyntheticReport {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticReport>
  return (
    typeof candidate.syntheticId === "string" &&
    typeof candidate.syntheticName === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.details === "string" &&
    typeof candidate.recommendation === "string" &&
    Array.isArray(candidate.changesFromPrevious) &&
    candidate.changesFromPrevious.every((item) => typeof item === "string") &&
    Array.isArray(candidate.appliedInputs) &&
    candidate.appliedInputs.every((item) => typeof item === "string") &&
    Array.isArray(candidate.ignoredInputs) &&
    candidate.ignoredInputs.every((item) => typeof item === "string") &&
    Array.isArray(candidate.keyRisks) &&
    candidate.keyRisks.every((risk) => typeof risk === "string") &&
    Boolean(candidate.concernLevels) &&
    typeof candidate.concernLevels?.feasibility === "number" &&
    typeof candidate.concernLevels?.risk === "number" &&
    isSyntheticComplexity(candidate.concernLevels?.complexityLabel) &&
    (candidate.handoff === null || typeof candidate.handoff === "string") &&
    Array.isArray(candidate.upstreamContext) &&
    candidate.upstreamContext.every((item) => typeof item === "string") &&
    (candidate.directedHandoffs === undefined ||
      (Array.isArray(candidate.directedHandoffs) &&
        candidate.directedHandoffs.every((item) =>
          isSyntheticDirectedHandoff(item),
        ))) &&
    (candidate.operational === undefined ||
      candidate.operational === null ||
      isSyntheticOperationalReport(candidate.operational)) &&
    typeof candidate.model?.provider === "string" &&
    typeof candidate.model?.model === "string"
  )
}

export function isSyntheticOutputJson(
  value: unknown,
): value is SyntheticOutputJson {
  return isAdvisorReport(value) || isSyntheticReport(value)
}
