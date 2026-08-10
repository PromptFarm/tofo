"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Cpu, KeyRound, Terminal } from "lucide-react";
import type { ModelProviderKind, ModelProviderSettings } from "@/lib/sqlite/appSettings";
import type { UsageSummary } from "@/lib/db-client";
import { cn } from "@/lib/utils";

type Props = {
  initialSettings: ModelProviderSettings | null;
  lifetimeUsage: UsageSummary;
};

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function formatUsd(n: number) {
  return n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
}

const PROVIDER_OPTIONS: Array<{
  value: ModelProviderKind;
  icon: typeof Cpu;
  title: string;
  description: string;
}> = [
  {
    value: "ollama",
    icon: Cpu,
    title: "Local model (Ollama)",
    description: "Runs fully offline on this machine. Free, but weaker answers than a hosted model.",
  },
  {
    value: "claude",
    icon: KeyRound,
    title: "Claude API key",
    description: "Pay-per-token via api.anthropic.com. Needs an Anthropic API key.",
  },
  {
    value: "claude-cli",
    icon: Terminal,
    title: "Claude CLI (subscription)",
    description: "Uses your installed, logged-in `claude` CLI and Pro/Max subscription limits.",
  },
];

export function SettingsPageClient({ initialSettings, lifetimeUsage }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firstRun = searchParams.get("firstRun") === "1";
  const [usageExpanded, setUsageExpanded] = useState(false);

  const [provider, setProvider] = useState<ModelProviderKind>(initialSettings?.provider ?? "ollama");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(initialSettings?.ollamaBaseUrl ?? "http://localhost:11434/v1");
  const [ollamaModel, setOllamaModel] = useState(initialSettings?.ollamaModel ?? "qwen2.5:7b-instruct");
  const [claudeApiKey, setClaudeApiKey] = useState(initialSettings?.claudeApiKey ?? "");
  const [claudeModel, setClaudeModel] = useState(initialSettings?.claudeModel ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/model-provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ollamaBaseUrl, ollamaModel, claudeApiKey, claudeModel }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save settings");
      }
      setSaved(true);
      if (firstRun) {
        router.push("/tofo/projects");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[640px] px-8 py-12">
        {firstRun && (
          <div className="mb-8 rounded-lg border border-[var(--primary-border)] bg-[var(--primary-container)] px-4 py-3 text-sm text-[var(--primary)]">
            Welcome to TOFO. Pick how synthetic agents should think before you run your first simulation.
          </div>
        )}

        <h1 className="text-xl font-semibold text-[var(--on-surface)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
          Choose the model provider used for every synthetic agent&apos;s simulation and chat.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {PROVIDER_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = provider === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setProvider(option.value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                  active
                    ? "border-[var(--primary-border)] bg-[var(--primary-container)]"
                    : "border-[var(--surface-container)] bg-[var(--surface-low)] hover:border-[var(--on-surface-variant)]",
                )}
              >
                <Icon size={18} className={active ? "text-[var(--primary)] mt-0.5" : "text-[var(--on-surface-variant)] mt-0.5"} />
                <span className="flex-1">
                  <span className={cn("block text-sm font-medium", active ? "text-[var(--primary)]" : "text-[var(--on-surface)]")}>
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--on-surface-variant)]">{option.description}</span>
                </span>
                {active && <Check size={16} className="mt-0.5 shrink-0 text-[var(--primary)]" />}
              </button>
            );
          })}
        </div>

        {provider === "ollama" && (
          <div className="mt-6 flex flex-col gap-4 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] p-4">
            <Field label="Base URL">
              <input
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="w-full rounded-md border border-[var(--surface-container)] bg-[var(--surface-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] outline-none focus:border-[var(--primary)]"
              />
            </Field>
            <Field label="Model">
              <input
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5:7b-instruct"
                className="w-full rounded-md border border-[var(--surface-container)] bg-[var(--surface-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] outline-none focus:border-[var(--primary)]"
              />
            </Field>
            <p className="text-xs text-[var(--on-surface-variant)]">
              Ollama must already be running locally — <code className="font-mono">ollama serve</code> — with this model pulled.
            </p>
          </div>
        )}

        {provider === "claude" && (
          <div className="mt-6 flex flex-col gap-4 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] p-4">
            <Field label="Anthropic API key">
              <input
                type="password"
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-md border border-[var(--surface-container)] bg-[var(--surface-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] outline-none focus:border-[var(--primary)]"
              />
            </Field>
            <Field label="Model (optional)">
              <input
                value={claudeModel}
                onChange={(e) => setClaudeModel(e.target.value)}
                placeholder="claude-sonnet-5"
                className="w-full rounded-md border border-[var(--surface-container)] bg-[var(--surface-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] outline-none focus:border-[var(--primary)]"
              />
            </Field>
            <p className="text-xs text-[var(--on-surface-variant)]">
              Stored locally in this app&apos;s database, sent only to api.anthropic.com.
            </p>
          </div>
        )}

        {provider === "claude-cli" && (
          <div className="mt-6 flex flex-col gap-4 rounded-lg border border-[var(--surface-container)] bg-[var(--surface-low)] p-4">
            <Field label="Model (optional)">
              <input
                value={claudeModel}
                onChange={(e) => setClaudeModel(e.target.value)}
                placeholder="claude-sonnet-5"
                className="w-full rounded-md border border-[var(--surface-container)] bg-[var(--surface-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] outline-none focus:border-[var(--primary)]"
              />
            </Field>
            <p className="text-xs text-[var(--on-surface-variant)]">
              Requires the <code className="font-mono">claude</code> CLI installed and logged in on this machine, with a Pro/Max
              subscription. Your organization may restrict Claude Code subscription access — check with your admin if calls fail.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]">
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-9 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--surface-lowest)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : firstRun ? "Save and continue" : "Save"}
          </button>
          {saved && !firstRun && <span className="text-sm text-[#34d399]">Saved</span>}
        </div>

        {lifetimeUsage.totalTokens > 0 && (
          <div className="mt-10 border-t border-[var(--surface-container)] pt-6">
            <button
              type="button"
              onClick={() => setUsageExpanded((v) => !v)}
              className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
            >
              {usageExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-sm font-medium">
                Usage: {formatTokens(lifetimeUsage.totalTokens)} tokens · {formatUsd(lifetimeUsage.totalCostUsd)}
              </span>
              <span className="text-xs opacity-60">— across every project</span>
            </button>
            {usageExpanded && (
              <ul className="mt-3 ml-[20px] flex flex-col gap-1.5 text-xs font-mono">
                {lifetimeUsage.bySynthetic.map((s) => (
                  <li key={s.syntheticId} className="flex items-center gap-2 text-[var(--t3)]">
                    <span className="min-w-[160px] truncate text-[var(--on-surface-variant)]">{s.syntheticName}</span>
                    <span>{formatTokens(s.totalTokens)} tokens</span>
                    <span className="opacity-40">·</span>
                    <span>{formatUsd(s.costUsd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--on-surface-variant)]">{label}</span>
      {children}
    </label>
  );
}
