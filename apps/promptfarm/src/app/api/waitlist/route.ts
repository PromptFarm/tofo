import { NextRequest, NextResponse } from "next/server";
import { sendWaitlistLead, validateLandingEmail } from "@/lib/landing/telegram";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = validateLandingEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const ok = await sendWaitlistLead(email);

  if (!ok) {
    return NextResponse.json({ error: "Waitlist not configured" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
