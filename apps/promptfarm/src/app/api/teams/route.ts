import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import {
  listTeamPresets,
  hasTeamPresets,
  seedDefaultTeams,
  createTeamPreset,
  deleteTeamPreset,
} from "@/lib/db-client";

export async function GET() {
  const user = await requireAppUser();
  const seeded = await hasTeamPresets(user.id);
  if (!seeded) await seedDefaultTeams(user.id);
  const teams = await listTeamPresets(user.id);
  return NextResponse.json({ teams });
}

export async function POST(req: NextRequest) {
  const user = await requireAppUser();
  const body = (await req.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const team = await createTeamPreset(user.id, body.name.trim());
  return NextResponse.json({ team }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await requireAppUser();
  const teamId = new URL(req.url).searchParams.get("id");
  if (!teamId) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await deleteTeamPreset(user.id, teamId);
  return NextResponse.json({ ok: true });
}
