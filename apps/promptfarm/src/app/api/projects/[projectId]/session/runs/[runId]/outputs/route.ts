import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { getRunOutputs } from "@/lib/db-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const outputs = await getRunOutputs(user.id, runId);
  return NextResponse.json({ outputs });
}
