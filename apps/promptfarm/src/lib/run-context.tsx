"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import type { SyntheticNode, SyntheticEdge } from "@/lib/planning/types";

export type RunStats = {
  durationMs: number;
  agentsRun: number;
  totalAgents: number;
  tokenUsage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  costUsd: number | null;
  model: string | null;
  completedAt: Date;
};

type RunContextValue = {
  isRunning: boolean;
  canRun: boolean;
  pendingChatNodes: number;
  hasBuildPlan: boolean;
  hasIdea: boolean;
  agentCount: number;
  completedAgentCount: number;
  elapsedSecs: number;
  runStatus: "idle" | "running" | "done" | "error";
  runStats: RunStats | null;
  visibleSynthetics: SyntheticNode[];
  revisionEdges: SyntheticEdge[];
  graphRegistered: boolean;
  teamSaveState: "idle" | "saving" | "saved" | "error";
  start: () => void;
  stop: () => void;
  openBuildPlan: () => void;
  openReport: () => void;
  newSession: () => void;
  addRole: (templateId: string) => void;
  removeRole: (syntheticId: string) => void;
  addCustomRole: (name: string, roleDesc: string) => void;
  setRevisionEdges: (edges: SyntheticEdge[]) => void;
  /** Direct setters — called by ThinkingGraph for high-frequency progress updates */
  setCompletedAgentCount: (n: number) => void;
  setRunStats: (s: RunStats | null) => void;
  setTeamSaveState: (state: "idle" | "saving" | "saved" | "error") => void;
  /** Called by ThinkingGraph to register its run controls */
  register: (controls: {
    start: () => void;
    stop: () => void;
    canRun: boolean;
    isRunning: boolean;
    pendingChatNodes: number;
    hasBuildPlan?: boolean;
    openBuildPlan?: () => void;
    openReport?: () => void;
    hasIdea?: boolean;
    agentCount?: number;
    runStatus?: "idle" | "running" | "done" | "error";
    newSession?: () => void;
    visibleSynthetics?: SyntheticNode[];
    addRole?: (templateId: string) => void;
    removeRole?: (syntheticId: string) => void;
    addCustomRole?: (name: string, roleDesc: string) => void;
    revisionEdges?: SyntheticEdge[];
    setRevisionEdges?: (edges: SyntheticEdge[]) => void;
  }) => void;
};

const RunContext = createContext<RunContextValue>({
  isRunning: false,
  canRun: false,
  pendingChatNodes: 0,
  hasBuildPlan: false,
  hasIdea: false,
  agentCount: 0,
  completedAgentCount: 0,
  elapsedSecs: 0,
  runStatus: "idle",
  runStats: null,
  visibleSynthetics: [],
  revisionEdges: [],
  graphRegistered: false,
  teamSaveState: "idle",
  start: () => {},
  stop: () => {},
  openBuildPlan: () => {},
  openReport: () => {},
  newSession: () => {},
  addRole: () => {},
  removeRole: () => {},
  addCustomRole: () => {},
  setRevisionEdges: () => {},
  setCompletedAgentCount: () => {},
  setRunStats: () => {},
  setTeamSaveState: () => {},
  register: () => {},
});

export function RunProvider({ children }: { children: ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [canRun, setCanRun] = useState(false);
  const [pendingChatNodes, setPendingChatNodes] = useState(0);
  const [hasBuildPlan, setHasBuildPlan] = useState(false);
  const [hasIdea, setHasIdea] = useState(false);
  const [agentCount, setAgentCount] = useState(0);
  const [completedAgentCount, setCompletedAgentCount] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [visibleSynthetics, setVisibleSynthetics] = useState<SyntheticNode[]>([]);
  const [revisionEdges, setRevisionEdgesCtx] = useState<SyntheticEdge[]>([]);
  const setRevisionEdgesRef = useRef<(edges: SyntheticEdge[]) => void>(() => {});
  const [graphRegistered, setGraphRegistered] = useState(false);
  const [teamSaveState, setTeamSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const startFnRef = useRef<() => void>(() => {});
  const stopFnRef = useRef<() => void>(() => {});
  const openBuildPlanFnRef = useRef<() => void>(() => {});
  const openReportFnRef = useRef<() => void>(() => {});
  const newSessionFnRef = useRef<() => void>(() => {});
  const addRoleFnRef = useRef<(templateId: string) => void>(() => {});
  const removeRoleFnRef = useRef<(syntheticId: string) => void>(() => {});
  const addCustomRoleFnRef = useRef<(name: string, roleDesc: string) => void>(() => {});

  // Elapsed-seconds ticker — runs while isRunning is true
  const runStartRef = useRef<number>(0);
  useEffect(() => {
    if (!isRunning) {
      setElapsedSecs(0);
      return;
    }
    runStartRef.current = Date.now();
    setElapsedSecs(0);
    const id = window.setInterval(() => {
      setElapsedSecs(Math.round((Date.now() - runStartRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const register = useCallback((controls: {
    start: () => void;
    stop: () => void;
    canRun: boolean;
    isRunning: boolean;
    pendingChatNodes: number;
    hasBuildPlan?: boolean;
    openBuildPlan?: () => void;
    openReport?: () => void;
    hasIdea?: boolean;
    agentCount?: number;
    runStatus?: "idle" | "running" | "done" | "error";
    newSession?: () => void;
    visibleSynthetics?: SyntheticNode[];
    addRole?: (templateId: string) => void;
    removeRole?: (syntheticId: string) => void;
    addCustomRole?: (name: string, roleDesc: string) => void;
    revisionEdges?: SyntheticEdge[];
    setRevisionEdges?: (edges: SyntheticEdge[]) => void;
  }) => {
    setGraphRegistered(true);
    setIsRunning(controls.isRunning);
    setCanRun(controls.canRun);
    setPendingChatNodes(controls.pendingChatNodes);
    setHasBuildPlan(controls.hasBuildPlan ?? false);
    setHasIdea(controls.hasIdea ?? false);
    setAgentCount(controls.agentCount ?? 0);
    setRunStatus(controls.runStatus ?? "idle");
    startFnRef.current = controls.start;
    stopFnRef.current = controls.stop;
    if (controls.openBuildPlan) openBuildPlanFnRef.current = controls.openBuildPlan;
    if (controls.openReport)    openReportFnRef.current = controls.openReport;
    if (controls.newSession)    newSessionFnRef.current = controls.newSession;
    if (controls.visibleSynthetics) setVisibleSynthetics(controls.visibleSynthetics);
    if (controls.addRole)          addRoleFnRef.current = controls.addRole;
    if (controls.removeRole)       removeRoleFnRef.current = controls.removeRole;
    if (controls.addCustomRole)    addCustomRoleFnRef.current = controls.addCustomRole;
    if (controls.revisionEdges)    setRevisionEdgesCtx(controls.revisionEdges);
    if (controls.setRevisionEdges) setRevisionEdgesRef.current = controls.setRevisionEdges;
  }, []);

  const start         = useCallback(() => startFnRef.current(),         []);
  const stop          = useCallback(() => stopFnRef.current(),          []);
  const openBuildPlan = useCallback(() => openBuildPlanFnRef.current(), []);
  const openReport    = useCallback(() => openReportFnRef.current(),    []);
  const newSession    = useCallback(() => newSessionFnRef.current(),    []);
  const addRole       = useCallback((templateId: string) => addRoleFnRef.current(templateId), []);
  const removeRole    = useCallback((syntheticId: string) => removeRoleFnRef.current(syntheticId), []);
  const addCustomRole    = useCallback((name: string, roleDesc: string) => addCustomRoleFnRef.current(name, roleDesc), []);
  const setRevisionEdges = useCallback((edges: SyntheticEdge[]) => setRevisionEdgesRef.current(edges), []);

  return (
    <RunContext.Provider value={{
      isRunning, canRun, pendingChatNodes, hasBuildPlan, hasIdea,
      agentCount, completedAgentCount, elapsedSecs, runStatus, runStats,
      visibleSynthetics, revisionEdges, graphRegistered, teamSaveState,
      start, stop, openBuildPlan, openReport, newSession,
      addRole, removeRole, addCustomRole, setRevisionEdges,
      setCompletedAgentCount, setRunStats, setTeamSaveState,
      register,
    }}>
      {children}
    </RunContext.Provider>
  );
}

export function useRunContext() {
  return useContext(RunContext);
}
