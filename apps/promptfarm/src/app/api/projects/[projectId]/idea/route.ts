import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { updateProjectIdea } from "@/lib/db-client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireAppUser();
    const { projectId } = await params;
    const { idea } = (await req.json()) as { idea: string };

    if (!idea?.trim()) {
      return NextResponse.json({ error: "Idea is required" }, { status: 400 });
    }

    await updateProjectIdea(user.id, projectId, idea);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
