import { NextResponse } from "next/server"

import { buildThinkingGraphSpec } from "@/lib/thinking-graph/server"

type SpecRequestBody = {
  sessionId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SpecRequestBody
    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 },
      )
    }

    const projectSpec = await buildThinkingGraphSpec({ sessionId: body.sessionId })
    return NextResponse.json(projectSpec)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build project spec.",
      },
      { status: 500 },
    )
  }
}
