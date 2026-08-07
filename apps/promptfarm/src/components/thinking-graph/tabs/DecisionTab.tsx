"use client";

import { useMemo, useState } from "react";
import type { SyntheticNode } from "@/lib/planning/types";
import type {
  AdvisorConflictResolution,
  RunSummaryConflict,
  RunSummaryConflictEdge,
  RunSummaryDecisionFamily,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticPreparedInputSource,
} from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import { MONO, SANS, matchAdvisorResolution, meterColor } from "../OutcomeReport.utils";
import type { DecisionRequiredPayload } from "../OutcomeReport.types";

// ── helpers ───────────────────────────────────────────────────────────────────

const METRICS = [
  { id: "feasibility",  label: "Feasibility",    highMeansBad: false, accessor: (r: RunSummaryReport["decisionMatrix"][number]) => r.feasibility },
  { id: "risk",         label: "Risk",            highMeansBad: true,  accessor: (r: RunSummaryReport["decisionMatrix"][number]) => r.risk },
  { id: "timePressure", label: "Time pressure",   highMeansBad: true,  accessor: (r: RunSummaryReport["decisionMatrix"][number]) => r.timePressure },
  { id: "userValue",    label: "User value",      highMeansBad: false, accessor: (r: RunSummaryReport["decisionMatrix"][number]) => r.userValue },
  { id: "costPressure", label: "Cost pressure",   highMeansBad: true,  accessor: (r: RunSummaryReport["decisionMatrix"][number]) => r.costPressure },
];

function buildDecisionPayload(family: RunSummaryDecisionFamily): DecisionRequiredPayload {
  return {
    type: "decision_required",
    syntheticId: family.contributorSyntheticIds[0] ?? "unknown",
    familyId: family.familyId,
    title: family.familyTitle,
    question: family.familyTitle,
    options: family.options.map((o) => ({ id: o.optionId, label: o.optionLabel, description: o.profileNote })),
    recommendedOptionId: family.recommendedOptionId,
    required: true,
  };
}

// ── DecisionCard ──────────────────────────────────────────────────────────────

function DecisionCard({
  family,
  onApplyDecisionOption,
}: {
  family: RunSummaryDecisionFamily;
  onApplyDecisionOption?: (payload: { decision: DecisionRequiredPayload; optionId: string; source?: SyntheticPreparedInputSource }) => void;
}) {
  const [appliedOptionId, setAppliedOptionId] = useState<string | null>(null);
  const appliedLabel = appliedOptionId
    ? (family.options.find((o) => o.optionId === appliedOptionId)?.optionLabel ?? appliedOptionId)
    : null;

  function handleAcceptRecommended() {
    if (!family.recommendedOptionId || !onApplyDecisionOption) return;
    const decision = buildDecisionPayload(family);
    onApplyDecisionOption({ decision, optionId: family.recommendedOptionId, source: "defaults" });
    setAppliedOptionId(family.recommendedOptionId);
  }

  function handleUndo() {
    setAppliedOptionId(null);
  }

  return (
    <section style={{ border: "1px solid var(--surface-container)", borderRadius: 10, background: "var(--surface-low)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--on-surface)", fontFamily: SANS, lineHeight: 1.3 }}>
          {family.familyTitle}
        </p>

        {/* Contributor chips */}
        {family.contributorSyntheticNames.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {family.contributorSyntheticNames.map((name) => (
              <span key={name} style={{ fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600, color: "var(--primary)", background: "var(--primary-container)", border: "1px solid var(--primary-border)", borderRadius: 4, padding: "1px 6px" }}>
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Applied / accept recommended row */}
        {appliedLabel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--color-success-text)", background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 999, padding: "2px 10px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-success-text)", flexShrink: 0 }} />
              Applied: {appliedLabel}
            </span>
            <button type="button" onClick={handleUndo}
              style={{ padding: 0, border: "none", background: "transparent", color: "var(--t3)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer", textDecoration: "underline" }}>
              Undo
            </button>
          </div>
        ) : family.recommendedOptionLabel && onApplyDecisionOption ? (
          <button type="button" onClick={handleAcceptRecommended}
            style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 999, border: "1px solid var(--color-success-border)", background: "var(--color-success-bg)", color: "var(--color-success-text)", fontSize: "var(--text-caption)", fontFamily: MONO, fontWeight: 600, cursor: "pointer" }}>
            Accept recommended: {family.recommendedOptionLabel}
          </button>
        ) : null}
      </div>

      {/* Compare options toggle */}
      {family.options.length > 0 && (
        <details style={{ borderTop: "1px solid var(--surface-container)" }}>
          <summary style={{ cursor: "pointer", padding: "8px 14px", fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--t3)", listStyle: "none", userSelect: "none" }}>
            ▶ Compare options
          </summary>
          <div style={{ padding: "0 14px 14px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 0 10px", textAlign: "left" }} />
                  {family.options.map((row) => (
                    <th key={row.optionId} style={{ padding: "6px 8px 10px", textAlign: "center", fontSize: "var(--text-caption)", fontWeight: 700, color: "var(--on-surface)", fontFamily: MONO, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <span>{row.optionLabel}</span>
                        <span style={{ fontSize: "var(--text-label)", color: "var(--t3)", fontWeight: 400 }}>{row.recommended ? "recommended" : "option"}</span>
                        {row.profileNote && (
                          <span style={{ fontSize: "var(--text-label)", color: "var(--on-surface-variant)", fontWeight: 400, lineHeight: 1.4, whiteSpace: "normal", maxWidth: 140 }}>{row.profileNote}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => (
                  <tr key={metric.id} style={{ borderTop: "1px solid var(--surface-container)" }}>
                    <td style={{ padding: "8px 12px 8px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: MONO, whiteSpace: "nowrap" }}>{metric.label}</span>
                        <span title={metric.highMeansBad ? "Lower is better" : "Higher is better"}
                          style={{ fontSize: "var(--text-label)", color: metric.highMeansBad ? "var(--color-error-text)" : "var(--color-success-text)", fontFamily: MONO, opacity: 0.8 }}>
                          {metric.highMeansBad ? "↓" : "↑"}
                        </span>
                      </div>
                    </td>
                    {family.options.map((row) => {
                      const value = metric.accessor(row);
                      const goodness = metric.highMeansBad ? 100 - value : value;
                      const badgeColor = goodness > 70 ? "var(--color-success-text)" : goodness >= 40 ? "var(--color-warning-text)" : "var(--color-error-text)";
                      const badgeBg   = goodness > 70 ? "var(--color-success-bg)"   : goodness >= 40 ? "var(--color-warning-bg)"   : "var(--color-error-bg)";
                      return (
                        <td key={row.optionId} style={{ padding: "8px", textAlign: "center" }}>
                          <div style={{ width: "100%", height: 4, background: "var(--surface-container)", borderRadius: 99, overflow: "hidden", marginBottom: 5 }}>
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
        </details>
      )}
    </section>
  );
}

// ── ConflictResolutionCard ────────────────────────────────────────────────────

function ConflictResolutionCard({
  conflict,
  nameById,
  advisorResolution,
  onApplyPath,
  onUndoPath,
}: {
  conflict: RunSummaryConflictEdge;
  nameById: Map<string, string>;
  advisorResolution: AdvisorConflictResolution | null;
  onApplyPath?: (payload: RunSummaryConflict) => void;
  onUndoPath?: (conflictTitle: string) => void;
}) {
  const [applied, setApplied] = useState(false);
  const fromName = nameById.get(conflict.fromSyntheticId) ?? conflict.fromSyntheticId;
  const toName   = nameById.get(conflict.toSyntheticId)   ?? conflict.toSyntheticId;
  const hasAdvisorPath = Boolean(advisorResolution?.suggestedPath);
  const pathText = advisorResolution?.suggestedPath ?? conflict.suggestion;
  const severityColor = conflict.severity === "high" ? "var(--color-error-text)" : "var(--color-warning-text)";
  const severityBg    = conflict.severity === "high" ? "var(--color-error-bg)"   : "var(--color-warning-bg)";
  const severityBorder= conflict.severity === "high" ? "var(--color-error-border)" : "var(--color-warning-border)";

  function handleApply() {
    if (!onApplyPath || !advisorResolution) return;
    setApplied(true);
    onApplyPath({ title: conflict.title, description: conflict.description, raisedBy: null, suggestion: advisorResolution.suggestedPath });
  }

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${severityBorder}`, background: "var(--surface-high)", overflow: "hidden" }}>
      {/* Title row */}
      <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--surface-container)" }}>
        <p style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--on-surface)", fontFamily: SANS, flex: 1, minWidth: 0 }}>{conflict.title}</p>
        {/* Severity badge */}
        <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: severityBg, border: `1px solid ${severityBorder}`, color: severityColor, fontFamily: MONO, textTransform: "uppercase" as const, letterSpacing: "0.5px", flexShrink: 0 }}>
          {conflict.severity}
        </span>
        {hasAdvisorPath && (
          <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "var(--primary)", fontFamily: MONO, flexShrink: 0 }}>
            advisor
          </span>
        )}
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Agent pair chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {[fromName, toName].map((name, i) => (
            <span key={i} style={{ fontSize: "var(--text-caption)", fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", color: "var(--color-error-text)", fontFamily: SANS }}>
              {name}
            </span>
          ))}
          <span style={{ fontSize: "var(--text-label)", color: severityColor, fontFamily: MONO }}>↔</span>
        </div>

        {/* Resolution path */}
        <div style={{ borderRadius: 6, background: hasAdvisorPath ? "rgba(167,139,250,0.07)" : "var(--color-success-bg-subtle)", border: hasAdvisorPath ? "1px solid rgba(167,139,250,0.25)" : "1px solid var(--color-success-border)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
          <p style={{ fontSize: "var(--text-label)", fontWeight: 600, color: hasAdvisorPath ? "var(--primary)" : "var(--color-success-text)", fontFamily: MONO }}>
            {hasAdvisorPath ? "Advisor path" : "Suggested path"}
          </p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.55, fontFamily: SANS }}>{pathText}</p>
          {advisorResolution?.whyThisPath && (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.5 }}>{advisorResolution.whyThisPath}</p>
          )}

          {/* Action row */}
          {hasAdvisorPath && onApplyPath && (
            <div style={{ marginTop: 2 }}>
              {applied ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--color-warning-text)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 999, padding: "2px 10px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-warning-text)", flexShrink: 0 }} />
                    Staged — will apply on next run
                  </span>
                  <button type="button" onClick={() => { setApplied(false); onUndoPath?.(conflict.title); }}
                    style={{ padding: 0, border: "none", background: "transparent", color: "var(--t3)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer", textDecoration: "underline" }}>
                    Undo
                  </button>
                </div>
              ) : (
                <button type="button" onClick={handleApply}
                  style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid var(--primary-border)", background: "var(--primary-container)", color: "var(--primary)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer" }}>
                  Apply this path
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DecisionTab ───────────────────────────────────────────────────────────────

export function DecisionTab({
  summaryReport,
  synthetics,
  outputsBySyntheticId,
  onApplyDecisionOption,
  onApplyConflictDirective,
  onUndoConflictDirective,
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  outputsBySyntheticId?: Record<string, SyntheticOutputJson | null>;
  onApplyDecisionOption?: (payload: { decision: DecisionRequiredPayload; optionId: string; source?: SyntheticPreparedInputSource }) => void;
  onApplyConflictDirective?: (conflict: RunSummaryConflict) => void;
  onUndoConflictDirective?: (conflictTitle: string) => void;
}) {
  const nameById = useMemo(() => new Map(synthetics.map((s) => [s.id, s.name])), [synthetics]);
  const codeById = useMemo(() => new Map(synthetics.map((s) => [s.id, s.code])), [synthetics]);

  const advisorResolutions = useMemo((): AdvisorConflictResolution[] => {
    if (!outputsBySyntheticId) return [];
    const advisorSynthetic = synthetics.find((s) => s.nodeRole === "advisor");
    if (!advisorSynthetic) return [];
    const raw = outputsBySyntheticId[advisorSynthetic.id];
    if (!raw || !isAdvisorReport(raw)) return [];
    return raw.conflictResolution;
  }, [synthetics, outputsBySyntheticId]);

  const actionableConflicts = useMemo(
    () => summaryReport.conflictMap.filter((c) => {
      const resolution = matchAdvisorResolution(c, advisorResolutions, codeById);
      return Boolean(resolution?.suggestedPath) || c.suggestion.trim().length > 0;
    }),
    [summaryReport.conflictMap, advisorResolutions, codeById],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Open Decisions ── */}
      <section>
        <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 12, fontFamily: MONO }}>Open Decisions</p>
        {summaryReport.decisionFamilies.length === 0 ? (
          <div style={{ borderRadius: 8, border: "1px solid var(--surface-container)", background: "var(--surface-low)", padding: "28px 20px", textAlign: "center" }}>
            <p style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS, marginBottom: 6 }}>No open decisions</p>
            <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.6 }}>
              All choices have been made or none were raised.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {summaryReport.decisionFamilies.map((family) => (
              <DecisionCard
                key={family.familyId}
                family={family}
                onApplyDecisionOption={onApplyDecisionOption}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Conflict Resolutions ── */}
      {actionableConflicts.length > 0 && (
        <section>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 12, fontFamily: MONO }}>Conflict Resolutions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actionableConflicts.map((conflict) => (
              <ConflictResolutionCard
                key={`${conflict.fromSyntheticId}-${conflict.toSyntheticId}`}
                conflict={conflict}
                nameById={nameById}
                advisorResolution={matchAdvisorResolution(conflict, advisorResolutions, codeById)}
                onApplyPath={onApplyConflictDirective}
                onUndoPath={onUndoConflictDirective}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
