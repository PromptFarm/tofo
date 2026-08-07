import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { updateProjectName } from "@/lib/db-client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireAppUser();
    const { projectId } = await params;
    const { name } = (await req.json()) as { name: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    await updateProjectName(user.id, projectId, name);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
