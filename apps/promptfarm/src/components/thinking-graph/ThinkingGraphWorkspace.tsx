"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThinkingGraphUiStore } from "@/components/thinking-graph/state/useThinkingGraphUiStore";
import { useThinkingGraphChatStore } from "@/components/thinking-graph/state/useThinkingGraphChatStore";
import {
  useThinkingGraphVersionStore,
  serializeSimulationRun,
  deserializeSimulationRun,
} from "@/components/thinking-graph/state/useThinkingGraphVersionStore";
import { useThinkingGraphPersistenceStore } from "@/components/thinking-graph/state/useThinkingGraphPersistenceStore";
import { TopNav } from "@/components/layout/TopNav";
import { ThinkingGraph } from "@/components/thinking-graph/ThinkingGraph";
import { RunProvider, useRunContext } from "@/lib/run-context";
import { PendingOperationBanner } from "@/components/ui/PendingOperationBanner";
import { getPendingOperationState } from "@/components/ui/pendingOperationState";
import { usePendingOperationGuard } from "@/components/ui/usePendingOperationGuard";
import {
  fetchThinkingGraphSession,
  saveProjectThinkingGraphSession,
} from "@/lib/thinking-graph/client";
import { rehydrateStagingBuffer } from "@/components/thinking-graph/hooks/useStagingBuffer";
import { buildProjectFromThinkingGraphPayload } from "@/lib/thinking-graph/projectAdapter";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";
import type { SyntheticEdge } from "@/lib/planning/types";
import { applyLocalSessionPayloadChange } from "./applyLocalSessionPayloadChange";
import { mergeIncomingSessionPayload } from "./mergeIncomingSessionPayload";

type ThinkingGraphWorkspaceProps = {
  projectId: string | null;
  projectName: string | null;
  initialIdeaPrompt: string;
  initialSessionPayload: SyntheticGraphPayload | null;
  autostart?: boolean;
  autoPersonaIds?: string[];
  withRunProvider?: boolean;
};

export function ThinkingGraphWorkspace({
  projectId,
  projectName,
  initialIdeaPrompt,
  initialSessionPayload,
  autostart = false,
  autoPersonaIds = [],
  withRunProvider = true,
}: ThinkingGraphWorkspaceProps) {
  const [sessionPayload, setSessionPayload] = useState<SyntheticGraphPayload | null>(
    initialSessionPayload,
  );
  const [revisionEdges, setRevisionEdges] = useState<SyntheticEdge[]>(
    initialSessionPayload?.edges.map((edge) => ({ ...edge })) ?? [],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [teamMutationPending, setTeamMutationPending] = useState(false);
  const [sessionPayloadProjectId, setSessionPayloadProjectId] = useState<string | null>(
    initialSessionPayload ? projectId : null,
  );
  const [readyProjectKey, setReadyProjectKey] = useState<string | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(
    initialSessionPayload ? JSON.stringify(initialSessionPayload) : null,
  );
  const projectKey = projectId ?? "standalone-thinking-graph";

  const resetUiState = useThinkingGraphUiStore((s) => s.resetUiState);
  const clearPendingInputs = useThinkingGraphChatStore((s) => s.clearPendingInputs);
  const setPendingStructuredClarifications = useThinkingGraphChatStore(
    (s) => s.setPendingStructuredClarifications,
  );
  const resetVersionState = useThinkingGraphVersionStore((s) => s.resetVersionState);
  const restoreSimulationHistory = useThinkingGraphVersionStore((s) => s.restoreSimulationHistory);
  const simulationHistory = useThinkingGraphVersionStore((s) => s.simulationHistory);
  const persistentItems = useThinkingGraphPersistenceStore((s) => s.persistentItems);
  const loadPersistentItems = useThinkingGraphPersistenceStore((s) => s.loadPersistentItems);
  const { setTeamSaveState } = useRunContext();

  // Always reflects the latest canvas edges so handleSessionPayloadChange can
  // re-inject them when a server response overwrites sessionPayload.edges.
  const revisionEdgesRef = useRef<SyntheticEdge[]>(revisionEdges);
  revisionEdgesRef.current = revisionEdges;

  useLayoutEffect(() => {
    resetUiState();
    clearPendingInputs();
    resetVersionState();

    // Restore run history from the saved payload so the history panel
    // survives page reloads and project switches.
    const savedHistory = initialSessionPayload?.runHistory;
    if (savedHistory && savedHistory.length > 0) {
      restoreSimulationHistory(savedHistory.map(deserializeSimulationRun));
    }

    setSessionPayload(initialSessionPayload);
    setSessionPayloadProjectId(initialSessionPayload ? projectId : null);
    setRevisionEdges(initialSessionPayload?.edges.map((edge) => ({ ...edge })) ?? []);
    setSelectedNodeId(null);
    setErrorMessage(null);
    setSaveState("idle");
    setTeamMutationPending(false);
    lastSavedSignatureRef.current = initialSessionPayload
      ? JSON.stringify(initialSessionPayload)
      : null;
    // Re-hydrate staged decisions and clarifications from persisted preparedInputs
    // so the report shows previously chosen options/answers after a page reload.
    rehydrateStagingBuffer(initialSessionPayload?.preparedInputs.decisions ?? []);
    setPendingStructuredClarifications(
      initialSessionPayload?.preparedInputs.clarifications ?? [],
    );
    loadPersistentItems(initialSessionPayload?.persistentItems ?? []);
    setReadyProjectKey(projectKey);
    if (process.env.NODE_ENV !== "production") {
      console.log("[team-save][client][hydrate-initial]", {
        projectId,
        sessionId: initialSessionPayload?.sessionId ?? null,
        syntheticIds:
          initialSessionPayload?.synthetics.map((synthetic) => synthetic.id) ?? [],
      });
    }
  }, [projectId, projectKey, initialSessionPayload, resetUiState, clearPendingInputs, resetVersionState, restoreSimulationHistory, setPendingStructuredClarifications, loadPersistentItems]);

  useEffect(() => {
    if (initialSessionPayload) {
      return;
    }

    // Don't create a session until the user has entered an idea.
    // ThinkingGraph creates it lazily on first idea submit.
    if (!initialIdeaPrompt) return;

    let isMounted = true;

    async function loadSession() {
      try {
        const payload = await fetchThinkingGraphSession({
          ideaPrompt: initialIdeaPrompt || undefined,
        });

        if (!isMounted) {
          return;
        }

        setSessionPayload(payload);
        setSessionPayloadProjectId(projectId);
        setRevisionEdges(payload.edges.map((edge) => ({ ...edge })));
        setErrorMessage(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load thinking graph session.",
        );
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [projectId, initialIdeaPrompt, initialSessionPayload]);

  // Keep a ref to the latest unsaved payload so the beforeunload handler can
  // read it without closing over a stale value.
  const pendingSaveRef = useRef<{ projectId: string; payload: SyntheticGraphPayload } | null>(null);
  const teamSaveResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTeamSaveResetTimer = useCallback(() => {
    if (teamSaveResetTimerRef.current) {
      clearTimeout(teamSaveResetTimerRef.current);
      teamSaveResetTimerRef.current = null;
    }
  }, []);

  const persistSessionPayloadNow = useCallback(
    async (payload: SyntheticGraphPayload) => {
      if (!projectId) {
        return;
      }

      const currentPersistentItems = useThinkingGraphPersistenceStore.getState().persistentItems;
      const payloadToSave =
        simulationHistory.length > 0
          ? {
              ...payload,
              runHistory: simulationHistory.map(serializeSimulationRun),
              persistentItems: currentPersistentItems,
            }
          : { ...payload, persistentItems: currentPersistentItems };

      const signature = JSON.stringify(payloadToSave);
      pendingSaveRef.current = { projectId, payload: payloadToSave };
      clearTeamSaveResetTimer();
      setSaveState("saving");
      setTeamSaveState("saving");
      if (process.env.NODE_ENV !== "production") {
        console.log("[team-save][client][persist-now]", {
          projectId,
          sessionId: payloadToSave.sessionId,
          syntheticIds: payloadToSave.synthetics.map((synthetic) => synthetic.id),
        });
      }

      try {
        await saveProjectThinkingGraphSession(projectId, payloadToSave);
        lastSavedSignatureRef.current = signature;
        pendingSaveRef.current = null;
        setSaveState("saved");
        setTeamMutationPending(false);
        setTeamSaveState("saved");
        teamSaveResetTimerRef.current = setTimeout(() => {
          setTeamSaveState("idle");
          teamSaveResetTimerRef.current = null;
        }, 1600);
      } catch {
        setSaveState("error");
        setTeamMutationPending(false);
        setTeamSaveState("error");
      }
    },
    [clearTeamSaveResetTimer, projectId, setTeamSaveState, simulationHistory],
  );

  useEffect(() => {
    if (!projectId || !sessionPayload || sessionPayloadProjectId !== projectId) {
      return;
    }

    const payloadToSave =
      simulationHistory.length > 0
        ? {
            ...sessionPayload,
            runHistory: simulationHistory.map(serializeSimulationRun),
            persistentItems,
          }
        : { ...sessionPayload, persistentItems };

    const signature = JSON.stringify(payloadToSave);
    if (signature === lastSavedSignatureRef.current) {
      pendingSaveRef.current = null;
      return;
    }

    // Track the unsaved state so beforeunload can flush it.
    pendingSaveRef.current = { projectId, payload: payloadToSave };

    setSaveState("saving");
    const timeoutId = window.setTimeout(async () => {
      try {
        await saveProjectThinkingGraphSession(projectId, payloadToSave);
        lastSavedSignatureRef.current = signature;
        pendingSaveRef.current = null;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [projectId, sessionPayload, sessionPayloadProjectId, simulationHistory, persistentItems]);

  // Whenever simulationHistory grows (a new run is recorded), merge it back
  // into sessionPayload so the auto-save above picks it up and persists it.
  useEffect(() => {
    if (!sessionPayload || !projectId || simulationHistory.length === 0) return;

    // Skip if payload already carries identical run IDs — avoids a redundant save
    // on the initial restore cycle (layout effect → restoreSimulationHistory → this effect).
    const payloadIds = (sessionPayload.runHistory ?? []).map((r) => r.id).join(",");
    const historyIds = simulationHistory.map((r) => r.id).join(",");
    if (payloadIds === historyIds) return;

    setSessionPayload((prev) =>
      prev
        ? {
            ...prev,
            runHistory: simulationHistory.map(serializeSimulationRun),
          }
        : prev,
    );
    setSessionPayloadProjectId(projectId);
  }, [sessionPayload, simulationHistory, projectId]);

  useEffect(() => {
    return () => {
      clearTeamSaveResetTimer();
    };
  }, [clearTeamSaveResetTimer]);

  const handleSessionPayloadChange = useCallback(
    (payload: SyntheticGraphPayload) => {
      setSessionPayload((prev) =>
        mergeIncomingSessionPayload(prev, payload, revisionEdgesRef.current),
      );
      setSessionPayloadProjectId(projectId);
    },
    [projectId],
  );

  const handleLocalSessionPayloadChange = useCallback(
    (payload: SyntheticGraphPayload) => {
      setSessionPayload((prev) =>
        applyLocalSessionPayloadChange(prev, payload, revisionEdgesRef.current),
      );
      setSessionPayloadProjectId(projectId);
    },
    [projectId],
  );

  const project = useMemo(
    () => (sessionPayload ? buildProjectFromThinkingGraphPayload(sessionPayload) : null),
    [sessionPayload],
  );
  const selectedRevision = useMemo(() => project?.iterations[0] ?? null, [project]);

  const handleRevisionEdgesChange = useCallback((nextEdges: SyntheticEdge[]) => {
    setRevisionEdges(nextEdges);
    // Merge edges back into sessionPayload so the auto-save picks them up
    // and they survive a page reload.
    setSessionPayload((prev) => (prev ? { ...prev, edges: nextEdges } : prev));
    setSessionPayloadProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    setSelectedNodeId(null);
  }, [selectedRevision?.id]);

  const pendingOperation = getPendingOperationState({
    active: teamMutationPending || saveState === "saving",
    message: "Saving changes. Please wait before reloading the page.",
  });

  const flushPendingSaveOnUnload = useCallback(() => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    const body = JSON.stringify({ payload: pending.payload });
    navigator.sendBeacon(
      `/api/projects/${pending.projectId}/session`,
      new Blob([body], { type: "application/json" }),
    );
  }, []);

  usePendingOperationGuard({
    active: pendingOperation.shouldBlockUnload,
    onBeforeUnload: flushPendingSaveOnUnload,
  });

  const saveLabel =
    saveState === "saving"
      ? "Saving"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Save failed"
          : null;

  const content = (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-4 py-2 border-b border-border bg-background/70 backdrop-blur flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {projectName ?? "Thinking Graph"}
          </p>
          {projectId ? (
            <p className="text-xs text-muted-foreground truncate">
              Project ID {projectId}
            </p>
          ) : null}
        </div>
        {saveLabel ? (
          <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {saveLabel}
          </span>
        ) : null}
      </div>
      <PendingOperationBanner
        active={pendingOperation.active}
        message={pendingOperation.message}
      />
      <TopNav />
      <div className="flex flex-1 min-h-0">
        {errorMessage ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {errorMessage}
          </div>
        ) : readyProjectKey === projectKey ? (
          <ThinkingGraph
            key={projectKey}
            projectId={projectId}
            selectedRevision={selectedRevision}
            revisionEdges={revisionEdges}
            onRevisionEdgesChange={handleRevisionEdgesChange}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            sessionPayload={sessionPayload}
            onSessionPayloadChange={handleSessionPayloadChange}
            onLocalSessionPayloadChange={handleLocalSessionPayloadChange}
            onLocalTeamMutationStart={() => {
              setTeamMutationPending(true);
              setSaveState("saving");
              setTeamSaveState("saving");
            }}
            onPersistSessionPayloadNow={persistSessionPayloadNow}
            autostart={autostart}
            autoPersonaIds={autoPersonaIds}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            Loading project...
          </div>
        )}
      </div>
    </div>
  );

  return withRunProvider ? <RunProvider>{content}</RunProvider> : content;
}
