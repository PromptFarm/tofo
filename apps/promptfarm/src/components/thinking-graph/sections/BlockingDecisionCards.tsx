"use client";

import { useMemo, useState } from "react";
import type {
  DomainVerdict,
  RunSummaryDecisionFamily,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticReport,
  SyntheticPreparedInputSource,
  SyntheticUserFacingQuestion,
} from "@/lib/thinking-graph/server/types";
import { MONO, SANS, meterColor } from "../OutcomeReport.utils";
import type { DecisionRequiredPayload } from "../OutcomeReport.types";
import { ReadinessProgressBar } from "../panels/ReadinessProgressBar";
import type { StagedDecision } from "../hooks/useStagingBuffer";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";

// ── Urgency helpers ───────────────────────────────────────────────────────────

type UrgencyLevel = "blocking" | "important" | "optional";

function getAttachedQuestions(
  output: SyntheticOutputJson | null | undefined,
): SyntheticUserFacingQuestion[] {
  if (!output || !("details" in output)) return [];
  const report = output as SyntheticReport;
  return report.operational?.userFacing?.questions ?? [];
}

function resolveUrgency(decision: DecisionRequiredPayload): UrgencyLevel {
  return decision.urgency ?? "blocking";
}

type UrgencyStyle = {
  borderLeft: string;
  background: string;
  headerColor: string;
  headerBg: string;
  headerText: string;
};

const URGENCY_STYLE: Record<UrgencyLevel, UrgencyStyle> = {
  blocking: {
    borderLeft: "3px solid var(--color-error-border)",
    background: "color-mix(in srgb, var(--color-error-bg) 25%, var(--surface-low))",
    headerColor: "var(--color-error-text)",
    headerBg: "color-mix(in srgb, var(--color-error-bg) 40%, transparent)",
    headerText: "⚠ NEEDS DECISION",
  },
  important: {
    borderLeft: "3px solid var(--primary-border)",
    background: "color-mix(in srgb, var(--primary-container) 20%, var(--surface-low))",
    headerColor: "var(--primary)",
    headerBg: "color-mix(in srgb, var(--primary-container) 30%, transparent)",
    headerText: "",
  },
  optional: {
    borderLeft: "3px solid var(--surface-container)",
    background: "var(--surface-low)",
    headerColor: "var(--t3)",
    headerBg: "transparent",
    headerText: "",
  },
};

// For secondary "also blocking" cards (index > 0 among blocking decisions)
const ALSO_BLOCKING_STYLE: UrgencyStyle = {
  borderLeft: "3px solid var(--color-warning-border)",
  background: "color-mix(in srgb, var(--color-warning-bg) 25%, var(--surface-low))",
  headerColor: "var(--color-warning-text)",
  headerBg: "color-mix(in srgb, var(--color-warning-bg) 40%, transparent)",
  headerText: "⚠ ALSO NEEDED",
};

// ── Resolved card ─────────────────────────────────────────────────────────────

function ResolvedDecisionCard({
  decision,
  chosenLabel,
}: {
  decision: DecisionRequiredPayload;
  chosenLabel: string;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--color-success-border)",
        background: "color-mix(in srgb, var(--color-success-bg) 20%, var(--surface-low))",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>✅</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS, margin: 0, lineHeight: 1.4 }}>
          {decision.title}
        </p>
        <p style={{ fontSize: "var(--text-label)", color: "var(--color-success-text)", fontFamily: MONO, margin: "2px 0 0", lineHeight: 1 }}>
          {chosenLabel}
        </p>
      </div>
    </div>
  );
}

// ── Compare-options metrics (mirrors DecisionTab.tsx) ────────────────────────

const METRICS = [
  { id: "feasibility",  label: "Feasibility",  highMeansBad: false, accessor: (r: RunSummaryDecisionFamily["options"][number]) => r.feasibility },
  { id: "risk",         label: "Risk",          highMeansBad: true,  accessor: (r: RunSummaryDecisionFamily["options"][number]) => r.risk },
  { id: "timePressure", label: "Time pressure", highMeansBad: true,  accessor: (r: RunSummaryDecisionFamily["options"][number]) => r.timePressure },
  { id: "userValue",    label: "User value",    highMeansBad: false, accessor: (r: RunSummaryDecisionFamily["options"][number]) => r.userValue },
  { id: "costPressure", label: "Cost pressure", highMeansBad: true,  accessor: (r: RunSummaryDecisionFamily["options"][number]) => r.costPressure },
];

// ── Single decision card ──────────────────────────────────────────────────────

const EDGE_TYPE_ARROW: Record<SyntheticEdge["type"], string> = {
  tension:      "↔",
  oversight:    "→",
  amplification:"⇡",
  structural:   "—",
};

function DecisionCard({
  decision,
  urgencyStyle,
  urgencyBadge,
  relatedEdgeLabel,
  relatedEdgeType,
  sourceAgentCode,
  attachedQuestions,
  family,
  selectedOptionId,
  initialAnswers,
  initialSubmittedAnswers,
  onApplyDecisionOption,
  onUndoDecisionOption,
  onAnswersChange,
  onApplyStructuredClarifications,
}: {
  decision: DecisionRequiredPayload;
  urgencyStyle: UrgencyStyle;
  urgencyBadge?: string;
  relatedEdgeLabel?: string;
  relatedEdgeType?: SyntheticEdge["type"];
  sourceAgentCode?: string;
  attachedQuestions: SyntheticUserFacingQuestion[];
  family?: RunSummaryDecisionFamily | null;
  /** Controlled: which option is currently staged for this decision (from parent/buffer). */
  selectedOptionId: string | null;
  /** Pre-existing question answers (lifted to parent, survives remount) */
  initialAnswers?: Record<string, string>;
  /** If answers were already submitted in a previous session, start in submitted state */
  initialSubmittedAnswers?: Record<string, string> | null;
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  onUndoDecisionOption?: () => void;
  /** Notifies parent when answers change so they can persist across remounts */
  onAnswersChange?: (answers: Record<string, string>) => void;
  onApplyStructuredClarifications?: (payload: {
    syntheticId: string;
    syntheticName: string;
    answers: { questionId: string; questionLabel: string; answer: string }[];
    source?: SyntheticPreparedInputSource;
  }) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string> | null>(
    initialSubmittedAnswers ?? null,
  );

  const hasQuestions = attachedQuestions.length > 0;
  // At least one non-empty answer is required to submit.
  const anyAnswered = !hasQuestions || attachedQuestions.some(
    (q) => (answers[q.id] ?? "").trim().length > 0,
  );

  function updateAnswers(next: Record<string, string>) {
    setAnswers(next);
    onAnswersChange?.(next);
  }

  function handleOptionClick(optionId: string) {
    onApplyDecisionOption?.({ decision, optionId, source: "manual_edit" });
  }

  function handleUndo() {
    onUndoDecisionOption?.();
  }

  function handleSubmitAnswers() {
    if (!onApplyStructuredClarifications) return;
    const filled = attachedQuestions
      .map((q) => ({ questionId: q.id, questionLabel: q.label, answer: (answers[q.id] ?? "").trim() }))
      .filter((a) => a.answer.length > 0);
    if (filled.length === 0) return;
    onApplyStructuredClarifications({
      syntheticId: decision.syntheticId,
      syntheticName: decision.title,
      answers: filled,
      source: "manual_edit",
    });
    // Save submitted answers for display, keep in editable state for re-edit
    setSubmittedAnswers({ ...answers });
  }

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--surface-container)",
        borderLeft: urgencyStyle.borderLeft,
        background: urgencyStyle.background,
        overflow: "hidden",
      }}
    >
      {/* ── Badge row ── */}
      {urgencyBadge && (
        <div
          style={{
            padding: "4px 14px",
            background: urgencyStyle.headerBg,
            borderBottom: "1px solid var(--surface-container)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{
            fontSize: "var(--text-label)",
            fontWeight: 700,
            fontFamily: MONO,
            color: urgencyStyle.headerColor,
            letterSpacing: "0.04em",
          }}>
            {urgencyBadge}
          </span>
        </div>
      )}

      {/* ── Title + question ── */}
      <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Involved agents mini-card — shown when both sides of the relation are known */}
        {sourceAgentCode && decision.relatedNodeName && relatedEdgeType && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Source badge */}
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: MONO,
              padding: "2px 7px", borderRadius: 4,
              background: "rgba(167,139,250,0.12)",
              border: "1px solid rgba(167,139,250,0.28)",
              color: "var(--primary)",
              letterSpacing: "0.05em",
              lineHeight: 1.4,
            }}>
              {sourceAgentCode}
            </span>
            {/* Edge type arrow */}
            <span style={{ fontSize: 10, color: "var(--t3)", fontFamily: MONO, flexShrink: 0 }}>
              {EDGE_TYPE_ARROW[relatedEdgeType]}
            </span>
            {/* Counterpart badge */}
            <span style={{
              fontSize: 9, fontWeight: 700, fontFamily: MONO,
              padding: "2px 7px", borderRadius: 4,
              background: "rgba(167,139,250,0.12)",
              border: "1px solid rgba(167,139,250,0.28)",
              color: "var(--primary)",
              letterSpacing: "0.05em",
              lineHeight: 1.4,
            }}>
              {decision.relatedNodeName}
            </span>
          </div>
        )}
        {/* Relation context label — only shown when mini-card isn't rendered */}
        {relatedEdgeLabel && !(sourceAgentCode && decision.relatedNodeName && relatedEdgeType) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 2, height: 14, borderRadius: 1, background: "var(--t3)", flexShrink: 0 }} />
            <span style={{
              fontSize: "var(--text-label)",
              fontFamily: MONO,
              color: "var(--t3)",
              letterSpacing: "0.03em",
              lineHeight: 1,
            }}>
              {relatedEdgeLabel}
            </span>
          </div>
        )}
        <p style={{
          fontSize: "var(--text-body)",
          fontWeight: 600,
          color: "var(--on-surface)",
          fontFamily: SANS,
          margin: 0,
          lineHeight: 1.3,
        }}>
          {decision.title}
        </p>
        {decision.question && decision.question !== decision.title && (
          <p style={{
            fontSize: "var(--text-caption)",
            color: "var(--on-surface-variant)",
            fontFamily: SANS,
            lineHeight: 1.55,
            margin: 0,
          }}>
            {decision.question}
          </p>
        )}
      </div>

      {/* ── Option list — hidden once user has selected ── */}
      {!selectedOptionId && (
      <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        {decision.options.map((option) => {
          const isRecommended = option.id === decision.recommendedOptionId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleOptionClick(option.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                background: isRecommended
                  ? "color-mix(in srgb, var(--primary-container) 50%, var(--surface-low))"
                  : "var(--surface-low)",
                border: isRecommended ? "1px solid var(--primary-border)" : "1px solid var(--surface-container)",
                borderRadius: 8,
                padding: "8px 10px",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.1s, border-color 0.1s",
              }}
            >
              {/* Radio dot */}
              <span style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: `2px solid ${isRecommended ? "var(--primary)" : "var(--on-surface-variant)"}`,
                background: isRecommended ? "var(--primary)" : "transparent",
                flexShrink: 0,
                marginTop: 3,
              }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{
                  fontSize: "var(--text-caption)",
                  fontWeight: isRecommended ? 600 : 400,
                  color: "var(--on-surface)",
                  fontFamily: SANS,
                  lineHeight: 1.4,
                }}>
                  {option.label}
                </span>
                {option.description && option.description !== option.label && (
                  <span style={{
                    fontSize: "var(--text-label)",
                    color: "var(--on-surface-variant)",
                    fontFamily: SANS,
                    lineHeight: 1.4,
                    opacity: 0.85,
                  }}>
                    {option.description}
                  </span>
                )}
              </span>
              {isRecommended && (
                <span style={{
                  fontSize: "var(--text-label)",
                  fontFamily: MONO,
                  color: "var(--primary)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>
                  ✓ Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* ── Staged confirmation — shown immediately after pick ── */}
      {selectedOptionId && (() => {
        const chosen = decision.options.find((o) => o.id === selectedOptionId);
        return (
          <div style={{
            margin: "0 14px 12px",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-success-border)",
            background: "color-mix(in srgb, var(--color-success-bg) 30%, var(--surface-low))",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>✅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                color: "var(--color-success-text)",
                fontFamily: MONO,
                margin: 0,
                lineHeight: 1.3,
              }}>
                Staged: {chosen?.label ?? selectedOptionId}
              </p>
              <p style={{
                fontSize: "var(--text-label)",
                color: "var(--on-surface-variant)",
                fontFamily: SANS,
                margin: "2px 0 0",
                lineHeight: 1.4,
              }}>
                Will apply on next run · staged in queue
              </p>
            </div>
            <button
              type="button"
              onClick={handleUndo}
              style={{
                background: "none",
                border: "1px solid var(--surface-container)",
                borderRadius: 6,
                padding: "3px 9px",
                fontSize: "var(--text-label)",
                fontFamily: MONO,
                color: "var(--t3)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Undo
            </button>
          </div>
        );
      })()}

      {/* ── Compare options (metrics table, collapsible) ── */}

      {/* ── Attached questions ── */}
      {hasQuestions && (
        <>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderTop: "1px solid var(--surface-container)",
            background: "color-mix(in srgb, var(--color-warning-bg) 12%, transparent)",
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--surface-container)" }} />
            <span style={{
              fontSize: "var(--text-label)",
              fontFamily: MONO,
              color: "var(--color-warning-text)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}>
              ─── Also answer ───
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--surface-container)" }} />
          </div>

          <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* ── Submitted read-only view ── */}
            {submittedAnswers ? (
              <>
                {attachedQuestions.map((q) => {
                  const ans = submittedAnswers[q.id]?.trim();
                  if (!ans) return null;
                  return (
                    <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS }}>
                        <span style={{ color: "var(--color-warning-text)", marginRight: 5 }}>Q:</span>
                        {q.question}
                      </span>
                      <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, padding: "6px 10px", borderRadius: 7, background: "var(--surface-container)", borderLeft: "3px solid var(--color-warning-border, var(--primary-border))" }}>
                        {ans}
                      </span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--color-success-text)" }}>
                    ✓ Answers submitted — staged for next run
                  </span>
                  <button
                    type="button"
                    onClick={() => setSubmittedAnswers(null)}
                    style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--surface-container)", background: "transparent", color: "var(--t3)", fontSize: "var(--text-label)", fontFamily: MONO, cursor: "pointer" }}
                  >
                    Edit
                  </button>
                </div>
              </>
            ) : (
              <>
                {attachedQuestions.map((q) => (
                  <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label
                      htmlFor={`bdc-${decision.syntheticId}-${q.id}`}
                      style={{
                        fontSize: "var(--text-caption)",
                        fontWeight: 600,
                        color: "var(--on-surface)",
                        fontFamily: SANS,
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ color: "var(--color-warning-text)", marginRight: 5 }}>Q:</span>
                      {q.question}
                      {q.required && <span style={{ color: "var(--color-error-text)", marginLeft: 3 }}>*</span>}
                    </label>
                    {q.whyItMatters && (
                      <p style={{
                        fontSize: "var(--text-label)",
                        color: "var(--t3)",
                        fontFamily: SANS,
                        lineHeight: 1.4,
                        margin: 0,
                      }}>
                        {q.whyItMatters}
                      </p>
                    )}
                    <input
                      id={`bdc-${decision.syntheticId}-${q.id}`}
                      type="text"
                      value={answers[q.id] ?? ""}
                      onChange={(e) => updateAnswers({ ...answers, [q.id]: e.target.value })}
                      placeholder={q.suggestedAnswer ?? "Your answer…"}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        borderRadius: 7,
                        border: "1px solid var(--surface-container)",
                        background: "var(--surface-low)",
                        color: "var(--on-surface)",
                        fontSize: "var(--text-caption)",
                        fontFamily: SANS,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                ))}

                {onApplyStructuredClarifications && (
                  <button
                    type="button"
                    disabled={!anyAnswered}
                    onClick={handleSubmitAnswers}
                    style={{
                      alignSelf: "flex-start",
                      padding: "6px 14px",
                      borderRadius: 7,
                      border: anyAnswered
                        ? "1px solid var(--color-warning-border, var(--primary-border))"
                        : "1px solid var(--surface-container)",
                      background: anyAnswered
                        ? "color-mix(in srgb, var(--color-warning-bg) 50%, var(--surface-low))"
                        : "var(--surface-container)",
                      color: anyAnswered ? "var(--color-warning-text)" : "var(--t3)",
                      fontSize: "var(--text-caption)",
                      fontFamily: MONO,
                      fontWeight: 600,
                      cursor: anyAnswered ? "pointer" : "default",
                      opacity: anyAnswered ? 1 : 0.6,
                    }}
                  >
                    Submit answers
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── BlockingDecisionCards (exported) ─────────────────────────────────────────

const EDGE_TYPE_LABELS: Record<SyntheticEdge["type"], (counterpartName: string) => string> = {
  tension:      (n) => `↔ Tension with: ${n}`,
  oversight:    (n) => `↑ Oversees: ${n}`,
  amplification:(n) => `↗ Amplifies: ${n}`,
  structural:   (n) => `— Linked to: ${n}`,
};

export function BlockingDecisionCards({
  pendingDecisions,
  outputsBySyntheticId,
  summaryReport,
  stagedDecisions,
  edges,
  synthetics,
  onApplyDecisionOption,
  onUnstageDecision,
  appliedClarifications,
  onApplyStructuredClarifications,
}: {
  pendingDecisions: DecisionRequiredPayload[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  /** Used to look up the matching decision family for the Compare options table */
  summaryReport?: RunSummaryReport | null;
  /** Graph edges — used to resolve relatedEdgeId into a human-readable label */
  edges?: SyntheticEdge[];
  /** Graph nodes — used to resolve the source agent code for the mini-card */
  synthetics?: SyntheticNode[];
  /**
   * Live staging buffer snapshot from useStagingBuffer.
   * selectedOptionId for each DecisionCard is derived directly from this map,
   * so Discard (unstageAll) instantly resets all cards without local state.
   */
  stagedDecisions?: ReadonlyMap<string, StagedDecision>;
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  /** Called when user undoes a staged decision — removes it from the staging buffer */
  onUnstageDecision?: (familyId: string) => void;
  /** Applied clarifications from preparedInputs — used to restore submitted-answer state on reload */
  appliedClarifications?: SyntheticPreparedClarification[];
  onApplyStructuredClarifications?: (payload: {
    syntheticId: string;
    syntheticName: string;
    answers: { questionId: string; questionLabel: string; answer: string }[];
    source?: SyntheticPreparedInputSource;
  }) => void;
}) {
  // Question answers keyed by syntheticId — lifted here so they survive within a session.
  // Not persisted across full page reloads, but survives modal close/reopen.
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, Record<string, string>>>({});

  function handleApplyOption(payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) {
    onApplyDecisionOption?.(payload);
  }

  function handleUndoOption(decision: DecisionRequiredPayload) {
    // Remove from the staging buffer — this causes stagedDecisions to update,
    // which drives selectedOptionId back to null (controlled).
    onUnstageDecision?.(decision.familyId ?? decision.title);
  }

  /** Derive the currently staged optionId for a decision from the live buffer. */
  function getStagedOptionId(decision: DecisionRequiredPayload): string | null {
    if (!stagedDecisions) return null;
    const familyKey = decision.familyId?.trim().length ? decision.familyId : decision.syntheticId;
    return stagedDecisions.get(familyKey)?.optionId ?? null;
  }

  // Count blocking decisions for progress bar
  const totalBlocking = useMemo(
    () => pendingDecisions.filter((d) => resolveUrgency(d) === "blocking").length,
    [pendingDecisions],
  );

  const resolvedBlocking = useMemo(
    () =>
      pendingDecisions.filter(
        (d) => resolveUrgency(d) === "blocking" && getStagedOptionId(d) !== null,
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingDecisions, stagedDecisions],
  );

  // Index decisionFamilies by familyId for O(1) lookup
  const familyById = useMemo(() => {
    const map = new Map<string, RunSummaryDecisionFamily>();
    for (const f of summaryReport?.decisionFamilies ?? []) {
      map.set(f.familyId, f);
      // also index by title for fallback matching
      map.set(f.familyTitle, f);
    }
    return map;
  }, [summaryReport?.decisionFamilies]);

  // Build edge map keyed by id for O(1) relatedEdgeId lookup
  const edgeById = useMemo(() => {
    const map = new Map<string, SyntheticEdge>();
    for (const e of edges ?? []) map.set(e.id, e);
    return map;
  }, [edges]);

  // Build node map keyed by id for O(1) source agent code lookup
  const nodeById = useMemo(() => {
    const map = new Map<string, SyntheticNode>();
    for (const n of synthetics ?? []) map.set(n.id, n);
    return map;
  }, [synthetics]);

  // Build clarification map keyed by syntheticId → submitted answer Record
  // so each DecisionCard can restore its "submitted" state on reload.
  const clarificationAnswersBySyntheticId = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const c of appliedClarifications ?? []) {
      const record: Record<string, string> = {};
      for (const a of c.answers) record[a.questionId] = a.answer;
      map.set(c.syntheticId, record);
    }
    return map;
  }, [appliedClarifications]);

  // Track which blocking decisions we've seen so second+ get "ALSO BLOCKING" style
  let blockingSeenCount = 0;

  if (pendingDecisions.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Section label */}
      <p style={{
        fontSize: "var(--text-label)",
        letterSpacing: "1px",
        textTransform: "uppercase",
        color: "var(--color-error-text)",
        fontFamily: MONO,
        margin: 0,
      }}>
        Decisions Required · {pendingDecisions.length}
      </p>
      <p style={{
        fontSize: "var(--text-label)",
        color: "var(--on-surface-variant)",
        fontFamily: MONO,
        margin: 0,
        lineHeight: 1.55,
      }}>
        These decisions arise from tensions and dependencies in your graph. Resolving them will update the affected agents on the next run.
      </p>

      {/* Cards */}
      {pendingDecisions.map((decision) => {
        const urgency = resolveUrgency(decision);
        const stagedOptionId = getStagedOptionId(decision);
        const attachedQuestions = getAttachedQuestions(
          outputsBySyntheticId[decision.syntheticId],
        );
        const family = (decision.familyId ? familyById.get(decision.familyId) : undefined)
          ?? familyById.get(decision.title)
          ?? null;


        // Determine visual style
        let style: UrgencyStyle;
        let badge: string | undefined;

        if (urgency === "blocking") {
          const isFirst = blockingSeenCount === 0;
          blockingSeenCount++;
          style = isFirst ? URGENCY_STYLE.blocking : ALSO_BLOCKING_STYLE;
          badge = isFirst ? URGENCY_STYLE.blocking.headerText : ALSO_BLOCKING_STYLE.headerText;
        } else if (urgency === "optional") {
          style = URGENCY_STYLE.optional;
          badge = "Optional";
        } else {
          // important — no badge
          style = URGENCY_STYLE.important;
          badge = undefined;
        }

        const relatedEdge = decision.relatedEdgeId ? edgeById.get(decision.relatedEdgeId) : undefined;
        const relatedEdgeLabel = relatedEdge && decision.relatedNodeName
          ? EDGE_TYPE_LABELS[relatedEdge.type]?.(decision.relatedNodeName)
          : undefined;
        const sourceAgent = nodeById.get(decision.syntheticId);

        return (
          <DecisionCard
            key={`${decision.syntheticId}-${decision.familyId ?? decision.title}`}
            decision={decision}
            urgencyStyle={style}
            urgencyBadge={badge}
            relatedEdgeLabel={relatedEdgeLabel}
            relatedEdgeType={relatedEdge?.type}
            sourceAgentCode={sourceAgent?.code}
            attachedQuestions={attachedQuestions}
            family={family}
            selectedOptionId={stagedOptionId}
            initialAnswers={pendingAnswers[decision.syntheticId]}
            initialSubmittedAnswers={clarificationAnswersBySyntheticId.get(decision.syntheticId) ?? null}
            onApplyDecisionOption={handleApplyOption}
            onUndoDecisionOption={() => handleUndoOption(decision)}
            onAnswersChange={(ans) =>
              setPendingAnswers((prev) => ({ ...prev, [decision.syntheticId]: ans }))
            }
            onApplyStructuredClarifications={onApplyStructuredClarifications}
          />
        );
      })}

      {/* Readiness progress bar */}
      <ReadinessProgressBar
        totalBlocking={totalBlocking}
        resolvedBlocking={resolvedBlocking}
        overallVerdict={summaryReport?.overallVerdict}
      />
    </div>
  );
}
