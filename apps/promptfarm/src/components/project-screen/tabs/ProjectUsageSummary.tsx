"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchProjectTokenUsage } from "@/lib/thinking-graph/client";
import type { UsageSummary } from "@/lib/db-client";

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function formatUsd(n: number) {
  return n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
}

type Props = {
  projectId: string;
  // Bump this (e.g. with a run count) to refetch after a new run completes —
  // this component has no other way to know the project's usage changed.
  refreshKey?: number;
};

// Lifetime total for this project — every synthetic output ever persisted
// for it, not just the latest run (see the hero's per-run line above this
// for that). Collapsed by default; the per-synthetic breakdown is opt-in.
export function ProjectUsageSummary({ projectId, refreshKey }: Props) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProjectTokenUsage(projectId)
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => {
        // Non-critical — just don't show the summary if it fails to load.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  if (!usage || usage.totalTokens === 0) return null;

  return (
    <div className="px-7 py-2 border-b border-[var(--border)] text-[11px] font-mono">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] bg-transparent border-none cursor-pointer p-0"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>Project total: {formatTokens(usage.totalTokens)} tokens</span>
        <span className="opacity-40">·</span>
        <span>{formatUsd(usage.totalCostUsd)}</span>
        <span className="opacity-50">across all runs</span>
      </button>
      {expanded && (
        <ul className="mt-2 ml-[18px] flex flex-col gap-1">
          {usage.bySynthetic.map((s) => (
            <li key={s.syntheticId} className="flex items-center gap-2 text-[var(--t3)]">
              <span className="text-[var(--on-surface-variant)] min-w-[140px] truncate">{s.syntheticName}</span>
              <span>{formatTokens(s.totalTokens)} tokens</span>
              <span className="opacity-40">·</span>
              <span>{formatUsd(s.costUsd)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
