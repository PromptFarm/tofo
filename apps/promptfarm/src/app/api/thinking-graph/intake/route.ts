import { NextResponse } from "next/server"

import { streamIntakeQuestionsForSession, saveIntakeAnswers } from "@/lib/thinking-graph/server/service"
import type { SyntheticIntakeAnswer } from "@/lib/thinking-graph/server/types"

type IntakeBuildRequestBody = {
  sessionId: string
  ideaPrompt: string
}

type IntakeAnswersRequestBody = {
  sessionId: string
  answers: SyntheticIntakeAnswer[]
}

// POST /api/thinking-graph/intake
// Streams LLM token deltas, then sends a final JSON line with questions.
// Each line is a JSON object:
//   { type: "delta", text: "..." }   — raw LLM token
//   { type: "done", questions: [...] } — final parsed questions
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IntakeBuildRequestBody
    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 })
    }
    if (typeof body.ideaPrompt !== "string" || !body.ideaPrompt.trim()) {
      return NextResponse.json({ error: "ideaPrompt is required." }, { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const questions = await streamIntakeQuestionsForSession({
            sessionId: body.sessionId,
            ideaPrompt: body.ideaPrompt,
            onTextDelta: (delta) => {
              // Best-effort UI progress — a dead/disconnected client must not
              // abort the intake generation itself.
              try {
                controller.enqueue(
                  encoder.encode(JSON.stringify({ type: "delta", text: delta }) + "\n"),
                )
              } catch {
                // controller already closed — client gone, keep running server-side
              }
            },
          })
          try {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "done", questions }) + "\n"),
            )
          } catch {
            // controller already closed
          }
        } catch (err) {
          try {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "error", error: err instanceof Error ? err.message : "Failed." }) + "\n",
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
      { error: error instanceof Error ? error.message : "Failed to build intake questions." },
      { status: 500 },
    )
  }
}

// PATCH /api/thinking-graph/intake
// Saves user answers to intake questions.
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as IntakeAnswersRequestBody
    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 })
    }
    if (!Array.isArray(body.answers)) {
      return NextResponse.json({ error: "answers must be an array." }, { status: 400 })
    }

    const payload = await saveIntakeAnswers({
      sessionId: body.sessionId,
      answers: body.answers,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save intake answers." },
      { status: 500 },
    )
  }
}
