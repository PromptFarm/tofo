"use client";

import type { DomainVerdict } from "@/lib/thinking-graph/server/types";
import { MONO, SANS } from "../OutcomeReport.utils";

type VerdictConfig = {
  icon: string;
  label: string;
  bg: string;
  border: string;
  color: string;
  tooltip: string;
};

const VERDICT_CFG: Record<DomainVerdict, VerdictConfig> = {
  go: {
    icon: "🟢",
    label: "Ready to build",
    bg: "var(--color-success-bg)",
    border: "var(--color-success-border)",
    color: "var(--color-success-text)",
    tooltip: "All agents cleared — no critical blockers found. You're good to proceed.",
  },
  conditional: {
    icon: "🟡",
    label: "Proceed with conditions",
    bg: "var(--color-warning-bg)",
    border: "var(--color-warning-border)",
    color: "var(--color-warning-text)",
    tooltip: "Some agents raised open concerns. You can move forward, but addressing the highlighted conditions will reduce risk.",
  },
  no_go: {
    icon: "🔴",
    label: "Not ready",
    bg: "var(--color-error-bg)",
    border: "var(--color-error-border)",
    color: "var(--color-error-text)",
    tooltip: "One or more agents flagged a critical blocker. Resolve the highlighted condition to unlock the next run.",
  },
};

export function VerdictHeader({
  overallVerdict,
  overallCondition,
  mostBlockedAgentSummary,
  runVersionLabel,
  agentCount,
}: {
  overallVerdict: DomainVerdict | null | undefined;
  overallCondition?: string | null;
  mostBlockedAgentSummary?: string | null;
  runVersionLabel?: string;
  agentCount: number;
}) {
  const cfg = overallVerdict ? VERDICT_CFG[overallVerdict] : null;

  const metaParts: string[] = [];
  if (runVersionLabel) metaParts.push(`Run ${runVersionLabel}`);
  metaParts.push(`${agentCount} agent${agentCount !== 1 ? "s" : ""}`);
  if (cfg) metaParts.push(cfg.label);
  const metaLine = metaParts.join(" · ");

  return (
    <div
      style={{
        minHeight: 72,
        borderRadius: 8,
        border: `1px solid ${cfg?.border ?? "var(--surface-container)"}`,
        background: cfg?.bg ?? "var(--surface-high)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Top row: verdict + meta */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: cfg ? "help" : "default" }}
          title={cfg?.tooltip}
        >
          {cfg && (
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{cfg.icon}</span>
          )}
          <span
            style={{
              fontSize: "var(--text-body)",
              fontWeight: 700,
              fontFamily: SANS,
              color: cfg?.color ?? "var(--on-surface)",
            }}
          >
            {cfg?.label ?? "Running…"}
          </span>
        </div>
        <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)", whiteSpace: "nowrap" }}>
          {metaLine}
        </span>
      </div>

      {/* Condition sentence — never truncated */}
      {overallCondition && (
        <p
          style={{
            fontSize: "var(--text-caption)",
            fontFamily: SANS,
            color: cfg?.color ?? "var(--on-surface-variant)",
            lineHeight: 1.55,
            margin: 0,
            overflowWrap: "break-word",
          }}
        >
          {overallCondition}
        </p>
      )}

      {/* Most blocked agent context */}
      {mostBlockedAgentSummary && (
        <p
          style={{
            fontSize: "var(--text-caption)",
            fontFamily: SANS,
            color: "var(--on-surface-variant)",
            lineHeight: 1.5,
            margin: 0,
            overflowWrap: "break-word",
            opacity: 0.8,
          }}
        >
          {mostBlockedAgentSummary}
        </p>
      )}
    </div>
  );
}
