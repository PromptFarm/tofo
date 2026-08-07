"use client";

import { useMemo } from "react";
import type { SyntheticNode } from "@/lib/planning/types";
import type { SyntheticOutputJson } from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import { MONO, SANS } from "../OutcomeReport.utils";

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Simple token-overlap deduplication.
 * Returns true when two risk strings share > 55% of their word tokens,
 * i.e. they describe the same concept in different words.
 */
function tokenOverlap(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

function deduplicateRisks(risks: RiskRow[]): RiskRow[] {
  const kept: RiskRow[] = [];
  for (const candidate of risks) {
    const isDuplicate = kept.some((r) => tokenOverlap(r.text, candidate.text) > 0.55);
    if (!isDuplicate) kept.push(candidate);
  }
  return kept;
}

// ── Data collection ───────────────────────────────────────────────────────────

type RiskRow = {
  text: string;
  syntheticCode: string;
  syntheticId: string;
};

const MAX_RISKS = 5;

function collectRisks(
  synthetics: SyntheticNode[],
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): RiskRow[] {
  const raw: RiskRow[] = [];

  for (const s of synthetics) {
    const output = outputsBySyntheticId[s.id];
    if (!output || isAdvisorReport(output)) continue;
    // Only read from operational.risks — NOT output.keyRisks (root level)
    const risks = output.operational?.risks ?? [];
    for (const risk of risks) {
      if (!risk?.trim()) continue;
      raw.push({ text: risk.trim(), syntheticCode: s.code, syntheticId: s.id });
    }
  }

  return deduplicateRisks(raw).slice(0, MAX_RISKS);
}

// ── Agent code chip ───────────────────────────────────────────────────────────

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

// ── RisksSection (exported) ───────────────────────────────────────────────────

export function RisksSection({
  synthetics,
  outputsBySyntheticId,
}: {
  synthetics: SyntheticNode[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
}) {
  const risks = useMemo(
    () => collectRisks(synthetics, outputsBySyntheticId),
    [synthetics, outputsBySyntheticId],
  );

  if (risks.length === 0) return null;

  return (
    <section>
      {/* Section label */}
      <p
        style={{
          fontSize: "var(--text-label)",
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--color-warning-text)",
          fontFamily: MONO,
          margin: "0 0 8px",
          borderBottom: "1px solid var(--surface-container)",
          paddingBottom: 8,
        }}
      >
        Risks · {risks.length}
      </p>

      {/* Risk rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {risks.map((row, index) => (
          <div
            key={`${row.syntheticId}-risk-${index}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "6px 0",
              borderBottom:
                index < risks.length - 1
                  ? "1px solid var(--surface-container)"
                  : "none",
            }}
          >
            {/* Warning icon */}
            <span
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                flexShrink: 0,
                color: "var(--color-warning-text)",
              }}
            >
              ⚠
            </span>

            {/* Risk text */}
            <p
              style={{
                flex: 1,
                margin: 0,
                fontSize: "var(--text-caption)",
                fontFamily: SANS,
                color: "var(--on-surface-variant)",
                lineHeight: 1.55,
                overflowWrap: "break-word",
              }}
            >
              {row.text}
            </p>

            {/* Agent attribution */}
            <span style={{ flexShrink: 0, paddingTop: 2 }}>
              <AgentCodeChip code={row.syntheticCode} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

