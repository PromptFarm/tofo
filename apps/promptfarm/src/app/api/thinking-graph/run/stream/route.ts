import {
  runThinkingGraphSessionWithProgress,
  type ThinkingGraphRunProgressEvent,
} from "@/lib/thinking-graph/server"
import { iterationLog } from "@/lib/thinking-graph/server/profiling"
import { requireAppUser } from "@/lib/auth"
import { getProjectIdForSession } from "@/lib/db-client"
import { buildProjectFilesContext } from "@/lib/project-file-context"

export const maxDuration = 300
import type { SyntheticEdge } from "@/lib/planning/types"

function parseSyntheticEdges(raw: unknown): SyntheticEdge[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const edges: SyntheticEdge[] = []
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).from === "string" &&
      typeof (item as Record<string, unknown>).to === "string" &&
      typeof (item as Record<string, unknown>).type === "string"
    ) {
      const e = item as Record<string, unknown>
      edges.push({
        id: e.id as string,
        from: e.from as string,
        to: e.to as string,
        type: e.type as SyntheticEdge["type"],
        sourceHandle: typeof e.sourceHandle === "string" ? e.sourceHandle : undefined,
        targetHandle: typeof e.targetHandle === "string" ? e.targetHandle : undefined,
      })
    }
  }
  return edges.length > 0 ? edges : undefined
}

type RunRequestBody = {
  sessionId?: string
  projectId?: string | null
  ideaPrompt?: string
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
  edges?: unknown
}

function encodeEvent(
  encoder: TextEncoder,
  event: ThinkingGraphRunProgressEvent,
): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`)
}

export async function POST(request: Request) {
  const user = await requireAppUser()

  const body = (await request.json()) as RunRequestBody
  if (typeof body.ideaPrompt !== "string" || body.ideaPrompt.trim().length === 0) {
    return new Response(
      JSON.stringify({
        type: "run_failed",
        error: "ideaPrompt is required.",
      } satisfies ThinkingGraphRunProgressEvent),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }

  iterationLog("run_stream_request", {
    sessionId: body.sessionId,
    projectId: body.projectId,
    ideaPromptPreview: body.ideaPrompt?.slice(0, 500),
    rerunMode: body.rerunMode,
    dirtySyntheticIds: body.dirtySyntheticIds,
  });

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const projectId =
          body.projectId ??
          (await getProjectIdForSession(user.id, body.sessionId));
        const projectFilesContext = await buildProjectFilesContext({
          userId: user.id,
          projectId,
        })
        if (process.env.NODE_ENV !== "production") {
          console.log("[project-files][context]", {
            projectId: projectId ?? null,
            contextChars: projectFilesContext?.length ?? 0,
          })
        }
        await runThinkingGraphSessionWithProgress({
          sessionId: body.sessionId,
          ideaPrompt: body.ideaPrompt!.trim(),
          projectFilesContext,
          rerunMode: body.rerunMode,
          targetSyntheticId: body.targetSyntheticId,
          dirtySyntheticIds: body.dirtySyntheticIds,
          edges: parseSyntheticEdges(body.edges),
          userId: user.id,
          projectId,
          onProgress: async (event) => {
            // Best-effort UI progress — a dead/disconnected client must not
            // abort the run itself (this previously surfaced as a misleading
            // "LLM call failed" error when the real LLM call had succeeded).
            try {
              controller.enqueue(encodeEvent(encoder, event))
            } catch (enqueueError) {
              console.warn(
                `[run-stream] dropped progress event (controller closed): type=${event.type}`,
                enqueueError,
              )
            }
          },
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to run thinking graph session."
        console.error("[run-stream] run failed:", msg, error)
        try {
          controller.enqueue(
            encodeEvent(encoder, {
              type: "run_failed",
              sessionId: body.sessionId,
              error: msg,
            }),
          )
        } catch {
          // controller already closed/cancelled — client disconnected
        }
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  })
}
