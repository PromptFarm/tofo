import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth";
import { signInAction, signUpAction } from "./actions";

type SearchValue = string | string[] | undefined;

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const user = await getCurrentAppUser();
  if (user) {
    redirect("/tofo/projects");
  }

  const params = await searchParams;
  const mode = firstValue(params.mode) === "signup" ? "signup" : "signin";
  const error = firstValue(params.error);
  const message = firstValue(params.message);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--on-surface)] flex">
      {/* ── Left: form ── */}
      <div className="flex flex-col w-full lg:w-[480px] shrink-0 px-10 py-10 justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-[2.5px] w-[18px] h-[18px]">
            <span className="block rounded-[2px] bg-[#a78bfa]" />
            <span className="block rounded-[2px] bg-[#34d399] opacity-75" />
            <span className="block rounded-[2px] bg-[#fb923c] opacity-65" />
            <span className="block rounded-[2px] bg-[#60a5fa] opacity-85" />
          </div>
          <span className="text-sm font-bold text-[var(--on-surface)] tracking-tight">PromptFarm</span>
        </div>

        {/* Form area */}
        <div className="flex flex-col gap-8 max-w-sm w-full">
          <div>
            <h1 className="text-4xl font-bold text-[var(--on-surface)] mb-2">Welcome back.</h1>
            <p className="text-sm text-[var(--on-surface-variant)]">Access the neural network interface.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-[var(--surface-container)]">
            <Link
              href="/tofo/auth?mode=signin"
              className={`pb-3 text-sm font-medium transition-colors ${
                mode === "signin"
                  ? "text-[var(--on-surface)] border-b-2 border-[var(--primary)] -mb-px"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
              }`}
            >
              Sign in
            </Link>
            <Link
              href="/tofo/auth?mode=signup"
              className={`pb-3 text-sm font-medium transition-colors ${
                mode === "signup"
                  ? "text-[var(--on-surface)] border-b-2 border-[var(--primary)] -mb-px"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
              }`}
            >
              Create account
            </Link>
          </div>

          {/* Error / message */}
          {error ? (
            <div className="rounded-lg border border-[rgba(255,99,132,0.25)] bg-[rgba(255,99,132,0.08)] px-4 py-3 text-sm text-[rgb(255,140,160)]">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] px-4 py-3 text-sm text-[var(--on-surface)]">
              {message}
            </div>
          ) : null}

          {/* Form */}
          {mode === "signin" ? (
            <form action={signInAction} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--on-surface-variant)]">
                  Email address
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="name@domain.com"
                  className="w-full rounded-md border border-[var(--surface-container)] bg-white px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--t3)] focus:outline-none focus:border-[var(--primary-border)]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--on-surface-variant)]">
                    Password
                  </label>
                </div>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-[var(--surface-container)] bg-white px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--t3)] focus:outline-none focus:border-[var(--primary-border)]"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                Sign in →
              </button>
            </form>
          ) : (
            <form action={signUpAction} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--on-surface-variant)]">
                  Email address
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="name@domain.com"
                  className="w-full rounded-md border border-[var(--surface-container)] bg-white px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--t3)] focus:outline-none focus:border-[var(--primary-border)]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--on-surface-variant)]">
                  Password
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-[var(--surface-container)] bg-white px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--t3)] focus:outline-none focus:border-[var(--primary-border)]"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)] hover:opacity-90 transition-opacity"
              >
                Create account →
              </button>
            </form>
          )}

          <p className="text-xs text-[var(--t3)]">
            Email/password via <strong className="text-[var(--on-surface-variant)]">Supabase Auth.</strong>
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-[10px] text-[var(--t3)]">© 2024 PromptFarm. All rights reserved.</p>
          {/* <Link href="#" className="text-[10px] text-[rgba(255,255,255,0.25)] hover:text-white">Privacy Policy</Link> */}
          {/* <Link href="#" className="text-[10px] text-[rgba(255,255,255,0.25)] hover:text-white">Terms of Service</Link> */}
        </div>
      </div>

      {/* ── Right: background image with left-to-transparent gradient overlay ── */}
      <div className="hidden lg:flex flex-1 relative">
        <div className="absolute inset-0 bg-[url('/neural-bg.png')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--background)_0%,rgba(247,249,251,0.35)_72%,transparent_100%)]" />
      </div>
    </div>
  );
}
