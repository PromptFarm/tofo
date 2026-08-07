import type {
  SyntheticEdge,
  SyntheticNode,
  TranscriptEntry,
} from "../../planning/types"

import type {
  DirectorOutput,
  RunSummaryReport,
  SyntheticBackendDescriptor,
  SyntheticConversationMessage,
  SyntheticGraphPayload,
  SyntheticIntakeAnswer,
  SyntheticIntakeQuestion,
  SyntheticMemoryState,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticPreparedInputs,
  SyntheticSession,
} from "./types"
import { getPendingIntakeQuestions } from "./intakeBuilder"
import { buildProjectSpec } from "../projectSpecification"
import { getThinkingGraphProviderDescriptor } from "./config"

type CreateSessionInput = {
  ideaPrompt?: string
  selectedPersonaIds: string[]
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  provider: SyntheticBackendDescriptor
  orchestrator: SyntheticBackendDescriptor
}

type ThinkingGraphStore = {
  sessions: Map<string, SyntheticSession>
}

const DEFAULT_PROVIDER: SyntheticBackendDescriptor =
  getThinkingGraphProviderDescriptor()

const DEFAULT_ORCHESTRATOR: SyntheticBackendDescriptor = {
  kind: "google_adk",
  label: "Google ADK",
}

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createSessionId(): string {
  return createMessageId("session")
}

function createMemoryState(): SyntheticMemoryState {
  return {
    conversation: [],
    upstreamContext: [],
  }
}

function createPreparedInputs(): SyntheticPreparedInputs {
  return {
    decisions: [],
    clarifications: [],
  }
}

/** Stable synthetic ID used to store the idea-node chat conversation. */
export const IDEA_SYNTHETIC_ID = "__idea__"

function buildMemoryIndex(
  synthetics: SyntheticNode[],
): Record<string, SyntheticMemoryState> {
  return Object.fromEntries(
    synthetics.map((synthetic) => [synthetic.id, createMemoryState()]),
  )
}

function cloneSession(session: SyntheticSession): SyntheticSession {
  return {
    ...session,
    synthetics: session.synthetics.map((synthetic) => ({
      ...synthetic,
      layout: { ...synthetic.layout },
      config: { ...synthetic.config },
    })),
    edges: session.edges.map((edge) => ({
      ...edge,
      ...(edge.waypoints
        ? { waypoints: edge.waypoints.map((point) => ({ ...point })) }
        : {}),
    })),
    transcript: session.transcript.map((entry) => ({ ...entry })),
    memoryBySyntheticId: Object.fromEntries(
      Object.entries(session.memoryBySyntheticId).map(([syntheticId, memory]) => [
        syntheticId,
        {
          ...memory,
          conversation: memory.conversation.map((message) => ({ ...message })),
          upstreamContext: [...memory.upstreamContext],
          ...(memory.latestOutput
            ? { latestOutput: { ...memory.latestOutput } }
            : {}),
        },
      ]),
    ),
    preparedInputs: {
      decisions: session.preparedInputs.decisions.map((decision) => ({
        ...decision,
      })),
      clarifications: session.preparedInputs.clarifications.map(
        (clarification) => ({
          ...clarification,
          answers: clarification.answers.map((answer) => ({ ...answer })),
        }),
      ),
    },
    resolvedDecisions: (session.resolvedDecisions ?? []).map((d) => ({ ...d })),
    intakeQuestions: (session.intakeQuestions ?? []).map((q) => ({ ...q })),
    intakeAnswers: (session.intakeAnswers ?? []).map((a) => ({ ...a })),
    recommendedSolutions: (session.recommendedSolutions ?? []).map((s) => ({ ...s })),
    proposedImprovements: (session.proposedImprovements ?? []).map((p) => ({ ...p })),
    directorOutput: session.directorOutput ?? null,
    runSummary: session.runSummary ?? null,
  }
}

function toGraphPayload(session: SyntheticSession): SyntheticGraphPayload {
  console.log("[toGraphPayload] Input session.proposedImprovements:", {
    count: session.proposedImprovements?.length,
    data: session.proposedImprovements,
  });

  const payload = {
    sessionId: session.id,
    ideaPrompt: session.ideaPrompt,
    synthetics: session.synthetics.map((synthetic) => ({
      ...synthetic,
      layout: { ...synthetic.layout },
      config: { ...synthetic.config },
    })),
    edges: session.edges.map((edge) => ({ ...edge })),
    transcript: session.transcript.map((entry) => ({ ...entry })),
    outputsBySyntheticId: Object.fromEntries(
      Object.entries(session.memoryBySyntheticId).map(([syntheticId, memory]) => [
        syntheticId,
        memory.latestOutput ?? null,
      ]),
    ),
    conversationsBySyntheticId: Object.fromEntries(
      Object.entries(session.memoryBySyntheticId).map(([syntheticId, memory]) => [
        syntheticId,
        memory.conversation.map((message) => ({ ...message })),
      ]),
    ),
    preparedInputs: {
      decisions: session.preparedInputs.decisions.map((decision) => ({
        ...decision,
      })),
      clarifications: session.preparedInputs.clarifications.map(
        (clarification) => ({
          ...clarification,
          answers: clarification.answers.map((answer) => ({ ...answer })),
        }),
      ),
    },
    provider: { ...session.provider },
    orchestrator: { ...session.orchestrator },
    intakeQuestions: (session.intakeQuestions ?? []).map((q) => ({ ...q })),
    intakeAnswers: (session.intakeAnswers ?? []).map((a) => ({ ...a })),
    recommendedSolutions: (session.recommendedSolutions ?? []).map((s) => ({ ...s })),
    proposedImprovements: (session.proposedImprovements ?? []).map((p) => ({ ...p })),
    pendingIntakeQuestions: getPendingIntakeQuestions(session).map((q) => ({ ...q })),
    directorOutput: session.directorOutput ?? null,
    runSummary: session.runSummary ?? null,
    projectSpec: buildProjectSpec({
      ideaPrompt: session.ideaPrompt,
      synthetics: session.synthetics,
      outputsBySyntheticId: Object.fromEntries(
        Object.entries(session.memoryBySyntheticId).map(([id, m]) => [id, m.latestOutput ?? null])
      ),
      appliedDecisions: session.preparedInputs.decisions,
      appliedStructuredClarifications: session.preparedInputs.clarifications,
    }),
  } as SyntheticGraphPayload;

  console.log("[toGraphPayload] Output payload.proposedImprovements:", {
    count: payload.proposedImprovements?.length,
    data: payload.proposedImprovements,
  });

  return payload;
}

function getStore(): ThinkingGraphStore {
  const globalScope = globalThis as typeof globalThis & {
    __promptfarmThinkingGraphStore__?: ThinkingGraphStore
  }

  if (!globalScope.__promptfarmThinkingGraphStore__) {
    globalScope.__promptfarmThinkingGraphStore__ = {
      sessions: new Map<string, SyntheticSession>(),
    }
  }

  return globalScope.__promptfarmThinkingGraphStore__
}

export class InMemorySyntheticRepository {
  private readonly store = getStore()

  createSession(input: CreateSessionInput): SyntheticSession {
    const now = new Date().toISOString()
    const session: SyntheticSession = {
      id: createSessionId(),
      createdAt: now,
      updatedAt: now,
      ideaPrompt: input.ideaPrompt ?? "",
      selectedPersonaIds: [...input.selectedPersonaIds],
      synthetics: input.synthetics.map((synthetic) => ({
        ...synthetic,
        layout: { ...synthetic.layout },
        config: { ...synthetic.config },
      })),
      edges: input.edges.map((edge) => ({ ...edge })),
      transcript: [],
      memoryBySyntheticId: buildMemoryIndex(input.synthetics),
      preparedInputs: createPreparedInputs(),
      resolvedDecisions: [],
      intakeQuestions: [],
      intakeAnswers: [],
      recommendedSolutions: [],
      proposedImprovements: [],
      directorOutput: null,
      runSummary: null,
      provider: { ...input.provider },
      orchestrator: { ...input.orchestrator },
    }

    this.store.sessions.set(session.id, session)
    return cloneSession(session)
  }

  getSession(sessionId: string): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    return session ? cloneSession(session) : null
  }

  loadFromPayload(payload: SyntheticGraphPayload): void {
    if (this.store.sessions.has(payload.sessionId)) return

    const memoryBySyntheticId: Record<string, SyntheticMemoryState> = {}
    for (const synthetic of payload.synthetics) {
      const conversation = payload.conversationsBySyntheticId[synthetic.id] ?? []
      const latestOutput = payload.outputsBySyntheticId[synthetic.id] ?? undefined
      memoryBySyntheticId[synthetic.id] = {
        ...createMemoryState(),
        conversation,
        ...(latestOutput ? { latestOutput } : {}),
      }
    }

    const now = new Date().toISOString()
    const session: SyntheticSession = {
      id: payload.sessionId,
      createdAt: now,
      updatedAt: now,
      ideaPrompt: payload.ideaPrompt,
      selectedPersonaIds: payload.synthetics.map((s) => s.id),
      synthetics: payload.synthetics,
      edges: payload.edges,
      transcript: payload.transcript,
      memoryBySyntheticId,
      preparedInputs: payload.preparedInputs ?? createPreparedInputs(),
      resolvedDecisions: payload.preparedInputs?.decisions ?? [],
      intakeQuestions: payload.intakeQuestions ?? [],
      intakeAnswers: payload.intakeAnswers ?? [],
      recommendedSolutions: payload.recommendedSolutions ?? [],
      proposedImprovements: payload.proposedImprovements ?? [],
      provider: payload.provider,
      orchestrator: payload.orchestrator,
      directorOutput: payload.directorOutput ?? null,
      runSummary: payload.runSummary ?? null,
    }

    this.store.sessions.set(session.id, session)
  }

  saveSession(session: SyntheticSession): SyntheticSession {
    const savedSession = {
      ...cloneSession(session),
      updatedAt: new Date().toISOString(),
    }

    this.store.sessions.set(savedSession.id, savedSession)
    return cloneSession(savedSession)
  }

  updateIdeaPrompt(sessionId: string, ideaPrompt: string): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    session.ideaPrompt = ideaPrompt
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  appendTranscriptEntries(
    sessionId: string,
    entries: TranscriptEntry[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session || entries.length === 0) {
      return session ? cloneSession(session) : null
    }

    session.transcript.push(...entries.map((entry) => ({ ...entry })))
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  appendConversationMessage(
    sessionId: string,
    input: Omit<
      SyntheticConversationMessage,
      "id" | "createdAt" | "includeInNextIteration"
    > & {
      includeInNextIteration?: boolean
    },
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    // Auto-initialise for virtual nodes (e.g. IDEA_SYNTHETIC_ID) that are not
    // registered in session.synthetics but still need conversation storage.
    if (!session.memoryBySyntheticId[input.syntheticId]) {
      session.memoryBySyntheticId[input.syntheticId] = createMemoryState()
    }
    const memory = session.memoryBySyntheticId[input.syntheticId]!

    memory.conversation.push({
      ...input,
      id: createMessageId(`msg-${input.syntheticId}`),
      createdAt: new Date().toISOString(),
      includeInNextIteration: input.includeInNextIteration ?? false,
    })
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  setConversationMessageIterationUsage(
    sessionId: string,
    syntheticId: string,
    messageId: string,
    includeInNextIteration: boolean,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const memory = session.memoryBySyntheticId[syntheticId]
    if (!memory) {
      throw new Error(
        `Cannot update conversation message usage. Synthetic "${syntheticId}" does not exist in session "${sessionId}".`,
      )
    }

    const message = memory.conversation.find((entry) => entry.id === messageId)
    if (!message) {
      throw new Error(
        `Cannot update conversation message usage. Message "${messageId}" does not exist for synthetic "${syntheticId}".`,
      )
    }

    message.includeInNextIteration = includeInNextIteration
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  clearConversationIterationUsage(sessionId: string): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    let didChange = false

    Object.values(session.memoryBySyntheticId).forEach((memory) => {
      memory.conversation.forEach((message) => {
        if (message.includeInNextIteration) {
          message.includeInNextIteration = false
          didChange = true
        }
      })
    })

    if (didChange) {
      session.updatedAt = new Date().toISOString()
    }

    return cloneSession(session)
  }

  deleteConversationMessage(
    sessionId: string,
    syntheticId: string,
    messageId: string,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const memory = session.memoryBySyntheticId[syntheticId]
    if (!memory) {
      throw new Error(
        `Cannot delete conversation message. Synthetic "${syntheticId}" does not exist in session "${sessionId}".`,
      )
    }

    const nextConversation = memory.conversation.filter(
      (entry) => entry.id !== messageId,
    )
    if (nextConversation.length === memory.conversation.length) {
      throw new Error(
        `Cannot delete conversation message. Message "${messageId}" does not exist for synthetic "${syntheticId}".`,
      )
    }

    memory.conversation = nextConversation
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  replaceSyntheticOutput(
    sessionId: string,
    syntheticId: string,
    output: SyntheticOutputJson,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const memory = session.memoryBySyntheticId[syntheticId]
    if (!memory) {
      throw new Error(
        `Cannot replace synthetic output. Synthetic "${syntheticId}" does not exist in session "${sessionId}".`,
      )
    }

    memory.latestOutput = { ...output }
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  updateUpstreamContext(
    sessionId: string,
    syntheticId: string,
    upstreamContext: string[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    const memory = session.memoryBySyntheticId[syntheticId]
    if (!memory) {
      throw new Error(
        `Cannot update upstream context. Synthetic "${syntheticId}" does not exist in session "${sessionId}".`,
      )
    }

    memory.upstreamContext = [...upstreamContext]
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  setPreparedInputs(
    sessionId: string,
    preparedInputs: SyntheticPreparedInputs,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    session.preparedInputs = {
      decisions: preparedInputs.decisions.map((decision) => ({ ...decision })),
      clarifications: preparedInputs.clarifications.map((clarification) => ({
        ...clarification,
        answers: clarification.answers.map((answer) => ({ ...answer })),
      })),
    }
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  accumulateResolvedDecisions(
    sessionId: string,
    decisions: SyntheticPreparedInputs["decisions"],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) {
      return null
    }

    if (!session.resolvedDecisions) {
      session.resolvedDecisions = []
    }

    for (const incoming of decisions) {
      // Replace existing entry for same syntheticId+decisionTitle, or append
      const existingIdx = session.resolvedDecisions.findIndex(
        (d) =>
          d.syntheticId === incoming.syntheticId &&
          d.decisionTitle === incoming.decisionTitle,
      )
      if (existingIdx >= 0) {
        session.resolvedDecisions[existingIdx] = { ...incoming }
      } else {
        session.resolvedDecisions.push({ ...incoming })
      }
    }

    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  /**
   * Promotes answered structured clarifications into the permanent intake
   * Q&A store so all subsequent runs see them in buildIntakeContextBlock.
   * Called before runChain so agents in the current run also benefit.
   */
  accumulateIntakeAnswersFromClarifications(
    sessionId: string,
    clarifications: SyntheticPreparedClarification[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null

    const existingQIds = new Set(session.intakeQuestions.map((q) => q.id))
    const answerMap = new Map(session.intakeAnswers.map((a) => [a.questionId, a]))

    for (const clarification of clarifications) {
      for (const answer of clarification.answers) {
        if (!existingQIds.has(answer.questionId)) {
          session.intakeQuestions.push({
            id: answer.questionId,
            question: answer.questionLabel,
            whyItMatters: "",
            required: false,
            suggestedAnswer: null,
            source: "agent",
            syntheticId: clarification.syntheticId,
          })
          existingQIds.add(answer.questionId)
        }
        const existing = answerMap.get(answer.questionId)
        if (existing) {
          existing.answer = answer.answer
          existing.answeredAt = new Date().toISOString()
        } else {
          const newAnswer: SyntheticIntakeAnswer = {
            questionId: answer.questionId,
            answer: answer.answer,
            answeredAt: new Date().toISOString(),
          }
          session.intakeAnswers.push(newAnswer)
          answerMap.set(answer.questionId, newAnswer)
        }
      }
    }

    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  setIntakeQuestions(
    sessionId: string,
    questions: SyntheticIntakeQuestion[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.intakeQuestions = questions.map((q) => ({ ...q }))
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  setIntakeAnswers(
    sessionId: string,
    answers: SyntheticIntakeAnswer[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.intakeAnswers = answers.map((a) => ({ ...a }))
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  resetIntakeForNewIdea(
    sessionId: string,
    newIdeaPrompt: string,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.ideaPrompt = newIdeaPrompt
    session.intakeQuestions = []
    session.intakeAnswers = []
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  setDirectorOutput(
    sessionId: string,
    directorOutput: DirectorOutput,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.directorOutput = directorOutput
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  rebuildGraphWithPersonas(
    sessionId: string,
    selectedPersonaIds: string[],
    synthetics: import("../../planning/types").SyntheticNode[],
    edges: import("../../planning/types").SyntheticEdge[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.selectedPersonaIds = [...selectedPersonaIds]
    session.synthetics = synthetics.map((s) => ({
      ...s,
      layout: { ...s.layout },
      config: { ...s.config },
    }))
    session.edges = edges.map((e) => ({ ...e }))
    // Preserve memory slots where IDs already exist; create empty ones for new synthetics
    const oldMemory = session.memoryBySyntheticId
    session.memoryBySyntheticId = Object.fromEntries(
      synthetics.map((s) => [s.id, oldMemory[s.id] ?? createMemoryState()]),
    )
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  updateEdges(
    sessionId: string,
    edges: import("../../planning/types").SyntheticEdge[],
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.edges = edges.map((e) => ({ ...e }))
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  setRunSummary(
    sessionId: string,
    runSummary: RunSummaryReport,
  ): SyntheticSession | null {
    const session = this.store.sessions.get(sessionId)
    if (!session) return null
    session.runSummary = runSummary
    session.updatedAt = new Date().toISOString()
    return cloneSession(session)
  }

  toPayload(sessionId: string): SyntheticGraphPayload | null {
    const session = this.store.sessions.get(sessionId)
    return session ? toGraphPayload(session) : null
  }
}

export function createDefaultSyntheticBackendDescriptors(): {
  provider: SyntheticBackendDescriptor
  orchestrator: SyntheticBackendDescriptor
} {
  return {
    provider: { ...DEFAULT_PROVIDER },
    orchestrator: { ...DEFAULT_ORCHESTRATOR },
  }
}

export const thinkingGraphRepository = new InMemorySyntheticRepository()
