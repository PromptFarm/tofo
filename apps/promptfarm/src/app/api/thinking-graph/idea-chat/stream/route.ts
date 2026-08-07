import {
  streamChatWithIdeaSession,
  type ThinkingGraphChatProgressEvent,
} from "@/lib/thinking-graph/server"

type IdeaChatRequestBody = {
  sessionId?: string
  ideaPrompt?: string
  userMessage?: string
}

function encodeEvent(event: ThinkingGraphChatProgressEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`)
}

export async function POST(request: Request) {
  const body = (await request.json()) as IdeaChatRequestBody

  if (typeof body.userMessage !== "string" || body.userMessage.trim().length === 0) {
    return new Response(JSON.stringify({ error: "userMessage is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamChatWithIdeaSession({
          sessionId: body.sessionId,
          ideaPrompt: body.ideaPrompt,
          userMessage: body.userMessage!.trim(),
          onProgress: async (event) => {
            // Best-effort UI progress — a dead/disconnected client must not
            // abort the chat call itself.
            try {
              controller.enqueue(encodeEvent(event))
            } catch {
              // controller already closed — client gone, keep running server-side
            }
          },
        })
      } catch (error) {
        try {
          controller.enqueue(
            encodeEvent({
              type: "chat_failed",
              sessionId: body.sessionId,
              syntheticId: "__idea__",
              error:
                error instanceof Error
                  ? error.message
                  : "Idea chat stream failed.",
            }),
          )
        } catch {
          // controller already closed
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
      Connection: "keep-alive",
    },
  })
}

