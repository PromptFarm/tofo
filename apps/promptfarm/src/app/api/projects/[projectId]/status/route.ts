import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { updateProjectStatus } from "@/lib/db-client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireAppUser();
    const { projectId } = await params;
    const { status } = (await req.json()) as { status: string };

    if (status !== "draft" && status !== "active") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await updateProjectStatus(user.id, projectId, status);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
