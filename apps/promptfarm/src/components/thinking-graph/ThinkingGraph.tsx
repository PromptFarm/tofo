"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThinkingGraphGraphData } from "./hooks/useThinkingGraphGraphData";
import "@xyflow/react/dist/style.css";

import { toast } from "sonner";
import { ThinkingGraphCanvas } from "./canvas/ThinkingGraphCanvas";
import { useThinkingGraphActions } from "./hooks/useThinkingGraphActions";
import { useThinkingGraphEditor } from "./hooks/useThinkingGraphEditor";
import { useThinkingGraphHistory } from "./hooks/useThinkingGraphHistory";
import { useThinkingGraphRuntime } from "./hooks/useThinkingGraphRuntime";
import { useThinkingGraphDecisions } from "./hooks/useThinkingGraphDecisions";
import { ThinkingGraphOverlays } from "./overlays/ThinkingGraphOverlays";
import { ConnectionTypeDialog } from "./panels/ConnectionTypeDialog";
import { DeleteRoleDialog } from "./panels/DeleteRoleDialog";
import { OnboardingOverlay } from "./panels/OnboardingOverlay";
import { RolePalette } from "./panels/RolePalette";
import { GraphSidebar } from "./panels/GraphSidebar";
import { IdeaInputFooter } from "./panels/IdeaInputFooter";import { useThinkingGraphUiStore } from "./state/useThinkingGraphUiStore";
import { useThinkingGraphChatStore } from "./state/useThinkingGraphChatStore";
import type {
  IterationNode,
  SyntheticEdge,
  SyntheticNode,
} from "@/lib/planning/types";
import type {
  DirectorOutput,
  RunSummaryConflict,
  SyntheticGraphPayload,
  SyntheticIntakeAnswer,
  SyntheticOutputJson,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
  SyntheticPreparedInputSource,
} from "@/lib/thinking-graph/server/types";
import { updateThinkingGraphPreparedInputs, streamThinkingGraphDirector, confirmThinkingGraphDirector, fetchThinkingGraphSession } from "@/lib/thinking-graph/client";
import { buildRunSummaryReport } from "@/lib/thinking-graph/reportSummary";
import { useTheme } from "@/lib/theme-context";
import { useRunContext, type RunStats } from "@/lib/run-context";
import { reconcilePayloadWithVisibleSynthetics } from "./reconcilePayloadWithVisibleSynthetics";
import { syncSessionPayloadSynthetics } from "./syncSessionPayloadSynthetics";
import {
  EDGE_TYPE_OPTIONS,
  EXTRA_SYNTHETIC_ROLE_TEMPLATES,
  ROLE_DESCRIPTIONS,
  type SyntheticRoleTemplate,
} from "./thinkingGraphConstants";
import {
  accumulateTokenUsageAcrossRuns,
  buildAppliedChatDigest,
  buildRecommendationDigestFromOutputs,
  composeAppliedChatSection,
  composeConflictDirective,
  composeDecisionSelectionDirective,
  composeIterationDraft,
  composeResponsibleAgentQuestion,
  composeRoutingClarificationQuestion,
  composeStructuredClarificationDirective,
  ensureAppliedChatDigestInPrompt,
  getDownstreamNodes,
  getVisibleSynthetics,
  hasDependencyCycle,
  mergePromptDraftWithIdea,
  mergePromptSections,
  normalizeDecisionDirectivesInPrompt,
  saveJsonSnapshotToFile,
  withCumulativeTokenUsage,
  type AppliedDecisionSelection,
  type AppliedStructuredClarification,
  type DecisionRequiredPayload,
} from "./thinkingGraphUtils";

interface ThinkingGraphProps {
  projectId: string | null;
  selectedRevision: IterationNode | null;
  revisionEdges: SyntheticEdge[];
  onRevisionEdgesChange: (edges: SyntheticEdge[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  sessionPayload: SyntheticGraphPayload | null;
  onSessionPayloadChange: (payload: SyntheticGraphPayload) => void;
  onLocalSessionPayloadChange?: (payload: SyntheticGraphPayload) => void;
  onLocalTeamMutationStart?: () => void;
  onPersistSessionPayloadNow?: (payload: SyntheticGraphPayload) => void | Promise<void>;
  autostart?: boolean;
  autoPersonaIds?: string[];
}

export function ThinkingGraph({
  projectId,
  selectedRevision,
  revisionEdges,
  onRevisionEdgesChange,
  selectedNodeId,
  onSelectNode,
  sessionPayload,
  onSessionPayloadChange,
  onLocalSessionPayloadChange,
  onLocalTeamMutationStart,
  onPersistSessionPayloadNow,
  autostart = false,
  autoPersonaIds = [],
}: ThinkingGraphProps) {
  const { theme } = useTheme();
  const {
    register: registerRunContext,
    setCompletedAgentCount,
    setRunStats,
    completedAgentCount,
    runStats,
  } = useRunContext();
  const setNodeRunStatus = useThinkingGraphUiStore((s) => s.setNodeRunStatus);
  const hoveredNodeId = useThinkingGraphUiStore((s) => s.hoveredNodeId);
  const setHoveredNodeId = useThinkingGraphUiStore((s) => s.setHoveredNodeId);
  const selectedEdgeId = useThinkingGraphUiStore((s) => s.selectedEdgeId);
  const setSelectedEdgeId = useThinkingGraphUiStore((s) => s.setSelectedEdgeId);
  const roleSearchTerm = useThinkingGraphUiStore((s) => s.roleSearchTerm);
  const setRoleSearchTerm = useThinkingGraphUiStore((s) => s.setRoleSearchTerm);
  const isRolePanelExpanded = useThinkingGraphUiStore(
    (s) => s.isRolePanelExpanded,
  );
  const setIsRolePanelExpanded = useThinkingGraphUiStore(
    (s) => s.setIsRolePanelExpanded,
  );
  const hoveredRoleId = useThinkingGraphUiStore((s) => s.hoveredRoleId);
  const setHoveredRoleId = useThinkingGraphUiStore((s) => s.setHoveredRoleId);
  const thinkingInput = useThinkingGraphUiStore((s) => s.thinkingInput);
  const setThinkingInput = useThinkingGraphUiStore((s) => s.setThinkingInput);
  const domainCategory = useThinkingGraphUiStore((s) => s.domainCategory);
  const setDomainCategory = useThinkingGraphUiStore((s) => s.setDomainCategory);
  const ideaPrompt = useThinkingGraphUiStore((s) => s.ideaPrompt);
  const setIdeaPrompt = useThinkingGraphUiStore((s) => s.setIdeaPrompt);
  const hasIdea = useThinkingGraphUiStore((s) => s.hasIdea);
  const setHasIdea = useThinkingGraphUiStore((s) => s.setHasIdea);
  const showProcessGraph = useThinkingGraphUiStore((s) => s.showProcessGraph);
  const setShowProcessGraph = useThinkingGraphUiStore(
    (s) => s.setShowProcessGraph,
  );
  const logEntries = useThinkingGraphUiStore((s) => s.logEntries);
  const setLogEntries = useThinkingGraphUiStore((s) => s.setLogEntries);
  const addLogEntry = useThinkingGraphUiStore((s) => s.addLogEntry);
  const previousExpanded = useThinkingGraphUiStore((s) => s.previousExpanded);
  const setPreviousExpanded = useThinkingGraphUiStore((s) => s.setPreviousExpanded);
  const graphJustReady = useThinkingGraphUiStore((s) => s.graphJustReady);
  const setGraphJustReady = useThinkingGraphUiStore((s) => s.setGraphJustReady);
  const openReport = useThinkingGraphUiStore((s) => s.openReport);
  const openBuildPlan = useThinkingGraphUiStore((s) => s.openBuildPlan);
  const openHistoryView = useThinkingGraphUiStore((s) => s.openHistoryView);
  const resetUiState = useThinkingGraphUiStore((s) => s.resetUiState);
  const closeReport = useThinkingGraphUiStore((s) => s.closeReport);
  const pendingAppliedDecisions = useThinkingGraphChatStore(
    (s) => s.pendingAppliedDecisions,
  );
  const setPendingAppliedDecisions = useThinkingGraphChatStore(
    (s) => s.setPendingAppliedDecisions,
  );
  const pendingStructuredClarifications = useThinkingGraphChatStore(
    (s) => s.pendingStructuredClarifications,
  );
  const setPendingStructuredClarifications = useThinkingGraphChatStore(
    (s) => s.setPendingStructuredClarifications,
  );
  const clearPendingInputs = useThinkingGraphChatStore(
    (s) => s.clearPendingInputs,
  );

  const [showIntakePanel, setShowIntakePanel] = useState(false);
  const intakePanelInitialized = useRef(false);
  useEffect(() => {
    console.log("[intake-effect] fired, initialized:", intakePanelInitialized.current, "payload:", !!sessionPayload);
    if (intakePanelInitialized.current) return;
    if (!sessionPayload) return;
    const answered = new Set(sessionPayload.intakeAnswers?.map((a) => a.questionId) ?? []);
    const hasUnanswered = (sessionPayload.intakeQuestions ?? []).some((q) => !answered.has(q.id));
    console.log("[intake-effect] questions:", sessionPayload.intakeQuestions?.length, "hasUnanswered:", hasUnanswered);
    if (hasUnanswered) {
      console.log("[intake-effect] calling setShowIntakePanel(true)");
      setShowIntakePanel(true);
      onSelectNode(ideaNodeId);
    }
    intakePanelInitialized.current = true;
  }, [sessionPayload]);

  // ── Lazy session creation — fires when idea is submitted but no session exists ──
  const sessionCreatingRef = useRef(false);
  useEffect(() => {
    if (sessionPayload || !hasIdea || !ideaPrompt || sessionCreatingRef.current) return;
    sessionCreatingRef.current = true;
    void fetchThinkingGraphSession({ ideaPrompt }).then((payload) => {
      onSessionPayloadChange(payload);
      onRevisionEdgesChange(payload.edges.map((e) => ({ ...e })));
    });
  }, [hasIdea, ideaPrompt, sessionPayload]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Director phase ──────────────────────────────────────────────────
  type DirectorPhase = "idle" | "running" | "awaiting_confirmation" | "confirming" | "confirmed" | "skipped";
  const [directorPhase, setDirectorPhase] = useState<DirectorPhase>("idle");
  const [directorOutput, setDirectorOutput] = useState<DirectorOutput | null>(null);
  const directorTriggeredRef = useRef(false);

  // ── Ghost nodes — cycle through role names while Director scans ──────
  const SCAN_ROLE_POOL = [
    "Product", "Engineer", "Designer", "Marketing", "Finance",
    "Legal", "QA", "Research", "Strategy", "Growth",
    "DevOps", "Security", "Data Analyst", "UX", "Sales",
    "Architect", "Ops", "Brand", "Content", "Analytics",
  ];
  const [ghostNames, setGhostNames] = useState<string[]>([]);

  useEffect(() => {
    if (directorPhase !== "running") {
      setGhostNames([]);
      return;
    }
    const pick = (): string[] => {
      const shuffled = [...SCAN_ROLE_POOL].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 4);
    };
    setGhostNames(pick());
    const id = window.setInterval(() => {
      setGhostNames((prev) => {
        const next = [...prev];
        const idx = Math.floor(Math.random() * next.length);
        const available = SCAN_ROLE_POOL.filter((n) => !next.includes(n));
        if (available.length > 0) {
          next[idx] = available[Math.floor(Math.random() * available.length)] ?? next[idx];
        }
        return next;
      });
    }, 700);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directorPhase]);

  // ── Selected persona IDs for live canvas toggle during awaiting_confirmation ──
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(new Set());
  // Seed once when director output first arrives
  const seededPersonasRef = useRef(false);
  useEffect(() => {
    if (seededPersonasRef.current || !directorOutput || directorOutput.personaSuggestions.length === 0) return;
    seededPersonasRef.current = true;
    setSelectedPersonaIds(new Set(directorOutput.personaSuggestions.map((s) => s.personaId)));
  }, [directorOutput]);

  const logScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const baseVisibleSynthetics = useMemo(
    () => (selectedRevision ? getVisibleSynthetics(selectedRevision) : []),
    [selectedRevision],
  );
  const currentRevisionId = selectedRevision?.id ?? null;
  const {
    runStatus,
    setRunStatus,
    runtimeByNodeId,
    setRuntimeByNodeId,
    runErrorMessage,
    setRunErrorMessage,
    chatsByNodeId,
    setChatsByNodeId,
    chatDraftByNodeId,
    setChatDraftByNodeId,
    chatUpdatedNodeIds,
    setChatUpdatedNodeIds,
    chatUpdatedOpinions,
    setChatUpdatedOpinions,
    syntheticProgressByNodeId,
    setSyntheticProgressByNodeId,
    currentRunTotalAgents,
    outputsBySyntheticId,
    setViewingRunOutputs,
    resetRuntimeState,
    lastRunSyntheticIds,
    executeRun,
    sendChatMessage,
    sendIdeaChatMessage,
    toggleChatMessageIterationUsage,
    removeChatMessage,
  } = useThinkingGraphRuntime({
    sessionPayload,
    onSessionPayloadChange,
    onRevisionEdgesChange,
    onCompletedAgentCountChange: setCompletedAgentCount,
    onRunStatsChange: setRunStats,
  });
  const {
    rootPrompt,
    planGeneratedRunIds,
    simulationHistory,
    activeRunId,
    activeRunHasPlan,
    setRootPrompt,
    setActiveRunId,
    resetHistoryState,
    markPlanGenerated,
    recordSimpleRun,
    recordBranchingRun,
    createIterationPromptFromActiveRun,
    buildRestoreState,
  } = useThinkingGraphHistory();
  const runId = selectedRevision?.graphRevision.run.id ?? "run";
  const ideaNodeId = `${runId}-idea`;
  const outcomeNodeId = `${runId}-outcome`;
  const isRunInProgress = runStatus === "running";

  // Hide intake panel once a run starts
  useEffect(() => {
    if (isRunInProgress) setShowIntakePanel(false);
  }, [isRunInProgress]);

  const activeNodeId = isRunInProgress
    ? null
    : (selectedNodeId ?? hoveredNodeId);
  const isOutcomeReady = runStatus === "done";
  // Mark nodes as needing re-run after a graph change.
  const markNodesDirty = useCallback(
    (ids: string[]) => {
      if (runStatus !== "done") return;
      setChatUpdatedNodeIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    },
    [runStatus, setChatUpdatedNodeIds],
  );
  const {
    pendingRoleDeleteId,
    setPendingRoleDeleteId,
    pendingConnection,
    setPendingConnection,
    setAddedSyntheticsByRevision,
    setRemovedSyntheticIdsByRevision,
    addedSynthetics,
    visibleSynthetics,
    roleTemplates,
    roleTemplateById,
    filteredRoleTemplates,
    selectedSyntheticNode,
    selectedSyntheticEdgeCount,
    pendingDeleteRole,
    pendingDeleteRoleEdgeCount,
    handleConnect,
    confirmConnection,
    handleReconnect,
    handleAddRole,
    addCustomRole,
    handleDeleteSelectedRole,
    removeRoleById,
    resetEditorState,
  } = useThinkingGraphEditor({
    baseVisibleSynthetics,
    currentRevisionId,
    revisionEdges,
    selectedNodeId,
    showProcessGraph,
    isRunInProgress,
    ideaNodeId,
    outcomeNodeId,
    extraRoleTemplates: EXTRA_SYNTHETIC_ROLE_TEMPLATES,
    roleSearchTerm,
    onRevisionEdgesChange,
    onSelectNode,
    onSelectedEdgeChange: setSelectedEdgeId,
    markNodesDirty,
    onTeamMutationStart: onLocalTeamMutationStart,
  });
  const selectedSyntheticMessages = useMemo(
    () =>
      selectedSyntheticNode
        ? (chatsByNodeId[selectedSyntheticNode.id] ?? [])
        : [],
    [chatsByNodeId, selectedSyntheticNode],
  );
  const selectedSyntheticMessageTail = useMemo(() => {
    const lastMessage =
      selectedSyntheticMessages[selectedSyntheticMessages.length - 1];
    return lastMessage
      ? `${lastMessage.id}:${lastMessage.text.length}:${lastMessage.pending ? "pending" : "done"}`
      : "";
  }, [selectedSyntheticMessages]);
  const appliedChatDigest = useMemo(
    () =>
      buildAppliedChatDigest({
        payload: sessionPayload,
        synthetics: visibleSynthetics,
      }),
    [sessionPayload, visibleSynthetics],
  );
  const currentSummaryReport = useMemo(
    () =>
      buildRunSummaryReport({
        ideaPrompt,
        synthetics: visibleSynthetics,
        edges: revisionEdges,
        outputsBySyntheticId,
      }),
    [ideaPrompt, outputsBySyntheticId, revisionEdges, visibleSynthetics],
  );
  const currentRecommendationDigest = useMemo(
    () =>
      buildRecommendationDigestFromOutputs({
        synthetics: visibleSynthetics,
        outputsBySyntheticId,
      }),
    [outputsBySyntheticId, visibleSynthetics],
  );
  const syntheticNodeIds = useMemo(
    () => visibleSynthetics.map((node) => node.id),
    [visibleSynthetics],
  );
  const syntheticNodeIdSet = useMemo(
    () => new Set(visibleSynthetics.map((node) => node.id)),
    [visibleSynthetics],
  );

  const reconcileServerPayload = useCallback(
    (payload: SyntheticGraphPayload) =>
      reconcilePayloadWithVisibleSynthetics(payload, visibleSynthetics),
    [visibleSynthetics],
  );

  useEffect(() => {
    if (!sessionPayload) {
      return;
    }

    const currentSyntheticIds = sessionPayload.synthetics.map((synthetic) => synthetic.id).join(",");
    const nextSyntheticIds = visibleSynthetics.map((synthetic) => synthetic.id).join(",");
    if (currentSyntheticIds === nextSyntheticIds) {
      return;
    }

    const nextPayload = syncSessionPayloadSynthetics(sessionPayload, visibleSynthetics);
    if (onLocalSessionPayloadChange) {
      onLocalSessionPayloadChange(nextPayload);
    } else {
      onSessionPayloadChange(nextPayload);
    }
    void onPersistSessionPayloadNow?.(nextPayload);
  }, [
    onLocalSessionPayloadChange,
    onPersistSessionPayloadNow,
    onSessionPayloadChange,
    sessionPayload,
    visibleSynthetics,
  ]);

  const persistPreparedInputs = useCallback(
    async (input: {
      decisions: AppliedDecisionSelection[];
      clarifications: AppliedStructuredClarification[];
    }) => {
      if (!sessionPayload) {
        return;
      }

      try {
        const nextPayload = await updateThinkingGraphPreparedInputs({
          sessionId: sessionPayload.sessionId,
          preparedInputs: {
            decisions: input.decisions.map((decision) => ({ ...decision })),
            clarifications: input.clarifications.map((clarification) => ({
              ...clarification,
              answers: clarification.answers.map((answer) => ({ ...answer })),
            })),
          },
          sessionPayload,
        });
        onSessionPayloadChange(reconcileServerPayload(nextPayload));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to save prepared inputs.",
        );
      }
    },
    [onSessionPayloadChange, reconcileServerPayload, sessionPayload],
  );

  const {
    applyConflictDirective,
    applyDecisionOption,
    adoptNextMove,
    applyStructuredClarifications,
    flushStagedDecisions,
    hasPending: hasStagedChanges,
    stagedCount: stagedChangesCount,
    stagedDecisions,
    stagedActionKeys,
    unstageDecision,
    unstageAction,
    unstageAll,
    unstageConflict,
  } = useThinkingGraphDecisions({
    createIterationPromptFromActiveRun,
    currentRecommendationDigest,
    appliedChatDigest,
    syntheticNodeIds,
    revisionEdges,
    rootPrompt,
    persistPreparedInputs,
    setChatUpdatedNodeIds,
    setRuntimeByNodeId,
  });

  const actions = useThinkingGraphActions({
    // History hook
    setRootPrompt,
    setActiveRunId,
    createIterationPromptFromActiveRun,
    recordSimpleRun,
    recordBranchingRun,
    resetHistoryState,
    buildRestoreState,
    // Runtime hook
    setRunStatus,
    setRuntimeByNodeId,
    setViewingRunOutputs,
    setSyntheticProgressByNodeId,
    setRunErrorMessage,
    setChatUpdatedNodeIds,
    chatUpdatedOpinions,
    setChatUpdatedOpinions,
    setChatDraftByNodeId,
    executeRun,
    resetRuntimeState,
    outputsBySyntheticId,
    chatUpdatedNodeIds,
    runStatus,
    runtimeByNodeId,
    // Editor hook
    setAddedSyntheticsByRevision,
    setRemovedSyntheticIdsByRevision,
    setPendingRoleDeleteId,
    setPendingConnection,
    resetEditorState,
    // RunContext
    setRunStats,
    setCompletedAgentCount,
    // Props
    projectId,
    onSelectNode,
    onRevisionEdgesChange,
    selectedRevision,
    sessionPayload,
    // Computed values
    syntheticNodeIds,
    syntheticNodeIdSet,
    visibleSynthetics,
    addedSynthetics,
    baseVisibleSynthetics,
    currentRevisionId,
    currentRecommendationDigest,
    appliedChatDigest,
    currentSummaryReport,
    isRunInProgress,
    revisionEdges,
    simulationHistory,
    activeRunId,
    rootPrompt,
    // Utils
      persistPreparedInputs,
      onOpenIntakeWizard: () => {
        setShowIntakePanel(true);
      },
      // DOM refs
      logScrollRef,
      // Flush staged decisions/conflicts before the run prompt is built
      onBeforeRun: flushStagedDecisions,
    });

  const handleCanvasDropPosition = useCallback(
    (templateId: string, position: { x: number; y: number }) => {
      if (!hasIdea) return;
      handleAddRole(templateId, position);
    },
    [handleAddRole, hasIdea],
  );

  useEffect(() => {
    actions.cancelRunTimers();
    setSelectedEdgeId(null);
    setPendingRoleDeleteId(null);
    setRoleSearchTerm("");
    setHasIdea(false);
    setShowProcessGraph(false);
    setIdeaPrompt("");
    setThinkingInput("");
    clearPendingInputs();
    void persistPreparedInputs({
      decisions: [],
      clarifications: [],
    });
    setHoveredNodeId(null);
    resetUiState();
    setGraphJustReady(false);
    resetEditorState();
    resetRuntimeState();
    // After clearing runtime state, immediately restore needs_rerun for any
    // nodes that have staged decisions/clarifications (persisted in preparedInputs).
    // This ensures the amber "re-run needed" indicator is visible on reload and
    // after any re-render that triggers this reset effect.
    if (sessionPayload) {
      const affectedIds = [
        ...sessionPayload.preparedInputs.decisions.map((d) => d.syntheticId),
        ...sessionPayload.preparedInputs.clarifications.map((c) => c.syntheticId),
      ];
      if (affectedIds.length > 0) {
        setRuntimeByNodeId((prev) => {
          const next = { ...prev };
          for (const id of affectedIds) next[id] = "needs_rerun";
          return next;
        });
      }
    }
    // If session already has completed outputs, restore "done" status so the report button is visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (sessionPayload && Object.values(sessionPayload.outputsBySyntheticId).some(Boolean)) {
      setRunStatus("done");
    }
    // Reset Director state
    setDirectorPhase("idle");
    setDirectorOutput(null);
    setSelectedPersonaIds(new Set());
    directorTriggeredRef.current = false;
    seededPersonasRef.current = false;
  }, [
    selectedRevision?.id,
    actions.cancelRunTimers,
    resetUiState,
    resetEditorState,
    resetRuntimeState,
  ]);

  useEffect(() => {
    return () => {
      actions.cancelRunTimers();
    };
  }, [actions.cancelRunTimers]);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }
    if (!revisionEdges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [revisionEdges, selectedEdgeId]);

  useEffect(() => {
    if (!sessionPayload) {
      return;
    }

    if (sessionPayload.ideaPrompt.trim().length > 0) {
      setHasIdea(true);
      setIsRolePanelExpanded(false);
      setIdeaPrompt(sessionPayload.ideaPrompt);
      setShowProcessGraph(true);
    }

    setPendingAppliedDecisions(
      sessionPayload.preparedInputs.decisions.map((decision) => ({
        ...decision,
      })),
    );
    setPendingStructuredClarifications(
      sessionPayload.preparedInputs.clarifications.map((clarification) => ({
        ...clarification,
        answers: clarification.answers.map((answer) => ({ ...answer })),
      })),
    );
  }, [sessionPayload]);


  useEffect(() => {
    if (!selectedSyntheticNode || selectedSyntheticMessages.length === 0) {
      return;
    }

    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [
    selectedSyntheticMessageTail,
    selectedSyntheticMessages.length,
    selectedSyntheticNode,
  ]);


  const discardStagedChanges = useCallback(() => {
    unstageAll();
    useThinkingGraphUiStore.getState().clearActionCardStates();
    // Clear the server-side preparedInputs so the next run starts clean.
    void persistPreparedInputs({ decisions: [], clarifications: [] });
    toast.success("Staged changes discarded.");
  }, [unstageAll, persistPreparedInputs]);

  const isAnalysisPending =
    directorPhase === "running" || directorPhase === "awaiting_confirmation" || directorPhase === "confirming";

  useEffect(() => {
    registerRunContext({
      isRunning: isRunInProgress,
      canRun: hasIdea && !isRunInProgress && syntheticNodeIds.length > 0 && (!isAnalysisPending || simulationHistory.length > 0),
      pendingChatNodes: chatUpdatedNodeIds.size,
      hasBuildPlan: activeRunHasPlan,
      openBuildPlan: () => {
        if (activeRunHasPlan) openBuildPlan();
      },
      openReport,
      start: actions.startThinkingRun,
      stop: actions.stopThinkingRun,
      hasIdea,
      agentCount:
        isRunInProgress && currentRunTotalAgents > 0
          ? currentRunTotalAgents
          : syntheticNodeIds.length,
      runStatus,
      newSession: actions.resetSession,
      visibleSynthetics,
      addRole: handleAddRole,
      removeRole: removeRoleById,
      addCustomRole,
      revisionEdges,
      setRevisionEdges: onRevisionEdgesChange,
    });
  }, [
    registerRunContext,
    isRunInProgress,
    hasIdea,
    syntheticNodeIds.length,
    currentRunTotalAgents,
    chatUpdatedNodeIds.size,
    activeRunHasPlan,
    openBuildPlan,
    openReport,
    runStatus,
    isAnalysisPending,
    simulationHistory.length,
    visibleSynthetics,
    handleAddRole,
    removeRoleById,
    addCustomRole,
    revisionEdges,
    onRevisionEdgesChange,
  ]);

  // Sync runtimeByNodeId → Zustand for ReportTab animations
  useEffect(() => {
    const mapped: Record<string, "idle" | "active" | "done"> = {};
    for (const [id, status] of Object.entries(runtimeByNodeId)) {
      mapped[id] = status === "running" ? "active" : status === "done" ? "done" : "idle";
    }
    setNodeRunStatus(mapped);
  }, [runtimeByNodeId, setNodeRunStatus]);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      event.preventDefault();
      actions.removeSelectedEdge();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions.removeSelectedEdge, selectedEdgeId]);

  // ── Analysis trigger (runs once after idea is submitted) ────────────
  useEffect(() => {
    if (
      !hasIdea ||
      directorPhase !== "idle" ||
      directorTriggeredRef.current ||
      (autostart && autoPersonaIds.length > 0) ||
      !sessionPayload?.sessionId ||
      !ideaPrompt
    ) return;

    // Session already has analysis output (page reload) — restore correct phase
    if (sessionPayload.directorOutput) {
      setDirectorOutput(sessionPayload.directorOutput);
      const savedStatus = sessionPayload.directorStatus;
      setDirectorPhase(
        savedStatus === "confirmed" ? "confirmed"
        : savedStatus === "skipped" ? "skipped"
        : "awaiting_confirmation",
      );
      directorTriggeredRef.current = true;
      return;
    }

    directorTriggeredRef.current = true;
    setDirectorPhase("running");

    void (async () => {
      try {
        const payload = await streamThinkingGraphDirector({
          sessionId: sessionPayload.sessionId,
          ideaPrompt,
        });
        onSessionPayloadChange({ ...payload, directorStatus: "pending" });
        onRevisionEdgesChange(payload.edges.map((e) => ({ ...e })));
        setDirectorOutput(payload.directorOutput ?? null);
        setDirectorPhase("awaiting_confirmation");
        // sidebar auto-open handled by the effect below
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Analysis failed.",
        );
        setDirectorPhase("skipped");
      }
    })();
  }, [hasIdea, sessionPayload?.sessionId, ideaPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open Idea node sidebar as soon as analysis starts
  useEffect(() => {
    if (directorPhase === "running" || directorPhase === "awaiting_confirmation") {
      onSelectNode(ideaNodeId);
    }
  }, [directorPhase, ideaNodeId, onSelectNode]);

  // Reveal the process graph as soon as proposed nodes are ready to preview
  // ("awaiting_confirmation") — chips in the sidebar then toggle canvas nodes live.
  // Also fires on confirmed/skipped to handle all terminal states.
  useEffect(() => {
    if (
      directorPhase === "awaiting_confirmation" ||
      directorPhase === "confirming" ||
      directorPhase === "confirmed" ||
      directorPhase === "skipped"
    ) {
      setShowProcessGraph(true);
    }
  }, [directorPhase, setShowProcessGraph]);

  const handleDirectorConfirm = useCallback(
    async (confirmedPersonaIds: string[], intakeAnswers: SyntheticIntakeAnswer[]) => {
      if (!sessionPayload?.sessionId) return;
      setDirectorPhase("confirming");
      try {
        const payload = await confirmThinkingGraphDirector({
          sessionId: sessionPayload.sessionId,
          confirmedPersonaIds,
          intakeAnswers,
        });
        onSessionPayloadChange({ ...payload, directorStatus: "confirmed" });
        onRevisionEdgesChange(payload.edges.map((e) => ({ ...e })));
        setDirectorOutput(payload.directorOutput ?? null);
        setDirectorPhase("confirmed");
        // Keep idea node selected so user immediately sees the run-context summary.
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to apply team selection.",
        );
        setDirectorPhase("awaiting_confirmation");
      }
    },
    [sessionPayload?.sessionId, onSessionPayloadChange, onRevisionEdgesChange],
  );

  const handleDirectorSkip = useCallback(() => {
    setDirectorPhase("skipped");
    onSelectNode(null);
    if (sessionPayload) {
      onSessionPayloadChange({ ...sessionPayload, directorStatus: "skipped" });
    }
  }, [onSelectNode, sessionPayload, onSessionPayloadChange]);

  // Auto-confirm Director when launched from the creation page
  const autoSelectedTeamAppliedRef = useRef(false);
  const autoConfirmedRef = useRef(false);
  const autoRunStartedRef = useRef(false);

  useEffect(() => {
    if (
      !autostart ||
      autoSelectedTeamAppliedRef.current ||
      autoPersonaIds.length === 0 ||
      directorPhase !== "idle" ||
      !sessionPayload?.sessionId ||
      !hasIdea
    ) {
      return;
    }

    autoSelectedTeamAppliedRef.current = true;
    directorTriggeredRef.current = true;
    void handleDirectorConfirm(autoPersonaIds, []);
  }, [
    autostart,
    autoPersonaIds,
    directorPhase,
    handleDirectorConfirm,
    hasIdea,
    sessionPayload?.sessionId,
  ]);

  useEffect(() => {
    if (
      !autostart ||
      autoConfirmedRef.current ||
      directorPhase !== "awaiting_confirmation" ||
      !directorOutput
    ) return;
    autoConfirmedRef.current = true;
    const ids = autoPersonaIds.length > 0
      ? autoPersonaIds
      : directorOutput.personaSuggestions.map((s) => s.personaId);
    void handleDirectorConfirm(ids, []);
  }, [autostart, directorPhase, directorOutput, autoPersonaIds, handleDirectorConfirm]);

  useEffect(() => {
    if (
      !autostart ||
      autoRunStartedRef.current ||
      directorPhase !== "confirmed" ||
      !selectedRevision ||
      !sessionPayload?.sessionId ||
      !hasIdea ||
      isRunInProgress ||
      runStatus === "done" ||
      syntheticNodeIds.length === 0
    ) {
      return;
    }

    autoRunStartedRef.current = true;
    window.setTimeout(() => {
      void actions.startThinkingRun();
    }, 0);
  }, [
    actions.startThinkingRun,
    autostart,
    directorPhase,
    hasIdea,
    isRunInProgress,
    runStatus,
    selectedRevision,
    sessionPayload?.sessionId,
    syntheticNodeIds.length,
  ]);

  // Ghost synthetics — placeholder nodes that cycle during Director scanning
  const ghostSynthetics = useMemo(() => {
    if (ghostNames.length === 0) return [];
    const COLS = 4;
    return ghostNames.map((name, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      return {
        id: `ghost-${idx}`,
        code: name.slice(0, 2).toUpperCase(),
        name,
        role: "",
        status: "thinking" as const,
        layout: { x: 260 + col * 280, y: 220 + row * 240 },
        config: { enabled: true, temperature: 0.35, strictness: 80, engagementPercent: 75 },
      };
    });
  }, [ghostNames]);

  // Proposed synthetics — real persona nodes shown before confirmation so chip toggles update the canvas live
  const proposedSynthetics = useMemo(() => {
    if (!directorOutput || directorOutput.personaSuggestions.length === 0) return [];
    const suggestions = directorOutput.personaSuggestions.filter((s) => selectedPersonaIds.has(s.personaId));
    const n = suggestions.length;
    const COLS = Math.min(4, n <= 4 ? n : Math.ceil(n / 2));
    return suggestions.map((s, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const isRTL = row % 2 === 1;
      const actualCol = isRTL ? COLS - 1 - col : col;
      return {
        id: `syn-${s.personaId.replace(/_/g, "-")}`,
        code: s.name.replace(/[^A-Z]/g, "").slice(0, 2) || s.name.slice(0, 2).toUpperCase(),
        name: s.name.split("/")[0]?.trim() ?? s.name,
        role: s.domain,
        status: "proposed" as const,
        layout: { x: 260 + actualCol * 280, y: 220 + row * 240 },
        config: { enabled: true, temperature: 0.35, strictness: 80, engagementPercent: 75 },
      };
    });
  }, [directorOutput, selectedPersonaIds]);

  const graphData = useThinkingGraphGraphData({
    theme,
    hasIdea,
    showProcessGraph,
    selectedRevision,
    visibleSynthetics,
    ideaNodeId,
    outcomeNodeId,
    activeNodeId,
    hoveredNodeId,
    selectedNodeId,
    selectedEdgeId,
    isRunInProgress,
    isOutcomeReady,
    runtimeByNodeId,
    chatUpdatedNodeIds,
    revisionEdges,
    onRevisionEdgesChange,
    directorPhase,
    ghostSynthetics,
    proposedSynthetics,
    lastRunSyntheticIds,
  });

  const selectedEdgeData = useMemo(
    () =>
      selectedEdgeId
        ? (revisionEdges.find((e) => e.id === selectedEdgeId) ?? null)
        : null,
    [selectedEdgeId, revisionEdges],
  );
  const isSidebarVisible =
    hasIdea && (Boolean(selectedNodeId) || Boolean(selectedEdgeData));
  const isIdeaNodeSelected = selectedNodeId === ideaNodeId;
  const isSyntheticNodeSelected = Boolean(selectedSyntheticNode);
  const selectedNodeLabel = selectedNodeId
    ? (graphData.nodeNames[selectedNodeId] ?? selectedNodeId)
    : "";

  return (
    <div
      className="relative flex-1 min-h-0"
      style={{ background: "var(--graph-bg)" }}
    >
      <ThinkingGraphCanvas
        nodes={graphData.nodes}
        edges={graphData.edges}
        hasIdea={hasIdea}
        showProcessGraph={showProcessGraph}
        isRunInProgress={isRunInProgress}
        isOutcomeReady={isOutcomeReady}
        selectedNodeId={selectedNodeId}
        directorPhase={directorPhase}
        onSelectNode={onSelectNode}
        onSelectedEdgeChange={setSelectedEdgeId}
        onHoveredNodeChange={setHoveredNodeId}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onDropRole={handleCanvasDropPosition}
      />

      {!hasIdea && (
        <OnboardingOverlay
          domainCategory={domainCategory}
          setDomainCategory={setDomainCategory}
        />
      )}

      {hasIdea && (
        <RolePalette
          isRolePanelExpanded={isRolePanelExpanded}
          setIsRolePanelExpanded={setIsRolePanelExpanded}
          hasIdea={hasIdea}
          filteredRoleTemplates={filteredRoleTemplates}
          roleSearchTerm={roleSearchTerm}
          setRoleSearchTerm={setRoleSearchTerm}
          hoveredRoleId={hoveredRoleId}
          setHoveredRoleId={setHoveredRoleId}
          handleAddRole={handleAddRole}
          simulationHistory={simulationHistory}
          activeRunId={activeRunId}
          switchToRun={actions.switchToRun}
          openHistoryView={openHistoryView}
          planGeneratedRunIds={planGeneratedRunIds}
        />
      )}

      {/* Role hover tooltip */}
      {hasIdea &&
        hoveredRoleId &&
        roleTemplateById.get(hoveredRoleId) &&
        ROLE_DESCRIPTIONS[roleTemplateById.get(hoveredRoleId)!.code] && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: isRolePanelExpanded
                ? "calc(14px + 17rem + 10px)"
                : "calc(14px + 34px + 10px)",
              zIndex: 25,
              width: "14rem",
              borderRadius: 8,
              border: "1px solid var(--surface-container)",
              background: "var(--panel-bg-solid)",
              backdropFilter: "blur(16px)",
              padding: "10px 12px",
              pointerEvents: "none",
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--on-surface)",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                marginBottom: 6,
              }}
            >
              [{roleTemplateById.get(hoveredRoleId)!.code}]{" "}
              {roleTemplateById.get(hoveredRoleId)!.name}
            </p>
            <p
              style={{
                fontSize: 9,
                color: "var(--on-surface-variant)",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                lineHeight: 1.65,
              }}
            >
              {ROLE_DESCRIPTIONS[roleTemplateById.get(hoveredRoleId)!.code]}
            </p>
          </div>
        )}

      {isSidebarVisible && (
        <GraphSidebar
          projectId={projectId}
          selectedEdgeData={selectedEdgeData}
          selectedNodeLabel={selectedNodeLabel}
          hasIdea={hasIdea}
          isIdeaNodeSelected={isIdeaNodeSelected}
          isSyntheticNodeSelected={isSyntheticNodeSelected}
          selectedSyntheticNode={selectedSyntheticNode}
          selectedSyntheticEdgeCount={selectedSyntheticEdgeCount}
          ideaPrompt={ideaPrompt}
          logEntries={logEntries}
          logScrollRef={logScrollRef}
          chatScrollRef={chatScrollRef}
          chatContainerRef={chatContainerRef}
          runtimeByNodeId={runtimeByNodeId}
          syntheticProgressByNodeId={syntheticProgressByNodeId}
          outputsBySyntheticId={outputsBySyntheticId}
          chatsByNodeId={chatsByNodeId}
          chatDraftByNodeId={chatDraftByNodeId}
          chatUpdatedOpinions={chatUpdatedOpinions}
          revisionEdges={revisionEdges}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={onSelectNode}
          setSelectedEdgeId={setSelectedEdgeId}
          onRevisionEdgesChange={onRevisionEdgesChange}
          markNodesDirty={markNodesDirty}
          setChatDraftByNodeId={setChatDraftByNodeId}
          handleDeleteSelectedRole={handleDeleteSelectedRole}
          removeSelectedEdge={actions.removeSelectedEdge}
          sessionPayload={sessionPayload}
          thinkingInput={thinkingInput}
          setThinkingInput={setThinkingInput}
          submitIdea={actions.submitIdea}
          stopThinkingRun={actions.stopThinkingRun}
          isRunInProgress={isRunInProgress}
          runStatus={runStatus}
          runErrorMessage={runErrorMessage}
          completedAgentCount={completedAgentCount}
          syntheticNodeIds={syntheticNodeIds}
          activeRunId={activeRunId}
          rootPrompt={rootPrompt}
          draftNextIteration={actions.draftNextIteration}
          savePromptSnapshot={actions.savePromptSnapshot}
          intakeSessionId={showIntakePanel ? (sessionPayload?.sessionId ?? null) : null}
          onIntakePayloadUpdate={(payload) => {
            setShowIntakePanel(false);
            onSessionPayloadChange(payload);
          }}
          directorOutput={directorOutput ?? sessionPayload?.directorOutput ?? null}
          directorPhase={directorPhase}
          directorSelectedPersonaIds={selectedPersonaIds}
          onToggleDirectorPersona={(personaId) => {
            setSelectedPersonaIds((prev) => {
              const next = new Set(prev);
              if (next.has(personaId)) {
                if (next.size <= 1) return prev; // keep at least one
                next.delete(personaId);
              } else {
                next.add(personaId);
              }
              return next;
            });
          }}
          onDirectorConfirm={handleDirectorConfirm}
          onDirectorSkip={handleDirectorSkip}
          pendingAppliedDecisions={pendingAppliedDecisions}
          pendingStructuredClarifications={pendingStructuredClarifications}
          removePendingAppliedDecision={actions.removePendingAppliedDecision}
          removePendingStructuredClarification={actions.removePendingStructuredClarification}
          updatePendingStructuredClarificationAnswer={actions.updatePendingStructuredClarificationAnswer}
          sendChatMessage={sendChatMessage}
          sendIdeaChatMessage={sendIdeaChatMessage}
          toggleChatMessageIterationUsage={toggleChatMessageIterationUsage}
          removeChatMessage={removeChatMessage}
          graphNodeNames={graphData.nodeNames}
        />
      )}



      {/* Bottom idea-input panel — only before idea is submitted */}
      {!hasIdea && (
        <IdeaInputFooter
          hasIdea={hasIdea}
          projectId={projectId}
          ideaPrompt={ideaPrompt}
          thinkingInput={thinkingInput}
          setThinkingInput={setThinkingInput}
          isRunInProgress={isRunInProgress}
          runStatus={runStatus}
          runErrorMessage={runErrorMessage}
          previousExpanded={previousExpanded}
          setPreviousExpanded={setPreviousExpanded}
          activeRunId={activeRunId}
          rootPrompt={rootPrompt}
          completedAgentCount={completedAgentCount}
          syntheticNodeIds={syntheticNodeIds}
          simulationHistoryLength={simulationHistory.length}
          outputsBySyntheticId={outputsBySyntheticId}
          pendingAppliedDecisions={pendingAppliedDecisions}
          pendingStructuredClarifications={pendingStructuredClarifications}
          draftNextIteration={actions.draftNextIteration}
          savePromptSnapshot={actions.savePromptSnapshot}
          submitIdea={actions.submitIdea}
          stopThinkingRun={actions.stopThinkingRun}
          removePendingAppliedDecision={actions.removePendingAppliedDecision}
          removePendingStructuredClarification={actions.removePendingStructuredClarification}
          updatePendingStructuredClarificationAnswer={actions.updatePendingStructuredClarificationAnswer}
          intakeQuestions={sessionPayload?.intakeQuestions ?? []}
          intakeAnswers={sessionPayload?.intakeAnswers ?? []}
        />
      )}

      {/* Bottom hint — tap to open right panel when sidebar is collapsed */}
      {hasIdea && !isSidebarVisible && (isAnalysisPending || isRunInProgress) && (
        <button
          type="button"
          onClick={() => onSelectNode(ideaNodeId)}
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 20,
            border: "1px solid rgba(167,139,250,0.4)",
            background: "var(--panel-bg)",
            backdropFilter: "blur(12px)",
            color: "#a78bfa",
            fontSize: 10,
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 16px rgba(167,139,250,0.15)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#a78bfa",
              flexShrink: 0,
              animation: (directorPhase === "running" || isRunInProgress)
                ? "intake-pulse-dot 1.2s ease infinite"
                : "none",
            }}
          />
          {isRunInProgress
            ? "Simulation running… tap to follow along"
            : directorPhase === "running"
            ? "Analyzing idea… tap to follow along"
            : "✦ Tap Idea node to finish setup before running"}
        </button>
      )}

      {/* Outcome report modal — current run */}
      <ThinkingGraphOverlays
        activeRunId={activeRunId}
        runVersionLabel={simulationHistory.find((r) => r.id === activeRunId)?.versionLabel}
        sessionId={sessionPayload?.sessionId ?? null}
        ideaPrompt={ideaPrompt}
        visibleSynthetics={visibleSynthetics}
        revisionEdges={revisionEdges}
        outputsBySyntheticId={outputsBySyntheticId}
        summaryReport={currentSummaryReport}
        appliedDecisions={pendingAppliedDecisions}
        appliedStructuredClarifications={pendingStructuredClarifications}
        appliedChatDigest={appliedChatDigest}
        markPlanGenerated={markPlanGenerated}
        onSelectNode={onSelectNode}
        onApplyConflictDirective={applyConflictDirective}
        onApplyDecisionOption={applyDecisionOption}
        onApplyStructuredClarifications={applyStructuredClarifications}
        onRouteDecisionToAgent={actions.routeDecisionToAgent}
        onOpenResponsibleAgent={actions.openResponsibleAgentWithQuestion}
        onAdoptNextMove={adoptNextMove}
        onOpenWithAssistant={actions.openWithAssistant}
        hasStagedChanges={hasStagedChanges}
        stagedChangesCount={stagedChangesCount}
        stagedDecisions={stagedDecisions}
        stagedActionKeys={stagedActionKeys}
        onDiscardStagedChanges={discardStagedChanges}
        onUnstageAction={unstageAction}
        onUndoConflictDirective={unstageConflict}
        onUnstageDecision={unstageDecision}
      />

      {/* Build Plan full-screen page — current run */}

      {/* History: view a past run's outcome report */}

      {/* History: view a past run's build plan */}

      <ConnectionTypeDialog
        open={Boolean(pendingConnection)}
        options={EDGE_TYPE_OPTIONS}
        onClose={() => setPendingConnection(null)}
        onConfirm={confirmConnection}
      />

      <DeleteRoleDialog
        open={Boolean(pendingRoleDeleteId)}
        roleName={pendingDeleteRole?.name}
        linkedEdgeCount={pendingDeleteRoleEdgeCount}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRoleDeleteId(null);
          }
        }}
        onConfirm={() => {
          if (pendingRoleDeleteId) {
            removeRoleById(pendingRoleDeleteId);
          }
          setPendingRoleDeleteId(null);
        }}
      />
    </div>
  );
}
