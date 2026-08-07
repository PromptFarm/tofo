import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { addTeamMember, removeTeamMember, updateTeamMember } from "@/lib/db-client";

type Ctx = { params: Promise<{ teamId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireAppUser();
  const { teamId } = await params;
  const body = (await req.json()) as {
    personaId?: string | null;
    name?: string;
    domain?: string;
    skillDescription?: string;
  };
  if (!body.name?.trim() || !body.domain?.trim()) {
    return NextResponse.json({ error: "name and domain are required" }, { status: 400 });
  }
  const member = await addTeamMember(user.id, teamId, {
    personaId: body.personaId ?? null,
    name: body.name.trim(),
    domain: body.domain.trim(),
    skillDescription: body.skillDescription?.trim() ?? "",
  });
  return NextResponse.json({ member }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await requireAppUser();
  const { teamId } = await params;
  const memberId = new URL(req.url).searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  await removeTeamMember(user.id, teamId, memberId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireAppUser();
  const { teamId } = await params;
  const body = (await req.json()) as {
    memberId: string;
    name?: string;
    domain?: string;
    skillDescription?: string;
  };
  if (!body.memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  await updateTeamMember(user.id, teamId, body.memberId, {
    name: body.name,
    domain: body.domain,
    skillDescription: body.skillDescription,
  });
  return NextResponse.json({ ok: true });
}
