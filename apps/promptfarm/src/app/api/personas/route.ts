import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth";
import { loadAllPersonas } from "@/lib/thinking-graph/server/personaSource";

export async function GET() {
  try {
    await requireAppUser();
    const personas = await loadAllPersonas();
    return NextResponse.json({ personas });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
