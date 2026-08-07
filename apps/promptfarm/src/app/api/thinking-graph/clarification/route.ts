import { NextResponse } from "next/server"
import { appendThinkingGraphClarificationAnswer } from "@/lib/thinking-graph/server"

type ClarificationAnswerBody = {
  sessionId: string
  syntheticId: string
  syntheticName: string
  questionId: string
  questionLabel: string
  answer: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ClarificationAnswerBody

    if (
      !body.sessionId ||
      !body.syntheticId ||
      !body.syntheticName ||
      !body.questionId ||
      !body.questionLabel ||
      !body.answer?.trim()
    ) {
      return NextResponse.json(
        { error: "sessionId, syntheticId, syntheticName, questionId, questionLabel and answer are required." },
        { status: 400 },
      )
    }

    const payload = await appendThinkingGraphClarificationAnswer({
      sessionId: body.sessionId,
      syntheticId: body.syntheticId,
      syntheticName: body.syntheticName,
      questionId: body.questionId,
      questionLabel: body.questionLabel,
      answer: body.answer.trim(),
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save clarification answer." },
      { status: 500 },
    )
  }
}

