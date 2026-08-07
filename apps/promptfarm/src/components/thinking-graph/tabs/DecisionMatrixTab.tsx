"use client";

import type {
  RunSummaryReport,
  SyntheticPreparedInputSource,
} from "@/lib/thinking-graph/server/types";
import { MONO, SANS, meterColor, applyDecisionOptionSelection } from "../OutcomeReport.utils";
import type { DecisionRequiredPayload } from "../OutcomeReport.types";
import type { StagedDecision } from "../hooks/useStagingBuffer";

export function DecisionMatrixTab({
  summaryReport,
  decisionRequired,
  allPendingDecisions,
  stagedDecisions,
  onApplyDecisionOption,
  onUnstageDecision,
}: {
  summaryReport: RunSummaryReport;
  decisionRequired?: DecisionRequiredPayload | null;
  /** Full pending decision list — used to resolve relation context (relatedNodeName) per family. */
  allPendingDecisions?: DecisionRequiredPayload[];
  stagedDecisions?: ReadonlyMap<string, StagedDecision>;
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  onUnstageDecision?: (familyId: string) => void;
}) {

  if (summaryReport.decisionMatrix.length === 0 && summaryReport.decisionFamilies.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 10, textAlign: "center" }}>
        <span style={{ fontSize: 22 }}>⊙</span>
        <p style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS }}>No decision families yet</p>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.6, maxWidth: 340 }}>
          When agents identify competing choices, the families appear here so you can compare options and apply a decision before the next run.
        </p>
      </div>
    );
  }

  // Build relation context lookup keyed by familyId (or title fallback).
  const relationContextByFamily = new Map<string, string>();
  for (const d of allPendingDecisions ?? []) {
    if (!d.relatedNodeName) continue;
    const key = d.familyId ?? d.title;
    if (!relationContextByFamily.has(key)) {
      relationContextByFamily.set(key, d.relatedNodeName);
    }
  }

  const URGENCY_RANK: Record<string, number> = { blocking: 2, important: 1, optional: 0 };

  // Sort blocking decisions to the top so they are immediately visible.
  const sortedFamilies = [...summaryReport.decisionFamilies].sort(
    (a, b) => (URGENCY_RANK[b.urgency] ?? 1) - (URGENCY_RANK[a.urgency] ?? 1),
  );

  const metrics = [
    { id: "feasibility", label: "Feasibility", highMeansBad: false, accessor: (row: RunSummaryReport["decisionMatrix"][number]) => row.feasibility },
    { id: "risk", label: "Risk exposure", highMeansBad: true, accessor: (row: RunSummaryReport["decisionMatrix"][number]) => row.risk },
    { id: "timePressure", label: "Time pressure", highMeansBad: true, accessor: (row: RunSummaryReport["decisionMatrix"][number]) => row.timePressure },
    { id: "userValue", label: "User value", highMeansBad: false, accessor: (row: RunSummaryReport["decisionMatrix"][number]) => row.userValue },
    { id: "costPressure", label: "Cost pressure", highMeansBad: true, accessor: (row: RunSummaryReport["decisionMatrix"][number]) => row.costPressure },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: MONO, lineHeight: 1.5 }}>
        Pick an option for each decision family. Staged choices apply on the next run.
      </p>
      {sortedFamilies.map((family) => {
        const isBlocking = family.urgency === "blocking";
        const isOptional = family.urgency === "optional";
        const urgencyBadge = isBlocking
          ? { label: "⚠ Needs Decision", color: "var(--color-error-text)", bg: "var(--color-error-bg)", border: "var(--color-error-border)" }
          : isOptional
            ? { label: "Optional", color: "var(--t3)", bg: "var(--surface-container)", border: "var(--surface-container)" }
            : null;

        const effectiveDecision: DecisionRequiredPayload =
          decisionRequired?.familyId === family.familyId
            ? decisionRequired
            : {
                type: "decision_required",
                syntheticId: family.contributorSyntheticIds[0] ?? "unknown",
                familyId: family.familyId,
                title: family.familyTitle,
                question: family.familyTitle,
                options: family.options.map((o) => ({ id: o.optionId, label: o.optionLabel, description: o.profileNote })),
                recommendedOptionId: family.recommendedOptionId ?? null,
                required: true,
              };
        return (
        <section
          key={family.familyId}
          style={{
            border: isBlocking
              ? "1px solid var(--color-error-border)"
              : "1px solid var(--surface-container)",
            borderLeft: isBlocking ? "4px solid var(--color-error-border)" : undefined,
            borderRadius: 10,
            background: isBlocking
              ? "color-mix(in srgb, var(--color-error-bg) 12%, var(--surface-low))"
              : "var(--surface-low)",
            padding: "12px 14px",
          }}
        >
          <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontSize: "var(--text-caption)", fontWeight: 700, color: "var(--on-surface)", fontFamily: MONO, margin: 0 }}>
              {family.familyTitle}
            </p>
            {urgencyBadge && (
              <span style={{
                fontSize: "var(--text-label)",
                fontFamily: MONO,
                fontWeight: 700,
                color: urgencyBadge.color,
                background: urgencyBadge.bg,
                border: `1px solid ${urgencyBadge.border}`,
                borderRadius: 4,
                padding: "2px 7px",
                whiteSpace: "nowrap",
              }}>
                {urgencyBadge.label}
              </span>
            )}
          </div>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: MONO, lineHeight: 1.5, marginBottom: relationContextByFamily.has(family.familyId) ? 4 : 12 }}>
            Contributors: {family.contributorSyntheticNames.join(", ")}
            {family.recommendedOptionLabel ? ` · prefer ${family.recommendedOptionLabel}` : ""}
          </p>
          {(() => {
            const counterpartName = relationContextByFamily.get(family.familyId);
            if (!counterpartName) return null;
            const fromName = family.contributorSyntheticNames[0] ?? "Agent";
            return (
              <p style={{ fontSize: "var(--text-label)", color: "var(--t3)", fontFamily: MONO, lineHeight: 1.4, marginBottom: 12, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ opacity: 0.5 }}>↔</span>
                <span>from tension: </span>
                <span style={{ fontWeight: 600, color: "var(--on-surface-variant)" }}>{fromName}</span>
                <span style={{ opacity: 0.5 }}>vs</span>
                <span style={{ fontWeight: 600, color: "var(--on-surface-variant)" }}>{counterpartName}</span>
              </p>
            );
          })()}
          <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {effectiveDecision.options.map((option) => {
                const isRecommended = option.id === effectiveDecision.recommendedOptionId;
                const stagedOptionId = stagedDecisions?.get(family.familyId)?.optionId;
                const isThisStaged = stagedOptionId === option.id;
                const anotherStaged = stagedOptionId !== undefined && !isThisStaged;

                if (isThisStaged) {
                  return (
                    <span
                      key={`${family.familyId}-staged-${option.id}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 999, border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "var(--color-success-text)", fontSize: "var(--text-caption)", fontFamily: MONO, fontWeight: 600 }}>
                        <span>✓</span>
                        <span>{option.label} — staged</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onUnstageDecision?.(family.familyId)}
                        style={{ padding: "2px 7px", borderRadius: 999, border: "1px solid var(--surface-container)", background: "transparent", color: "var(--t3)", fontSize: "var(--text-label)", fontFamily: MONO, cursor: "pointer" }}
                      >
                        Change
                      </button>
                    </span>
                  );
                }

                return (
                  <button
                    key={`${family.familyId}-action-${option.id}`}
                    type="button"
                    disabled={anotherStaged}
                    onClick={() => {
                      applyDecisionOptionSelection({ decision: effectiveDecision, optionId: option.id, onApplyDecisionOption });
                      // buffer write is handled by applyDecisionOptionSelection → onApplyDecisionOption
                    }}
                    style={{
                      padding: "6px 10px", borderRadius: 999,
                      border: `1px solid ${isRecommended ? "var(--primary-border)" : "var(--surface-container)"}`,
                      background: isRecommended ? "var(--primary-container)" : "transparent",
                      color: isRecommended ? "var(--primary)" : "var(--on-surface-variant)",
                      fontSize: "var(--text-caption)", fontFamily: MONO,
                      cursor: anotherStaged || !onApplyDecisionOption ? "default" : "pointer",
                      opacity: anotherStaged ? 0.35 : onApplyDecisionOption ? 1 : 0.75,
                    }}
                  >
                    {isRecommended ? `✓ ${option.label}` : option.label}
                  </button>
                );
              })}
            </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 0 10px", textAlign: "left" }} />
                  {family.options.map((row) => (
                    <th key={`${row.familyId}-${row.optionId}`} style={{ padding: "6px 8px 10px", textAlign: "center", fontSize: "var(--text-caption)", fontWeight: 700, color: "var(--on-surface)", fontFamily: MONO, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span>{row.optionLabel}</span>
                        <span style={{ fontSize: "var(--text-label)", color: "var(--t3)", fontWeight: 400 }}>{row.recommended ? "recommended" : "option"}</span>
                        <span style={{ fontSize: "var(--text-label)", color: "var(--on-surface-variant)", fontWeight: 400, lineHeight: 1.4, whiteSpace: "normal", maxWidth: 140 }}>{row.profileNote}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={`${family.familyId}-${metric.id}`} style={{ borderTop: "1px solid var(--surface-container)" }}>
                    <td style={{ padding: "10px 12px 10px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: MONO, whiteSpace: "nowrap" }}>{metric.label}</span>
                        <span title={metric.highMeansBad ? "Lower is better" : "Higher is better"} style={{ fontSize: "var(--text-label)", color: metric.highMeansBad ? "var(--color-error-text)" : "var(--color-success-text)", fontFamily: MONO, opacity: 0.8 }}>
                          {metric.highMeansBad ? "↓ better" : "↑ better"}
                        </span>
                      </div>
                    </td>
                    {family.options.map((row) => {
                      const value = metric.accessor(row);
                      const goodness = metric.highMeansBad ? 100 - value : value;
                      const badgeColor = goodness > 70 ? "var(--color-success-text)" : goodness >= 40 ? "var(--color-warning-text)" : "var(--color-error-text)";
                      const badgeBg = goodness > 70 ? "var(--color-success-bg)" : goodness >= 40 ? "var(--color-warning-bg)" : "var(--color-error-bg)";
                      return (
                        <td key={`${family.familyId}-${metric.id}-${row.optionId}`} style={{ padding: "10px 8px", textAlign: "center" }}>
                          <div style={{ width: "100%", height: 4, background: "var(--surface-container)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                            <div style={{ width: `${value}%`, height: "100%", background: meterColor(value, metric.highMeansBad), borderRadius: 99 }} />
                          </div>
                          <span style={{ display: "inline-block", fontSize: "var(--text-label)", fontWeight: 700, fontFamily: MONO, color: badgeColor, background: badgeBg, border: `1px solid ${badgeColor}33`, borderRadius: 4, padding: "1px 5px", lineHeight: 1.6 }}>
                            {value}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        );
      })}
      <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.5, marginTop: 4 }}>
        Scores are agent estimates (0–100). Higher feasibility and user value = better. Higher risk, time pressure, and cost = worse.
      </p>
    </div>
  );
}

