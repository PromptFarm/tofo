import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import {
  getProjectById,
  softDeleteProject,
  updateProjectMetadata,
} from "@/lib/db-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const project = await getProjectById(user.id, projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  await softDeleteProject(user.id, projectId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    idea?: string;
    selectedTeamId?: string | null;
    domainTags?: string[];
  };

  const { projectId } = await params;
  await updateProjectMetadata(user.id, projectId, body);
  return NextResponse.json({ ok: true });
}
