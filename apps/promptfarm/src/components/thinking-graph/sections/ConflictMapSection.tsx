"use client";

import { useState } from "react";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type {
  RunSummaryConflict,
  RunSummaryReport,
  SyntheticOutputJson,
} from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import { MONO, SANS } from "../OutcomeReport.utils";
import { ConflictMapTab } from "../tabs/ConflictMapTab";

const EDGE_META: Record<
  SyntheticEdge["type"],
  { label: string; color: string; impact: string; badge: string; fromRole: string; toRole: string }
> = {
  tension: {
    label: "Tension",
    color: "var(--color-error-text)",
    badge: "↔",
    impact:
      "Each agent receives the other's output framed as an opposing position and is prompted to push back. The aggregator surfaces the friction and proposes a resolution path.",
    fromRole: "Position",
    toRole: "Counter-position",
  },
  oversight: {
    label: "Oversight",
    color: "var(--color-success-text)",
    badge: "→",
    impact:
      "The source agent's output is forwarded to the target as 'work under your review.' The reviewer is prompted to identify gaps, risks, or failures before the run continues.",
    fromRole: "Work submitted for review",
    toRole: "Reviewer response",
  },
  amplification: {
    label: "Amplification",
    color: "var(--primary)",
    badge: "⇡",
    impact:
      "The source agent's findings are forwarded to the target as 'amplified signal — weight this heavily.' The target prioritises those concerns in its own analysis.",
    fromRole: "Amplified signal",
    toRole: "Response",
  },
  structural: {
    label: "Structural",
    color: "var(--t3)",
    badge: "—",
    impact: "A structural dependency used for ordering only. No extra context is injected.",
    fromRole: "Source",
    toRole: "Target",
  },
};

function getOutputSummary(output: SyntheticOutputJson | null | undefined): string | null {
  if (!output) return null;
  if (isAdvisorReport(output)) return output.topRecommendation ?? null;
  return output.operational?.summary ?? output.summary ?? null;
}

function getOutputRecommendation(output: SyntheticOutputJson | null | undefined): string | null {
  if (!output) return null;
  if (isAdvisorReport(output)) return null;
  return output.recommendation ?? null;
}

function getOutputKeyRisks(output: SyntheticOutputJson | null | undefined): string[] {
  if (!output || isAdvisorReport(output)) return [];
  return output.keyRisks ?? [];
}

function AgentOutputBlock({
  name,
  role,
  output,
  roleColor,
}: {
  name: string;
  role: string;
  output: SyntheticOutputJson | null | undefined;
  roleColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = getOutputSummary(output);
  const recommendation = getOutputRecommendation(output);
  const keyRisks = getOutputKeyRisks(output);

  if (!summary) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: roleColor, fontWeight: 600 }}>
          {role}
        </span>
        <span style={{ fontSize: "var(--text-caption)", fontFamily: SANS, fontWeight: 600, color: "var(--on-surface)" }}>
          {name}
        </span>
        <span style={{ fontSize: "var(--text-label)", fontFamily: SANS, color: "var(--t3)" }}>
          No output yet — run the graph first.
        </span>
      </div>
    );
  }

  const hasMore = (recommendation && recommendation !== summary) || keyRisks.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: roleColor, fontWeight: 600 }}>
          {role}
        </span>
        <span style={{ fontSize: "var(--text-caption)", fontFamily: SANS, fontWeight: 600, color: "var(--on-surface)" }}>
          {name}
        </span>
      </div>
      {/* Summary */}
      <p style={{
        fontSize: "var(--text-caption)",
        fontFamily: SANS,
        color: "var(--on-surface-variant)",
        lineHeight: 1.5,
        margin: 0,
        padding: "6px 10px",
        borderRadius: 6,
        background: "var(--surface-container)",
        borderLeft: `3px solid color-mix(in srgb, ${roleColor} 50%, transparent)`,
      }}>
        {summary}
      </p>
      {/* Expandable details */}
      {hasMore && (
        <>
          {expanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
              {recommendation && recommendation !== summary && (
                <div>
                  <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Recommendation
                  </span>
                  <p style={{ fontSize: "var(--text-caption)", fontFamily: SANS, color: "var(--on-surface-variant)", lineHeight: 1.5, margin: "3px 0 0" }}>
                    {recommendation}
                  </p>
                </div>
              )}
              {keyRisks.length > 0 && (
                <div>
                  <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Key risks
                  </span>
                  <ul style={{ margin: "3px 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
                    {keyRisks.map((r, i) => (
                      <li key={i} style={{ fontSize: "var(--text-caption)", fontFamily: SANS, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ alignSelf: "flex-start", padding: "1px 6px", border: "1px solid var(--surface-container)", borderRadius: 4, background: "transparent", color: "var(--t3)", fontSize: "var(--text-label)", fontFamily: MONO, cursor: "pointer" }}
          >
            {expanded ? "▲ less" : "▼ more"}
          </button>
        </>
      )}
    </div>
  );
}

function EdgeRelationCard({
  edge,
  fromNode,
  toNode,
  outputsBySyntheticId,
}: {
  edge: SyntheticEdge;
  fromNode?: SyntheticNode;
  toNode?: SyntheticNode;
  outputsBySyntheticId?: Record<string, SyntheticOutputJson | null>;
}) {
  const meta = EDGE_META[edge.type] ?? EDGE_META.structural;
  const fromName = fromNode?.name ?? edge.from;
  const toName = toNode?.name ?? edge.to;
  const fromOutput = outputsBySyntheticId?.[edge.from];
  const toOutput = outputsBySyntheticId?.[edge.to];

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--surface-container)",
        background: "var(--surface-high)",
        overflow: "hidden",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "var(--text-label)",
            fontFamily: MONO,
            fontWeight: 700,
            color: meta.color,
            background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
            borderRadius: 20,
            padding: "1px 8px",
            whiteSpace: "nowrap" as const,
          }}
        >
          {meta.badge} {meta.label}
        </span>
        <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS }}>
          {fromName}
        </span>
        <span style={{ fontSize: "var(--text-label)", color: "var(--t3)", fontFamily: MONO }}>
          {meta.badge}
        </span>
        <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS }}>
          {toName}
        </span>
      </div>
      {/* Impact description */}
      <p style={{ fontSize: "var(--text-label)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.55, margin: 0 }}>
        {meta.impact}
      </p>
      {/* Agent outputs — show what each side actually produced */}
      {edge.type !== "structural" && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderTop: `1px solid color-mix(in srgb, ${meta.color} 20%, var(--surface-container))`,
          paddingTop: 10,
        }}>
          <AgentOutputBlock
            name={fromName}
            role={meta.fromRole}
            output={fromOutput}
            roleColor={meta.color}
          />
          <AgentOutputBlock
            name={toName}
            role={meta.toRole}
            output={toOutput}
            roleColor={meta.color}
          />
        </div>
      )}
    </div>
  );
}

export function ConflictMapSection({
  summaryReport,
  synthetics,
  outputsBySyntheticId,
  revisionEdges,
  stagedDecisions,
  appliedDecisions,
  onApplyConflictDirective,
  onUndoConflictDirective,
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  outputsBySyntheticId?: Record<string, SyntheticOutputJson | null>;
  /** All canvas edges — used to show every relation type, not just tensions. */
  revisionEdges?: SyntheticEdge[];
  stagedDecisions?: Array<{ syntheticId: string; optionLabel: string }>;
  appliedDecisions?: Array<{ syntheticId: string; optionLabel: string }>;
  onApplyConflictDirective?: (conflict: RunSummaryConflict) => void;
  onUndoConflictDirective?: (conflictTitle: string) => void;
}) {
  // Open by default when there are edges or conflicts.
  const semanticEdges = (revisionEdges ?? []).filter(
    (e) => e.type === "tension" || e.type === "oversight" || e.type === "amplification",
  );
  const conflictCount = summaryReport.conflictMap.length;
  const totalCount = Math.max(semanticEdges.length, conflictCount);

  const [open, setOpen] = useState(true);

  if (totalCount === 0) return null;

  const nodeById = new Map(synthetics.map((s) => [s.id, s]));

  return (
    <section>
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
        <span>Relations & Conflicts</span>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-label)", opacity: 0.6 }}>
          {totalCount}
        </span>
      </button>

      {open && (
        <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* If we have revisionEdges, show each as an EdgeRelationCard */}
          {semanticEdges.length > 0 ? (
            <>
              <p
                style={{
                  fontSize: "var(--text-label)",
                  color: "var(--t3)",
                  fontFamily: MONO,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Each connection below changes how agents receive each other&apos;s output during the run.
              </p>
              {semanticEdges.map((edge) => (
                <EdgeRelationCard
                  key={edge.id}
                  edge={edge}
                  fromNode={nodeById.get(edge.from)}
                  toNode={nodeById.get(edge.to)}
                  outputsBySyntheticId={outputsBySyntheticId}
                />
              ))}
              {/* Full conflict cards (with advisor path / apply button) for tension edges */}
              {conflictCount > 0 && (
                <ConflictMapTab
                  summaryReport={summaryReport}
                  synthetics={synthetics}
                  outputsBySyntheticId={outputsBySyntheticId}
                  stagedDecisions={stagedDecisions}
                  appliedDecisions={appliedDecisions}
                  onApplyConflictDirective={onApplyConflictDirective}
                  onUndoConflictDirective={onUndoConflictDirective}
                />
              )}
            </>
          ) : (
            // Fallback: only summaryReport.conflictMap (no revisionEdges prop provided)
            <ConflictMapTab
              summaryReport={summaryReport}
              synthetics={synthetics}
              outputsBySyntheticId={outputsBySyntheticId}
              stagedDecisions={stagedDecisions}
              appliedDecisions={appliedDecisions}
              onApplyConflictDirective={onApplyConflictDirective}
              onUndoConflictDirective={onUndoConflictDirective}
            />
          )}
        </div>
      )}
    </section>
  );
}
