"use client";

import { create } from "zustand";

import type { HistoryView, LogEntry, SimulationRun } from "../runtime/runtimeTypes";

type ThinkingGraphUiState = {
  // Action card states — persisted across modal open/close
  actionCardStates: Record<string, "adopted" | "skipped">;
  setActionCardState: (key: string, state: "adopted" | "skipped" | null) => void;
  clearActionCardStates: () => void;
  // Dirty synthetic tracking from ReportTab chat (for partial re-run)
  reportTabChatUpdatedSyntheticIds: Set<string>;
  addReportTabChatUpdatedSyntheticId: (id: string) => void;
  removeReportTabChatUpdatedSyntheticId: (id: string) => void;
  clearReportTabChatUpdatedSyntheticIds: () => void;
  // Overlays
  reportOpen: boolean;
  buildPlanOpen: boolean;
  historyView: HistoryView;
  buildPlanReturnPhaseId: string | null;
  completedTaskIds: Set<string>;
  // Canvas interaction
  hoveredNodeId: string | null;
  selectedEdgeId: string | null;
  // Role palette
  roleSearchTerm: string;
  isRolePanelExpanded: boolean;
  hoveredRoleId: string | null;
  // Idea / session
  hasIdea: boolean;
  ideaPrompt: string;
  thinkingInput: string;
  showProcessGraph: boolean;
  domainCategory: string | null;
  // Execution log
  logEntries: LogEntry[];
  logIdCounter: number;
  runTokenCounter: number;
  runStartTime: number;
  runTimerIds: number[];
  // Per-node run status for ReportTab animations
  nodeRunStatus: Record<string, "idle" | "active" | "done">;
  setNodeRunStatus: (status: Record<string, "idle" | "active" | "done">) => void;
  streamingTextByNodeId: Record<string, string>;
  appendStreamingText: (nodeId: string, delta: string) => void;
  clearStreamingText: () => void;
  // History panel
  previousExpanded: boolean;
  graphJustReady: boolean;

  // Overlay actions
  openReport: () => void;
  closeReport: () => void;
  openBuildPlan: () => void;
  closeBuildPlan: () => void;
  openHistoryView: (run: SimulationRun, mode: "report" | "plan") => void;
  closeHistoryView: () => void;
  setBuildPlanReturnPhaseId: (phaseId: string | null) => void;
  toggleTaskComplete: (taskId: string) => void;
  resetUiState: () => void;
  // Canvas interaction actions
  setHoveredNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  // Role palette actions
  setRoleSearchTerm: (term: string) => void;
  setIsRolePanelExpanded: (expanded: boolean) => void;
  setHoveredRoleId: (id: string | null) => void;
  // Idea / session actions
  setHasIdea: (hasIdea: boolean) => void;
  setIdeaPrompt: (prompt: string) => void;
  setThinkingInput: (input: string) => void;
  setShowProcessGraph: (show: boolean) => void;
  setDomainCategory: (category: string | null) => void;
  // Log actions
  setLogEntries: (entries: LogEntry[]) => void;
  addLogEntry: (entry: LogEntry) => void;
  // History panel actions
  setPreviousExpanded: (expanded: boolean) => void;
  setGraphJustReady: (ready: boolean) => void;
  // Execution counters
  incrementLogIdCounter: () => number;
  incrementRunTokenCounter: () => number;
  setRunStartTime: (time: number) => void;
  addRunTimerId: (id: number) => void;
  clearRunTimerIds: () => void;
  setRunTimerIds: (ids: number[]) => void;
};

const initialState = {
  actionCardStates: {} as Record<string, "adopted" | "skipped">,
  reportTabChatUpdatedSyntheticIds: new Set<string>(),
  reportOpen: false,
  buildPlanOpen: false,
  historyView: null as HistoryView,
  buildPlanReturnPhaseId: null as string | null,
  completedTaskIds: new Set<string>(),
  hoveredNodeId: null as string | null,
  selectedEdgeId: null as string | null,
  roleSearchTerm: "",
  isRolePanelExpanded: false,
  hoveredRoleId: null as string | null,
  hasIdea: false,
  ideaPrompt: "",
  thinkingInput: "",
  showProcessGraph: false,
  domainCategory: null as string | null,
  logEntries: [] as LogEntry[],
  logIdCounter: 0,
  runTokenCounter: 0,
  runStartTime: 0,
  runTimerIds: [] as number[],
  nodeRunStatus: {} as Record<string, "idle" | "active" | "done">,
  streamingTextByNodeId: {} as Record<string, string>,
  previousExpanded: false,
  graphJustReady: false,
};

export const useThinkingGraphUiStore = create<ThinkingGraphUiState>((set) => ({
  ...initialState,

  clearActionCardStates: () => set({ actionCardStates: {} }),

  // ReportTab dirty tracking
  addReportTabChatUpdatedSyntheticId: (id) =>
    set((state) => {
      const next = new Set(state.reportTabChatUpdatedSyntheticIds);
      next.add(id);
      return { reportTabChatUpdatedSyntheticIds: next };
    }),
  removeReportTabChatUpdatedSyntheticId: (id) =>
    set((state) => {
      const next = new Set(state.reportTabChatUpdatedSyntheticIds);
      next.delete(id);
      return { reportTabChatUpdatedSyntheticIds: next };
    }),
  clearReportTabChatUpdatedSyntheticIds: () =>
    set({ reportTabChatUpdatedSyntheticIds: new Set<string>() }),

  // Action card states
  setActionCardState: (key, state) =>
    set((prev) => {
      const next = { ...prev.actionCardStates };
      if (state === null) {
        delete next[key];
      } else {
        next[key] = state;
      }
      return { actionCardStates: next };
    }),

  // Overlays
  openReport: () =>
    set({ reportOpen: true, buildPlanOpen: false, historyView: null }),
  closeReport: () => set({ reportOpen: false }),
  openBuildPlan: () =>
    set({ buildPlanOpen: true, reportOpen: false, historyView: null }),
  closeBuildPlan: () => set({ buildPlanOpen: false }),
  openHistoryView: (run, mode) =>
    set({ historyView: { run, mode }, reportOpen: false, buildPlanOpen: false }),
  closeHistoryView: () => set({ historyView: null }),
  setBuildPlanReturnPhaseId: (phaseId) =>
    set({ buildPlanReturnPhaseId: phaseId }),
  toggleTaskComplete: (taskId) =>
    set((state) => {
      const next = new Set(state.completedTaskIds);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return { completedTaskIds: next };
    }),
  resetUiState: () =>
    set({
      ...initialState,
      completedTaskIds: new Set<string>(),
      reportTabChatUpdatedSyntheticIds: new Set<string>(),
    }),

  // Canvas interaction
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id }),

  // Role palette
  setRoleSearchTerm: (term) => set({ roleSearchTerm: term }),
  setIsRolePanelExpanded: (expanded) => set({ isRolePanelExpanded: expanded }),
  setHoveredRoleId: (id) => set({ hoveredRoleId: id }),

  // Idea / session
  setHasIdea: (hasIdea) => set({ hasIdea }),
  setIdeaPrompt: (prompt) => set({ ideaPrompt: prompt }),
  setThinkingInput: (input) => set({ thinkingInput: input }),
  setShowProcessGraph: (show) => set({ showProcessGraph: show }),
  setDomainCategory: (category) => set({ domainCategory: category }),

  // Log
  setLogEntries: (entries) => set({ logEntries: entries }),
  addLogEntry: (entry) =>
    set((state) => ({ logEntries: [...state.logEntries, entry] })),

  setNodeRunStatus: (status) => set({ nodeRunStatus: status }),
  appendStreamingText: (nodeId, delta) =>
    set((state) => ({
      streamingTextByNodeId: {
        ...state.streamingTextByNodeId,
        [nodeId]: (state.streamingTextByNodeId[nodeId] ?? "") + delta,
      },
    })),
  clearStreamingText: () => set({ streamingTextByNodeId: {} }),

  // History panel
  setPreviousExpanded: (expanded) => set({ previousExpanded: expanded }),
  setGraphJustReady: (ready) => set({ graphJustReady: ready }),

  // Execution counters
  incrementLogIdCounter: () => {
    let result = 0;
    set((state) => {
      result = state.logIdCounter + 1;
      return { logIdCounter: result };
    });
    return result;
  },
  incrementRunTokenCounter: () => {
    let result = 0;
    set((state) => {
      result = state.runTokenCounter + 1;
      return { runTokenCounter: result };
    });
    return result;
  },
  setRunStartTime: (time) => set({ runStartTime: time }),
  addRunTimerId: (id) =>
    set((state) => ({ runTimerIds: [...state.runTimerIds, id] })),
  clearRunTimerIds: () => set({ runTimerIds: [] }),
  setRunTimerIds: (ids) => set({ runTimerIds: ids }),
}));
