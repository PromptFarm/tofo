import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { getProjectTokenUsage } from "@/lib/db-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const usage = await getProjectTokenUsage(user.id, projectId);
  return NextResponse.json({ usage });
}
