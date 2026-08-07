"use client";

import { useState } from "react";
import { BuildPlanPage } from "../BuildPlanPage";
import { OutcomeReport } from "../OutcomeReport";
import { SpecOverlay } from "../panels/SpecOverlay";
import { useThinkingGraphUiStore } from "../state/useThinkingGraphUiStore";
import { useThinkingGraphVersionStore } from "../state/useThinkingGraphVersionStore";
import { useRunContext } from "@/lib/run-context";
import { buildThinkingGraphSpec } from "@/lib/thinking-graph/client";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type {
  ProjectSpec,
  RunSummaryConflict,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
} from "@/lib/thinking-graph/server/types";
import type { StagedDecision } from "../hooks/useStagingBuffer";

type ThinkingGraphOverlaysProps = {
  activeRunId: string | null;
  runVersionLabel?: string;
  sessionId: string | null;
  ideaPrompt: string;
  visibleSynthetics: SyntheticNode[];
  revisionEdges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
  summaryReport: RunSummaryReport;
  appliedDecisions?: SyntheticPreparedDecision[];
  appliedStructuredClarifications?: SyntheticPreparedClarification[];
  appliedChatDigest: string[];
  markPlanGenerated: (runId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  onApplyConflictDirective: (conflict: RunSummaryConflict) => void;
  onApplyDecisionOption: (payload: {
    decision: {
      type: "decision_required";
      syntheticId: string;
      title: string;
      question: string;
      options: { id: string; label: string; description: string }[];
      required: true;
    };
    optionId: string;
  }) => void;
  onRouteDecisionToAgent: (payload: {
    decision: {
      type: "decision_required";
      syntheticId: string;
      title: string;
      question: string;
      options: { id: string; label: string; description: string }[];
      required: true;
    };
    optionId: string;
    targetSyntheticId: string;
  }) => void;
  onOpenResponsibleAgent: (conflict: RunSummaryConflict) => void;
  onApplyStructuredClarifications: (payload: {
    syntheticId: string;
    syntheticName: string;
    answers: {
      questionId: string;
      questionLabel: string;
      answer: string;
    }[];
  }) => void;
  onAdoptNextMove?: (payload: {
    action: string;
    mode: "self" | "assistant" | "defer";
  }) => void;
  onOpenWithAssistant?: (syntheticId: string, draft: string) => void;
  /** True when decisions/conflicts are staged but not yet flushed to the prompt */
  hasStagedChanges?: boolean;
  /** How many items are staged */
  stagedChangesCount?: number;
  /** Live snapshot of staged decisions from useStagingBuffer */
  stagedDecisions?: ReadonlyMap<string, StagedDecision>;
  /** Adopted action texts currently staged (not yet flushed to the prompt) */
  stagedActionKeys?: string[];
  /** Called when user clicks "Discard all" — should call useStagingBuffer.unstageAll() */
  onDiscardStagedChanges?: () => void;
  /** Called when user undoes a staged conflict — removes it from the staging buffer */
  onUndoConflictDirective?: (conflictTitle: string) => void;
  /** Called when user removes a single staged decision from the tray */
  onUnstageDecision?: (familyId: string) => void;
  /** Called when user removes a staged adopted action from the tray */
  onUnstageAction?: (action: string) => void;
};

export function ThinkingGraphOverlays({
  activeRunId,
  runVersionLabel,
  sessionId,
  ideaPrompt,
  visibleSynthetics,
  revisionEdges,
  outputsBySyntheticId,
  summaryReport,
  appliedDecisions = [],
  appliedStructuredClarifications = [],
  appliedChatDigest,
  markPlanGenerated,
  onSelectNode,
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
  onUndoConflictDirective,
  onUnstageDecision,
  onUnstageAction,
}: ThinkingGraphOverlaysProps) {
  const reportOpen = useThinkingGraphUiStore((state) => state.reportOpen);
  const buildPlanOpen = useThinkingGraphUiStore((state) => state.buildPlanOpen);
  const historyView = useThinkingGraphUiStore((state) => state.historyView);
  const buildPlanReturnPhaseId = useThinkingGraphUiStore(
    (state) => state.buildPlanReturnPhaseId,
  );
  const completedTaskIds = useThinkingGraphUiStore(
    (state) => state.completedTaskIds,
  );
  const closeReport = useThinkingGraphUiStore((state) => state.closeReport);
  const openBuildPlan = useThinkingGraphUiStore((state) => state.openBuildPlan);
  const closeBuildPlan = useThinkingGraphUiStore(
    (state) => state.closeBuildPlan,
  );
  const openHistoryView = useThinkingGraphUiStore(
    (state) => state.openHistoryView,
  );
  const closeHistoryView = useThinkingGraphUiStore(
    (state) => state.closeHistoryView,
  );
  const setBuildPlanReturnPhaseId = useThinkingGraphUiStore(
    (state) => state.setBuildPlanReturnPhaseId,
  );
  const toggleTaskComplete = useThinkingGraphUiStore(
    (state) => state.toggleTaskComplete,
  );

  const simulationHistory = useThinkingGraphVersionStore(
    (state) => state.simulationHistory,
  );

  // Previous run summary for the active run — null on first run.
  const activeRunPreviousSummary = (() => {
    if (!activeRunId) return null;
    const idx = simulationHistory.findIndex((r) => r.id === activeRunId);
    return simulationHistory[idx - 1]?.summaryReport ?? null;
  })();

  // Previous run summary for a history-view run — null when it is the oldest run.
  const historyRunPreviousSummary = (() => {
    if (!historyView) return null;
    const idx = simulationHistory.findIndex((r) => r.id === historyView.run.id);
    return simulationHistory[idx - 1]?.summaryReport ?? null;
  })();

  const { start: startRun } = useRunContext();
  const [specOverlay, setSpecOverlay] = useState<ProjectSpec | null>(null);
  const [specLoading, setSpecLoading] = useState(false);

  const handleBuildSpec = async () => {
    if (!sessionId || specLoading) return;
    setSpecLoading(true);
    try {
      const spec = await buildThinkingGraphSpec(sessionId);
      setSpecOverlay(spec);
    } catch (err) {
      console.error("[SpecOverlay] failed to build spec:", err);
    } finally {
      setSpecLoading(false);
    }
  };

  return (
    <>
      {reportOpen && (
        <OutcomeReport
          onClose={closeReport}
          onGeneratePlan={() => {
            if (activeRunId) {
              markPlanGenerated(activeRunId);
            }
            closeReport();
            openBuildPlan();
          }}
          onBuildSpec={sessionId ? handleBuildSpec : undefined}
          onRunIteration={() => { closeReport(); startRun(); }}
          ideaPrompt={ideaPrompt}
          synthetics={visibleSynthetics}
          edges={revisionEdges}
          outputsBySyntheticId={outputsBySyntheticId}
          summaryReport={summaryReport}
          previousRunSummary={activeRunPreviousSummary}
          runVersionLabel={runVersionLabel}
          appliedDecisions={appliedDecisions}
          appliedStructuredClarifications={appliedStructuredClarifications}
          appliedChatDigest={appliedChatDigest}
          onApplyConflictDirective={onApplyConflictDirective}
          onApplyDecisionOption={onApplyDecisionOption}
          onApplyStructuredClarifications={onApplyStructuredClarifications}
          onRouteDecisionToAgent={onRouteDecisionToAgent}
          onOpenResponsibleAgent={onOpenResponsibleAgent}
          onAdoptNextMove={onAdoptNextMove}
          onOpenWithAssistant={onOpenWithAssistant}
          hasStagedChanges={hasStagedChanges}
          stagedChangesCount={stagedChangesCount}
          stagedDecisions={stagedDecisions}
          stagedActionKeys={stagedActionKeys}
          onDiscardStagedChanges={onDiscardStagedChanges}
          onUndoConflictDirective={onUndoConflictDirective}
          onUnstageDecision={onUnstageDecision}
          onUnstageAction={onUnstageAction}
        />
      )}

      {(specLoading || specOverlay) && (
        <SpecOverlay
          spec={specOverlay}
          loading={specLoading}
          onClose={() => { setSpecOverlay(null); }}
        />
      )}

      {buildPlanOpen && (
        <BuildPlanPage
          ideaPrompt={ideaPrompt}
          synthetics={visibleSynthetics}
          edges={revisionEdges}
          outputsBySyntheticId={outputsBySyntheticId}
          summaryReport={summaryReport}
          appliedDecisions={appliedDecisions}
          appliedStructuredClarifications={appliedStructuredClarifications}
          initialPhaseId={buildPlanReturnPhaseId ?? undefined}
          completedTaskIds={completedTaskIds}
          onToggleTaskComplete={toggleTaskComplete}
          onClose={closeBuildPlan}
          onChatWithAgent={(agentId, fromPhaseId) => {
            setBuildPlanReturnPhaseId(fromPhaseId);
            closeBuildPlan();
            onSelectNode(agentId);
          }}
        />
      )}

      {historyView?.mode === "report" && (
        <OutcomeReport
          onClose={closeHistoryView}
          onGeneratePlan={() => {
            const runId = historyView.run.id;
            markPlanGenerated(runId);
            openHistoryView(historyView.run, "plan");
          }}
          ideaPrompt={historyView.run.prompt}
          synthetics={historyView.run.synthetics}
          edges={historyView.run.edges}
          outputsBySyntheticId={historyView.run.outputsBySyntheticId}
          summaryReport={historyView.run.summaryReport}
          previousRunSummary={historyRunPreviousSummary}
          appliedDecisions={historyView.run.appliedDecisions}
          appliedStructuredClarifications={
            historyView.run.appliedStructuredClarifications
          }
          appliedChatDigest={[]}
          onApplyConflictDirective={onApplyConflictDirective}
          onApplyDecisionOption={onApplyDecisionOption}
          onApplyStructuredClarifications={onApplyStructuredClarifications}
          onRouteDecisionToAgent={onRouteDecisionToAgent}
          onOpenResponsibleAgent={onOpenResponsibleAgent}
          onAdoptNextMove={onAdoptNextMove}
          onOpenWithAssistant={onOpenWithAssistant}
        />
      )}

      {historyView?.mode === "plan" && (
        <BuildPlanPage
          ideaPrompt={historyView.run.prompt}
          synthetics={historyView.run.synthetics}
          edges={historyView.run.edges}
          outputsBySyntheticId={historyView.run.outputsBySyntheticId}
          summaryReport={historyView.run.summaryReport}
          appliedDecisions={historyView.run.appliedDecisions}
          appliedStructuredClarifications={
            historyView.run.appliedStructuredClarifications
          }
          initialPhaseId={buildPlanReturnPhaseId ?? undefined}
          completedTaskIds={completedTaskIds}
          onToggleTaskComplete={toggleTaskComplete}
          onClose={closeHistoryView}
          onChatWithAgent={(agentId, fromPhaseId) => {
            setBuildPlanReturnPhaseId(fromPhaseId);
            closeHistoryView();
            onSelectNode(agentId);
          }}
        />
      )}
    </>
  );
}
