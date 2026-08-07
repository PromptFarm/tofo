import { NextResponse } from "next/server"

import { requireAppUser } from "@/lib/auth"
import { buildProjectFilesContext } from "@/lib/project-file-context"
import { getProjectIdForSession } from "@/lib/db-client"
import { runThinkingGraphSession } from "@/lib/thinking-graph/server"

type RunRequestBody = {
  sessionId?: string
  projectId?: string | null
  ideaPrompt?: string
  rerunMode?: "full" | "single_node" | "from_node_downstream"
  targetSyntheticId?: string
  dirtySyntheticIds?: string[]
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser()
    const body = (await request.json()) as RunRequestBody
    if (typeof body.ideaPrompt !== "string" || body.ideaPrompt.trim().length === 0) {
      return NextResponse.json(
        { error: "ideaPrompt is required." },
        { status: 400 },
      )
    }

    const projectId =
      body.projectId ??
      (await getProjectIdForSession(user.id, body.sessionId));
    const projectFilesContext = await buildProjectFilesContext({
      userId: user.id,
      projectId,
    })
    if (process.env.NODE_ENV !== "production") {
      console.log("[project-files][context]", {
        projectId: projectId ?? null,
        contextChars: projectFilesContext?.length ?? 0,
      })
    }

    const payload = await runThinkingGraphSession({
      sessionId: body.sessionId,
      ideaPrompt: body.ideaPrompt.trim(),
      projectFilesContext,
      rerunMode: body.rerunMode,
      targetSyntheticId: body.targetSyntheticId,
      dirtySyntheticIds: body.dirtySyntheticIds,
    })

    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run thinking graph session.",
      },
      { status: 500 },
    )
  }
}
