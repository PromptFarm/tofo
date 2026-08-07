import { NextResponse } from "next/server"

import {
  chatWithThinkingGraphSynthetic,
  deleteThinkingGraphChatMessage,
  setThinkingGraphChatMessageIterationUsage,
  getThinkingGraphChatHistory,
} from "@/lib/thinking-graph/server"

type ChatRequestBody = {
  sessionId?: string
  ideaPrompt?: string
  syntheticId?: string
  userMessage?: string
  messageId?: string
  includeInNextIteration?: boolean
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("sessionId")
    const syntheticId = searchParams.get("syntheticId")
    if (!sessionId || !syntheticId) {
      return NextResponse.json({ error: "sessionId and syntheticId are required." }, { status: 400 })
    }
    const messages = await getThinkingGraphChatHistory({ sessionId, syntheticId })
    return NextResponse.json({ messages })
  } catch {
    return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody
    if (typeof body.syntheticId !== "string" || body.syntheticId.trim().length === 0) {
      return NextResponse.json(
        { error: "syntheticId is required." },
        { status: 400 },
      )
    }

    if (typeof body.userMessage !== "string" || body.userMessage.trim().length === 0) {
      return NextResponse.json(
        { error: "userMessage is required." },
        { status: 400 },
      )
    }

    const payload = await chatWithThinkingGraphSynthetic({
      sessionId: body.sessionId,
      ideaPrompt: body.ideaPrompt,
      syntheticId: body.syntheticId.trim(),
      userMessage: body.userMessage.trim(),
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to chat with thinking graph synthetic.",
      },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody
    if (typeof body.sessionId !== "string" || body.sessionId.trim().length === 0) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 })
    }
    if (typeof body.syntheticId !== "string" || body.syntheticId.trim().length === 0) {
      return NextResponse.json({ error: "syntheticId is required." }, { status: 400 })
    }
    if (typeof body.messageId !== "string" || body.messageId.trim().length === 0) {
      return NextResponse.json({ error: "messageId is required." }, { status: 400 })
    }
    if (typeof body.includeInNextIteration !== "boolean") {
      return NextResponse.json(
        { error: "includeInNextIteration is required." },
        { status: 400 },
      )
    }

    const payload = await setThinkingGraphChatMessageIterationUsage({
      sessionId: body.sessionId.trim(),
      syntheticId: body.syntheticId.trim(),
      messageId: body.messageId.trim(),
      includeInNextIteration: body.includeInNextIteration,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update thinking graph chat context usage.",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody
    if (typeof body.sessionId !== "string" || body.sessionId.trim().length === 0) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 })
    }
    if (typeof body.syntheticId !== "string" || body.syntheticId.trim().length === 0) {
      return NextResponse.json({ error: "syntheticId is required." }, { status: 400 })
    }
    if (typeof body.messageId !== "string" || body.messageId.trim().length === 0) {
      return NextResponse.json({ error: "messageId is required." }, { status: 400 })
    }

    const payload = await deleteThinkingGraphChatMessage({
      sessionId: body.sessionId.trim(),
      syntheticId: body.syntheticId.trim(),
      messageId: body.messageId.trim(),
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete thinking graph chat message.",
      },
      { status: 500 },
    )
  }
}
