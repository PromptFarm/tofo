import "server-only"
import { getSessionPayload, persistChatMessage, getChatMessagesFromDb, saveProjectSession } from "@/lib/db-client"

import type {
  SerializedSimulationRun,
  SyntheticGraphPayload,
  SyntheticIntakeAnswer,
  SyntheticIntakeQuestion,
  SyntheticPreparedInputs,
  ThinkingGraphChatProgressEvent,
  ThinkingGraphRunProgressEvent,
} from "./types"
import { isSyntheticOutputJson } from "./types"
import {
  createDefaultSyntheticBackendDescriptors,
  thinkingGraphRepository,
} from "./repository"
import { loadGameDevelopmentPersonas, loadAllPersonas } from "./personaSource"
import { buildLinearPersonaGraph } from "./graphBuilder"
import { createModelProvider } from "./modelProvider"
import { AdkSyntheticOrchestrator } from "./orchestrator"
import { getThinkingGraphRuntimeConfig } from "./config"
import { buildSpec } from "./specBuilder"
import { iterationLog } from "./profiling"
import { buildIntakeQuestions, filterResolvedDecisionQuestions, collectIntakeQuestionsFromRun } from "./intakeBuilder"
import { buildDirectorOutput } from "./directorBuilder"
import type { ProjectSpec, SyntheticPersona } from "./types"

function isSyntheticGraphPayloadSnapshot(
  value: unknown,
): value is SyntheticGraphPayload {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<SyntheticGraphPayload>
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.ideaPrompt === "string" &&
    Array.isArray(candidate.synthetics) &&
    Array.isArray(candidate.edges) &&
    Array.isArray(candidate.transcript) &&
    typeof candidate.outputsBySyntheticId === "object" &&
    candidate.outputsBySyntheticId !== null &&
    typeof candidate.conversationsBySyntheticId === "object" &&
    candidate.conversationsBySyntheticId !== null
  )
}

function getInboundContextSourceIds(
  session: {
    synthetics: { id: string }[]
    edges: { from: string; to: string; type: string }[]
  },
  syntheticId: string,
): string[] {
  const inboundSourceIdSet = new Set(
    session.edges
      .filter((edge) => edge.to === syntheticId && edge.type !== "structural")
      .map((edge) => edge.from),
  )

  return session.synthetics
    .map((synthetic) => synthetic.id)
    .filter((id) => inboundSourceIdSet.has(id))
}

function createDefaultOrchestrator(): AdkSyntheticOrchestrator {
  const config = getThinkingGraphRuntimeConfig()

  if (config.provider === "gemini") {
    throw new Error(
      'THINKING_GRAPH_MODEL_PROVIDER="gemini" is configured, but a Gemini model provider is not implemented yet.',
    )
  }

  return new AdkSyntheticOrchestrator(createModelProvider(config))
}

function buildServerRecommendationDigest(
  payload: SyntheticGraphPayload,
): string[] {
  return payload.synthetics.flatMap((synthetic) => {
    const output = payload.outputsBySyntheticId[synthetic.id]
    if (!output || !("details" in output)) {
      return []
    }

    const recommendation = output.recommendation?.trim()
    if (!recommendation) {
      return []
    }

    return [`${synthetic.name}: ${recommendation}`]
  })
}

function appendCompletedRunToPayload(input: {
  priorPayload: SyntheticGraphPayload
  nextPayload: SyntheticGraphPayload
  runId: string
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  completedAt: string
  appliedDecisions: SyntheticGraphPayload["preparedInputs"]["decisions"]
  appliedClarifications: SyntheticGraphPayload["preparedInputs"]["clarifications"]
}): SyntheticGraphPayload {
  const existingHistory = input.priorPayload.runHistory ?? []
  const summaryReport = input.nextPayload.runSummary ?? input.priorPayload.runSummary
  if (!summaryReport) {
    return input.nextPayload
  }

  if (existingHistory.some((run) => run.id === input.runId)) {
    return {
      ...input.nextPayload,
      runHistory: existingHistory,
    }
  }

  const serializedRun: SerializedSimulationRun = {
    id: input.runId,
    versionLabel: `v${existingHistory.length + 1}`,
    basePrompt: input.priorPayload.ideaPrompt,
    iterationPrompt: input.nextPayload.ideaPrompt,
    prompt: input.nextPayload.ideaPrompt,
    reason:
      existingHistory.length === 0
        ? "Initial simulation"
        : input.rerunMode === "from_node_downstream"
          ? "Re-run after targeted changes"
          : "Re-run with updated idea context",
    createdAt: input.completedAt,
    synthetics: input.nextPayload.synthetics.map((synthetic) => ({
      ...synthetic,
      layout: { ...synthetic.layout },
      config: { ...synthetic.config },
    })),
    edges: input.nextPayload.edges.map((edge) => ({
      ...edge,
      waypoints: edge.waypoints?.map((point) => ({ ...point })),
    })),
    outputsBySyntheticId: Object.fromEntries(
      Object.entries(input.nextPayload.outputsBySyntheticId).map(([syntheticId, output]) => [
        syntheticId,
        output ? structuredClone(output) : null,
      ]),
    ),
    summaryReport: structuredClone(summaryReport),
    recommendationDigest: buildServerRecommendationDigest(input.nextPayload),
    appliedDecisions: input.appliedDecisions.map((decision) => ({ ...decision })),
    appliedStructuredClarifications: input.appliedClarifications.map((clarification) => ({
      ...clarification,
      answers: clarification.answers.map((answer) => ({ ...answer })),
    })),
    runtimeSnapshot: Object.fromEntries(
      input.nextPayload.synthetics.map((synthetic) => [
        synthetic.id,
        input.nextPayload.outputsBySyntheticId[synthetic.id] ? "done" : "blocked",
      ]),
    ),
  }

  return {
    ...input.nextPayload,
    runHistory: [...existingHistory, serializedRun],
  }
}

export async function getOrCreateThinkingGraphSession(input?: {
  sessionId?: string
  ideaPrompt?: string
  selectedPersonaIds?: string[]
}): Promise<SyntheticGraphPayload> {
  if (input?.sessionId) {
    const existingPayload = thinkingGraphRepository.toPayload(input.sessionId)
    if (existingPayload) {
      if (
        typeof input.ideaPrompt === "string" &&
        input.ideaPrompt !== existingPayload.ideaPrompt
      ) {
        thinkingGraphRepository.updateIdeaPrompt(input.sessionId, input.ideaPrompt)
        return (
          thinkingGraphRepository.toPayload(input.sessionId) ?? existingPayload
        )
      }

      return existingPayload
    }

    // Not in memory — try to restore from DB
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
      return dbPayload
    }
  }

  const personas = await (async () => {
    if (input?.selectedPersonaIds && input.selectedPersonaIds.length > 0) {
      const all = await loadAllPersonas()
      const byId = new Map(all.map((p) => [p.id, p]))
      const matched = input.selectedPersonaIds
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
      if (matched.length > 0) return matched
    }
    throw new Error("Cannot create a thinking graph session without selected personas. Please select a team.")
  })()
  const { synthetics, edges } = buildLinearPersonaGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  const session = thinkingGraphRepository.createSession({
    ideaPrompt: input?.ideaPrompt ?? "",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  const payload = thinkingGraphRepository.toPayload(session.id)
  if (!payload) {
    throw new Error("Failed to create thinking graph session payload.")
  }

  return payload
}

export async function updateThinkingGraphPreparedInputs(input: {
  sessionId: string
  preparedInputs: SyntheticPreparedInputs
  sessionPayload?: unknown
}): Promise<SyntheticGraphPayload> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    if (
      isSyntheticGraphPayloadSnapshot(input.sessionPayload) &&
      input.sessionPayload.sessionId === input.sessionId
    ) {
      thinkingGraphRepository.loadFromPayload(input.sessionPayload)
    } else {
      const dbPayload = await getSessionPayload(input.sessionId)
      if (dbPayload) {
        thinkingGraphRepository.loadFromPayload(dbPayload)
      }
    }
  }

  const session = thinkingGraphRepository.setPreparedInputs(
    input.sessionId,
    input.preparedInputs,
  )

  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after prepared input update.`,
      )
    })()
  )
}

/**
 * Appends a single clarification answer to `session.preparedInputs.clarifications`.
 * If a clarification entry for `syntheticId` already exists, the new answer is
 * merged into it (replacing any prior answer for the same questionId).
 * This allows ReportTab "Add to next run" to feed answers into the permanent
 * `intakeAnswers` path (via `accumulateIntakeAnswersFromClarifications`) rather
 * than relying solely on the ephemeral chat/context-note path.
 */
export async function appendThinkingGraphClarificationAnswer(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  questionId: string
  questionLabel: string
  answer: string
}): Promise<SyntheticGraphPayload> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  const existing = session.preparedInputs.clarifications
  const newAnswer = {
    questionId: input.questionId,
    questionLabel: input.questionLabel,
    answer: input.answer,
  }

  // Find or create the clarification entry for this synthetic.
  const entryIndex = existing.findIndex((c) => c.syntheticId === input.syntheticId)
  let nextClarifications: typeof existing
  if (entryIndex >= 0) {
    const entry = existing[entryIndex]!
    const answerIndex = entry.answers.findIndex((a) => a.questionId === input.questionId)
    const nextAnswers =
      answerIndex >= 0
        ? entry.answers.map((a, i) => (i === answerIndex ? newAnswer : a))
        : [...entry.answers, newAnswer]
    nextClarifications = existing.map((c, i) =>
      i === entryIndex
        ? { ...c, source: "manual_edit" as const, answers: nextAnswers }
        : c,
    )
  } else {
    nextClarifications = [
      ...existing,
      {
        syntheticId: input.syntheticId,
        syntheticName: input.syntheticName,
        answers: [newAnswer],
        appliedAt: new Date().toISOString(),
        source: "manual_edit" as const,
      },
    ]
  }

  return updateThinkingGraphPreparedInputs({
    sessionId: input.sessionId,
    preparedInputs: {
      decisions: session.preparedInputs.decisions,
      clarifications: nextClarifications,
    },
  })
}

export async function appendRecommendedSolution(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  riskDescription: string
  solution: string
  priorRisk?: number
}): Promise<SyntheticGraphPayload> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  const newSolution: import("./types").RecommendedSolution = {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    riskDescription: input.riskDescription,
    solution: input.solution,
    proposedAt: new Date().toISOString(),
    priorRisk: input.priorRisk,
  }

  session.recommendedSolutions = [
    ...session.recommendedSolutions,
    newSolution,
  ]

  // Save the mutated session back (getSession returns a clone, so we need to persist the mutation)
  thinkingGraphRepository.saveSession(session)

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after recommended solution update.`,
      )
    })()
  )
}

export async function updateRecommendedSolutionWithResult(input: {
  sessionId: string
  solutionId: string
  runId: string
  postRisk: number
}): Promise<SyntheticGraphPayload> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  session.recommendedSolutions = session.recommendedSolutions.map((sol) =>
    sol.id === input.solutionId
      ? {
          ...sol,
          evaluatedInRunId: input.runId,
          postRisk: input.postRisk,
        }
      : sol,
  )

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after solution result update.`,
      )
    })()
  )
}

export async function generateRiskProposalText(input: {
  sessionId: string
  syntheticId: string
  riskDescription: string
  currentRisk: number
}): Promise<string> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  const modelProvider = createModelProvider(getThinkingGraphRuntimeConfig())

  const result = await modelProvider.generate({
    messages: [
      {
        role: "system",
        content: `You are a strategic advisor helping improve a project idea. Based on a specific risk identified by an expert synthetic agent, generate a concise, actionable proposal to mitigate that risk. The proposal should be practical and directly address the identified problem. Keep it 1-3 sentences maximum.`,
      },
      {
        role: "user",
        content: `Project idea: ${session.ideaPrompt}\n\nRisk to address (currently at ${input.currentRisk}% risk level): ${input.riskDescription}\n\nPropose a concrete solution to reduce this risk:`,
      },
    ],
    temperature: 0.7,
    maxTokens: 300,
  })

  return result.text.trim()
}

export async function generateExpertAnswerWithAssessment(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  question: string
  whyItMatters: string
}): Promise<{ answer: string; improvementEstimate: number }> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  const modelProvider = createModelProvider(getThinkingGraphRuntimeConfig())

  // Generate expert answer
  const answerResult = await modelProvider.generate({
    messages: [
      {
        role: "system",
        content: `You are a strategic expert helping clarify key decisions for a project. Answer the question comprehensively based on the project idea. Your answer should be clear, actionable, and directly address the question. Keep it 2-4 sentences.`,
      },
      {
        role: "user",
        content: `Project idea: ${session.ideaPrompt}\n\nExpert question (${input.syntheticName}): ${input.question}\n\nWhy it matters: ${input.whyItMatters}\n\nProvide a comprehensive expert answer:`,
      },
    ],
    temperature: 0.7,
    maxTokens: 300,
  })

  const answer = answerResult.text.trim()

  // Assess improvement
  const assessmentResult = await modelProvider.generate({
    messages: [
      {
        role: "system",
        content: `You are evaluating how much an expert answer clarifies and strengthens a project idea on a scale of 0-100.
Return ONLY a JSON object with one field: {"improvement": <number 0-100>}
0 = no improvement, 50 = moderate improvement, 100 = major improvement.`,
      },
      {
        role: "user",
        content: `Project idea: ${session.ideaPrompt}\n\nExpert question: ${input.question}\n\nExpert answer provided: ${answer}\n\nHow much does this answer improve the project idea clarity/strength? Respond with only the JSON object.`,
      },
    ],
    temperature: 0.5,
    maxTokens: 50,
  })

  let improvementEstimate = 50; // Default to moderate
  try {
    const parsed = JSON.parse(assessmentResult.text.trim())
    improvementEstimate = Math.max(0, Math.min(100, parsed.improvement || 50))
  } catch {
    // If parsing fails, use default
  }

  return { answer, improvementEstimate }
}

export async function appendProposedImprovement(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  riskDescription: string
  proposal: string
  priorRisk: number
}): Promise<SyntheticGraphPayload> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  console.log("[appendProposedImprovement] Session before:", {
    sessionId: session.id,
    proposedImprovementsCount: session.proposedImprovements?.length,
    proposedImprovements: session.proposedImprovements,
  })

  // Ensure proposedImprovements array exists
  if (!Array.isArray(session.proposedImprovements)) {
    console.log("[appendProposedImprovement] Creating proposedImprovements array");
    session.proposedImprovements = []
  }

  const newImprovement: import("./types").ProposedImprovement = {
    id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    riskDescription: input.riskDescription,
    proposal: input.proposal,
    priorRisk: input.priorRisk,
    expectedTargetRisk: 40,
    addedAt: new Date().toISOString(),
  }

  console.log("[appendProposedImprovement] Adding new improvement:", newImprovement);

  session.proposedImprovements = [
    ...session.proposedImprovements,
    newImprovement,
  ]

  console.log("[appendProposedImprovement] Session after:", {
    proposedImprovementsCount: session.proposedImprovements.length,
  })

  // Save the mutated session back (getSession returns a clone, so we need to persist the mutation)
  thinkingGraphRepository.saveSession(session)

  const payload = thinkingGraphRepository.toPayload(session.id)
  console.log("[appendProposedImprovement] Payload returned from toPayload:", {
    proposedImprovementsCount: payload?.proposedImprovements?.length,
    proposedImprovements: payload?.proposedImprovements,
  });

  return (
    payload ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after proposed improvement update.`,
      )
    })()
  )
}

export async function deleteProposedImprovement(input: {
  sessionId: string
  improvementId: string
}): Promise<SyntheticGraphPayload> {
  if (!thinkingGraphRepository.getSession(input.sessionId)) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
    }
  }

  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found.`)
  }

  session.proposedImprovements = (session.proposedImprovements ?? []).filter(
    (p) => p.id !== input.improvementId
  )

  // Save the mutated session back
  thinkingGraphRepository.saveSession(session)

  const payload = thinkingGraphRepository.toPayload(session.id)
  return (
    payload ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after proposed improvement deletion.`,
      )
    })()
  )
}

export async function runThinkingGraphSession(input: {
  sessionId?: string
  ideaPrompt: string
  projectFilesContext?: string | null
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
}): Promise<SyntheticGraphPayload> {
  return runThinkingGraphSessionWithProgress(input)
}

export async function runThinkingGraphSessionWithProgress(input: {
  sessionId?: string
  ideaPrompt: string
  projectFilesContext?: string | null
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
  edges?: import("../../planning/types").SyntheticEdge[]
  onProgress?: (event: ThinkingGraphRunProgressEvent) => void | Promise<void>
  // Desktop apps must survive the user navigating away or minimizing the
  // window mid-run — the run cannot depend on a connected client to persist
  // its result. When provided, the finished session is saved to SQLite here,
  // server-side, regardless of whether onProgress's consumer is still listening.
  userId?: string
  projectId?: string | null
}): Promise<SyntheticGraphPayload> {
  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })
  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) {
    throw new Error(`Session "${payload.sessionId}" was not found for run.`)
  }

  if (input.edges && input.edges.length > 0) {
    thinkingGraphRepository.updateEdges(session.id, input.edges)
  }

  const activeSession = thinkingGraphRepository.getSession(session.id) ?? session

  function getDownstreamSyntheticIds(startIds: string[]): string[] {
    const queue = [...startIds]
    const visited = new Set(startIds)

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) {
        continue
      }

      activeSession.edges
        .filter((edge) => edge.type !== "structural" && edge.from === current)
        .forEach((edge) => {
          if (visited.has(edge.to)) {
            return
          }
          visited.add(edge.to)
          queue.push(edge.to)
        })
    }

    return activeSession.synthetics
      .map((synthetic) => synthetic.id)
      .filter((syntheticId) => visited.has(syntheticId))
  }

  const dirtySyntheticIds = Array.from(
    new Set(
      (input.dirtySyntheticIds ?? []).filter((syntheticId) =>
        activeSession.synthetics.some((synthetic) => synthetic.id === syntheticId),
      ),
    ),
  )
  const syntheticIdsToRun =
    input.rerunMode === "single_node" && input.targetSyntheticId
      ? [input.targetSyntheticId]
      : input.rerunMode === "from_node_downstream" && input.targetSyntheticId
        ? getDownstreamSyntheticIds([input.targetSyntheticId])
        : input.rerunMode === "from_node_downstream" && dirtySyntheticIds.length > 0
          ? getDownstreamSyntheticIds(dirtySyntheticIds)
          : activeSession.synthetics.map((synthetic) => synthetic.id)

  await input.onProgress?.({
    type: "run_started",
    sessionId: activeSession.id,
    totalAgents: syntheticIdsToRun.length,
    completedAgents: 0,
  })

  iterationLog("service_run_start", {
    sessionId: activeSession.id,
    ideaPromptPreview: activeSession.ideaPrompt.slice(0, 500),
    preparedInputs: activeSession.preparedInputs,
    memorySnapshot: Object.fromEntries(
      Object.entries(activeSession.memoryBySyntheticId).map(([id, m]) => [
        id,
        { hasLatestOutput: Boolean(m.latestOutput), conversationLength: m.conversation?.length ?? 0 },
      ])
    ),
  });

  // Promote answered clarifications into the permanent intake Q&A store so
  // agents in this run (and all future runs) see them in buildIntakeContextBlock.
  if (activeSession.preparedInputs.clarifications.length > 0) {
    thinkingGraphRepository.accumulateIntakeAnswersFromClarifications(
      activeSession.id,
      activeSession.preparedInputs.clarifications,
    )
  }

  const config = getThinkingGraphRuntimeConfig()
  const orchestrator = createDefaultOrchestrator()
  const result = await orchestrator.runChain({
    session: activeSession,
    syntheticIds: syntheticIdsToRun,
    projectFilesContext: input.projectFilesContext,
    onProgress: input.onProgress,
    agentStaggerMs: config.agentStaggerMs,
  })

  // Build a set of already-answered question IDs so we can hard-filter them
  // from agent outputs. This prevents a re-raised clarificationRequest from
  // appearing in the UI even when the LLM ignores the "Do NOT re-raise" instruction.
  const answeredQuestionIds = new Set(activeSession.intakeAnswers.map((a) => a.questionId))

  for (const synthetic of activeSession.synthetics) {
    let output = result.outputsBySyntheticId[synthetic.id]
    if (output) {
      // Hard-filter clarificationRequests that are already answered.
      if ("details" in output && output.operational?.clarificationRequests) {
        const filtered = output.operational.clarificationRequests.filter(
          (cr) => !answeredQuestionIds.has(cr.id),
        )
        if (filtered.length !== output.operational.clarificationRequests.length) {
          output = {
            ...output,
            operational: { ...output.operational, clarificationRequests: filtered },
          }
        }
      }
      thinkingGraphRepository.replaceSyntheticOutput(activeSession.id, synthetic.id, output)
      thinkingGraphRepository.updateUpstreamContext(
        activeSession.id,
        synthetic.id,
        getInboundContextSourceIds(activeSession, synthetic.id)
          .map((sourceId) => activeSession.memoryBySyntheticId[sourceId]?.latestOutput)
          .filter(isSyntheticOutputJson)
          .map((candidate) => JSON.stringify(candidate)),
      )
    }
  }

  if (result.runSummary) {
    thinkingGraphRepository.setRunSummary(activeSession.id, result.runSummary)
  }

  // Harvest clarificationRequests from agent outputs and merge into the permanent
  // intakeQuestions store so that future runs (and buildIntakeContextBlock) can
  // reference them with "Do NOT re-raise" instructions to agents.
  const sessionAfterChain = thinkingGraphRepository.getSession(activeSession.id)
  if (sessionAfterChain) {
    const sessionWithIntake = collectIntakeQuestionsFromRun({
      session: sessionAfterChain,
      outputsBySyntheticId: result.outputsBySyntheticId,
    })
    if (sessionWithIntake !== sessionAfterChain) {
      thinkingGraphRepository.setIntakeQuestions(activeSession.id, sessionWithIntake.intakeQuestions)
    }
  }

  thinkingGraphRepository.appendTranscriptEntries(activeSession.id, result.transcript)
  thinkingGraphRepository.clearConversationIterationUsage(activeSession.id)
  // Accumulate user decisions into permanent resolved store before clearing
  if (activeSession.preparedInputs.decisions.length > 0) {
    thinkingGraphRepository.accumulateResolvedDecisions(
      activeSession.id,
      activeSession.preparedInputs.decisions,
    )
  }
  thinkingGraphRepository.setPreparedInputs(activeSession.id, {
    decisions: [],
    clarifications: [],
  })
  const baseNextPayload =
    thinkingGraphRepository.toPayload(activeSession.id) ??
    (() => {
      throw new Error(`Failed to load payload for session "${activeSession.id}" after run.`)
    })()
  const nextPayload = appendCompletedRunToPayload({
    priorPayload: payload,
    nextPayload: baseNextPayload,
    runId: result.runId,
    rerunMode: input.rerunMode,
    completedAt: result.completedAt,
    appliedDecisions: activeSession.preparedInputs.decisions,
    appliedClarifications: activeSession.preparedInputs.clarifications,
  })

  // Persist server-side, independent of whether a client is still connected
  // to receive the run_completed event below (see param doc on userId/projectId).
  if (input.userId && input.projectId) {
    try {
      await saveProjectSession(input.userId, input.projectId, nextPayload)
    } catch (err) {
      console.error(
        `[thinking-graph][service] failed to persist completed run for session "${activeSession.id}":`,
        err,
      )
    }
  }

  await input.onProgress?.({
    type: "run_completed",
    sessionId: activeSession.id,
    runId: result.runId,
    completedAt: result.completedAt,
    totalAgents: syntheticIdsToRun.length,
    completedAgents: syntheticIdsToRun.length,
    payload: nextPayload,
  })

  return nextPayload
}

export async function chatWithThinkingGraphSynthetic(input: {
  sessionId?: string
  ideaPrompt?: string
  syntheticId: string
  userMessage: string
}): Promise<SyntheticGraphPayload> {
  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })
  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) {
    throw new Error(`Session "${payload.sessionId}" was not found for chat.`)
  }

  const afterUser = thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: input.syntheticId,
    role: "user",
    text: input.userMessage,
  })
  const userMsg = afterUser?.memoryBySyntheticId[input.syntheticId]?.conversation.at(-1)
  if (userMsg) {
    persistChatMessage(session.id, { syntheticId: input.syntheticId, messageId: userMsg.id, role: userMsg.role, text: userMsg.text, includeInNextIteration: userMsg.includeInNextIteration, createdAt: userMsg.createdAt }).catch(() => {})
  }

  const updatedSession = thinkingGraphRepository.getSession(session.id)
  if (!updatedSession) {
    throw new Error(`Session "${session.id}" disappeared after user message append.`)
  }

  const orchestrator = createDefaultOrchestrator()
  const result = await orchestrator.chat({
    session: updatedSession,
    syntheticId: input.syntheticId,
    userMessage: input.userMessage,
  })

  const afterSynthetic = thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: input.syntheticId,
    role: "synthetic",
    text: result.replyText,
  })
  const syntheticMsg = afterSynthetic?.memoryBySyntheticId[input.syntheticId]?.conversation.at(-1)
  if (syntheticMsg) {
    persistChatMessage(session.id, { syntheticId: input.syntheticId, messageId: syntheticMsg.id, role: syntheticMsg.role, text: syntheticMsg.text, includeInNextIteration: syntheticMsg.includeInNextIteration, createdAt: syntheticMsg.createdAt }).catch(() => {})
  }

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(`Failed to load payload for session "${session.id}" after chat.`)
    })()
  )
}

export async function streamChatWithThinkingGraphSynthetic(input: {
  sessionId?: string
  ideaPrompt?: string
  syntheticId: string
  userMessage: string
  onProgress?: (event: ThinkingGraphChatProgressEvent) => void | Promise<void>
}): Promise<SyntheticGraphPayload> {
  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })
  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) {
    throw new Error(`Session "${payload.sessionId}" was not found for chat.`)
  }

  const afterUser2 = thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: input.syntheticId,
    role: "user",
    text: input.userMessage,
  })
  const userMsg2 = afterUser2?.memoryBySyntheticId[input.syntheticId]?.conversation.at(-1)
  if (userMsg2) {
    persistChatMessage(session.id, { syntheticId: input.syntheticId, messageId: userMsg2.id, role: userMsg2.role, text: userMsg2.text, includeInNextIteration: userMsg2.includeInNextIteration, createdAt: userMsg2.createdAt }).catch(() => {})
  }

  const updatedSession = thinkingGraphRepository.getSession(session.id)
  if (!updatedSession) {
    throw new Error(`Session "${session.id}" disappeared after user message append.`)
  }

  const orchestrator = createDefaultOrchestrator()
  const result = await orchestrator.chat({
    session: updatedSession,
    syntheticId: input.syntheticId,
    userMessage: input.userMessage,
    onTextDelta: async (textDelta) => {
      await input.onProgress?.({
        type: "assistant_chunk",
        sessionId: session.id,
        syntheticId: input.syntheticId,
        textDelta,
      })
    },
  })

  const afterSynthetic2 = thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: input.syntheticId,
    role: "synthetic",
    text: result.replyText,
  })
  const syntheticMsg2 = afterSynthetic2?.memoryBySyntheticId[input.syntheticId]?.conversation.at(-1)
  if (syntheticMsg2) {
    persistChatMessage(session.id, { syntheticId: input.syntheticId, messageId: syntheticMsg2.id, role: syntheticMsg2.role, text: syntheticMsg2.text, includeInNextIteration: syntheticMsg2.includeInNextIteration, createdAt: syntheticMsg2.createdAt }).catch(() => {})
  }

  const nextPayload =
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(`Failed to load payload for session "${session.id}" after chat.`)
    })()

  await input.onProgress?.({
    type: "chat_completed",
    sessionId: session.id,
    syntheticId: input.syntheticId,
    payload: nextPayload,
  })

  return nextPayload
}

export async function runDirectorPhase(input: {
  sessionId: string
  ideaPrompt: string
  onTextDelta?: (delta: string) => void | Promise<void>
}): Promise<SyntheticGraphPayload> {
  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })
  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) throw new Error(`Session "${payload.sessionId}" not found for director phase.`)

  const allPersonas = await loadAllPersonas()
  const config = getThinkingGraphRuntimeConfig()
  const modelProvider = createModelProvider(config)

  const directorOutput = await buildDirectorOutput({
    ideaPrompt: input.ideaPrompt,
    availablePersonas: allPersonas,
    resolvedDecisions: session.resolvedDecisions.length > 0 ? session.resolvedDecisions : undefined,
    modelProvider,
    onTextDelta: input.onTextDelta,
  })

  thinkingGraphRepository.setDirectorOutput(payload.sessionId, directorOutput)

  if (directorOutput.groundedQuestions.length > 0) {
    thinkingGraphRepository.setIntakeQuestions(payload.sessionId, directorOutput.groundedQuestions)
  }

  return (
    thinkingGraphRepository.toPayload(payload.sessionId) ??
    (() => {
      throw new Error(`Failed to load payload after director phase.`)
    })()
  )
}

export async function confirmDirectorPhase(input: {
  sessionId: string
  confirmedPersonaIds: string[]
  intakeAnswers?: SyntheticIntakeAnswer[]
}): Promise<SyntheticGraphPayload> {
  let session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    const dbPayload = await getSessionPayload(input.sessionId)
    if (dbPayload) {
      thinkingGraphRepository.loadFromPayload(dbPayload)
      session = thinkingGraphRepository.getSession(input.sessionId)
    }
  }
  if (!session) throw new Error(`Session "${input.sessionId}" not found for director confirmation.`)

  const allPersonas = await loadAllPersonas()
  const personaById = new Map(allPersonas.map((p) => [p.id, p]))
  const personas = input.confirmedPersonaIds
    .map((id) => personaById.get(id))
    .filter((p): p is SyntheticPersona => p !== undefined)

  if (personas.length === 0) throw new Error("No valid personas found for the confirmed IDs.")

  const { synthetics, edges } = buildLinearPersonaGraph(personas)

  thinkingGraphRepository.rebuildGraphWithPersonas(
    input.sessionId,
    input.confirmedPersonaIds,
    synthetics,
    edges,
  )

  if (input.intakeAnswers && input.intakeAnswers.length > 0) {
    thinkingGraphRepository.setIntakeAnswers(input.sessionId, input.intakeAnswers)
  }

  return (
    thinkingGraphRepository.toPayload(input.sessionId) ??
    (() => {
      throw new Error(`Failed to load payload after director confirmation.`)
    })()
  )
}

export async function getThinkingGraphChatHistory(input: {
  sessionId: string
  syntheticId: string
}): Promise<import("./types").SyntheticConversationMessage[]> {
  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (session) {
    const inMemory = session.memoryBySyntheticId[input.syntheticId]?.conversation ?? []
    if (inMemory.length > 0) return inMemory
  }
  // Fall back to DB when in-memory session is gone (e.g. server restart)
  const rows = await getChatMessagesFromDb(input.sessionId, input.syntheticId)
  return rows.map((r) => ({
    id: r.id,
    syntheticId: input.syntheticId,
    role: r.role as "user" | "synthetic" | "system",
    text: r.text,
    includeInNextIteration: r.includeInNextIteration,
    createdAt: r.createdAt,
  }))
}

export async function setThinkingGraphChatMessageIterationUsage(input: {
  sessionId: string
  syntheticId: string
  messageId: string
  includeInNextIteration: boolean
}): Promise<SyntheticGraphPayload> {
  const session = thinkingGraphRepository.setConversationMessageIterationUsage(
    input.sessionId,
    input.syntheticId,
    input.messageId,
    input.includeInNextIteration,
  )

  if (!session) {
    throw new Error(
      `Session "${input.sessionId}" was not found while updating chat context usage.`,
    )
  }

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after updating chat context usage.`,
      )
    })()
  )
}

export async function buildThinkingGraphSpec(input: {
  sessionId: string
}): Promise<ProjectSpec> {
  const session = thinkingGraphRepository.getSession(input.sessionId)
  if (!session) {
    throw new Error(`Session "${input.sessionId}" was not found for spec generation.`)
  }

  const { projectSpec } = await buildSpec({ session })
  return projectSpec
}

export async function buildIntakeQuestionsForSession(input: {
  sessionId: string
  ideaPrompt: string
}): Promise<SyntheticIntakeQuestion[]> {
  // Ensure session exists (create if needed)
  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })

  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) {
    throw new Error(`Session "${payload.sessionId}" not found for intake.`)
  }

  // If ideaPrompt changed — reset intake
  if (session.ideaPrompt !== input.ideaPrompt) {
    thinkingGraphRepository.resetIntakeForNewIdea(payload.sessionId, input.ideaPrompt)
  }

  // If questions already generated for this idea — return them
  const freshSession = thinkingGraphRepository.getSession(payload.sessionId)!
  if (freshSession.intakeQuestions.length > 0) {
    return freshSession.intakeQuestions
  }

  const config = getThinkingGraphRuntimeConfig()
  const modelProvider = createModelProvider(config)

  const questions = await buildIntakeQuestions({
    ideaPrompt: input.ideaPrompt,
    modelProvider,
    resolvedDecisions: freshSession.resolvedDecisions.length > 0 ? freshSession.resolvedDecisions : undefined,
  })

  thinkingGraphRepository.setIntakeQuestions(payload.sessionId, questions)
  return questions
}

export async function saveIntakeAnswers(input: {
  sessionId: string
  answers: SyntheticIntakeAnswer[]
}): Promise<SyntheticGraphPayload> {
  const session = thinkingGraphRepository.setIntakeAnswers(
    input.sessionId,
    input.answers,
  )

  if (!session) {
    throw new Error(`Session "${input.sessionId}" not found while saving intake answers.`)
  }

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(`Failed to load payload for session "${session.id}" after saving intake answers.`)
    })()
  )
}

export async function streamIntakeQuestionsForSession(input: {
  sessionId: string
  ideaPrompt: string
  onTextDelta: (delta: string) => void | Promise<void>
}): Promise<SyntheticIntakeQuestion[]> {
  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })

  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) {
    throw new Error(`Session "${payload.sessionId}" not found for intake.`)
  }

  if (session.ideaPrompt !== input.ideaPrompt) {
    thinkingGraphRepository.resetIntakeForNewIdea(payload.sessionId, input.ideaPrompt)
  }

  const freshSession = thinkingGraphRepository.getSession(payload.sessionId)!
  if (freshSession.intakeQuestions.length > 0) {
    return freshSession.intakeQuestions
  }

  const config = getThinkingGraphRuntimeConfig()
  const modelProvider = createModelProvider(config)

  const resolvedDecisions = freshSession.resolvedDecisions.length > 0 ? freshSession.resolvedDecisions : undefined
  const resolvedBlock = resolvedDecisions
    ? `\nThe following decisions have already been made by the user — do NOT ask about them:\n${resolvedDecisions.map((d) => `- ${d.decisionTitle}: "${d.optionLabel}"`).join("\n")}\n`
    : ""

  let accumulatedText = ""
  if (modelProvider.streamText) {
    const systemPrompt = `You are a project intake specialist.
Given a project idea, generate 3 to 5 clarifying questions that will help the development team understand the scope, constraints, and goals before they start working.
${resolvedBlock}
Focus on questions that:
- Reveal hard constraints (platform, budget, team size, timeline)
- Clarify the core experience (target audience, genre conventions, unique differentiators)
- Unblock the first iteration (what must be decided now vs later)

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "whyItMatters": "...",
      "required": true,
      "suggestedAnswer": "..." or null
    }
  ]
}`
    const result = await modelProvider.streamText({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Project idea: ${input.ideaPrompt}` },
      ],
      onTextDelta: async (delta) => {
        accumulatedText += delta
        await input.onTextDelta(delta)
      },
    })
    accumulatedText = result.text
  } else {
    const questions = await buildIntakeQuestions({
      ideaPrompt: input.ideaPrompt,
      modelProvider,
      resolvedDecisions,
    })
    thinkingGraphRepository.setIntakeQuestions(payload.sessionId, questions)
    return questions
  }

  const questions = filterResolvedDecisionQuestions(parseIntakeResponseText(accumulatedText), resolvedDecisions)
  thinkingGraphRepository.setIntakeQuestions(payload.sessionId, questions)
  return questions
}

function parseIntakeResponseText(text: string): SyntheticIntakeQuestion[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []
    const data = JSON.parse(jsonMatch[0]) as { questions?: unknown[] }
    if (!Array.isArray(data.questions)) return []
    return data.questions.flatMap((item): SyntheticIntakeQuestion[] => {
      if (!item || typeof item !== "object") return []
      const q = item as Record<string, unknown>
      if (
        typeof q.id !== "string" ||
        typeof q.question !== "string" ||
        typeof q.whyItMatters !== "string" ||
        typeof q.required !== "boolean"
      ) return []
      return [{
        id: q.id,
        question: q.question,
        whyItMatters: q.whyItMatters,
        required: q.required,
        suggestedAnswer: typeof q.suggestedAnswer === "string" ? q.suggestedAnswer : null,
        source: "intake",
        syntheticId: null,
      }]
    }).slice(0, 20)
  } catch {
    return []
  }
}

export async function streamChatWithIdeaSession(input: {
  sessionId?: string
  ideaPrompt?: string
  userMessage: string
  onProgress?: (event: ThinkingGraphChatProgressEvent) => void | Promise<void>
}): Promise<SyntheticGraphPayload> {
  const IDEA_ID = "__idea__"

  const payload = await getOrCreateThinkingGraphSession({
    sessionId: input.sessionId,
    ideaPrompt: input.ideaPrompt,
  })
  const session = thinkingGraphRepository.getSession(payload.sessionId)
  if (!session) {
    throw new Error(`Session "${payload.sessionId}" was not found for idea chat.`)
  }

  // Append the user message (auto-creates memory slot if needed)
  const afterIdeaUser = thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: IDEA_ID,
    role: "user",
    text: input.userMessage,
  })
  const ideaUserMsg = afterIdeaUser?.memoryBySyntheticId[IDEA_ID]?.conversation.at(-1)
  if (ideaUserMsg) {
    persistChatMessage(session.id, { syntheticId: IDEA_ID, messageId: ideaUserMsg.id, role: ideaUserMsg.role, text: ideaUserMsg.text, includeInNextIteration: ideaUserMsg.includeInNextIteration, createdAt: ideaUserMsg.createdAt }).catch(() => {})
  }

  const updatedSession = thinkingGraphRepository.getSession(session.id)
  if (!updatedSession) {
    throw new Error(`Session "${session.id}" disappeared after idea chat user message.`)
  }

  const orchestrator = createDefaultOrchestrator()
  const ideaConversation = updatedSession.memoryBySyntheticId[IDEA_ID]?.conversation ?? []

  const result = await orchestrator.chatWithIdeaSession({
    session: updatedSession,
    userMessage: input.userMessage,
    ideaConversation,
    onTextDelta: async (textDelta) => {
      await input.onProgress?.({
        type: "assistant_chunk",
        sessionId: session.id,
        syntheticId: IDEA_ID,
        textDelta,
      })
    },
  })

  const afterIdeaSynthetic = thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: IDEA_ID,
    role: "synthetic",
    text: result.replyText,
  })
  const ideaSyntheticMsg = afterIdeaSynthetic?.memoryBySyntheticId[IDEA_ID]?.conversation.at(-1)
  if (ideaSyntheticMsg) {
    persistChatMessage(session.id, { syntheticId: IDEA_ID, messageId: ideaSyntheticMsg.id, role: ideaSyntheticMsg.role, text: ideaSyntheticMsg.text, includeInNextIteration: ideaSyntheticMsg.includeInNextIteration, createdAt: ideaSyntheticMsg.createdAt }).catch(() => {})
  }

  const nextPayload =
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(`Failed to load payload for session "${session.id}" after idea chat.`)
    })()

  await input.onProgress?.({
    type: "chat_completed",
    sessionId: session.id,
    syntheticId: IDEA_ID,
    payload: nextPayload,
  })

  return nextPayload
}

export async function deleteThinkingGraphChatMessage(input: {
  sessionId: string
  syntheticId: string
  messageId: string
}): Promise<SyntheticGraphPayload> {
  const session = thinkingGraphRepository.deleteConversationMessage(
    input.sessionId,
    input.syntheticId,
    input.messageId,
  )

  if (!session) {
    throw new Error(
      `Session "${input.sessionId}" was not found while deleting a chat message.`,
    )
  }

  return (
    thinkingGraphRepository.toPayload(session.id) ??
    (() => {
      throw new Error(
        `Failed to load payload for session "${session.id}" after deleting a chat message.`,
      )
    })()
  )
}
