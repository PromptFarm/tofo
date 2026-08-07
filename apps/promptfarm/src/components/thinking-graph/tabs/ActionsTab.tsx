"use client";

import { useEffect, useMemo, useState } from "react";
import { useThinkingGraphUiStore } from "../state/useThinkingGraphUiStore";
import type { SyntheticNode } from "@/lib/planning/types";
import type {
  RunSummaryConflict,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticReport,
  SyntheticPreparedDecision,
  SyntheticPreparedInputSource,
  SyntheticUserFacingQuestion,
} from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import {
  MONO,
  SANS,
  collectOperationalArtifactEntries,
  collectOperationalMissingEntries,
  buildNextMovesFromAdvisor,
  buildNextMovesFromDecisionFamilies,
  classifyNextMove,
  normalizeForUiDedup,
  matchAdvisorResolution,
} from "../OutcomeReport.utils";
import type { ClassifiedNextMove, DecisionRequiredPayload } from "../OutcomeReport.types";
import { ConflictCard } from "./ConflictMapTab";
import { StructuredListText } from "./shared/StructuredListText";

// ── PendingDecisionCard ───────────────────────────────────────────────────────
// Renders a pending decision with option buttons (primary) and any attached
// clarification questions from operational.userFacing.questions (secondary).
// Matches the sketch: options first, then a divider + question inputs.

function getAttachedQuestions(
  output: SyntheticOutputJson | null | undefined,
): SyntheticUserFacingQuestion[] {
  if (!output || !("details" in output)) return [];
  const report = output as SyntheticReport;
  return report.operational?.userFacing?.questions ?? [];
}

function PendingDecisionCard({
  decision,
  index,
  attachedQuestions,
  onApplyDecisionOption,
  onApplyStructuredClarifications,
}: {
  decision: DecisionRequiredPayload;
  index: number;
  attachedQuestions: SyntheticUserFacingQuestion[];
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  onApplyStructuredClarifications?: (payload: {
    syntheticId: string;
    syntheticName: string;
    answers: { questionId: string; questionLabel: string; answer: string }[];
    source?: SyntheticPreparedInputSource;
  }) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const hasQuestions = attachedQuestions.length > 0;
  const allAnswered = hasQuestions &&
    attachedQuestions.every((q) => !q.required || (answers[q.id] ?? "").trim().length > 0);

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
    // Reset after submit
    setAnswers({});
  }

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--color-info-border, var(--primary-border))",
        background: "color-mix(in srgb, var(--color-info-bg, var(--primary-container)) 30%, var(--surface-low))",
        overflow: "hidden",
      }}
    >
      {/* ── Header + options ── */}
      <div style={{ padding: "12px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 18, height: 18, borderRadius: "50%",
            background: "var(--primary-container)", border: "1px solid var(--primary-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "var(--text-label)", fontWeight: 700, color: "var(--primary)",
            flexShrink: 0, fontFamily: MONO,
          }}>
            {index + 1}
          </span>
          <p style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS, margin: 0, lineHeight: 1.3 }}>
            {decision.title}
          </p>
        </div>

        {/* Context / reason */}
        {decision.question && decision.question !== decision.title && (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.5, margin: "0 0 0 26px" }}>
            {decision.question}
          </p>
        )}

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginLeft: 26 }}>
          {decision.options.map((option) => {
            const isRecommended = option.id === decision.recommendedOptionId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onApplyDecisionOption?.({ decision, optionId: option.id, source: "manual_edit" })}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: isRecommended
                    ? "color-mix(in srgb, var(--primary-container) 60%, var(--surface-low))"
                    : "var(--surface-low)",
                  border: isRecommended ? "1px solid var(--primary-border)" : "1px solid var(--surface-container)",
                  borderRadius: 7, padding: "7px 10px",
                  cursor: onApplyDecisionOption ? "pointer" : "default",
                  textAlign: "left", width: "100%",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  border: `2px solid ${isRecommended ? "var(--primary)" : "var(--on-surface-variant)"}`,
                  background: isRecommended ? "var(--primary)" : "transparent",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "var(--text-caption)", color: "var(--on-surface)", fontFamily: SANS, flex: 1 }}>
                  {option.label}
                </span>
                {isRecommended && (
                  <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--primary)", fontWeight: 600 }}>
                    ✓ Recommended
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Questions divider + inputs (secondary) ── */}
      {hasQuestions && (
        <>
          {/* Divider row — "Also needs your input" */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 14px",
            borderTop: "1px solid var(--surface-container)",
            background: "color-mix(in srgb, var(--color-warning-bg, var(--surface-container)) 15%, transparent)",
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--surface-container)" }} />
            <span style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--color-warning-text)", whiteSpace: "nowrap", flexShrink: 0 }}>
              Also needs your input
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--surface-container)" }} />
          </div>

          {/* Question inputs */}
          <div style={{ padding: "10px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {attachedQuestions.map((q) => (
              <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label
                  htmlFor={`q-${decision.syntheticId}-${q.id}`}
                  style={{ fontSize: "var(--text-caption)", fontWeight: 600, color: "var(--on-surface)", fontFamily: SANS, lineHeight: 1.4 }}
                >
                  <span style={{ color: "var(--color-warning-text)", marginRight: 5 }}>Q:</span>
                  {q.question}
                  {q.required && <span style={{ color: "var(--color-error-text)", marginLeft: 3 }}>*</span>}
                </label>
                {q.whyItMatters && (
                  <p style={{ fontSize: "var(--text-label)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.4, margin: 0 }}>
                    {q.whyItMatters}
                  </p>
                )}
                <input
                  id={`q-${decision.syntheticId}-${q.id}`}
                  type="text"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder={q.suggestedAnswer ?? "Your answer…"}
                  style={{
                    width: "100%", padding: "7px 10px", borderRadius: 7,
                    border: "1px solid var(--surface-container)",
                    background: "var(--surface-low)",
                    color: "var(--on-surface)",
                    fontSize: "var(--text-caption)", fontFamily: SANS,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            ))}

            {onApplyStructuredClarifications && (
              <button
                type="button"
                disabled={!allAnswered}
                onClick={handleSubmitAnswers}
                style={{
                  alignSelf: "flex-start", padding: "6px 14px", borderRadius: 7,
                  border: allAnswered
                    ? "1px solid var(--color-warning-border, var(--primary-border))"
                    : "1px solid var(--surface-container)",
                  background: allAnswered
                    ? "color-mix(in srgb, var(--color-warning-bg) 50%, var(--surface-low))"
                    : "var(--surface-container)",
                  color: allAnswered ? "var(--color-warning-text)" : "var(--t3)",
                  fontSize: "var(--text-caption)", fontFamily: MONO, fontWeight: 600,
                  cursor: allAnswered ? "pointer" : "default",
                  opacity: allAnswered ? 1 : 0.6,
                }}
              >
                Submit answers
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function intentLabel(move: ClassifiedNextMove): string {
  switch (move.intent) {
    case "decide": return "Decision";
    case "research": return "Research";
    case "build": return "Build";
    case "validate": return "Review";
    case "defer": return "Defer";
    default:
      if (move.owner === "user") return "Decision";
      if (move.owner === "assistant") return "Research";
      return "Build";
  }
}

function ActionCard({
  move,
  index,
  stagedActionKeys,
  onAdopt,
}: {
  move: ClassifiedNextMove;
  index: number;
  stagedActionKeys?: Set<string>;
  onAdopt?: (action: string) => void;
}) {
  const cardState = useThinkingGraphUiStore((s) => s.actionCardStates[move.action] ?? "idle");
  const setActionCardState = useThinkingGraphUiStore((s) => s.setActionCardState);

  // Auto-reset to idle when an adopted action is removed from the staging buffer.
  useEffect(() => {
    if (cardState === "adopted" && stagedActionKeys !== undefined && !stagedActionKeys.has(move.action)) {
      setActionCardState(move.action, null);
    }
  }, [cardState, stagedActionKeys, move.action, setActionCardState]);

  const label = intentLabel(move);
  const concern = move.rationale ?? move.tradeoff ?? null;

  const isAdopted = cardState === "adopted";
  const isSkipped = cardState === "skipped";

  if (isAdopted) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid var(--color-success-border)", background: "color-mix(in srgb, var(--color-success-bg) 25%, var(--surface-low))", borderRadius: 10, padding: "10px 12px" }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-label)", fontWeight: 700, color: "var(--color-success-text)", flexShrink: 0, marginTop: 1, fontFamily: MONO }}>
          ✓
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "var(--text-body)", color: "var(--on-surface)", lineHeight: 1.55, fontFamily: SANS, margin: 0, overflowWrap: "break-word" }}>
            {move.action}
          </p>
          <p style={{ fontSize: "var(--text-label)", fontFamily: MONO, color: "var(--color-success-text)", margin: 0 }}>
            Staged for next run
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid var(--surface-container)", background: "var(--surface-low)", borderRadius: 10, padding: "10px 12px" }}>
      {/* Badge */}
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: isSkipped ? "var(--surface-container)" : "var(--primary-container)", border: `1px solid ${isSkipped ? "var(--surface-container)" : "var(--primary-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-label)", fontWeight: 700, color: isSkipped ? "var(--t3)" : "var(--primary)", flexShrink: 0, marginTop: 1, fontFamily: MONO }}>
        {isSkipped ? "–" : String(index + 1)}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-label)", padding: "1px 6px", borderRadius: 20, background: "var(--primary-container)", border: "1px solid var(--primary-border)", color: "var(--primary)", fontFamily: MONO, letterSpacing: "0.3px", flexShrink: 0 }}>
            {label}
          </span>
          <p style={{ fontSize: "var(--text-body)", color: isSkipped ? "var(--t3)" : "var(--on-surface)", lineHeight: 1.55, fontFamily: SANS, margin: 0, overflowWrap: "break-word", textDecoration: isSkipped ? "line-through" : "none" }}>
            {move.action}
          </p>
        </div>

        {!isSkipped && concern && (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", fontFamily: SANS, lineHeight: 1.5, margin: 0, overflowWrap: "break-word" }}>
            {concern}
          </p>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {!isSkipped && (
            <button
              type="button"
              onClick={() => { setActionCardState(move.action, "adopted"); onAdopt?.(move.action); }}
              style={{ fontSize: "var(--text-label)", fontFamily: MONO, fontWeight: 600, padding: "3px 10px", borderRadius: 5, border: "1px solid var(--primary-border)", background: "var(--primary-container)", color: "var(--primary)", cursor: "pointer" }}
            >
              Adopt
            </button>
          )}
          {isSkipped ? (
            <button
              type="button"
              onClick={() => setActionCardState(move.action, null)}
              style={{ fontSize: "var(--text-label)", fontFamily: MONO, padding: "3px 10px", borderRadius: 5, border: "1px solid var(--surface-container)", background: "transparent", color: "var(--t3)", cursor: "pointer" }}
            >
              Undo skip
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActionCardState(move.action, "skipped")}
              style={{ fontSize: "var(--text-label)", fontFamily: MONO, padding: "3px 10px", borderRadius: 5, border: "1px solid var(--surface-container)", background: "transparent", color: "var(--t3)", cursor: "pointer" }}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActionsTab({
  summaryReport,
  synthetics,
  outputsBySyntheticId,
  appliedDecisions,
  pendingDecisions = [],
  onApplyConflictDirective,
  onUndoConflictDirective,
  onApplyDecisionOption,
  onApplyStructuredClarifications,
  onAdoptAction,
  stagedActionKeys,
}: {
  summaryReport: RunSummaryReport;
  synthetics: SyntheticNode[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  appliedDecisions: SyntheticPreparedDecision[];
  /** All agents that currently have userFacing.state === "decision_required". */
  pendingDecisions?: DecisionRequiredPayload[];
  onApplyConflictDirective?: (conflict: RunSummaryConflict) => void;
  onUndoConflictDirective?: (conflictTitle: string) => void;
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  onApplyStructuredClarifications?: (payload: {
    syntheticId: string;
    syntheticName: string;
    answers: { questionId: string; questionLabel: string; answer: string }[];
    source?: SyntheticPreparedInputSource;
  }) => void;
  onAdoptAction?: (action: string) => void;
  /** Adopted action texts currently in the staging buffer — used to validate adopted card states. */
  stagedActionKeys?: string[];
}) {
  const nameById = useMemo(() => new Map(synthetics.map((s) => [s.id, s.name])), [synthetics]);
  const codeById = useMemo(() => new Map(synthetics.map((s) => [s.id, s.code])), [synthetics]);
  const stagedActionSet = useMemo(
    () => (stagedActionKeys ? new Set(stagedActionKeys) : undefined),
    [stagedActionKeys],
  );

  const advisorOutput = useMemo(() => {
    const advisorSynthetic = synthetics.find((s) => s.nodeRole === "advisor");
    if (!advisorSynthetic) return null;
    const raw = outputsBySyntheticId[advisorSynthetic.id];
    return raw && isAdvisorReport(raw) ? raw : null;
  }, [synthetics, outputsBySyntheticId]);

  const nextMoves = useMemo(() => {
    if (advisorOutput && advisorOutput.strategicOptions.length > 0) {
      return buildNextMovesFromAdvisor(advisorOutput.strategicOptions).slice(0, 5);
    }
    const familyMoves = buildNextMovesFromDecisionFamilies(summaryReport);
    if (familyMoves.length > 0) {
      const covered = new Set(familyMoves.map((m) => normalizeForUiDedup(m.action)));
      const extras = summaryReport.actionItems
        .filter((item) => !covered.has(normalizeForUiDedup(item)))
        .map((item) => classifyNextMove(item));
      return [...familyMoves, ...extras].slice(0, 5);
    }
    return summaryReport.actionItems.slice(0, 5).map((item) => classifyNextMove(item));
  }, [summaryReport.actionItems, summaryReport.decisionFamilies, advisorOutput?.strategicOptions]);

  const advisorResolutions = useMemo(
    () => advisorOutput?.conflictResolution ?? [],
    [advisorOutput],
  );

  const artifactEntries = useMemo(
    () => collectOperationalArtifactEntries(outputsBySyntheticId),
    [outputsBySyntheticId],
  );
  const missingEntries = useMemo(
    () => collectOperationalMissingEntries(outputsBySyntheticId),
    [outputsBySyntheticId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Section 0: Decisions Required (all pending, not just biggest conflict) ── */}
      {pendingDecisions.length > 0 && (
        <section>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-info-text)", marginBottom: 10, fontFamily: MONO }}>
            Decisions Required · {pendingDecisions.length}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingDecisions.map((decision, index) => {
              const agentOutput = outputsBySyntheticId[decision.syntheticId] ?? null;
              const attachedQuestions = getAttachedQuestions(agentOutput);
              return (
                <PendingDecisionCard
                  key={`${decision.syntheticId}-${decision.familyId ?? decision.title}`}
                  decision={decision}
                  index={index}
                  attachedQuestions={attachedQuestions}
                  onApplyDecisionOption={onApplyDecisionOption}
                  onApplyStructuredClarifications={onApplyStructuredClarifications}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 1: Next Actions ── */}
      <section>
        <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10, fontFamily: MONO }}>
          Next Actions
        </p>
        {nextMoves.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {nextMoves.map((move, index) => (
              <ActionCard key={`${move.action}-${index}`} move={move} index={index} stagedActionKeys={stagedActionSet} onAdopt={onAdoptAction} />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "var(--text-body)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.6 }}>
            No immediate actions — run another iteration to generate updated recommendations.
          </p>
        )}
      </section>

      {/* ── Section 2: Full Conflict Map ── */}
      {summaryReport.conflictMap.length > 0 && (
        <section>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10, fontFamily: MONO }}>
            Conflict Map
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {summaryReport.conflictMap.map((conflict) => (
              <ConflictCard
                key={`${conflict.fromSyntheticId}-${conflict.toSyntheticId}`}
                conflict={conflict}
                nameById={nameById}
                advisorResolution={matchAdvisorResolution(conflict, advisorResolutions, codeById)}
                stagedDecisions={appliedDecisions}
                onApplyPath={onApplyConflictDirective}
                onUndoPath={onUndoConflictDirective}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Section 3: Done / Missing ── */}
      {(artifactEntries.length > 0 || missingEntries.length > 0) && (
        <section>
          <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10, fontFamily: MONO }}>
            Done / Missing
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ borderRadius: 6, border: "1px solid var(--surface-container)", background: "var(--surface-high)", padding: "10px 12px" }}>
              <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-success-text)", fontFamily: MONO, marginBottom: 6 }}>
                Ready
              </p>
              {artifactEntries.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  {artifactEntries.slice(0, 5).map((entry, index) => (
                    <li key={`${entry.syntheticId}-${index}`} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: SANS }}>
                      <strong style={{ color: "var(--on-surface)" }}>{entry.syntheticName}</strong>: {entry.artifact}
                    </li>
                  ))}
                </ul>
              ) : appliedDecisions.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  {appliedDecisions.slice(0, 5).map((decision) => (
                    <li key={`applied-${decision.syntheticId}-${decision.optionId}`} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: SANS }}>
                      <strong style={{ color: "var(--on-surface)" }}>{decision.decisionTitle}</strong>: {decision.optionLabel}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS, lineHeight: 1.5 }}>
                    {"Agents haven't reported completed artifacts yet."}
                  </p>
                  <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: MONO, lineHeight: 1.5, opacity: 0.7 }}>
                    This fills up as runs progress.
                  </p>
                </div>
              )}
            </div>
            <div style={{ borderRadius: 6, border: "1px solid var(--color-error-border)", background: "var(--surface-high)", padding: "10px 12px" }}>
              <p style={{ fontSize: "var(--text-label)", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-error-text)", fontFamily: MONO, marginBottom: 6 }}>
                Missing
              </p>
              {missingEntries.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  {missingEntries.slice(0, 6).map((entry, index) => (
                    <li key={`${entry.syntheticId}-missing-${index}`} style={{ fontSize: "var(--text-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: SANS }}>
                      <strong style={{ color: "var(--on-surface)" }}>{entry.syntheticName}</strong>:{" "}
                      <StructuredListText text={entry.item} fontSize={11} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: "var(--text-caption)", color: "var(--t3)", fontFamily: SANS }}>
                  No gaps identified.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
