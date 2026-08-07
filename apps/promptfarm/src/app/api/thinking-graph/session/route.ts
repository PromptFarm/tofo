import { NextResponse } from "next/server"

import {
  getOrCreateThinkingGraphSession,
  isSyntheticPreparedInputs,
  updateThinkingGraphPreparedInputs,
  appendRecommendedSolution,
  appendProposedImprovement,
  deleteProposedImprovement,
} from "@/lib/thinking-graph/server"
import { iterationLog } from "@/lib/thinking-graph/server/profiling"
import { getProjectIdForSession, saveProjectSession } from "@/lib/db-client"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("sessionId") ?? undefined
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required for GET. Use POST to create a session." },
        { status: 400 },
      )
    }

    const payload = await getOrCreateThinkingGraphSession({
      sessionId,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load thinking graph session.",
      },
      { status: 500 },
    )
  }
}

type SessionPostBody = {
  sessionId?: string
  ideaPrompt?: string
  selectedPersonaIds?: string[]
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionPostBody
    const ideaPrompt =
      typeof body.ideaPrompt === "string" ? body.ideaPrompt : undefined
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.trim().length > 0
        ? body.sessionId
        : undefined
    const selectedPersonaIds =
      Array.isArray(body.selectedPersonaIds) &&
      body.selectedPersonaIds.every((id) => typeof id === "string")
        ? (body.selectedPersonaIds as string[])
        : undefined

    const payload = await getOrCreateThinkingGraphSession({
      sessionId,
      ideaPrompt,
      selectedPersonaIds,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create thinking graph session.",
      },
      { status: 500 },
    )
  }
}

type SessionPatchBody = {
  sessionId?: string
  preparedInputs?: unknown
  sessionPayload?: unknown
  recommendedSolution?: {
    syntheticId: string
    syntheticName: string
    riskDescription: string
    solution: string
    priorRisk?: number
  }
  proposedImprovement?: {
    syntheticId: string
    syntheticName: string
    riskDescription: string
    proposal: string
    priorRisk: number
  }
  deleteProposedImprovement?: {
    improvementId: string
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as SessionPatchBody
    if (typeof body.sessionId !== "string" || body.sessionId.trim().length === 0) {
      return NextResponse.json({ error: "sessionId is required." }, { status: 400 })
    }

    if (body.proposedImprovement) {
      const imp = body.proposedImprovement
      if (!imp.syntheticId || !imp.syntheticName || !imp.riskDescription || !imp.proposal || imp.priorRisk === undefined) {
        return NextResponse.json(
          { error: "proposedImprovement must have syntheticId, syntheticName, riskDescription, proposal, and priorRisk." },
          { status: 400 },
        )
      }

      const payload = await appendProposedImprovement({
        sessionId: body.sessionId,
        syntheticId: imp.syntheticId,
        syntheticName: imp.syntheticName,
        riskDescription: imp.riskDescription,
        proposal: imp.proposal,
        priorRisk: imp.priorRisk,
      })

      console.log("[PATCH proposedImprovement] payload before JSON:", {
        hasProposedImprovements: "proposedImprovements" in payload,
        proposedImprovementsLength: payload.proposedImprovements?.length,
      })

      // Save to DB so it persists across page reloads and other devices
      const projectId = await getProjectIdForSession("", body.sessionId)
      if (projectId) {
        await saveProjectSession("", projectId, payload)
      }

      const response = NextResponse.json(payload)
      console.log("[PATCH proposedImprovement] response headers:", response.headers)
      return response
    }

    if (body.deleteProposedImprovement) {
      const del = body.deleteProposedImprovement
      if (!del.improvementId) {
        return NextResponse.json(
          { error: "deleteProposedImprovement must have improvementId." },
          { status: 400 },
        )
      }

      const payload = await deleteProposedImprovement({
        sessionId: body.sessionId,
        improvementId: del.improvementId,
      })

      // Save to DB so it persists across page reloads and other devices
      const projectId = await getProjectIdForSession("", body.sessionId)
      if (projectId) {
        await saveProjectSession("", projectId, payload)
      }

      return NextResponse.json(payload)
    }

    if (body.recommendedSolution) {
      const sol = body.recommendedSolution
      if (!sol.syntheticId || !sol.syntheticName || !sol.riskDescription || !sol.solution) {
        return NextResponse.json(
          { error: "recommendedSolution must have syntheticId, syntheticName, riskDescription, and solution." },
          { status: 400 },
        )
      }

      const payload = await appendRecommendedSolution({
        sessionId: body.sessionId,
        syntheticId: sol.syntheticId,
        syntheticName: sol.syntheticName,
        riskDescription: sol.riskDescription,
        solution: sol.solution,
        priorRisk: sol.priorRisk,
      })

      return NextResponse.json(payload)
    }

    if (!isSyntheticPreparedInputs(body.preparedInputs)) {
      return NextResponse.json(
        { error: "preparedInputs must match the thinking graph contract." },
        { status: 400 },
      )
    }

    iterationLog("session_patch_prepared_inputs", {
      sessionId: body.sessionId,
      preparedInputs: body.preparedInputs,
    })

    const payload = await updateThinkingGraphPreparedInputs({
      sessionId: body.sessionId,
      preparedInputs: body.preparedInputs,
      sessionPayload: body.sessionPayload,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update thinking graph session.",
      },
      { status: 500 },
    )
  }
}
