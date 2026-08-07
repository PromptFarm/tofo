import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { updateTeamPresetName, deleteTeamPreset } from "@/lib/db-client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireAppUser();
  const { teamId } = await params;
  const body = (await req.json()) as { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  await updateTeamPresetName(user.id, teamId, body.name.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireAppUser();
  const { teamId } = await params;
  await deleteTeamPreset(user.id, teamId);
  return NextResponse.json({ ok: true });
}
