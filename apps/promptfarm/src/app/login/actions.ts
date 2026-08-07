"use server";

import { redirect } from "next/navigation";
import { createAppUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";

function redirectWith(path: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const suffix = search.toString();
  redirect(suffix ? `${path}?${suffix}` : path);
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  return { email, password };
}

export async function signInAction(formData: FormData) {
  let credentials: ReturnType<typeof readCredentials> | null = null;
  try {
    credentials = readCredentials(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign in failed";
    redirectWith("/tofo/auth", { mode: "signin", error: message });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(
    credentials ?? { email: "", password: "" },
  );
  if (error) {
    redirectWith("/tofo/auth", { mode: "signin", error: error.message });
  }

  redirect("/tofo/projects");
}

export async function signUpAction(formData: FormData) {
  let credentials: ReturnType<typeof readCredentials> | null = null;
  try {
    credentials = readCredentials(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign up failed";
    redirectWith("/tofo/auth", { mode: "signup", error: message });
  }

  const supabase = await createClient();
  const emailRedirectTo = createAppUrl("/tofo/auth/confirm").toString();
  const url = new URL(emailRedirectTo);
  url.searchParams.set("next", "/tofo/projects");

  const { data, error } = await supabase.auth.signUp({
    ...(credentials ?? { email: "", password: "" }),
    options: {
      emailRedirectTo: url.toString(),
    },
  });

  if (error) {
    redirectWith("/tofo/auth", { mode: "signup", error: error.message });
  }

  if (data.session) {
    redirect("/tofo/projects");
  }

  const { error: signInError } = await supabase.auth.signInWithPassword(
    credentials ?? { email: "", password: "" },
  );
  if (!signInError) {
    redirect("/tofo/projects");
  }

  redirectWith("/tofo/auth", {
    mode: "signin",
    message: "Check your email to confirm your account.",
  });
}
