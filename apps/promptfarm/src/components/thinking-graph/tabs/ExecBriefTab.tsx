"use client";

import { useMemo } from "react";
import type { SyntheticNode } from "@/lib/planning/types";
import type { RunSummaryReport } from "@/lib/thinking-graph/server/types";
import { computeRunDelta, type RunDelta } from "../OutcomeReport.delta";
import { MONO, SANS } from "../OutcomeReport.utils";

// ── Delta row ─────────────────────────────────────────────────────────────────

function DeltaRow({
  delta,
  label,
  nameToId,
  codeById,
  onAgentClick,
}: {
  delta: RunDelta;
  label: string;
  nameToId: Map<string, string>;
  codeById: Record<string, string>;
  onAgentClick?: (syntheticId: string) => void;
}) {
  const borderColor =
    delta.direction === "better"
      ? "var(--color-success-border)"
      : delta.direction === "worse"
        ? "var(--color-error-border)"
        : "var(--surface-container)";

  const bg =
    delta.direction === "better"
      ? "color-mix(in srgb, var(--color-success-bg) 40%, var(--surface-high))"
      : delta.direction === "worse"
        ? "color-mix(in srgb, var(--color-error-bg) 40%, var(--surface-high))"
        : "var(--surface-high)";

  function agentButton(name: string) {
    const id = nameToId.get(name);
    const code = id ? (codeById[id] ?? name) : name;
    return (
      <button
        key={name}
        type="button"
        onClick={() => id && onAgentClick?.(id)}
        style={{
          padding: 0,
          border: "none",
          background: "transparent",
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: "var(--text-caption)",
          color: "var(--primary)",
          cursor: id && onAgentClick ? "pointer" : "default",
          textDecoration: id && onAgentClick ? "underline" : "none",
          textUnderlineOffset: 2,
        }}
      >
        {code}
      </button>
    );
  }

  const segments: React.ReactNode[] = [];

  if (delta.improvedDomains.length > 0) {
    segments.push(
      <span key="improved" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-success-text)", fontFamily: MONO, fontSize: "var(--text-caption)" }}>
        <span>↑</span>
        {delta.improvedDomains.slice(0, 3).map(agentButton)}
        <span>improved</span>
        {delta.improvedDomains.length > 3 && (
          <span style={{ color: "var(--t3)" }}>+{delta.improvedDomains.length - 3}</span>
        )}
      </span>,
    );
  }

  if (delta.worsenedDomains.length > 0) {
    segments.push(
      <span key="worsened" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-warning-text)", fontFamily: MONO, fontSize: "var(--text-caption)" }}>
        <span>⚠</span>
        {delta.worsenedDomains.slice(0, 3).map(agentButton)}
        <span>new concern</span>
      </span>,
    );
  }

  if (delta.resolvedConflicts.length > 0) {
    segments.push(
      <span key="resolved" style={{ color: "var(--color-success-text)", fontFamily: MONO, fontSize: "var(--text-caption)" }}>
        {delta.resolvedConflicts.length} conflict{delta.resolvedConflicts.length !== 1 ? "s" : ""} resolved
      </span>,
    );
  }

  if (delta.newConflicts.length > 0) {
    segments.push(
      <span key="new-conflicts" style={{ color: "var(--color-error-text)", fontFamily: MONO, fontSize: "var(--text-caption)" }}>
        {delta.newConflicts.length} new conflict{delta.newConflicts.length !== 1 ? "s" : ""}
      </span>,
    );
  }

  if (segments.length === 0) {
    segments.push(
      <span key="no-change" style={{ color: "var(--t3)", fontFamily: MONO, fontSize: "var(--text-caption)" }}>
        No change in domain verdicts
      </span>,
    );
  }

  const DOT = <span style={{ color: "var(--t3)", fontFamily: MONO, fontSize: "var(--text-caption)", flexShrink: 0 }}>·</span>;

  return (
    <div
      style={{
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: bg,
        padding: "7px 12px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "4px 8px",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-label)",
          fontFamily: MONO,
          color: "var(--t3)",
          background: "var(--surface-container)",
          border: "1px solid var(--surface-container)",
          borderRadius: 4,
          padding: "1px 6px",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      {segments.map((seg, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i === 0 ? null : DOT}
          {seg}
        </span>
      ))}
    </div>
  );
}

// ── Brief sentence helpers ────────────────────────────────────────────────────

function parseSentence(sentence: string): { prefix: string | null; body: string } {
  const match = sentence.match(/^([A-Za-z][A-Za-z\s]{0,20}):\s(.+)$/);
  if (!match) return { prefix: null, body: sentence };
  return { prefix: match[1].trim(), body: match[2].trim() };
}

// ── ExecBriefTab ──────────────────────────────────────────────────────────────

export function ExecBriefTab({
  summaryReport,
  synthetics,
  previousRunSummary,
  previousRunLabel,
  onAgentClick,
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  previousRunSummary?: RunSummaryReport | null;
  previousRunLabel?: string;
  onAgentClick?: (syntheticId: string) => void;
}) {
  const codeById = useMemo(
    () => Object.fromEntries(synthetics.map((s) => [s.id, s.code])),
    [synthetics],
  );

  const nameToId = useMemo(
    () => new Map(synthetics.map((s) => [s.name, s.id])),
    [synthetics],
  );

  const delta = useMemo(
    () => (previousRunSummary ? computeRunDelta(summaryReport, previousRunSummary) : null),
    [summaryReport, previousRunSummary],
  );

  const conflict = summaryReport.biggestConflict;
  const deltaLabel = previousRunLabel ? `vs ${previousRunLabel}` : "vs Last Run";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Delta row — above brief when previous run exists */}
      {delta && (
        <DeltaRow
          delta={delta}
          label={deltaLabel}
          nameToId={nameToId}
          codeById={codeById}
          onAgentClick={onAgentClick}
        />
      )}

      {/* Executive brief */}
      <section>
        <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10, fontFamily: MONO }}>Brief</p>
        {summaryReport.executiveBrief.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {summaryReport.executiveBrief.map((item, index) => {
              const { prefix, body } = parseSentence(item.sentence);
              const isLast = index === summaryReport.executiveBrief.length - 1;
              return (
                <div
                  key={`brief-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: isLast ? "none" : "1px solid var(--surface-container)",
                  }}
                >
                  {/* Index number */}
                  <span style={{ width: 24, flexShrink: 0, fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--t3)", textAlign: "right", lineHeight: 1.65 }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  {/* Sentence content */}
                  <p style={{ fontSize: "var(--text-body)", color: "var(--on-surface-variant)", lineHeight: 1.65, fontFamily: SANS, overflowWrap: "break-word", margin: 0, flex: 1 }}>
                    {prefix && (
                      <span style={{ fontFamily: MONO, fontSize: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--t3)", marginRight: 7 }}>
                        {prefix}
                      </span>
                    )}
                    {body}
                    {item.sourceIds.length > 0 && (
                      <>
                        {"\u2009"}
                        {item.sourceIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onAgentClick?.(id)}
                            style={{
                              fontSize: "var(--text-label)",
                              fontFamily: MONO,
                              fontWeight: 600,
                              color: "var(--primary)",
                              background: "var(--primary-container)",
                              border: "1px solid var(--primary-border)",
                              borderRadius: 4,
                              padding: "1px 5px",
                              cursor: onAgentClick ? "pointer" : "default",
                              lineHeight: 1.5,
                              marginLeft: 3,
                              verticalAlign: "middle",
                            }}
                          >
                            {codeById[id] ?? id}
                          </button>
                        ))}
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: "var(--text-body)", color: "var(--t3)", fontFamily: SANS }}>No brief yet.</p>
        )}
      </section>

      {/* Biggest conflict */}
      {conflict && (
        <section>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10, fontFamily: MONO }}>Top Conflict</p>
          <blockquote style={{ margin: 0, paddingLeft: 12, borderLeft: "3px solid var(--color-error-border)", display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ fontSize: "var(--text-body)", color: "var(--on-surface)", fontFamily: SANS, lineHeight: 1.6, overflowWrap: "break-word", margin: 0 }}>
              {conflict.description}
            </p>
            <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.5, overflowWrap: "break-word", margin: 0 }}>
              {conflict.suggestion}
            </p>
          </blockquote>
        </section>
      )}

    </div>
  );
}
