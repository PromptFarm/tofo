import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createAppUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/tofo/projects";
  const nextPath = next.startsWith("/") ? next : "/tofo/projects";

  const redirectTo = createAppUrl(nextPath);

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  const loginUrl = createAppUrl("/tofo/auth");
  loginUrl.searchParams.set("mode", "signin");
  loginUrl.searchParams.set("error", "Email confirmation link is invalid or expired.");
  return NextResponse.redirect(loginUrl);
}
