import { useCallback } from "react";
import { toast } from "sonner";
import { fetchRunOutputs } from "@/lib/thinking-graph/client";

import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type { RunStats } from "@/lib/run-context";
import { buildRunSummaryReport } from "@/lib/thinking-graph/reportSummary";
import type {
  RunSummaryConflict,
  SyntheticGraphPayload,
} from "@/lib/thinking-graph/server/types";
import type { RuntimeNodeStatus, SimulationRun } from "../runtime/runtimeTypes";
import { useThinkingGraphUiStore } from "../state/useThinkingGraphUiStore";
import { useThinkingGraphChatStore } from "../state/useThinkingGraphChatStore";
import {
  selectOpenItems,
  useThinkingGraphPersistenceStore,
} from "../state/useThinkingGraphPersistenceStore";
import {
  appendPersistentItemsToPrompt,
  composeIterationDraft,
  composeResponsibleAgentQuestion,
  composeRoutingClarificationQuestion,
  ensureAppliedChatDigestInPrompt,
  extractPersistentItems,
  getDownstreamNodes,
  hasDependencyCycle,
  mergePromptDraftWithIdea,
  normalizeDecisionDirectivesInPrompt,
  saveJsonSnapshotToFile,
  withCumulativeTokenUsage,
  type AppliedDecisionSelection,
  type AppliedStructuredClarification,
  type DecisionRequiredPayload,
} from "../thinkingGraphUtils";

// ---------------------------------------------------------------------------
// Params type
// ---------------------------------------------------------------------------

export type UseThinkingGraphActionsParams = {
  // History hook
  setRootPrompt: (prompt: string) => void;
  setActiveRunId: (id: string) => void;
  createIterationPromptFromActiveRun: (() => string | null) | null;
  recordSimpleRun: (input: any) => SimulationRun | null;
  recordBranchingRun: (input: any) => SimulationRun | null;
  resetHistoryState: () => void;
  buildRestoreState: (input: any) => any;
  // Runtime hook
  setRunStatus: (status: "idle" | "running" | "done" | "error") => void;
  setRuntimeByNodeId: (state: any) => void;
  setViewingRunOutputs: (outputs: Record<string, any> | null) => void;
  setSyntheticProgressByNodeId: (state: Record<string, any>) => void;
  setRunErrorMessage: (error: string | null) => void;
  setChatUpdatedNodeIds: (ids: Set<string>) => void;
  chatUpdatedOpinions: Record<string, any>;
  setChatUpdatedOpinions: (opinions: Record<string, any>) => void;
  setChatDraftByNodeId: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  executeRun: (input: any) => Promise<any>;
  resetRuntimeState: () => void;
  outputsBySyntheticId: Record<string, any>;
  chatUpdatedNodeIds: Set<string>;
  runStatus: string;
  runtimeByNodeId: Record<string, any>;
  // Editor hook
  setAddedSyntheticsByRevision: (updater: (prev: any) => any) => void;
  setRemovedSyntheticIdsByRevision: (updater: (prev: any) => any) => void;
  setPendingRoleDeleteId: (id: string | null) => void;
  setPendingConnection: (conn: any) => void;
  resetEditorState: () => void;
  // RunContext
  setRunStats: (stats: RunStats | null) => void;
  setCompletedAgentCount: (count: number) => void;
  // Props
  projectId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onRevisionEdgesChange: (edges: SyntheticEdge[]) => void;
  selectedRevision: any;
  sessionPayload: SyntheticGraphPayload | null;
  // Computed values
  syntheticNodeIds: string[];
  syntheticNodeIdSet: Set<string>;
  visibleSynthetics: SyntheticNode[];
  addedSynthetics: SyntheticNode[];
  baseVisibleSynthetics: SyntheticNode[];
  currentRevisionId: string | null;
  currentRecommendationDigest: string[];
  appliedChatDigest: string[];
  currentSummaryReport: any;
  isRunInProgress: boolean;
  revisionEdges: SyntheticEdge[];
  simulationHistory: SimulationRun[];
  activeRunId: string | null;
  rootPrompt: string;
  // Utils
  persistPreparedInputs: (input: {
    decisions: AppliedDecisionSelection[];
    clarifications: AppliedStructuredClarification[];
  }) => Promise<void>;
  onOpenIntakeWizard: () => void;
  // DOM refs (kept in component, passed down)
  logScrollRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Called at the very start of startThinkingRun, before effectivePrompt is
   * built. Use this to flush any staged decisions/conflicts into thinkingInput
   * so they're included in the run prompt.
   */
  onBeforeRun?: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useThinkingGraphActions(params: UseThinkingGraphActionsParams) {
  // ---- Store selectors (stable references) ----
  const thinkingInput = useThinkingGraphUiStore((s) => s.thinkingInput);
  const ideaPrompt = useThinkingGraphUiStore((s) => s.ideaPrompt);
  const domainCategory = useThinkingGraphUiStore((s) => s.domainCategory);
  const hasIdea = useThinkingGraphUiStore((s) => s.hasIdea);
  const previousExpanded = useThinkingGraphUiStore((s) => s.previousExpanded);
  const setThinkingInput = useThinkingGraphUiStore((s) => s.setThinkingInput);
  const setHasIdea = useThinkingGraphUiStore((s) => s.setHasIdea);
  const setIsRolePanelExpanded = useThinkingGraphUiStore((s) => s.setIsRolePanelExpanded);
  const setIdeaPrompt = useThinkingGraphUiStore((s) => s.setIdeaPrompt);
  const setShowProcessGraph = useThinkingGraphUiStore((s) => s.setShowProcessGraph);
  const setHoveredNodeId = useThinkingGraphUiStore((s) => s.setHoveredNodeId);
  const setSelectedEdgeId = useThinkingGraphUiStore((s) => s.setSelectedEdgeId);
  const setRoleSearchTerm = useThinkingGraphUiStore((s) => s.setRoleSearchTerm);
  const setGraphJustReady = useThinkingGraphUiStore((s) => s.setGraphJustReady);
  const setPreviousExpanded = useThinkingGraphUiStore((s) => s.setPreviousExpanded);
  const setLogEntries = useThinkingGraphUiStore((s) => s.setLogEntries);
  const addLogEntry = useThinkingGraphUiStore((s) => s.addLogEntry);
  const incrementLogIdCounter = useThinkingGraphUiStore((s) => s.incrementLogIdCounter);
  const incrementRunTokenCounter = useThinkingGraphUiStore((s) => s.incrementRunTokenCounter);
  const setRunStartTime = useThinkingGraphUiStore((s) => s.setRunStartTime);
  const addRunTimerId = useThinkingGraphUiStore((s) => s.addRunTimerId);
  const clearRunTimerIds = useThinkingGraphUiStore((s) => s.clearRunTimerIds);
  const openReport = useThinkingGraphUiStore((s) => s.openReport);
  const closeReport = useThinkingGraphUiStore((s) => s.closeReport);
  const resetUiState = useThinkingGraphUiStore((s) => s.resetUiState);

  const pendingAppliedDecisions = useThinkingGraphChatStore((s) => s.pendingAppliedDecisions);
  const setPendingAppliedDecisions = useThinkingGraphChatStore((s) => s.setPendingAppliedDecisions);
  const pendingStructuredClarifications = useThinkingGraphChatStore((s) => s.pendingStructuredClarifications);
  const setPendingStructuredClarifications = useThinkingGraphChatStore((s) => s.setPendingStructuredClarifications);
  const clearPendingInputs = useThinkingGraphChatStore((s) => s.clearPendingInputs);

  // -----------------------------------------------------------------------
  // cancelRunTimers
  // -----------------------------------------------------------------------
  const cancelRunTimers = useCallback(() => {
    const timerIds = useThinkingGraphUiStore.getState().runTimerIds;
    timerIds.forEach((id) => clearTimeout(id));
    clearRunTimerIds();
  }, [clearRunTimerIds]);

  // -----------------------------------------------------------------------
  // submitIdea
  // -----------------------------------------------------------------------
  const submitIdea = useCallback(() => {
    const nextPrompt = thinkingInput.trim();
    if (!nextPrompt) return;

    const effectivePrompt = domainCategory
      ? `[Domain: ${domainCategory}]\n\n${nextPrompt}`
      : nextPrompt;

    cancelRunTimers();
    incrementRunTokenCounter();
    params.setRootPrompt(effectivePrompt);
    setHasIdea(true);
    setIsRolePanelExpanded(false);
    setIdeaPrompt(effectivePrompt);
    // When a session is available the Director will run and reveal the graph after
    // confirming the team. Show only the Idea node while it thinks.
    // Without a session, show the full graph immediately so the user can add roles.
    setShowProcessGraph(params.sessionPayload?.sessionId ? false : true);
    params.setRunStatus("idle");
    params.setRuntimeByNodeId({});
    params.setSyntheticProgressByNodeId({});
    params.setRunErrorMessage(null);
    setThinkingInput("");
    clearPendingInputs();
    void params.persistPreparedInputs({ decisions: [], clarifications: [] });
    setHoveredNodeId(null);
    params.onSelectNode(null);
    setGraphJustReady(true);
    window.setTimeout(() => setGraphJustReady(false), 2700);
  }, [
    thinkingInput, domainCategory, cancelRunTimers, incrementRunTokenCounter, params,
    setHasIdea, setIsRolePanelExpanded, setIdeaPrompt, setShowProcessGraph,
    setThinkingInput, clearPendingInputs, setHoveredNodeId, setGraphJustReady,
  ]);

  // -----------------------------------------------------------------------
  // switchToRun
  // -----------------------------------------------------------------------
  const switchToRun = useCallback(
    (run: SimulationRun) => {
      if (!params.currentRevisionId) return;
      cancelRunTimers();
      incrementRunTokenCounter();
      params.setActiveRunId(run.id);
      setIdeaPrompt(run.prompt);
      setHasIdea(true);
      setShowProcessGraph(true);
      params.setRunStatus("done");
      params.setRuntimeByNodeId(run.runtimeSnapshot ?? {});
      const hasOutputs = Object.keys(run.outputsBySyntheticId).length > 0;
      if (hasOutputs) {
        params.setViewingRunOutputs(run.outputsBySyntheticId);
      } else if (params.projectId) {
        void fetchRunOutputs(params.projectId, run.id).then((outputs) => {
          params.setViewingRunOutputs(outputs);
        }).catch(() => {
          params.setViewingRunOutputs({});
        });
      }
      params.setSyntheticProgressByNodeId({});
      params.setRunErrorMessage(null);
      setThinkingInput("");
      setHoveredNodeId(null);
      params.onSelectNode(null);
      params.setChatUpdatedNodeIds(new Set());
      params.setChatUpdatedOpinions(run.chatUpdatedOpinions ?? {});
      params.setRunStats(
        withCumulativeTokenUsage(run.stats, params.simulationHistory, run.id),
      );
      params.setCompletedAgentCount(run.stats?.agentsRun ?? 0);
      const { toRemove, toAdd } = params.buildRestoreState({
        run,
        baseSyntheticIds:
          params.selectedRevision?.graphRevision.run.activeSynthetics.map(
            (synthetic: SyntheticNode) => synthetic.id,
          ) ?? [],
      });
      params.setRemovedSyntheticIdsByRevision((prev: any) => ({
        ...prev,
        [params.currentRevisionId!]: toRemove,
      }));
      params.setAddedSyntheticsByRevision((prev: any) => ({
        ...prev,
        [params.currentRevisionId!]: toAdd,
      }));
      params.onRevisionEdgesChange(run.edges);
      toast.success(
        `Switched to ${run.versionLabel} — modify and re-run to create a branch`,
      );
    },
    [
      params, cancelRunTimers, incrementRunTokenCounter,
      setIdeaPrompt, setHasIdea, setShowProcessGraph,
      setThinkingInput, setHoveredNodeId,
    ],
  );

  // -----------------------------------------------------------------------
  // draftNextIteration
  // -----------------------------------------------------------------------
  const draftNextIteration = useCallback(() => {
    const currentIdeaPrompt = useThinkingGraphUiStore.getState().ideaPrompt;
    const basePrompt =
      params.createIterationPromptFromActiveRun?.() ??
      (params.rootPrompt.trim() || currentIdeaPrompt
        ? composeIterationDraft({
            basePrompt: params.rootPrompt.trim() || currentIdeaPrompt,
            recommendationDigest: params.currentRecommendationDigest,
            appliedChatDigest: [],
          })
        : null);
    if (!basePrompt) {
      toast.error("Run the graph first to create an iteration draft.");
      return;
    }

    const nextPrompt = composeIterationDraft({
      basePrompt,
      recommendationDigest: [],
      appliedChatDigest: params.appliedChatDigest,
    });

    setThinkingInput(normalizeDecisionDirectivesInPrompt(nextPrompt));
    setPreviousExpanded(false);
    toast.success(
      "Loaded a new iteration draft from recommendations and selected chat context.",
    );
  }, [params, setThinkingInput, setPreviousExpanded]);

  // -----------------------------------------------------------------------
  // updatePendingStructuredClarificationAnswer
  // -----------------------------------------------------------------------
  const updatePendingStructuredClarificationAnswer = useCallback(
    (input: { syntheticId: string; questionId: string; answer: string }) => {
      const next = pendingStructuredClarifications.map((item) =>
        item.syntheticId !== input.syntheticId
          ? item
          : {
              ...item,
              source: "manual_edit" as const,
              answers: item.answers.map((a) =>
                a.questionId !== input.questionId
                  ? a
                  : { ...a, answer: input.answer },
              ),
            },
      );
      setPendingStructuredClarifications(next);
      void params.persistPreparedInputs({
        decisions: pendingAppliedDecisions,
        clarifications: next,
      });
    },
    [pendingAppliedDecisions, pendingStructuredClarifications, setPendingStructuredClarifications, params],
  );

  // -----------------------------------------------------------------------
  // removePendingStructuredClarification
  // -----------------------------------------------------------------------
  const removePendingStructuredClarification = useCallback(
    (syntheticId: string) => {
      const next = pendingStructuredClarifications.filter(
        (item) => item.syntheticId !== syntheticId,
      );
      setPendingStructuredClarifications(next);
      void params.persistPreparedInputs({
        decisions: pendingAppliedDecisions,
        clarifications: next,
      });
    },
    [pendingAppliedDecisions, pendingStructuredClarifications, setPendingStructuredClarifications, params],
  );

  // -----------------------------------------------------------------------
  // removePendingAppliedDecision
  // -----------------------------------------------------------------------
  const removePendingAppliedDecision = useCallback(
    (syntheticId: string) => {
      const next = pendingAppliedDecisions.filter(
        (item) => item.syntheticId !== syntheticId,
      );
      setPendingAppliedDecisions(next);
      void params.persistPreparedInputs({
        decisions: next,
        clarifications: pendingStructuredClarifications,
      });
    },
    [pendingAppliedDecisions, pendingStructuredClarifications, setPendingAppliedDecisions, params],
  );

  // -----------------------------------------------------------------------
  // savePromptSnapshot
  // -----------------------------------------------------------------------
  const savePromptSnapshot = useCallback(() => {
    const activeRun =
      params.activeRunId !== null
        ? params.simulationHistory.find((r) => r.id === params.activeRunId) ?? null
        : null;

    const snapshot = {
      capturedAt: new Date().toISOString(),
      ideaPrompt,
      thinkingInput,
      previousContextExpanded: previousExpanded,
      activeRunId: params.activeRunId,
      currentSummaryReport: params.currentSummaryReport,
      pendingAppliedDecisions,
      appliedChatDigest: params.appliedChatDigest,
      currentRecommendationDigest: params.currentRecommendationDigest,
      visibleSyntheticIds: params.visibleSynthetics.map((s) => s.id),
      outputsBySyntheticId: params.outputsBySyntheticId,
      revisionEdges: params.revisionEdges,
      runtimeByNodeId: params.runtimeByNodeId,
      activeRun,
      simulationHistory: params.simulationHistory,
    };

    saveJsonSnapshotToFile({
      filenamePrefix: "thinking-graph-snapshot",
      payload: snapshot,
    });
    toast.success("Snapshot saved.");
  }, [
    ideaPrompt, thinkingInput, previousExpanded,
    pendingAppliedDecisions, params,
  ]);

  // -----------------------------------------------------------------------
  // openResponsibleAgentWithQuestion
  // -----------------------------------------------------------------------
  const openResponsibleAgentWithQuestion = useCallback(
    (conflict: RunSummaryConflict) => {
      const responsibleId = conflict.raisedBy;
      if (!responsibleId) {
        toast.error("Conflict does not specify a responsible synthetic.");
        return;
      }
      if (!params.syntheticNodeIdSet.has(responsibleId)) {
        toast.error("Responsible synthetic is not available on this canvas.");
        return;
      }
      params.onSelectNode(responsibleId);
      params.setChatDraftByNodeId((prev) => ({
        ...prev,
        [responsibleId]: composeResponsibleAgentQuestion(conflict),
      }));
      closeReport();
      toast.success("Opened responsible agent with a prefilled resolution question.");
    },
    [params, closeReport],
  );

  // -----------------------------------------------------------------------
  // openWithAssistant
  // -----------------------------------------------------------------------
  const openWithAssistant = useCallback(
    (syntheticId: string, draft: string) => {
      if (!params.syntheticNodeIdSet.has(syntheticId)) {
        toast.error("Agent is not available on this canvas.");
        return;
      }
      params.onSelectNode(syntheticId);
      params.setChatDraftByNodeId((prev) => ({
        ...prev,
        [syntheticId]: draft,
      }));
      closeReport();
    },
    [params, closeReport],
  );

  // -----------------------------------------------------------------------
  // routeDecisionToAgent
  // -----------------------------------------------------------------------
  const routeDecisionToAgent = useCallback(
    (input: {
      decision: DecisionRequiredPayload;
      optionId: string;
      targetSyntheticId: string;
    }) => {
      if (!params.syntheticNodeIdSet.has(input.targetSyntheticId)) {
        toast.error("Selected synthetic is not available on this canvas.");
        return;
      }
      const targetSynthetic = params.visibleSynthetics.find(
        (s) => s.id === input.targetSyntheticId,
      );
      if (!targetSynthetic) {
        toast.error("Selected synthetic is not available on this canvas.");
        return;
      }
      const selectedOption = input.decision.options.find(
        (o) => o.id === input.optionId,
      );
      if (!selectedOption) {
        toast.error("Selected unblock option is invalid.");
        return;
      }
      const activeConflict = params.currentSummaryReport.biggestConflict;
      if (!activeConflict) {
        toast.error("No active conflict is available.");
        return;
      }
      params.onSelectNode(input.targetSyntheticId);
      params.setChatDraftByNodeId((prev) => ({
        ...prev,
        [input.targetSyntheticId]: composeRoutingClarificationQuestion({
          conflict: activeConflict,
          targetSyntheticName: targetSynthetic.name,
          optionLabel: selectedOption.label,
          optionDescription: selectedOption.description,
        }),
      }));
      closeReport();
      toast.success("Opened selected agent with a targeted clarification request.");
    },
    [params, closeReport],
  );

  // -----------------------------------------------------------------------
  // stopThinkingRun
  // -----------------------------------------------------------------------
  const stopThinkingRun = useCallback(() => {
    cancelRunTimers();
    incrementRunTokenCounter();
    params.setRunStatus("idle");
    params.setRuntimeByNodeId((prev: Record<string, string>) => {
      const next = { ...prev };
      for (const [id, status] of Object.entries(next)) {
        if (status === "running" || status === "idle") delete next[id];
      }
      return next;
    });
    params.setRunErrorMessage(null);
    params.setRunStats(null);
    params.setCompletedAgentCount(0);
    params.setSyntheticProgressByNodeId({});
    setShowProcessGraph(true);
  }, [cancelRunTimers, incrementRunTokenCounter, params, setShowProcessGraph]);

  // -----------------------------------------------------------------------
  // legacyStartThinkingRun (timer-based, kept for local/dev mode)
  // -----------------------------------------------------------------------
  const legacyStartThinkingRun = useCallback(() => {
    if (!params.selectedRevision || params.isRunInProgress || !hasIdea) return;
    if (params.syntheticNodeIds.length === 0) {
      toast.error("No synthetic agents available for this revision.");
      return;
    }

    const baseEdges = params.revisionEdges.filter(
      (edge) =>
        (edge.type === "oversight" || edge.type === "amplification") &&
        params.syntheticNodeIdSet.has(edge.from) &&
        params.syntheticNodeIdSet.has(edge.to),
    );
    // Tension edges are bidirectional: both A and B must complete before any
    // node that depends on either of them can run, so add both directions.
    const tensionEdgePairs = params.revisionEdges.flatMap((edge) =>
      edge.type === "tension" &&
      params.syntheticNodeIdSet.has(edge.from) &&
      params.syntheticNodeIdSet.has(edge.to)
        ? [
            { from: edge.from, to: edge.to, id: edge.id, type: edge.type },
            { from: edge.to, to: edge.from, id: `${edge.id}_rev`, type: edge.type },
          ]
        : [],
    );
    const dependencyEdges = [...baseEdges, ...tensionEdgePairs];
    if (hasDependencyCycle(params.syntheticNodeIds, dependencyEdges.map((e) => ({ from: e.from, to: e.to })))) {
      const msg = "Dependency cycle detected. Please adjust edges before running.";
      params.setRunStatus("error");
      params.setRunErrorMessage(msg);
      toast.error(msg);
      return;
    }

    cancelRunTimers();
    const runToken = incrementRunTokenCounter();
    setRunStartTime(Date.now());

    const allLegacyDirtyIds = new Set([
      ...params.chatUpdatedNodeIds,
      ...useThinkingGraphUiStore.getState().reportTabChatUpdatedSyntheticIds,
    ]);
    const isPartialRerun = allLegacyDirtyIds.size > 0 && params.runStatus === "done";
    const affectedNodeIds: Set<string> = isPartialRerun
      ? getDownstreamNodes(params.syntheticNodeIds, allLegacyDirtyIds, dependencyEdges.map((e) => ({ from: e.from, to: e.to })))
      : new Set(params.syntheticNodeIds);

    const partialLabel = isPartialRerun
      ? `Re-running ${affectedNodeIds.size} affected node${affectedNodeIds.size === 1 ? "" : "s"}`
      : "Run started";
    setLogEntries([{ id: 0, elapsed: 0, nodeId: null, label: partialLabel, status: "info" }]);
    params.setRunStatus("running");
    params.setRunErrorMessage(null);
    setShowProcessGraph(true);
    params.setCompletedAgentCount(0);
    params.setRunStats(null);
    params.onSelectNode(null);

    params.setRuntimeByNodeId((prev: Record<string, string>) => {
      const next = { ...prev };
      for (const nodeId of params.syntheticNodeIds) {
        next[nodeId] = affectedNodeIds.has(nodeId) ? "idle" : "done";
      }
      return next;
    });

    const capturedChatCount = allLegacyDirtyIds.size;
    const capturedIsPartialRerun = isPartialRerun;
    params.setChatUpdatedNodeIds(new Set());
    params.setChatUpdatedOpinions({});
    // Clear action card states (adopted/skipped) now that the run is starting.
    useThinkingGraphUiStore.getState().clearActionCardStates();

    const appendLog = (nodeId: string | null, label: string, status: "info" | "running" | "done" | "error") => {
      const elapsed = Date.now() - useThinkingGraphUiStore.getState().runStartTime;
      const id = incrementLogIdCounter();
      addLogEntry({ id, elapsed, nodeId, label, status });
      setTimeout(() => {
        params.logScrollRef.current?.scrollTo({ top: params.logScrollRef.current.scrollHeight, behavior: "smooth" });
      }, 0);
    };

    const prerequisites = new Map<string, Set<string>>(
      params.syntheticNodeIds.map((nodeId) => [nodeId, new Set<string>()]),
    );
    dependencyEdges.forEach((edge) => { prerequisites.get(edge.to)?.add(edge.from); });

    const completed = new Set<string>(params.syntheticNodeIds.filter((id) => !affectedNodeIds.has(id)));
    const running = new Set<string>();

    const scheduleReadyNodes = () => {
      if (useThinkingGraphUiStore.getState().runTokenCounter !== runToken) return;

      if (completed.size === params.syntheticNodeIds.length) {
        params.setRunStatus("done");
        appendLog(null, "All agents complete", "info");
        toast.success("Thinking run complete");

        const durationMs = Date.now() - useThinkingGraphUiStore.getState().runStartTime;
        const completedStats: RunStats = {
          durationMs,
          agentsRun: affectedNodeIds.size,
          totalAgents: params.syntheticNodeIds.length,
          tokenUsage: { promptTokens: null, completionTokens: null, totalTokens: null },
          costUsd: null,
          model: null,
          completedAt: new Date(),
        };
        params.setRunStats(completedStats);

        const tensionEdges = params.revisionEdges.filter((e) => e.type === "tension");
        const conflictNodeIds = new Set<string>();
        tensionEdges.forEach((e) => {
          if (params.syntheticNodeIdSet.has(e.from)) conflictNodeIds.add(e.from);
          if (params.syntheticNodeIdSet.has(e.to)) conflictNodeIds.add(e.to);
        });
        if (conflictNodeIds.size > 0) {
          params.setRuntimeByNodeId((prev: Record<string, string>) => {
            const next = { ...prev };
            conflictNodeIds.forEach((id) => { if (next[id] === "done") next[id] = "conflict"; });
            return next;
          });
        }

        const runtimeSnapshot: Record<string, RuntimeNodeStatus> = {};
        for (const id of params.syntheticNodeIds) {
          runtimeSnapshot[id] = conflictNodeIds.has(id) ? "conflict" : "done";
        }

        const currentIdeaPrompt = useThinkingGraphUiStore.getState().ideaPrompt;
        const reason =
          params.simulationHistory.length === 0
            ? "Initial simulation"
            : capturedIsPartialRerun
              ? `Re-run after chat with ${capturedChatCount} agent${capturedChatCount === 1 ? "" : "s"}`
              : "Re-run with updated idea context";

        const createdRun = params.recordBranchingRun({
          prompt: currentIdeaPrompt,
          reason,
          synthetics: params.visibleSynthetics,
          edges: params.revisionEdges,
          outputsBySyntheticId: params.outputsBySyntheticId,
          summaryReport: buildRunSummaryReport({
            ideaPrompt: currentIdeaPrompt,
            synthetics: params.visibleSynthetics,
            edges: params.revisionEdges,
            outputsBySyntheticId: params.outputsBySyntheticId,
          }),
          stats: completedStats,
          runtimeSnapshot,
          chatUpdatedOpinions: { ...params.chatUpdatedOpinions },
        });
        if (createdRun) {
          useThinkingGraphPersistenceStore.getState().addPersistentItems(
            extractPersistentItems(
              params.outputsBySyntheticId,
              params.visibleSynthetics,
              createdRun.id,
            ),
          );
        }
        if (createdRun?.stats) {
          params.setRunStats(
            withCumulativeTokenUsage(createdRun.stats, [...params.simulationHistory, createdRun], createdRun.id),
          );
        }

        openReport();
        return;
      }

      let launchedAny = false;
      params.syntheticNodeIds.forEach((nodeId) => {
        if (completed.has(nodeId) || running.has(nodeId) || !affectedNodeIds.has(nodeId)) return;
        const deps = prerequisites.get(nodeId) ?? new Set<string>();
        if (!Array.from(deps).every((depId) => completed.has(depId))) return;

        launchedAny = true;
        running.add(nodeId);
        params.setRuntimeByNodeId((prev: Record<string, string>) => ({ ...prev, [nodeId]: "running" }));

        const synth = params.visibleSynthetics.find((s) => s.id === nodeId);
        const nodeLabel = synth ? `[${synth.code}] ${synth.name}` : nodeId;
        appendLog(nodeId, `${nodeLabel} — thinking`, "running");

        const durationMs = 1000 + Math.floor(Math.random() * 1800);
        const timerId = window.setTimeout(() => {
          if (useThinkingGraphUiStore.getState().runTokenCounter !== runToken) return;
          running.delete(nodeId);
          completed.add(nodeId);
          params.setRuntimeByNodeId((prev: Record<string, string>) => ({ ...prev, [nodeId]: "done" }));
          params.setCompletedAgentCount(
            Array.from(affectedNodeIds).filter((id) => completed.has(id)).length,
          );
          appendLog(nodeId, `${nodeLabel} — done`, "done");
          scheduleReadyNodes();
        }, durationMs);

        addRunTimerId(timerId);
      });

      if (!launchedAny && running.size === 0 && completed.size < params.syntheticNodeIds.length) {
        const msg = "Execution stalled due to unresolved dependencies.";
        params.setRunStatus("error");
        params.setRunErrorMessage(msg);
        appendLog(null, msg, "error");
        toast.error(msg);
        params.setRuntimeByNodeId((prev: Record<string, string>) => {
          const next = { ...prev };
          params.syntheticNodeIds.forEach((id) => { if (!completed.has(id)) next[id] = "blocked"; });
          return next;
        });
      }
    };

    scheduleReadyNodes();
  }, [
    cancelRunTimers, incrementRunTokenCounter, incrementLogIdCounter,
    setRunStartTime, setLogEntries, addLogEntry, addRunTimerId,
    setShowProcessGraph, openReport, hasIdea, params,
  ]);

  // -----------------------------------------------------------------------
  // startThinkingRun (async, server-backed)
  // -----------------------------------------------------------------------
  const startThinkingRun = useCallback(async () => {
    if (!params.selectedRevision || params.isRunInProgress || !hasIdea || !params.sessionPayload) return;
    if (params.syntheticNodeIds.length === 0) {
      toast.error("No synthetic agents available for this revision.");
      return;
    }

    // Flush any staged decisions/conflicts into thinkingInput before we read it.
    params.onBeforeRun?.();

    const baseEdges = params.revisionEdges.filter(
      (edge) =>
        (edge.type === "oversight" || edge.type === "amplification") &&
        params.syntheticNodeIdSet.has(edge.from) &&
        params.syntheticNodeIdSet.has(edge.to),
    );
    // Tension edges are bidirectional: both A and B must complete before any
    // node that depends on either of them can run, so add both directions.
    const tensionEdgePairs = params.revisionEdges.flatMap((edge) =>
      edge.type === "tension" &&
      params.syntheticNodeIdSet.has(edge.from) &&
      params.syntheticNodeIdSet.has(edge.to)
        ? [
            { from: edge.from, to: edge.to, id: edge.id, type: edge.type },
            { from: edge.to, to: edge.from, id: `${edge.id}_rev`, type: edge.type },
          ]
        : [],
    );
    const dependencyEdges = [...baseEdges, ...tensionEdgePairs];
    if (hasDependencyCycle(params.syntheticNodeIds, dependencyEdges.map((e) => ({ from: e.from, to: e.to })))) {
      const msg = "Dependency cycle detected. Please adjust edges before running.";
      params.setRunStatus("error");
      params.setRunErrorMessage(msg);
      toast.error(msg);
      return;
    }

    const currentIdeaPrompt = useThinkingGraphUiStore.getState().ideaPrompt;
    const automaticIterationPrompt =
      params.createIterationPromptFromActiveRun?.() ??
      (params.rootPrompt.trim() || currentIdeaPrompt
        ? composeIterationDraft({
            basePrompt: params.rootPrompt.trim() || currentIdeaPrompt,
            recommendationDigest: params.currentRecommendationDigest,
            appliedChatDigest: [],
          })
        : null);
    const effectivePrompt = appendPersistentItemsToPrompt(
      normalizeDecisionDirectivesInPrompt(
        ensureAppliedChatDigestInPrompt({
          prompt: mergePromptDraftWithIdea({
            ideaPrompt: currentIdeaPrompt,
            draftPrompt: thinkingInput.trim()
              ? thinkingInput.trim()
              : automaticIterationPrompt
                ? composeIterationDraft({
                    basePrompt: automaticIterationPrompt,
                    recommendationDigest: [],
                    appliedChatDigest: params.appliedChatDigest,
                  })
                : "",
          }),
          appliedChatDigest: params.appliedChatDigest,
        }),
      ),
      selectOpenItems(useThinkingGraphPersistenceStore.getState()),
    );

    console.group("[ThinkingRun] startThinkingRun — prompt debug");
    console.log("[ThinkingRun] thinkingInput (raw):", JSON.stringify(thinkingInput));
    console.log("[ThinkingRun] ideaPrompt (store):", JSON.stringify(currentIdeaPrompt));
    console.log("[ThinkingRun] automaticIterationPrompt:", JSON.stringify(automaticIterationPrompt));
    console.log("[ThinkingRun] effectivePrompt (final):", effectivePrompt);
    console.log("[ThinkingRun] pendingAppliedDecisions:", pendingAppliedDecisions);
    console.log("[ThinkingRun] pendingStructuredClarifications:", pendingStructuredClarifications);
    console.groupEnd();

    setIdeaPrompt(effectivePrompt);
    setThinkingInput("");
    const allDirtyIds = new Set([
      ...params.chatUpdatedNodeIds,
      ...useThinkingGraphUiStore.getState().reportTabChatUpdatedSyntheticIds,
    ]);
    const rerunMode =
      allDirtyIds.size > 0 && params.runStatus === "done"
        ? "from_node_downstream"
        : "full";
    const dirtySyntheticIds =
      rerunMode === "from_node_downstream"
        ? Array.from(allDirtyIds)
        : undefined;
    const startedAt = Date.now();
    setLogEntries([
      {
        id: 0,
        elapsed: 0,
        nodeId: null,
        label:
          rerunMode === "from_node_downstream" && dirtySyntheticIds
            ? `Partial rerun from ${dirtySyntheticIds.length} changed node${dirtySyntheticIds.length === 1 ? "" : "s"}`
            : "Run started",
        status: "info",
      },
    ]);
    setShowProcessGraph(true);
    params.onSelectNode(null);
    const runResult = await params.executeRun({
      sessionId: params.sessionPayload.sessionId,
      projectId: params.projectId,
      ideaPrompt: effectivePrompt,
      syntheticNodeIds: params.syntheticNodeIds,
      rerunMode,
      dirtySyntheticIds,
      edges: params.revisionEdges,
    });

    if (!runResult) return;

    const { runId, payload: nextPayload, runtimeSnapshot, stats } = runResult;
    const appliedDecisionsForRun = pendingAppliedDecisions.map((d) => ({ ...d }));
    const appliedClarificationsForRun = pendingStructuredClarifications.map((item) => ({
      ...item,
      answers: item.answers.map((a) => ({ ...a })),
    }));
    const logId = incrementLogIdCounter();
    addLogEntry({
      id: logId,
      elapsed: Date.now() - startedAt,
      nodeId: null,
      label: "All agents complete",
      status: "done",
    });

    const createdRun = params.recordSimpleRun({
      runId: runId ?? undefined,
      prompt: effectivePrompt,
      synthetics: nextPayload.synthetics.map((s: SyntheticNode) => ({ ...s })),
      edges: nextPayload.edges.map((e: SyntheticEdge) => ({ ...e })),
      outputsBySyntheticId: nextPayload.outputsBySyntheticId,
      summaryReport: nextPayload.runSummary ?? buildRunSummaryReport({
        ideaPrompt: effectivePrompt,
        synthetics: nextPayload.synthetics,
        edges: nextPayload.edges,
        outputsBySyntheticId: nextPayload.outputsBySyntheticId,
      }),
      appliedDecisions: appliedDecisionsForRun,
      appliedStructuredClarifications: appliedClarificationsForRun,
      stats,
      chatUpdatedOpinions: { ...params.chatUpdatedOpinions },
      runtimeSnapshot,
    });
    if (createdRun) {
      useThinkingGraphPersistenceStore.getState().addPersistentItems(
        extractPersistentItems(
          nextPayload.outputsBySyntheticId,
          nextPayload.synthetics,
          createdRun.id,
        ),
      );
    }
    if (createdRun?.stats) {
      params.setRunStats(
        withCumulativeTokenUsage(
          createdRun.stats,
          [...params.simulationHistory, createdRun],
          createdRun.id,
        ),
      );
    }
    if (appliedDecisionsForRun.length > 0 || appliedClarificationsForRun.length > 0) {
      clearPendingInputs();
      // Restore applied inputs for display — the report shows what was used in
      // the run even after the inputs are "consumed". Also ensures the
      // sessionPayload.preparedInputs preserved by handleSessionPayloadChange
      // is consistent with the Zustand store.
      if (appliedDecisionsForRun.length > 0) {
        setPendingAppliedDecisions(appliedDecisionsForRun);
      }
      if (appliedClarificationsForRun.length > 0) {
        setPendingStructuredClarifications(appliedClarificationsForRun);
      }
    }

    // Sync canvas edges with the server's canonical edge list returned by the run.
    // This ensures any edges the server preserved (or the user drew before running)
    // are correctly reflected in the canvas state after the run completes.
    if (nextPayload.edges) {
      params.onRevisionEdgesChange(nextPayload.edges.map((e: SyntheticEdge) => ({ ...e })));
    }

    toast.success("Thinking run complete");
    openReport();
  }, [
    hasIdea, thinkingInput, pendingAppliedDecisions, pendingStructuredClarifications,
    params, setIdeaPrompt, setThinkingInput, setLogEntries, setShowProcessGraph,
    incrementLogIdCounter, addLogEntry, clearPendingInputs, openReport,
  ]);

  // -----------------------------------------------------------------------
  // resetSession
  // -----------------------------------------------------------------------
  const resetSession = useCallback(() => {
    cancelRunTimers();
    incrementRunTokenCounter();
    setSelectedEdgeId(null);
    params.setPendingRoleDeleteId(null);
    setRoleSearchTerm("");
    setHasIdea(false);
    setIsRolePanelExpanded(false);
    setShowProcessGraph(false);
    setIdeaPrompt("");
    setThinkingInput("");
    clearPendingInputs();
    setHoveredNodeId(null);
    params.setPendingConnection(null);
    resetUiState();
    params.resetHistoryState();
    params.resetEditorState();
    params.resetRuntimeState();
    params.onSelectNode(null);
    params.onRevisionEdgesChange(
      params.selectedRevision?.graphRevision.run.edges.map((e: SyntheticEdge) => ({ ...e })) ?? [],
    );
  }, [
    cancelRunTimers, incrementRunTokenCounter, params,
    setSelectedEdgeId, setRoleSearchTerm, setHasIdea, setIsRolePanelExpanded,
    setShowProcessGraph, setIdeaPrompt, setThinkingInput, clearPendingInputs,
    setHoveredNodeId, resetUiState,
  ]);

  // -----------------------------------------------------------------------
  // removeSelectedEdge
  // -----------------------------------------------------------------------
  const removeSelectedEdge = useCallback(() => {
    const edgeId = useThinkingGraphUiStore.getState().selectedEdgeId;
    if (!edgeId) return;
    const edge = params.revisionEdges.find((e) => e.id === edgeId);
    if (
      edge &&
      (edge.from === "idea" ||
        edge.to === "idea" ||
        edge.from === "outcome" ||
        edge.to === "out" ||
        edge.from === "out" ||
        edge.to === "out")
    ) {
      toast.error("Structural edges cannot be deleted.");
      return;
    }
    params.onRevisionEdgesChange(
      params.revisionEdges.filter((e) => e.id !== edgeId),
    );
    setSelectedEdgeId(null);
  }, [params, setSelectedEdgeId]);

  return {
    cancelRunTimers,
    submitIdea,
    switchToRun,
    draftNextIteration,
    updatePendingStructuredClarificationAnswer,
    removePendingStructuredClarification,
    removePendingAppliedDecision,
    savePromptSnapshot,
    openResponsibleAgentWithQuestion,
    openWithAssistant,
    routeDecisionToAgent,
    stopThinkingRun,
    legacyStartThinkingRun,
    startThinkingRun,
    resetSession,
    removeSelectedEdge,
  };
}
