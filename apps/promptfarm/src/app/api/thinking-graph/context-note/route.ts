import { NextResponse } from "next/server"
import { persistChatMessage } from "@/lib/db-client"
import { thinkingGraphRepository } from "@/lib/thinking-graph/server/repository"

type ContextNoteBody = {
  sessionId: string
  syntheticId: string
  text: string
  role?: "user" | "synthetic" | "system"
  includeInNextIteration?: boolean
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContextNoteBody
    if (!body.sessionId || !body.syntheticId || !body.text) {
      return NextResponse.json({ error: "sessionId, syntheticId and text are required." }, { status: 400 })
    }

    const messageId = `ctx-${body.syntheticId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const createdAt = new Date().toISOString()

    await persistChatMessage(body.sessionId, {
      syntheticId: body.syntheticId,
      messageId,
      role: body.role ?? "user",
      text: body.text,
      includeInNextIteration: body.includeInNextIteration ?? true,
      createdAt,
    })

    // Keep the in-memory repository in sync so the next run (if already
    // loaded in this process) picks up the message without a DB round-trip.
    thinkingGraphRepository.appendConversationMessage(body.sessionId, {
      syntheticId: body.syntheticId,
      role: body.role ?? "user",
      text: body.text,
      includeInNextIteration: body.includeInNextIteration ?? true,
    })

    return NextResponse.json({ ok: true, messageId, createdAt })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save context note." },
      { status: 500 },
    )
  }
}
