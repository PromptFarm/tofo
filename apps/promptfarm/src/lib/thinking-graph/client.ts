import type {
  ThinkingGraphChatProgressEvent,
  SyntheticGraphPayload,
  SyntheticIntakeAnswer,
  SyntheticIntakeQuestion,
  SyntheticOutputJson,
  SyntheticPreparedInputs,
  ThinkingGraphRunProgressEvent,
  ProjectSpec,
} from "@/lib/thinking-graph/server/types"
import type { SyntheticEdge } from "@/lib/planning/types"

type ErrorPayload = {
  error?: string
}

type RunRequest = {
  sessionId?: string
  projectId?: string | null
  ideaPrompt: string
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
  edges?: SyntheticEdge[]
}

type ChatRequest = {
  sessionId?: string
  ideaPrompt?: string
  syntheticId: string
  userMessage: string
}

type ChatMessageMutationRequest = {
  sessionId: string
  syntheticId: string
  messageId: string
}

type SessionPreparedInputsMutationRequest = {
  sessionId: string
  preparedInputs: SyntheticPreparedInputs
  sessionPayload?: SyntheticGraphPayload
}

type FetchSessionInput = {
  sessionId?: string
  ideaPrompt?: string
  selectedPersonaIds?: string[]
}

export type ProjectFileSummary = {
  id: string
  projectId: string
  originalName: string
  contentType: string
  sizeBytes: number
  includeInContext: boolean
  createdAt: string
  updatedAt: string
}

function getBrowserProjectIdFallback(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("projectId");
}

function withBrowserProjectIdFallback(input: RunRequest): RunRequest {
  return {
    ...input,
    projectId: input.projectId ?? getBrowserProjectIdFallback(),
  };
}

async function parsePayload(
  response: Response,
  fallbackMessage: string,
): Promise<SyntheticGraphPayload> {
  const payload = (await response.json()) as SyntheticGraphPayload | ErrorPayload

  if (!response.ok) {
    throw new Error(
      "error" in payload && typeof payload.error === "string"
        ? payload.error
        : fallbackMessage,
    )
  }

  return payload as SyntheticGraphPayload
}

async function parseErrorResponse(
  response: Response,
  fallbackMessage: string,
): Promise<never> {
  const payload = (await response.json().catch(() => null)) as
    | ErrorPayload
    | null

  throw new Error(
    payload?.error && typeof payload.error === "string"
      ? payload.error
      : fallbackMessage,
  )
}

export async function fetchThinkingGraphSession(
  input?: FetchSessionInput,
): Promise<SyntheticGraphPayload> {
  if (input?.ideaPrompt !== undefined) {
    const response = await fetch("/api/thinking-graph/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: input.sessionId,
        ideaPrompt: input.ideaPrompt,
        selectedPersonaIds: input.selectedPersonaIds,
      }),
    })

    return parsePayload(response, "Failed to create thinking graph session.")
  }

  const params = new URLSearchParams()
  if (input?.sessionId) {
    params.set("sessionId", input.sessionId)
  }

  const response = await fetch(
    `/api/thinking-graph/session${params.toString() ? `?${params.toString()}` : ""}`,
    {
      method: "GET",
    },
  )

  return parsePayload(response, "Failed to load thinking graph session.")
}

export async function saveProjectThinkingGraphSession(
  projectId: string,
  payload: SyntheticGraphPayload,
) {
  const response = await fetch(`/api/projects/${projectId}/session`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  })

  if (!response.ok) {
    return parseErrorResponse(response, "Failed to save project session.")
  }

  return response.json()
}

export async function listProjectFiles(projectId: string): Promise<ProjectFileSummary[]> {
  const response = await fetch(`/api/projects/${projectId}/files`, {
    method: "GET",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null
    throw new Error(payload?.error ?? "Failed to load project files.")
  }

  const payload = (await response.json()) as { files: ProjectFileSummary[] }
  return payload.files
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
): Promise<ProjectFileSummary> {
  const formData = new FormData()
  formData.set("file", file)

  const response = await fetch(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null
    throw new Error(payload?.error ?? "Failed to upload project file.")
  }

  const payload = (await response.json()) as { file: ProjectFileSummary }
  return payload.file
}

export async function deleteProjectFile(
  projectId: string,
  fileId: string,
): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorPayload | null
    throw new Error(payload?.error ?? "Failed to delete project file.")
  }
}

export async function updateThinkingGraphPreparedInputs(
  input: SessionPreparedInputsMutationRequest,
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/session", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parsePayload(response, "Failed to update prepared thinking graph inputs.")
}

export async function runThinkingGraphSession(
  input: RunRequest,
): Promise<SyntheticGraphPayload> {
  const body = withBrowserProjectIdFallback(input);
  if (process.env.NODE_ENV !== "production") {
    console.log("[project-files][client-run-context]", {
      projectId: body.projectId ?? null,
      sessionId: body.sessionId ?? null,
    });
  }

  const response = await fetch("/api/thinking-graph/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  return parsePayload(response, "Thinking graph run failed.")
}

export async function streamThinkingGraphSession(
  input: RunRequest,
  onEvent?: (event: ThinkingGraphRunProgressEvent) => void,
): Promise<SyntheticGraphPayload> {
  const body = withBrowserProjectIdFallback(input);
  if (process.env.NODE_ENV !== "production") {
    console.log("[project-files][client-run-context]", {
      projectId: body.projectId ?? null,
      sessionId: body.sessionId ?? null,
    });
  }

  const response = await fetch("/api/thinking-graph/run/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    return parseErrorResponse(response, "Thinking graph streamed run failed.")
  }

  if (!response.body) {
    throw new Error("Thinking graph streamed run did not return a readable body.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finalPayload: SyntheticGraphPayload | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      const event = JSON.parse(trimmed) as ThinkingGraphRunProgressEvent
      onEvent?.(event)

      if (event.type === "run_failed") {
        throw new Error(event.error)
      }

      if (event.type === "run_completed") {
        finalPayload = event.payload
      }
    }
  }

  if (buffer.trim().length > 0) {
    const event = JSON.parse(buffer) as ThinkingGraphRunProgressEvent
    onEvent?.(event)
    if (event.type === "run_failed") {
      throw new Error(event.error)
    }
    if (event.type === "run_completed") {
      finalPayload = event.payload
    }
  }

  if (!finalPayload) {
    throw new Error("Thinking graph streamed run completed without a final payload.")
  }

  return finalPayload
}

export async function chatWithThinkingGraphSynthetic(
  input: ChatRequest,
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parsePayload(response, "Thinking graph chat failed.")
}

export async function streamThinkingGraphChat(
  input: ChatRequest,
  onEvent?: (event: ThinkingGraphChatProgressEvent) => void,
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    return parseErrorResponse(response, "Thinking graph chat stream failed.")
  }

  if (!response.body) {
    throw new Error("Thinking graph chat stream did not return a readable body.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finalPayload: SyntheticGraphPayload | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      const event = JSON.parse(trimmed) as ThinkingGraphChatProgressEvent
      onEvent?.(event)

      if (event.type === "chat_failed") {
        throw new Error(event.error)
      }

      if (event.type === "chat_completed") {
        finalPayload = event.payload
      }
    }
  }

  if (buffer.trim().length > 0) {
    const event = JSON.parse(buffer) as ThinkingGraphChatProgressEvent
    onEvent?.(event)
    if (event.type === "chat_failed") {
      throw new Error(event.error)
    }
    if (event.type === "chat_completed") {
      finalPayload = event.payload
    }
  }

  if (!finalPayload) {
    throw new Error("Thinking graph chat stream completed without a final payload.")
  }

  return finalPayload
}

export async function setThinkingGraphChatMessageIterationUsage(
  input: ChatMessageMutationRequest & {
    includeInNextIteration: boolean
  },
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/chat", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parsePayload(response, "Failed to update chat iteration usage.")
}

export async function buildThinkingGraphSpec(
  sessionId: string,
): Promise<ProjectSpec> {
  const response = await fetch("/api/thinking-graph/spec", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(
      payload?.error && typeof payload.error === "string"
        ? payload.error
        : "Failed to build project spec.",
    )
  }

  return response.json() as Promise<ProjectSpec>
}

export async function streamThinkingGraphIdeaChat(
  input: { sessionId?: string; ideaPrompt?: string; userMessage: string },
  onEvent?: (event: ThinkingGraphChatProgressEvent) => void,
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/idea-chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    return parseErrorResponse(response, "Thinking graph idea chat stream failed.")
  }

  if (!response.body) {
    throw new Error("Thinking graph idea chat stream did not return a readable body.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finalPayload: SyntheticGraphPayload | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const event = JSON.parse(trimmed) as ThinkingGraphChatProgressEvent
      onEvent?.(event)

      if (event.type === "chat_failed") throw new Error(event.error)
      if (event.type === "chat_completed") finalPayload = event.payload
    }
  }

  if (buffer.trim().length > 0) {
    const event = JSON.parse(buffer) as ThinkingGraphChatProgressEvent
    onEvent?.(event)
    if (event.type === "chat_failed") throw new Error(event.error)
    if (event.type === "chat_completed") finalPayload = event.payload
  }

  if (!finalPayload) {
    throw new Error("Thinking graph idea chat stream completed without a final payload.")
  }

  return finalPayload
}

export async function appendThinkingGraphClarification(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  questionId: string
  questionLabel: string
  answer: string
}): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/clarification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return parsePayload(response, "Failed to save clarification answer.")
}

export async function deleteThinkingGraphChatMessage(
  input: ChatMessageMutationRequest,
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/chat", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parsePayload(response, "Failed to delete chat message.")
}

export async function streamThinkingGraphIntakeQuestions(
  input: { sessionId: string; ideaPrompt: string },
  onTextDelta: (delta: string) => void,
): Promise<SyntheticIntakeQuestion[]> {
  const response = await fetch("/api/thinking-graph/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok || !response.body) {
    return parseErrorResponse(response, "Failed to build intake questions.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let questions: SyntheticIntakeQuestion[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const event = JSON.parse(trimmed) as
        | { type: "delta"; text: string }
        | { type: "done"; questions: SyntheticIntakeQuestion[] }
        | { type: "error"; error: string }
      if (event.type === "delta") {
        onTextDelta(event.text)
      } else if (event.type === "done") {
        questions = event.questions ?? []
      } else if (event.type === "error") {
        throw new Error(event.error)
      }
    }
  }

  return questions
}

export async function saveThinkingGraphIntakeAnswers(input: {
  sessionId: string
  answers: SyntheticIntakeAnswer[]
}): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/intake", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  return parsePayload(response, "Failed to save intake answers.")
}

type DirectorEvent =
  | { type: "delta"; text: string }
  | { type: "done"; payload: SyntheticGraphPayload }
  | { type: "error"; error: string }

export async function streamThinkingGraphDirector(
  input: { sessionId: string; ideaPrompt: string },
  onEvent?: (event: DirectorEvent) => void,
): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/director", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok || !response.body) {
    return parseErrorResponse(response, "Director phase failed.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finalPayload: SyntheticGraphPayload | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const event = JSON.parse(trimmed) as DirectorEvent
      onEvent?.(event)
      if (event.type === "error") throw new Error(event.error)
      if (event.type === "done") finalPayload = event.payload
    }
  }

  if (buffer.trim().length > 0) {
    const event = JSON.parse(buffer.trim()) as DirectorEvent
    onEvent?.(event)
    if (event.type === "error") throw new Error(event.error)
    if (event.type === "done") finalPayload = event.payload
  }

  if (!finalPayload) {
    throw new Error("Director phase completed without a final payload.")
  }
  return finalPayload
}

export async function confirmThinkingGraphDirector(input: {
  sessionId: string
  confirmedPersonaIds: string[]
  intakeAnswers?: SyntheticIntakeAnswer[]
}): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/director", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return parsePayload(response, "Director confirmation failed.")
}

export async function fetchRunOutputs(
  projectId: string,
  runId: string,
): Promise<Record<string, SyntheticOutputJson | null>> {
  const response = await fetch(
    `/api/projects/${projectId}/session/runs/${runId}/outputs`,
    { method: "GET" },
  )
  if (!response.ok) {
    throw new Error("Failed to load run outputs.")
  }
  const data = (await response.json()) as { outputs: Record<string, SyntheticOutputJson | null> }
  return data.outputs
}

export async function generateRiskProposal(input: {
  sessionId: string
  syntheticId: string
  riskDescription: string
  currentRisk: number
}): Promise<string> {
  const response = await fetch("/api/thinking-graph/risk-proposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error("Failed to generate risk proposal.")
  }
  const data = (await response.json()) as { proposal: string }
  return data.proposal
}

export async function appendProposedImprovement(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  riskDescription: string
  proposal: string
  priorRisk: number
}): Promise<SyntheticGraphPayload> {
  console.log("[appendProposedImprovement] Sending request:", input)
  const response = await fetch("/api/thinking-graph/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      proposedImprovement: {
        syntheticId: input.syntheticId,
        syntheticName: input.syntheticName,
        riskDescription: input.riskDescription,
        proposal: input.proposal,
        priorRisk: input.priorRisk,
      },
    }),
  })

  console.log("[appendProposedImprovement] Raw response status:", response.status)
  const rawData = await response.clone().json()
  console.log("[appendProposedImprovement] Raw response JSON:", rawData)

  const payload = await parsePayload(response, "Failed to save proposed improvement.")
  console.log("[appendProposedImprovement] After parsePayload - proposedImprovements:", payload.proposedImprovements)
  return payload
}

export async function deleteProposedImprovement(input: {
  sessionId: string
  improvementId: string
}): Promise<SyntheticGraphPayload> {
  const response = await fetch("/api/thinking-graph/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: input.sessionId,
      deleteProposedImprovement: {
        improvementId: input.improvementId,
      },
    }),
  })

  return parsePayload(response, "Failed to delete proposed improvement.")
}

export async function generateExpertAnswer(input: {
  sessionId: string
  syntheticId: string
  syntheticName: string
  question: string
  whyItMatters?: string
}): Promise<{ answer: string; improvementEstimate: number }> {
  const response = await fetch("/api/thinking-graph/expert-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || "Failed to generate expert answer")
  }

  return response.json()
}
