import { NextResponse } from "next/server"

import {
  runDirectorPhase,
  confirmDirectorPhase,
} from "@/lib/thinking-graph/server/service"
import type { SyntheticIntakeAnswer } from "@/lib/thinking-graph/server/types"

type DirectorRunRequestBody = {
  sessionId: string
  ideaPrompt: string
}

type DirectorConfirmRequestBody = {
  sessionId: string
  confirmedPersonaIds: string[]
  intakeAnswers?: SyntheticIntakeAnswer[]
}

// POST /api/thinking-graph/director
// Streams Director LLM analysis, then sends a final JSON line with the payload.
// Each line: { type: "delta", text: "..." } | { type: "done", payload: ... } | { type: "error", error: "..." }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DirectorRunRequestBody
    if (!body.sessionId?.trim() || !body.ideaPrompt?.trim()) {
      return NextResponse.json(
        { error: "sessionId and ideaPrompt are required." },
        { status: 400 },
      )
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const payload = await runDirectorPhase({
            sessionId: body.sessionId,
            ideaPrompt: body.ideaPrompt,
            onTextDelta: (delta) => {
              // Best-effort UI progress — a dead/disconnected client must not
              // abort the director phase itself.
              try {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: "delta", text: delta }) + "\n",
                  ),
                )
              } catch {
                // controller already closed — client gone, keep running server-side
              }
            },
          })
          try {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "done", payload }) + "\n",
              ),
            )
          } catch {
            // controller already closed
          }
        } catch (err) {
          try {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "error",
                  error: err instanceof Error ? err.message : "Director phase failed.",
                }) + "\n",
              ),
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
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Director phase failed.",
      },
      { status: 500 },
    )
  }
}

// PATCH /api/thinking-graph/director
// Confirms persona selection and rebuilds the graph.
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as DirectorConfirmRequestBody
    if (
      !body.sessionId?.trim() ||
      !Array.isArray(body.confirmedPersonaIds)
    ) {
      return NextResponse.json(
        { error: "sessionId and confirmedPersonaIds are required." },
        { status: 400 },
      )
    }

    const payload = await confirmDirectorPhase({
      sessionId: body.sessionId,
      confirmedPersonaIds: body.confirmedPersonaIds,
      intakeAnswers: body.intakeAnswers,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Director confirmation failed.",
      },
      { status: 500 },
    )
  }
}

