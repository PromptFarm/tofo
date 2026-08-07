import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { updateDraftProjectState } from "@/lib/db-client";
import { getHttpErrorDetails } from "@/lib/httpError";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireAppUser();
    const { projectId } = await params;
    const { selectedTeamId, domainTags } = (await req.json()) as {
      selectedTeamId?: string | null;
      domainTags?: string[];
    };

    console.log("[projects:draft][patch] request", {
      projectId,
      userId: user.id,
      selectedTeamIdProvided: selectedTeamId !== undefined,
      selectedTeamId: selectedTeamId === undefined ? "(omitted)" : selectedTeamId,
      domainTagsProvided: domainTags !== undefined,
      domainTags: domainTags === undefined ? "(omitted)" : domainTags,
    });

    await updateDraftProjectState(user.id, projectId, {
      ...(selectedTeamId !== undefined ? { selectedTeamId } : {}),
      ...(domainTags !== undefined ? { domainTags } : {}),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const details = getHttpErrorDetails(error);
    console.error("[projects:draft][patch] failed", details);

    return NextResponse.json(
      {
        error: details.message,
        upstreamStatus: details.status,
        upstreamMethod: details.method,
        upstreamUrl: details.url,
        upstreamResponse: details.responseData,
      },
      { status: details.status ?? 400 },
    );
  }
}
