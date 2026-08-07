import { NextRequest, NextResponse } from "next/server";
import {
  sanitizeLandingMessage,
  sendFeedbackLead,
  validateLandingEmail,
} from "@/lib/landing/telegram";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const message = sanitizeLandingMessage(body.message);
  if (!message) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" && body.email.trim()
      ? validateLandingEmail(body.email)
      : null;

  if (typeof body.email === "string" && body.email.trim() && !email) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const ok = await sendFeedbackLead(message, email ?? undefined);

  if (!ok) {
    return NextResponse.json({ error: "Feedback not configured" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
