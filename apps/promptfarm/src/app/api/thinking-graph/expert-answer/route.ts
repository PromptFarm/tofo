import { NextResponse } from "next/server"

import {
  generateExpertAnswerWithAssessment,
} from "@/lib/thinking-graph/server"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId: string
      syntheticId: string
      syntheticName: string
      question: string
      whyItMatters: string
    }

    const { sessionId, syntheticId, syntheticName, question, whyItMatters } = body

    if (!sessionId || !syntheticId || !syntheticName || !question) {
      return NextResponse.json(
        { error: "sessionId, syntheticId, syntheticName, and question are required." },
        { status: 400 },
      )
    }

    const result = await generateExpertAnswerWithAssessment({
      sessionId,
      syntheticId,
      syntheticName,
      question,
      whyItMatters: whyItMatters || "",
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate expert answer.",
      },
      { status: 500 },
    )
  }
}
