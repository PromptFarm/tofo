"use client";

import { useState } from "react";
import type { DomainGateResult, DomainVerdict } from "@/lib/thinking-graph/server/types";
import type { RunDelta } from "../OutcomeReport.delta";

const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

// ── Verdict helpers ───────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<DomainVerdict, { label: string; icon: string; color: string; bg: string; border: string }> = {
  go:          { label: "Proceed",                 icon: "🟢", color: "var(--color-success-text)", bg: "var(--color-success-bg)",          border: "var(--color-success-border)" },
  conditional: { label: "Proceed with conditions", icon: "🟡", color: "var(--color-warning-text)", bg: "var(--color-warning-bg-subtle)",    border: "var(--color-warning-border)" },
  no_go:       { label: "Blocked",                 icon: "🔴", color: "var(--color-error-text)",   bg: "var(--color-error-bg-subtle)",      border: "var(--color-error-border)"   },
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

// ── DeltaBadge ────────────────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: RunDelta }) {
  const issueCount = delta.worsenedDomains.length + delta.newConflicts.length;
  const improvedCount = delta.improvedDomains.length;

  if (issueCount > 0) {
    return (
      <span style={{
        fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600,
        color: "var(--color-warning-text)", background: "var(--color-warning-bg-subtle)",
        border: "1px solid var(--color-warning-border)", borderRadius: 999,
        padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        ⚠ {issueCount} new issue{issueCount !== 1 ? "s" : ""}
      </span>
    );
  }

  if (improvedCount > 0) {
    return (
      <span style={{
        fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600,
        color: "var(--color-success-text)", background: "var(--color-success-bg)",
        border: "1px solid var(--color-success-border)", borderRadius: 999,
        padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        ↑ {improvedCount} improved
      </span>
    );
  }

  return null;
}

// ── DomainChip ────────────────────────────────────────────────────────────────

function DomainChip({ gate }: { gate: DomainGateResult }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = VERDICT_CONFIG[gate.verdict];
  const ctx = gate.contextCompleteness;
  const expandable = gate.verdict !== "go" && gate.condition != null;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 0 }}>
      <button
        type="button"
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
        title={gate.syntheticName}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: expanded ? "6px 6px 0 0" : 6,
          border: `1px solid ${cfg.border}`, background: cfg.bg,
          color: cfg.color, fontFamily: MONO, fontSize: "var(--text-label)", fontWeight: 600,
          cursor: expandable ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        <span>{gate.syntheticCode}</span>
        {ctx && ctx.completenessPercent < 100 && (
          <span style={{ fontSize: "var(--text-caption)", opacity: 0.8 }}>{ctx.completenessPercent}%</span>
        )}
        {expandable && (
          <span style={{ fontSize: 9, opacity: 0.7, lineHeight: 1 }}>{expanded ? "▲" : "▼"}</span>
        )}
      </button>
      {expanded && gate.condition && (
        <div style={{
          padding: "6px 8px",
          border: `1px solid ${cfg.border}`, borderTop: "none",
          background: cfg.bg, borderRadius: "0 0 6px 6px",
          maxWidth: 280,
        }}>
          {ctx && ctx.totalItems > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: "var(--text-caption)", fontFamily: MONO,
                color: cfg.color, opacity: 0.9, marginBottom: 3,
              }}>
                Context: {ctx.completenessPercent}% ({ctx.answeredItems}/{ctx.totalItems})
              </div>
              <div style={{
                height: 4, borderRadius: 2, background: "rgba(0,0,0,0.1)",
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${ctx.completenessPercent}%`,
                  background: cfg.color, opacity: 0.7,
                  transition: "width 200ms ease",
                }}/>
              </div>
              {ctx.requiredItems > 0 && ctx.missingRequired.length > 0 && (
                <div style={{
                  fontSize: "var(--text-caption)", fontFamily: SANS,
                  color: cfg.color, marginTop: 4, lineHeight: 1.4,
                }}>
                  {ctx.missingRequired.length} required clarification{ctx.missingRequired.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
          <p style={{
            fontSize: "var(--text-caption)", fontFamily: SANS,
            color: cfg.color, lineHeight: 1.5, margin: 0,
            overflowWrap: "break-word",
          }}>
            {gate.condition}
          </p>
        </div>
      )}
    </div>
  );
}

// ── GoNoGoPanel ───────────────────────────────────────────────────────────────

export function GoNoGoPanel({
  domainGates,
  overallVerdict,
  overallCondition,
  delta,
  iterationLabel,
}: {
  domainGates: DomainGateResult[];
  overallVerdict: DomainVerdict;
  overallCondition: string | null;
  delta?: RunDelta | null;
  iterationLabel?: string;
}) {
  const cfg = VERDICT_CONFIG[overallVerdict];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Row 1 — overall verdict bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "8px 12px", borderRadius: 8,
        border: `1px solid ${cfg.border}`, background: cfg.bg,
      }}>
        {/* Verdict pill */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: MONO, fontSize: "var(--text-label)", fontWeight: 700,
          color: cfg.color, whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {cfg.icon} {cfg.label}
          {iterationLabel && (
            <span style={{ opacity: 0.6, fontWeight: 400 }}>· Run {iterationLabel}</span>
          )}
        </span>

        {/* Condition text */}
        {overallCondition && (
          <p style={{
            flex: 1, minWidth: 0, margin: 0,
            fontSize: "var(--text-caption)", fontFamily: SANS,
            color: cfg.color, lineHeight: 1.5, opacity: 0.9,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}
            title={overallCondition}
          >
            {truncate(overallCondition, 80)}
          </p>
        )}

        {/* Delta badge */}
        {delta && <DeltaBadge delta={delta} />}
      </div>

      {/* Row 2 — per-domain chips */}
      {domainGates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
          {domainGates.map((gate) => (
            <DomainChip key={gate.syntheticId} gate={gate} />
          ))}
        </div>
      )}

    </div>
  );
}
