import { NextResponse } from "next/server"
import { generateRiskProposalText } from "@/lib/thinking-graph/server"

type RiskProposalBody = {
  sessionId?: string
  syntheticId?: string
  riskDescription?: string
  currentRisk?: number
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RiskProposalBody

    if (!body.sessionId || !body.syntheticId || !body.riskDescription || body.currentRisk === undefined) {
      return NextResponse.json(
        { error: "sessionId, syntheticId, riskDescription, and currentRisk are required." },
        { status: 400 },
      )
    }

    const proposal = await generateRiskProposalText({
      sessionId: body.sessionId,
      syntheticId: body.syntheticId,
      riskDescription: body.riskDescription,
      currentRisk: body.currentRisk,
    })

    return NextResponse.json({ proposal })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate risk proposal.",
      },
      { status: 500 },
    )
  }
}
