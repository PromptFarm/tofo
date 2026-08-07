import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createProject, listProjects } from "@/lib/db-client";

type CreateProjectBody = {
  name?: string;
  idea?: string;
};

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await listProjects(user.id);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateProjectBody;
  const name = body.name?.trim();
  const idea = body.idea?.trim();

  if (!name || !idea) {
    return NextResponse.json(
      { error: "name and idea are required." },
      { status: 400 },
    );
  }

  const project = await createProject(user.id, { name, idea });
  return NextResponse.json({ project }, { status: 201 });
}
