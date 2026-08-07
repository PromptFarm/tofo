"use client";

import { useMemo, useState } from "react";
import type { SyntheticNode } from "@/lib/planning/types";
import type {
  RunSummaryConflict,
  RunSummaryConflictEdge,
  RunSummaryReport,
  SyntheticOutputJson,
  AdvisorConflictResolution,
  SyntheticPreparedDecision,
} from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import { MONO, SANS, matchAdvisorResolution } from "../OutcomeReport.utils";

export function ConflictCard({
  conflict,
  nameById,
  advisorResolution,
  stagedDecisions,
  appliedDecisions,
  onApplyPath,
  onUndoPath,
}: {
  conflict: RunSummaryConflictEdge;
  nameById: Map<string, string>;
  advisorResolution?: AdvisorConflictResolution | null;
  /** Staged decisions from the buffer — used to show "Decision staged" badge. */
  stagedDecisions?: Array<{ syntheticId: string; optionLabel: string }>;
  /** Applied/committed decisions — used to show "Decision applied" badge. */
  appliedDecisions?: Array<{ syntheticId: string; optionLabel: string }>;
  onApplyPath?: (payload: RunSummaryConflict) => void;
  onUndoPath?: (conflictTitle: string) => void;
}) {
  const [applied, setApplied] = useState(false);
  const severityColor = conflict.severity === "high" ? "var(--color-error-text)" : "var(--color-warning-text)";

  // Find any decision staged or applied that relates to one of the two conflicting agents.
  const conflictIds = new Set([conflict.fromSyntheticId, conflict.toSyntheticId]);
  const stagedDecision = stagedDecisions?.find((d) => conflictIds.has(d.syntheticId));
  const appliedDecision = appliedDecisions?.find((d) => conflictIds.has(d.syntheticId));
  const fromName = nameById.get(conflict.fromSyntheticId) ?? conflict.fromSyntheticId;
  const toName = nameById.get(conflict.toSyntheticId) ?? conflict.toSyntheticId;
  const suggestedPathText = advisorResolution?.suggestedPath ?? conflict.suggestion;
  const hasAdvisorPath = Boolean(advisorResolution?.suggestedPath);

  function handleApply() {
    if (!onApplyPath) return;
    setApplied(true);
    onApplyPath({ title: conflict.title, description: conflict.description, raisedBy: null, suggestion: advisorResolution!.suggestedPath });
  }

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${conflict.severity === "high" ? "var(--color-error-border)" : "var(--surface-container)"}`, background: "var(--surface-high)", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px 8px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--surface-container)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          <p style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--on-surface)", fontFamily: SANS }}>{conflict.title}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[fromName, toName].map((name, i) => (
              <span key={i} style={{ fontSize: "var(--text-caption)", fontWeight: 600, padding: "1px 7px", borderRadius: 20, background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", color: "var(--color-error-text)", fontFamily: SANS }}>
                {name}
              </span>
            ))}
            <span style={{ fontSize: "var(--text-label)", color: severityColor, fontFamily: MONO }}>↔</span>
            <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: conflict.severity === "high" ? "var(--color-error-bg)" : "var(--color-warning-bg)", border: `1px solid ${conflict.severity === "high" ? "var(--color-error-border)" : "var(--color-warning-border)"}`, color: severityColor, fontFamily: MONO, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
              {conflict.severity}
            </span>
            {hasAdvisorPath && (
              <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "var(--primary)", fontFamily: MONO, letterSpacing: "0.5px" }}>
                advisor
              </span>
            )}
            {appliedDecision && (
              <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", color: "var(--color-success-text)", fontFamily: MONO, letterSpacing: "0.4px", whiteSpace: "nowrap" as const }}>
                ✓ {appliedDecision.optionLabel}
              </span>
            )}
            {stagedDecision && !appliedDecision && (
              <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", color: "var(--color-warning-text)", fontFamily: MONO, letterSpacing: "0.4px", whiteSpace: "nowrap" as const }}>
                ⋯ staged: {stagedDecision.optionLabel}
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: SANS }}>{conflict.description}</p>
        <div style={{ borderRadius: 6, background: hasAdvisorPath ? "rgba(167,139,250,0.07)" : "var(--color-success-bg-subtle)", border: hasAdvisorPath ? "1px solid rgba(167,139,250,0.25)" : "1px solid var(--color-success-border)", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: "var(--text-label)", fontWeight: 600, color: hasAdvisorPath ? "var(--primary)" : "var(--color-success-text)", fontFamily: MONO }}>
            {hasAdvisorPath ? "Advisor path" : "Suggested path"}
          </p>
          <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.55, fontFamily: SANS }}>{suggestedPathText}</p>
          {advisorResolution?.whyThisPath && (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.5 }}>{advisorResolution.whyThisPath}</p>
          )}
          {!hasAdvisorPath && (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.5 }}>
              → Select {fromName} or {toName} on the canvas and use the chat panel to explore this conflict further.
            </p>
          )}
          {hasAdvisorPath && onApplyPath && (
            <div style={{ marginTop: 2 }}>
              {applied ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-caption)", fontFamily: MONO, color: "var(--color-warning-text)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 999, padding: "2px 10px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-warning-text)", flexShrink: 0 }} />
                    Staged — will apply on next run
                  </span>
                  <button type="button" onClick={() => { setApplied(false); onUndoPath?.(conflict.title); }} style={{ padding: 0, border: "none", background: "transparent", color: "var(--t3)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer", textDecoration: "underline" }}>
                    Undo
                  </button>
                </div>
              ) : (
                <button type="button" onClick={handleApply} style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid var(--primary-border)", background: "var(--primary-container)", color: "var(--primary)", fontSize: "var(--text-caption)", fontFamily: MONO, cursor: "pointer" }}>
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

export function ConflictMapTab({
  summaryReport,
  synthetics,
  outputsBySyntheticId,
  stagedDecisions,
  appliedDecisions,
  onApplyConflictDirective,
  onUndoConflictDirective,
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  outputsBySyntheticId?: Record<string, SyntheticOutputJson | null>;
  stagedDecisions?: Array<{ syntheticId: string; optionLabel: string }>;
  appliedDecisions?: Array<{ syntheticId: string; optionLabel: string }>;
  onApplyConflictDirective?: (conflict: RunSummaryConflict) => void;
  onUndoConflictDirective?: (conflictTitle: string) => void;
}) {
  const nameById = useMemo(() => new Map(synthetics.map((s) => [s.id, s.name])), [synthetics]);
  const codeById = useMemo(() => new Map(synthetics.map((s) => [s.id, s.code])), [synthetics]);

  const advisorResolutions = useMemo(() => {
    if (!outputsBySyntheticId) return [];
    const advisorSynthetic = synthetics.find((s) => s.nodeRole === "advisor");
    if (!advisorSynthetic) return [];
    const raw = outputsBySyntheticId[advisorSynthetic.id];
    if (!raw || !isAdvisorReport(raw)) return [];
    return raw.conflictResolution;
  }, [synthetics, outputsBySyntheticId]);

  if (summaryReport.conflictMap.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 10, textAlign: "center" }}>
        <span style={{ fontSize: 22 }}>◎</span>
        <p style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS }}>No conflicts detected</p>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.6, maxWidth: 340 }}>
          Conflicts appear here when agents identify competing priorities. You can also draw a conflict edge between two agents on the canvas to flag a known tension, then rerun.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {summaryReport.conflictMap.map((conflict) => (
        <ConflictCard
          key={`${conflict.fromSyntheticId}-${conflict.toSyntheticId}`}
          conflict={conflict}
          nameById={nameById}
          advisorResolution={matchAdvisorResolution(conflict, advisorResolutions, codeById)}
          stagedDecisions={stagedDecisions}
          appliedDecisions={appliedDecisions}
          onApplyPath={onApplyConflictDirective}
          onUndoPath={onUndoConflictDirective}
        />
      ))}
    </div>
  );
}

