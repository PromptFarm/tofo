"use client";

import { useMemo, useState } from "react";
import type { SyntheticNode } from "@/lib/planning/types";
import type { SyntheticOutputJson } from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import { MONO, SANS } from "../OutcomeReport.utils";

// ── MDA prefix parsing ────────────────────────────────────────────────────────

/**
 * Extracts a clean label from an MDA-prefixed finding string.
 *
 * Examples:
 *   "MDA Mechanics lens: Tap-to-turn reduces mis-input"
 *     → { label: "Mechanics", body: "Tap-to-turn reduces mis-input" }
 *   "Dynamics: Without escalation, degenerate zero-risk loop"
 *     → { label: "Dynamics", body: "Without escalation, degenerate zero-risk loop" }
 *   "No escalation creates a trivially winnable loop"
 *     → { label: null, body: "No escalation creates a trivially winnable loop" }
 */
function parseFindingPrefix(sentence: string): { label: string | null; body: string } {
  // Match optional "MDA " prefix, then a word/phrase, then optional " lens", then ": "
  // Note: avoid the 's' (dotAll) flag for ES2017 compat — use [\s\S] if needed
  const match = sentence.match(/^(?:MDA\s+)?([A-Za-z][A-Za-z\s]{0,30}?)(?:\s+lens)?:\s+(.+)$/);
  if (!match) return { label: null, body: sentence.trim() };
  const rawLabel = match[1].trim();
  // Strip any remaining "MDA " or "lens" fragments
  const label = rawLabel.replace(/^MDA\s+/i, "").replace(/\s+lens$/i, "").trim();
  return { label: label.length > 0 ? label : null, body: match[2].trim() };
}

// ── Chip colour by label content ─────────────────────────────────────────────

type ChipVariant = "primary" | "info" | "warning" | "muted";

function labelVariant(label: string | null): ChipVariant {
  if (!label) return "muted";
  const lower = label.toLowerCase();
  if (lower.includes("mechanic")) return "primary";
  if (lower.includes("dynamic")) return "info";
  if (lower.includes("aesthetic")) return "warning";
  return "muted";
}

const CHIP_STYLE: Record<ChipVariant, { color: string; bg: string; border: string }> = {
  primary: {
    color: "var(--primary)",
    bg: "var(--primary-container)",
    border: "var(--primary-border)",
  },
  info: {
    color: "var(--color-info-text, var(--primary))",
    bg: "var(--color-info-bg, var(--primary-container))",
    border: "var(--color-info-border, var(--primary-border))",
  },
  warning: {
    color: "var(--color-warning-text)",
    bg: "var(--color-warning-bg)",
    border: "var(--color-warning-border)",
  },
  muted: {
    color: "var(--t3)",
    bg: "var(--surface-container)",
    border: "var(--surface-container)",
  },
};

function LabelChip({ label, variant }: { label: string; variant: ChipVariant }) {
  const s = CHIP_STYLE[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 4,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        fontSize: "var(--text-label)",
        fontFamily: MONO,
        fontWeight: 600,
        lineHeight: 1.4,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function AgentCodeChip({ code }: { code: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 5px",
        borderRadius: 4,
        border: "1px solid var(--surface-container)",
        background: "var(--surface-high)",
        color: "var(--t3)",
        fontSize: "var(--text-label)",
        fontFamily: MONO,
        lineHeight: 1.4,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {code}
    </span>
  );
}

// ── Data collection ───────────────────────────────────────────────────────────

type FindingRow = {
  text: string;
  label: string | null;
  body: string;
  variant: ChipVariant;
  syntheticCode: string;
  syntheticId: string;
};

function collectFindings(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): FindingRow[] {
  const rows: FindingRow[] = [];
  for (const s of synthetics) {
    const output = outputsBySyntheticId[s.id];
    if (!output || isAdvisorReport(output)) continue;
    const findings = output.operational?.findings ?? [];
    for (const finding of findings) {
      if (!finding?.trim()) continue;
      const { label, body } = parseFindingPrefix(finding);
      rows.push({
        text: finding,
        label,
        body,
        variant: labelVariant(label),
        syntheticCode: s.code,
        syntheticId: s.id,
      });
    }
  }
  return rows;
}

// ── FindingsSection (exported) ────────────────────────────────────────────────

export function FindingsSection({
  synthetics,
  outputsBySyntheticId,
  defaultOpen = false,
}: {
  synthetics: SyntheticNode[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const findings = useMemo(
    () => collectFindings(synthetics, outputsBySyntheticId),
    [synthetics, outputsBySyntheticId],
  );

  // Unique agent codes that contributed findings, for the header chips
  const contributingCodes = useMemo(() => {
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const row of findings) {
      if (!seen.has(row.syntheticCode)) {
        seen.add(row.syntheticCode);
        codes.push(row.syntheticCode);
      }
    }
    return codes;
  }, [findings]);

  if (findings.length === 0) return null;

  return (
    <section>
      {/* ── Toggle header ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          borderBottom: "1px solid var(--surface-container)",
          paddingBottom: 8,
          cursor: "pointer",
          color: "var(--t3)",
          fontFamily: MONO,
          fontSize: "var(--text-caption)",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{open ? "▼" : "▶"}</span>
        <span>What the panel found</span>
        {contributingCodes.length > 0 && (
          <>
            <span style={{ opacity: 0.4, marginLeft: 2 }}>·</span>
            {contributingCodes.map((code) => (
              <AgentCodeChip key={code} code={code} />
            ))}
          </>
        )}
        <span style={{ marginLeft: "auto", fontSize: "var(--text-label)", opacity: 0.6 }}>
          {findings.length}
        </span>
      </button>

      {/* ── Finding rows ── */}
      {open && (
        <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {findings.map((row, index) => (
            <div
              key={`${row.syntheticId}-finding-${index}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "6px 0",
                borderBottom: index < findings.length - 1
                  ? "1px solid var(--surface-container)"
                  : "none",
              }}
            >
              {/* Label chip — or spacer when no label */}
              <span style={{ flexShrink: 0, minWidth: 80, display: "flex", justifyContent: "flex-end" }}>
                {row.label ? (
                  <LabelChip label={row.label} variant={row.variant} />
                ) : (
                  <span style={{
                    fontSize: "var(--text-label)",
                    fontFamily: MONO,
                    color: "var(--t3)",
                    opacity: 0.4,
                  }}>
                    ─
                  </span>
                )}
              </span>

              {/* Body text */}
              <p style={{
                flex: 1,
                margin: 0,
                fontSize: "var(--text-caption)",
                fontFamily: SANS,
                color: "var(--on-surface-variant)",
                lineHeight: 1.55,
                overflowWrap: "break-word",
              }}>
                {row.body}
              </p>

              {/* Agent attribution */}
              <span style={{ flexShrink: 0, paddingTop: 1 }}>
                <AgentCodeChip code={row.syntheticCode} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

