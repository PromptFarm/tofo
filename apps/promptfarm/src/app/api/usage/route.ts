import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { getLifetimeTokenUsage } from "@/lib/db-client";

// App-wide token usage/cost across every project — see docs/SYNTHETICS_GUIDE.md
// or the Settings page for where this is surfaced.
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await getLifetimeTokenUsage(user.id);
  return NextResponse.json({ usage });
}
