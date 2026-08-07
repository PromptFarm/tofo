import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { getLatestProjectSession, saveProjectSession } from "@/lib/db-client";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";

type SaveSessionBody = {
  payload?: SyntheticGraphPayload;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const payload = await getLatestProjectSession(user.id, projectId);
  return NextResponse.json({ payload });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveSessionBody;
  if (!body.payload?.sessionId) {
    return NextResponse.json({ error: "payload is required." }, { status: 400 });
  }

  const { projectId } = await params;
  try {
    const project = await saveProjectSession(user.id, projectId, body.payload);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("[PUT /api/projects/[projectId]/session] save failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save session." },
      { status: 500 },
    );
  }
}

// POST is used by navigator.sendBeacon on window close (sendBeacon only supports POST).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return PUT(request, { params });
}

