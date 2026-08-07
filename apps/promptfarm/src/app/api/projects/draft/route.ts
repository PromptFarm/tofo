import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { createDraftProject } from "@/lib/db-client";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAppUser();
    const { idea, selectedTeamId, domainTags } = (await req.json()) as {
      idea: string;
      selectedTeamId?: string | null;
      domainTags?: string[];
    };

    if (!idea?.trim()) {
      return NextResponse.json({ error: "Idea is required" }, { status: 400 });
    }

    const project = await createDraftProject(user.id, { idea, selectedTeamId, domainTags });
    return NextResponse.json({ projectId: project.id });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
