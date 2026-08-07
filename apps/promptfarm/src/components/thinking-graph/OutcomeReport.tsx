"use client";

import { useMemo, useState } from "react";

import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import { toDecisionFamilyId } from "./OutcomeReport.utils";
import type {
  RunSummaryConflict,
  RunSummaryReport,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
  SyntheticPreparedInputSource,
  SyntheticOutputJson,
  SyntheticReport,
} from "@/lib/thinking-graph/server/types";
import type { StagedDecision } from "./hooks/useStagingBuffer";
import type {
  DecisionRequiredOption,
  DecisionRequiredPayload,
  RouteDecisionToAgentInput,
  NextMoveMode,
} from "./OutcomeReport.types";

// Section components (Steps 10-13 implemented)
import { StagedChangesBar } from "./panels/StagedChangesBar";
import { BlockingDecisionCards } from "./sections/BlockingDecisionCards";
import { FindingsSection } from "./sections/FindingsSection";
import { RisksSection } from "./sections/RisksSection";
import { AgentVerdictsSection } from "./sections/AgentVerdictsSection";
import { ConflictMapSection } from "./sections/ConflictMapSection";
import { PersistentItemsSection } from "./sections/PersistentItemsSection";
import { VerdictHeader } from "./panels/VerdictHeader";
import { computeRunDelta } from "./OutcomeReport.delta";
import { exportReportAsHtml } from "@/lib/thinking-graph/exportReportHtml";



const MONO = "var(--font-jetbrains-mono), monospace";
const SANS = "var(--font-manrope), system-ui, sans-serif";

function asSyntheticReport(
  output: SyntheticOutputJson | null | undefined,
): SyntheticReport | null {
  if (!output || !("details" in output)) return null;
  return output;
}

function getOperational(
  output: SyntheticOutputJson | null | undefined,
) {
  return asSyntheticReport(output)?.operational ?? null;
}

function getOutputSummary(
  output: SyntheticOutputJson | null | undefined,
) {
  if (!output) return null;
  if ("summary" in output && typeof output.summary === "string") {
    return output.summary;
  }
  if ("topRecommendation" in output && typeof output.topRecommendation === "string") {
    return output.topRecommendation;
  }
  return null;
}


function parseDecisionRequired(
  output: SyntheticOutputJson | null | undefined,
): DecisionRequiredPayload | null {
  // Path 1 — legacy raw.decisionRequired
  const raw = output?.raw;
  if (raw && typeof raw === "object") {
    const payload = (raw as { decisionRequired?: unknown }).decisionRequired;
    if (payload && typeof payload === "object") {
      const candidate = payload as Partial<DecisionRequiredPayload>;

      const titleOk = typeof candidate.title === "string" && candidate.title.trim().length > 0;
      const questionOk = typeof candidate.question === "string" && candidate.question.trim().length > 0;
      if (
        candidate.type === "decision_required" &&
        typeof candidate.syntheticId === "string" &&
        titleOk &&
        questionOk &&
        Array.isArray(candidate.options)
      ) {
        const options = candidate.options.filter(
          (option): option is DecisionRequiredOption => {
            if (!option || typeof option !== "object") return false;
            const o = option as { id?: unknown; label?: unknown; description?: unknown };
            return (
              typeof o.id === "string" && o.id.trim().length > 0 &&
              typeof o.label === "string" &&
              typeof o.description === "string"
            );
          },
        );
        if (options.length > 0) {
          const recommendedOptionId =
            typeof candidate.recommendedOptionId === "string" &&
            options.some((o) => o.id === candidate.recommendedOptionId)
              ? candidate.recommendedOptionId
              : (options[0]?.id ?? null);
          return {
            type: "decision_required",
            syntheticId: candidate.syntheticId,
            familyId:
              typeof candidate.familyId === "string" && candidate.familyId.trim().length > 0
                ? candidate.familyId
                : toDecisionFamilyId(candidate.title as string),
            title: candidate.title as string,
            question: candidate.question as string,
            options,
            recommendedOptionId,
            required: true,
            ...(typeof candidate.relatedEdgeId === "string" ? { relatedEdgeId: candidate.relatedEdgeId } : {}),
            ...(typeof candidate.relatedNodeId === "string" ? { relatedNodeId: candidate.relatedNodeId } : {}),
            ...(typeof candidate.relatedNodeName === "string" ? { relatedNodeName: candidate.relatedNodeName } : {}),
          };
        }
      }
    }
  }

  // Path 2 — operational.userFacing (current structureAssembler path)
  const uf = getOperational(output)?.userFacing;
  if (uf?.state === "decision_required" && uf.options.length > 0) {
    const options: DecisionRequiredOption[] = uf.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.summary && o.summary !== o.label ? o.summary : o.label,
    }));
    const recommended = uf.options.find((o) => o.recommended);
    return {
      type: "decision_required",
      syntheticId: output!.syntheticId,
      familyId: toDecisionFamilyId(uf.title),
      title: uf.title,
      question: uf.summary,
      options,
      recommendedOptionId: recommended?.id ?? options[0]?.id ?? null,
      required: true,
      ...(uf.relatedEdgeId ? { relatedEdgeId: uf.relatedEdgeId } : {}),
      ...(uf.relatedNodeId ? { relatedNodeId: uf.relatedNodeId } : {}),
      ...(uf.relatedNodeName ? { relatedNodeName: uf.relatedNodeName } : {}),
    };
  }

  return null;
}


function isAgentRoutingDecisionOption(
  optionId: string | null | undefined,
): boolean {
  return optionId === "define_handoff_owner";
}


export function OutcomeReport({
  onClose,
  onGeneratePlan,
  onBuildSpec,
  onRunIteration,
  onApplyConflictDirective,
  onApplyDecisionOption,
  onRouteDecisionToAgent,
  onOpenResponsibleAgent,
  onApplyStructuredClarifications,
  onAdoptNextMove,
  onOpenWithAssistant,
  hasStagedChanges = false,
  stagedChangesCount = 0,
  stagedDecisions,
  stagedActionKeys,
  onDiscardStagedChanges,
  onRemoveStagedDecision,
  onRemoveStagedClarification,
  onUnstageDecision,
  onUnstageAction,
  onUndoConflictDirective,
  ideaPrompt,
  synthetics,
  edges,
  outputsBySyntheticId,
  summaryReport,
  previousRunSummary = null,
  runVersionLabel,
  appliedDecisions = [],
  appliedStructuredClarifications = [],
  appliedChatDigest,
}: {
  onClose: () => void;
  /** @deprecated No longer rendered — kept for caller compatibility. */
  onGeneratePlan?: () => void;
  /** @deprecated No longer rendered — kept for caller compatibility. */
  onBuildSpec?: () => void;
  onRunIteration?: () => void;
  onApplyConflictDirective?: (conflict: RunSummaryConflict) => void;
  ideaPrompt: string;
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  summaryReport: RunSummaryReport;
  /** Summary from the immediately preceding run — used for delta computation. Null on first run. */
  previousRunSummary?: RunSummaryReport | null;
  /** Version label of this run (e.g. "v2.1") — shown in the header. */
  runVersionLabel?: string;
  appliedDecisions?: SyntheticPreparedDecision[];
  appliedStructuredClarifications?: SyntheticPreparedClarification[];
  appliedChatDigest?: string[];
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: SyntheticPreparedInputSource;
  }) => void;
  /** @deprecated No longer consumed — kept for caller compatibility. */
  onRouteDecisionToAgent?: (payload: RouteDecisionToAgentInput) => void;
  /** @deprecated No longer consumed — kept for caller compatibility. */
  onOpenResponsibleAgent?: (conflict: RunSummaryConflict) => void;
  onApplyStructuredClarifications?: (payload: {
    syntheticId: string;
    syntheticName: string;
    answers: {
      questionId: string;
      questionLabel: string;
      answer: string;
    }[];
    source?: SyntheticPreparedInputSource;
  }) => void;
  onAdoptNextMove?: (payload: { action: string; mode: NextMoveMode }) => void;
  onOpenWithAssistant?: (syntheticId: string, draft: string) => void;
  /** True when decisions/conflicts are staged but not yet written to the prompt */
  hasStagedChanges?: boolean;
  /** Number of staged items */
  stagedChangesCount?: number;
  /** Live snapshot of staged decisions from the staging buffer */
  stagedDecisions?: ReadonlyMap<string, StagedDecision>;
  /** Adopted action texts currently staged */
  stagedActionKeys?: string[];
  /** Called when user clicks "Discard all" staged changes */
  onDiscardStagedChanges?: () => void;
  /** Called when user removes a single staged decision */
  onRemoveStagedDecision?: (syntheticId: string) => void;
  /** Called when user removes a single staged clarification */
  onRemoveStagedClarification?: (syntheticId: string) => void;
  /** Called when user removes a single staged decision by familyId */
  onUnstageDecision?: (familyId: string) => void;
  /** Called when user removes a staged adopted action */
  onUnstageAction?: (action: string) => void;
  /** Called when user undoes a staged conflict resolution */
  onUndoConflictDirective?: (conflictTitle: string) => void;
}) {
  const blockedAgentCount = useMemo(
    () =>
      synthetics.filter((s) => {
        const state = getOperational(outputsBySyntheticId[s.id])?.userFacing?.state;
        return state === "user_input_required" || state === "decision_required";
      }).length,
    [synthetics, outputsBySyntheticId],
  );
  const mostBlockedAgentSummary = useMemo(() => {
    for (const s of synthetics) {
      const out = outputsBySyntheticId[s.id];
      const operational = getOperational(out);
      if (operational?.readiness?.blocked) {
        return operational.summary ?? getOutputSummary(out);
      }
    }
    return null;
  }, [synthetics, outputsBySyntheticId]);

  // Collect decisions from ALL agents in decision_required state, not just
  // the biggest-conflict agent. Each agent may have its own pending decision
  // that was never surfaced because it wasn't the "biggest conflict".
  const allPendingDecisions = useMemo(() => {
    const seen = new Set<string>();
    const results: DecisionRequiredPayload[] = [];
    for (const synthetic of synthetics) {
      const output = outputsBySyntheticId[synthetic.id] ?? null;
      const parsed = parseDecisionRequired(output);
      if (!parsed) continue;
      const key = parsed.familyId ?? parsed.title;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(parsed);
    }
    return results;
  }, [synthetics, outputsBySyntheticId]);

  // Keep single decisionRequired for the Decision Matrix tab (backward compat).
  const decisionRequired = allPendingDecisions[0] ?? null;

  const title = ideaPrompt
    ? ideaPrompt.length > 52
      ? `${ideaPrompt.slice(0, 52)}...`
      : ideaPrompt
    : "Run Report";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}
      />

      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 101,
          width: "min(760px, calc(100vw - 2rem))",
          height: "min(680px, calc(100dvh - 3rem))",
          maxHeight: "calc(100dvh - 3rem)",
          borderRadius: 12,
          border: "1px solid var(--surface-container)",
          background: "var(--panel-bg-solid)",
          backdropFilter: "blur(20px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px 0",
            borderBottom: "1px solid var(--surface-container)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "var(--text-label)",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: MONO,
                  marginBottom: 4,
                }}
              >
                Run Report{runVersionLabel && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>· {runVersionLabel}</span>
                )}
              </p>
              <h2
                style={{
                  fontSize: "var(--text-heading)",
                  fontWeight: 700,
                  color: "var(--on-surface)",
                  fontFamily: SANS,
                  lineHeight: 1.2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {title}
                {hasStagedChanges && (
                  <span
                    title={`${stagedChangesCount} staged change${stagedChangesCount !== 1 ? "s" : ""} — will apply on next run`}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--color-warning-text)",
                      flexShrink: 0,
                      cursor: "help",
                    }}
                  />
                )}
              </h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                title="Export as HTML"
                onClick={() =>
                  exportReportAsHtml({
                    ideaPrompt,
                    synthetics,
                    outputsBySyntheticId,
                    summaryReport,
                    runVersionLabel,
                  })
                }
                style={{
                  height: 28,
                  paddingInline: 10,
                  borderRadius: 6,
                  border: "1px solid var(--surface-container)",
                  background: "transparent",
                  color: "var(--on-surface-variant)",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  letterSpacing: "0.5px",
                  whiteSpace: "nowrap",
                }}
              >
                ↓ HTML
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid var(--surface-container)",
                  background: "transparent",
                  color: "var(--on-surface-variant)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "var(--text-body)",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Verdict header — always visible, not in scroll area ── */}
          <div style={{ paddingBottom: 12 }}>
            <VerdictHeader
              overallVerdict={summaryReport.overallVerdict}
              overallCondition={summaryReport.overallCondition}
              mostBlockedAgentSummary={mostBlockedAgentSummary}
              runVersionLabel={runVersionLabel}
              agentCount={synthetics.length}
            />
          </div>
        </div>

        {/* ── Single scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 68px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Zone 2 + 3 — Blocking decisions */}
          <BlockingDecisionCards
            pendingDecisions={allPendingDecisions}
            outputsBySyntheticId={outputsBySyntheticId}
            summaryReport={summaryReport}
            stagedDecisions={stagedDecisions}
            edges={edges}
            synthetics={synthetics}
            appliedClarifications={appliedStructuredClarifications}
            onApplyDecisionOption={onApplyDecisionOption}
            onUnstageDecision={onUnstageDecision}
            onApplyStructuredClarifications={onApplyStructuredClarifications}
          />

          {/* Zone 4 — Findings (collapsible, default collapsed) */}
          <FindingsSection
            synthetics={synthetics}
            outputsBySyntheticId={outputsBySyntheticId}
          />

          {/* Zone 5 — Risks */}
          <RisksSection
            synthetics={synthetics}
            outputsBySyntheticId={outputsBySyntheticId}
          />

          {/* Zone 5b — Open persistent items (risk-facts, missing-info, clarifications) */}
          <PersistentItemsSection />

          {/* Zone 6 — Agent verdicts */}
          <AgentVerdictsSection
            summaryReport={summaryReport}
            synthetics={synthetics}
            edges={edges}
            outputsBySyntheticId={outputsBySyntheticId}
          />


          {/* Zone 8 — Relations & Conflicts (open by default) */}
          <ConflictMapSection
            summaryReport={summaryReport}
            synthetics={synthetics}
            outputsBySyntheticId={outputsBySyntheticId}
            revisionEdges={edges}
            stagedDecisions={stagedDecisions ? Array.from(stagedDecisions.values()) : undefined}
            appliedDecisions={appliedDecisions}
            onApplyConflictDirective={onApplyConflictDirective}
            onUndoConflictDirective={onUndoConflictDirective}
          />

        </div>

        <StagedChangesBar
          pendingDecisions={stagedDecisions ? Array.from(stagedDecisions.values()) : []}
          pendingActions={stagedActionKeys}
          decisions={appliedDecisions}
          clarifications={appliedStructuredClarifications}
          hasStagedChanges={hasStagedChanges}
          stagedChangesCount={stagedChangesCount}
          onDiscard={onDiscardStagedChanges}
          onRun={onRunIteration}
          onRemoveDecision={onUnstageDecision}
          onRemoveClarification={onRemoveStagedClarification}
          onRemoveAction={onUnstageAction}
        />
      </div>
    </>
  );
}
