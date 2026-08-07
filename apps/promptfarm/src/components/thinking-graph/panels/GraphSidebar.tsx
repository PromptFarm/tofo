import { useEffect, useRef, useState } from "react";
import type React from "react";
import { EDGE_TYPE_OPTIONS } from "../thinkingGraphConstants";
import { SyntheticNodePanel as ThinkingGraphSyntheticNodePanel } from "./SyntheticNodePanel";
import { IntakeInlinePanel } from "./IntakeInlinePanel";
import { DirectorNodePanel } from "./DirectorNodePanel";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type { LogEntry } from "../runtime/runtimeTypes";
import type { DirectorOutput, SyntheticGraphPayload, SyntheticIntakeAnswer } from "@/lib/thinking-graph/server/types";
import {
  selectProjectFilesEntry,
  useProjectFilesStore,
} from "../state/useProjectFilesStore";
import type {
  AppliedDecisionSelection,
  AppliedStructuredClarification,
} from "../thinkingGraphUtils";
import { formatPreparedInputSourceLabel } from "@/lib/thinking-graph/userFacingPresentation";

const IDEA_SYNTHETIC_ID = "__idea__";

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProjectFilesPanel({
  projectId,
  isRunInProgress,
  mono,
}: {
  projectId: string | null;
  isRunInProgress: boolean;
  mono: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { files, loaded, loading, error } = useProjectFilesStore((state) =>
    selectProjectFilesEntry(state, projectId),
  );
  const ensureFiles = useProjectFilesStore((state) => state.ensureFiles);
  const uploadFile = useProjectFilesStore((state) => state.uploadFile);
  const removeFile = useProjectFilesStore((state) => state.deleteFile);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void ensureFiles(projectId);
  }, [ensureFiles, projectId]);

  async function handleFileSelected(file: File | undefined) {
    if (!projectId || !file) return;

    try {
      await uploadFile(projectId, file);
    } catch {
      // Store owns the visible error state.
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handleDelete(fileId: string) {
    if (!projectId) return;

    setBusyFileId(fileId);
    try {
      await removeFile(projectId, fileId);
    } catch {
      // Store owns the visible error state.
    } finally {
      setBusyFileId(null);
    }
  }

  return (
    <div style={{ borderRadius: 7, border: "1px solid var(--surface-container)", background: "var(--surface-low)", overflow: "hidden" }}>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,text/csv,application/json"
        style={{ display: "none" }}
        onChange={(event) => {
          void handleFileSelected(event.target.files?.[0]);
        }}
      />
      <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--surface-container)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <p style={{ fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: mono, margin: 0 }}>
            Project files
          </p>
          <p style={{ fontSize: 9, color: "var(--on-surface-variant)", fontFamily: mono, margin: "3px 0 0", lineHeight: 1.4 }}>
            Included in the next run context
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!projectId || loading || isRunInProgress}
          style={{
            position: "relative",
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "1px solid var(--surface-container)",
            background: "var(--surface-high)",
            color: loading ? "var(--primary)" : "var(--on-surface-variant)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: !projectId || loading || isRunInProgress ? "not-allowed" : "pointer",
            opacity: !projectId ? 0.4 : 1,
            flexShrink: 0,
            overflow: "visible",
          }}
          title={
            projectId
              ? isRunInProgress
                ? "Files cannot be changed during a run"
                : "Attach text file"
              : "Create or open a project before attaching files"
          }
        >
          {loading && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: "2px solid rgba(167,139,250,0.18)",
                borderTopColor: "#a78bfa",
                borderRightColor: "rgba(52,211,153,0.85)",
                animation: "promptfarm-sidebar-file-spin 0.75s linear infinite",
                pointerEvents: "none",
              }}
            />
          )}
          <Paperclip size={13} />
        </button>
      </div>

      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {!projectId ? (
          <p style={{ fontSize: 10, color: "var(--t3)", fontFamily: mono, margin: 0, lineHeight: 1.5 }}>
            Open a project to attach context files.
          </p>
        ) : loading && !loaded ? (
          <p style={{ fontSize: 10, color: "var(--t3)", fontFamily: mono, margin: 0, lineHeight: 1.5 }}>
            Loading project files…
          </p>
        ) : files.length === 0 ? (
          <p style={{ fontSize: 10, color: "var(--t3)", fontFamily: mono, margin: 0, lineHeight: 1.5 }}>
            No files attached yet.
          </p>
        ) : (
          files.map((file) => (
            <div key={file.id} style={{ borderRadius: 6, border: "1px solid var(--surface-container)", background: "var(--surface-high)", padding: "7px 8px", display: "flex", alignItems: "center", gap: 8 }}>
              <Paperclip size={11} style={{ color: "var(--t3)", flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 10, color: "var(--on-surface)", fontFamily: mono, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.originalName}
                </p>
                <p style={{ fontSize: 8, color: "var(--t3)", fontFamily: mono, margin: "2px 0 0" }}>
                  {formatFileSize(file.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(file.id)}
                disabled={Boolean(busyFileId) || isRunInProgress}
                style={{
                  position: "relative",
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: "1px solid var(--surface-container)",
                  background: "var(--t3)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: busyFileId || isRunInProgress ? "not-allowed" : "pointer",
                  opacity: busyFileId && busyFileId !== file.id ? 0.35 : 1,
                  flexShrink: 0,
                }}
                title={isRunInProgress ? "Files cannot be changed during a run" : "Remove file"}
              >
                <X size={10} style={{ animation: busyFileId === file.id ? "promptfarm-sidebar-file-spin 0.8s linear infinite" : undefined }} />
              </button>
            </div>
          ))
        )}

        {error ? (
          <p style={{ fontSize: 9, color: "#f87171", fontFamily: mono, margin: 0, lineHeight: 1.45 }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface GraphSidebarProps {
  projectId: string | null;
  selectedEdgeData: SyntheticEdge | null;
  selectedNodeLabel: string;
  hasIdea: boolean;
  isIdeaNodeSelected: boolean;
  isSyntheticNodeSelected: boolean;
  selectedSyntheticNode: SyntheticNode | null;
  selectedSyntheticEdgeCount: number;
  ideaPrompt: string;
  logEntries: LogEntry[];
  logScrollRef: React.RefObject<HTMLDivElement | null>;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  runtimeByNodeId: Record<string, any>;
  syntheticProgressByNodeId: Record<string, any>;
  outputsBySyntheticId: Record<string, any>;
  chatsByNodeId: Record<string, any>;
  chatDraftByNodeId: Record<string, string>;
  chatUpdatedOpinions: Record<string, any>;
  revisionEdges: SyntheticEdge[];
  selectedEdgeId: string | null;
  onSelectNode: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  onRevisionEdgesChange: (edges: SyntheticEdge[]) => void;
  markNodesDirty: (ids: string[]) => void;
  setChatDraftByNodeId: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  handleDeleteSelectedRole: () => void;
  removeSelectedEdge: () => void;
  sessionPayload: SyntheticGraphPayload | null;
  // Run controls
  thinkingInput: string;
  setThinkingInput: (v: string) => void;
  submitIdea: () => void;
  stopThinkingRun: () => void;
  isRunInProgress: boolean;
  runStatus: string;
  runErrorMessage: string | null;
  completedAgentCount: number;
  syntheticNodeIds: string[];
  activeRunId: string | null;
  rootPrompt: string;
  draftNextIteration: () => void;
  savePromptSnapshot: () => void;
  // Intake
  intakeSessionId: string | null;
  onIntakePayloadUpdate: (payload: SyntheticGraphPayload) => void;
  // Director
  directorOutput?: DirectorOutput | null;
  directorPhase?: string;
  directorSelectedPersonaIds?: Set<string>;
  onToggleDirectorPersona?: (personaId: string) => void;
  onDirectorConfirm?: (ids: string[], answers: SyntheticIntakeAnswer[]) => void;
  onDirectorSkip?: () => void;
  // Pending decisions / clarifications
  pendingAppliedDecisions: AppliedDecisionSelection[];
  pendingStructuredClarifications: AppliedStructuredClarification[];
  removePendingAppliedDecision: (syntheticId: string) => void;
  removePendingStructuredClarification: (syntheticId: string) => void;
  updatePendingStructuredClarificationAnswer: (params: {
    syntheticId: string;
    questionId: string;
    answer: string;
  }) => void;
  // Chat
  sendChatMessage: (params: {
    sessionId: string;
    ideaPrompt?: string;
    syntheticId: string;
    userMessage: string;
  }) => Promise<SyntheticGraphPayload | null>;
  sendIdeaChatMessage: (params: {
    sessionId: string;
    ideaPrompt?: string;
    userMessage: string;
  }) => Promise<SyntheticGraphPayload | null>;
  toggleChatMessageIterationUsage: (params: {
    sessionId: string;
    syntheticId: string;
    messageId: string;
    includeInNextIteration: boolean;
  }) => Promise<SyntheticGraphPayload | null>;
  removeChatMessage: (params: {
    sessionId: string;
    syntheticId: string;
    messageId: string;
  }) => Promise<SyntheticGraphPayload | null>;
  graphNodeNames: Record<string, string>;
}

export function GraphSidebar({
  projectId,
  selectedEdgeData,
  selectedNodeLabel,
  hasIdea,
  isIdeaNodeSelected,
  isSyntheticNodeSelected,
  selectedSyntheticNode,
  selectedSyntheticEdgeCount,
  ideaPrompt,
  logEntries,
  logScrollRef,
  chatScrollRef,
  chatContainerRef,
  runtimeByNodeId,
  syntheticProgressByNodeId,
  outputsBySyntheticId,
  chatsByNodeId,
  chatDraftByNodeId,
  chatUpdatedOpinions,
  revisionEdges,
  selectedEdgeId,
  onSelectNode,
  setSelectedEdgeId,
  onRevisionEdgesChange,
  markNodesDirty,
  setChatDraftByNodeId,
  handleDeleteSelectedRole,
  removeSelectedEdge,
  sessionPayload,
  thinkingInput,
  setThinkingInput,
  submitIdea,
  stopThinkingRun,
  isRunInProgress,
  runStatus,
  runErrorMessage,
  completedAgentCount,
  syntheticNodeIds,
  activeRunId,
  rootPrompt,
  draftNextIteration,
  savePromptSnapshot,
  intakeSessionId,
  onIntakePayloadUpdate,
  directorOutput = null,
  directorPhase = "idle",
  directorSelectedPersonaIds,
  onToggleDirectorPersona,
  onDirectorConfirm,
  onDirectorSkip,
  pendingAppliedDecisions,
  pendingStructuredClarifications,
  removePendingAppliedDecision,
  removePendingStructuredClarification,
  updatePendingStructuredClarificationAnswer,
  sendChatMessage,
  sendIdeaChatMessage,
  toggleChatMessageIterationUsage,
  removeChatMessage,
  graphNodeNames,
}: GraphSidebarProps) {
  const mono = "var(--font-jetbrains-mono), monospace";
  const ideaMessages = chatsByNodeId[IDEA_SYNTHETIC_ID] ?? [];
  const ideaDraft = chatDraftByNodeId[IDEA_SYNTHETIC_ID] ?? "";

  return (
    <aside
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 30,
        height: "100%",
        width: "24rem",
        borderLeft: "1px solid var(--surface-container)",
        background: "var(--panel-bg-solid)",
        backdropFilter: "blur(16px)",
        padding: 16,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes promptfarm-sidebar-file-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <p style={{ fontSize: 8, letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: mono }}>
            {selectedEdgeData ? "Connection" : "Node"}
          </p>
          <h3 style={{ marginTop: 4, fontSize: 16, fontWeight: 600, color: "var(--on-surface)", fontFamily: "var(--font-manrope), sans-serif" }}>
            {selectedEdgeData
              ? `${graphNodeNames[selectedEdgeData.from] ?? selectedEdgeData.from} → ${graphNodeNames[selectedEdgeData.to] ?? selectedEdgeData.to}`
              : selectedNodeLabel}
          </h3>
        </div>
        <button
          type="button"
          style={{ width: 22, height: 22, borderRadius: 4, background: "var(--surface-high)", border: "1px solid var(--surface-container)", color: "var(--t3)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          onClick={() => { onSelectNode(null); setSelectedEdgeId(null); }}
        >
          ✕
        </button>
      </div>

      {selectedEdgeData ? (
        /* ─── Edge panel ─── */
        (() => {
          const isStructural =
            selectedEdgeData.from === "idea" ||
            selectedEdgeData.to === "idea" ||
            selectedEdgeData.from === "outcome" ||
            selectedEdgeData.to === "outcome" ||
            selectedEdgeData.from === "out" ||
            selectedEdgeData.to === "out";

          if (isStructural) {
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ borderRadius: 7, border: "1px solid var(--surface-container)", background: "var(--surface-low)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--t3)", flexShrink: 0 }} />
                    <p style={{ fontSize: 9, fontWeight: 600, color: "var(--t3)", fontFamily: mono, letterSpacing: "0.8px", textTransform: "uppercase" }}>Structural edge · read-only</p>
                  </div>
                  <p style={{ fontSize: 10, color: "var(--on-surface-variant)", fontFamily: mono, lineHeight: 1.6, margin: 0 }}>
                    This edge connects the <strong style={{ color: "var(--on-surface)" }}>Idea</strong> or <strong style={{ color: "var(--on-surface)" }}>Outcome</strong> node to the agent chain. It is visual scaffolding — it does not pass context during execution and its type has no effect on the simulation.
                  </p>
                  <p style={{ fontSize: 9, color: "var(--t3)", fontFamily: mono, lineHeight: 1.5, margin: 0 }}>
                    The idea prompt is always injected directly into every agent's instruction, regardless of this edge.
                  </p>
                </div>
              </div>
            );
          }

          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(() => {
            const activeOpt = EDGE_TYPE_OPTIONS.find((o) => o.type === selectedEdgeData.type);
            const fromName = graphNodeNames[selectedEdgeData.from] ?? selectedEdgeData.from;
            const toName = graphNodeNames[selectedEdgeData.to] ?? selectedEdgeData.to;
            if (!activeOpt) return null;
            return (
              <div style={{ borderRadius: 7, border: `1px solid ${activeOpt.color}30`, background: `${activeOpt.color}08`, padding: "9px 11px" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: activeOpt.color, fontFamily: mono, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>
                  {activeOpt.label}
                </p>
                <p style={{ fontSize: 10, color: "var(--on-surface)", fontFamily: mono, lineHeight: 1.5 }}>
                  <span style={{ opacity: 0.7 }}>{fromName}</span>
                  <span style={{ margin: "0 5px", opacity: 0.4 }}>→</span>
                  <span style={{ opacity: 0.7 }}>{toName}</span>
                </p>
              </div>
            );
          })()}
          <div style={{ borderRadius: 7, border: "1px solid var(--surface-container)", background: "var(--surface-low)", padding: 10 }}>
            <p style={{ fontSize: 8, letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", marginBottom: 8, fontFamily: mono }}>
              Relationship type
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {EDGE_TYPE_OPTIONS.map((opt) => {
                const isActive = selectedEdgeData.type === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      if (isActive) return;
                      const updated = revisionEdges.map((e) => e.id === selectedEdgeId ? { ...e, type: opt.type } : e);
                      onRevisionEdgesChange(updated);
                      markNodesDirty([selectedEdgeData.from, selectedEdgeData.to]);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 6, border: isActive ? `1px solid ${opt.color}55` : "1px solid transparent", background: isActive ? `${opt.color}12` : "transparent", cursor: isActive ? "default" : "pointer", textAlign: "left", transition: "all 0.12s" }}
                    onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = `${opt.color}08`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${opt.color}33`; } }}
                    onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; } }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: opt.color, flexShrink: 0, boxShadow: isActive ? `0 0 5px ${opt.color}88` : "none" }} />
                    <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--on-surface)" : "var(--on-surface-variant)", fontFamily: mono }}>{opt.label}</span>
                    {isActive && <span style={{ marginLeft: "auto", fontSize: 8, color: opt.color, fontFamily: mono }}>active</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {(() => {
            const opt = EDGE_TYPE_OPTIONS.find((o) => o.type === selectedEdgeData.type);
            if (!opt) return null;
            return (
              <div style={{ borderRadius: 7, border: `1px solid ${opt.color}30`, background: `${opt.color}08`, padding: "9px 11px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>
                  {opt.type === "tension" ? "⚡" : opt.type === "oversight" ? "✓" : opt.type === "amplification" ? "→" : "—"}
                </span>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 600, color: opt.color, fontFamily: mono, marginBottom: 3 }}>How this affects the simulation</p>
                  <p style={{ fontSize: 10, color: "var(--on-surface-variant)", fontFamily: mono, lineHeight: 1.6 }}>{opt.description}</p>
                </div>
              </div>
            );
          })()}

          <button type="button" onClick={removeSelectedEdge} style={{ height: 34, padding: "0 14px", borderRadius: 6, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger-text)", fontSize: 10, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono }}>
            Delete connection
          </button>
        </div>
          );
        })()

      ) : isIdeaNodeSelected ? (
        /* ─── Idea node panel ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Prompt — always first, compact scrollable window */}
          <div style={{ borderRadius: 7, border: "1px solid var(--surface-container)", background: "var(--surface-low)", overflow: "hidden" }}>
            <div style={{ position: "relative", padding: "10px 10px 10px 12px" }}>
              {(!hasIdea || thinkingInput) ? (
                <div style={{ position: "relative" }}>
                  <textarea
                    value={thinkingInput}
                    onChange={(e) => setThinkingInput(e.target.value)}
                    placeholder={hasIdea ? "Refine or add context to the idea…" : "Describe your idea…"}
                    rows={hasIdea ? 4 : 5}
                    style={{ width: "100%", resize: "vertical", background: "transparent", border: "none", outline: "none", fontSize: 11, color: "var(--on-surface)", fontFamily: mono, lineHeight: 1.65, paddingRight: 40, boxSizing: "border-box" }}
                    disabled={isRunInProgress}
                  />
                  <button
                    type="button"
                    onClick={isRunInProgress ? stopThinkingRun : submitIdea}
                    disabled={!isRunInProgress && !thinkingInput.trim()}
                    style={{ position: "absolute", right: 0, bottom: 0, width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: isRunInProgress ? "var(--danger-bg)" : "var(--primary-container)", border: `1px solid ${isRunInProgress ? "var(--danger-border)" : "var(--primary-border)"}`, color: isRunInProgress ? "#f87171" : "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: !isRunInProgress && !thinkingInput.trim() ? 0.35 : 1, transition: "all 0.15s" }}
                  >
                    {isRunInProgress ? <Square size={10} /> : <ArrowUp size={12} />}
                  </button>
                </div>
              ) : (
                <div style={{ maxHeight: 88, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
                  <p style={{ fontSize: 11, color: "var(--on-surface-variant)", lineHeight: 1.65, fontFamily: mono, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}>
                    {ideaPrompt}
                  </p>
                </div>
              )}
            </div>

            {/* Run status */}
            {hasIdea && (
              <div style={{ padding: "6px 12px 9px", borderTop: "1px solid var(--surface-container)" }}>
                <span style={{ fontSize: 9, color: runStatus === "running" ? "#a78bfa" : runStatus === "error" ? "#f87171" : runStatus === "done" ? "#34d399" : "var(--t3)", fontFamily: mono }}>
                  {runStatus === "running"
                    ? completedAgentCount >= syntheticNodeIds.length
                      ? "Synthesizing cross-agent insights…"
                      : `${completedAgentCount} / ${syntheticNodeIds.length} agents running…`
                    : runStatus === "error"
                      ? (runErrorMessage ?? "Run failed")
                      : runStatus === "done"
                        ? "Run complete — see results in the top bar."
                        : directorPhase === "running"
                          ? "Analyzing idea, selecting team…"
                          : directorPhase === "awaiting_confirmation" || directorPhase === "confirming"
                            ? "Review the suggested team below."
                            : syntheticNodeIds.length === 0
                              ? "Add roles to get started."
                              : `${syntheticNodeIds.length} role${syntheticNodeIds.length !== 1 ? "s" : ""} ready`}
                </span>
              </div>
            )}
          </div>

          <ProjectFilesPanel
            projectId={projectId}
            isRunInProgress={isRunInProgress}
            mono={mono}
          />

          {/* Director panel — shown while Director is analyzing or awaiting confirmation */}
          {(directorPhase === "running" || directorPhase === "awaiting_confirmation" || directorPhase === "confirming") && (
            <DirectorNodePanel
              directorOutput={directorOutput}
              isLoading={directorPhase === "running"}
              isConfirming={directorPhase === "confirming"}
              selectedIds={directorSelectedPersonaIds ?? new Set()}
              onTogglePersona={onToggleDirectorPersona ?? (() => {})}
              onConfirm={onDirectorConfirm ?? (() => {})}
              onSkip={onDirectorSkip ?? (() => {})}
            />
          )}

          {/* Intake questions fallback — only when Director has never started.
              Once the Director flow runs (even if skipped), it covers context
              questions via groundedQuestions, so the old intake panel is suppressed. */}
          {(directorPhase === "idle" || directorPhase === "confirmed" || directorPhase === "skipped") && intakeSessionId && ideaPrompt && (
            <IntakeInlinePanel
              sessionId={intakeSessionId}
              ideaPrompt={ideaPrompt}
              onPayloadUpdate={onIntakePayloadUpdate}
              preloadedQuestions={(() => {
                const answeredIds = new Set((sessionPayload?.intakeAnswers ?? []).map((a) => a.questionId));
                return (sessionPayload?.intakeQuestions ?? []).filter((q) => !answeredIds.has(q.id));
              })()}
            />
          )}

          {/* Pending decisions / clarifications */}
          {(pendingAppliedDecisions.length > 0 || pendingStructuredClarifications.length > 0) && (
            <div style={{ borderRadius: 8, border: "1px solid var(--surface-container)", background: "var(--surface-low)", overflow: "hidden" }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--surface-container)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "var(--t3)", fontFamily: mono }}>Saved For Next Run</p>
                <span style={{ fontSize: 8, color: "var(--t3)", fontFamily: mono }}>check before rerun</span>
              </div>
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingAppliedDecisions.map((decision) => (
                  <div key={`decision-${decision.syntheticId}-${decision.optionId}`} style={{ borderRadius: 6, border: "1px solid rgba(167,139,250,0.25)", background: "rgba(167,139,250,0.06)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontSize: 10, color: "var(--on-surface)", fontFamily: mono }}>Choice for {decision.syntheticId}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 999, border: "1px solid rgba(167,139,250,0.28)", background: "rgba(167,139,250,0.1)", color: "var(--primary)", fontFamily: mono }}>{formatPreparedInputSourceLabel(decision.source)}</span>
                        <button type="button" onClick={() => removePendingAppliedDecision(decision.syntheticId)} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontFamily: mono, cursor: "pointer" }}>remove</button>
                      </div>
                    </div>
                    <p style={{ fontSize: 10, color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: mono }}>{decision.decisionTitle}: {decision.optionLabel}</p>
                    {decision.relatedNodeName && (
                      <span style={{ fontSize: 8, color: "var(--t3)", fontFamily: mono, letterSpacing: "0.03em" }}>
                        resolves relation with {decision.relatedNodeName}
                      </span>
                    )}
                  </div>
                ))}
                {pendingStructuredClarifications.map((item) => (
                  <div key={`clarification-${item.syntheticId}`} style={{ borderRadius: 6, border: "1px solid rgba(251,146,60,0.25)", background: "rgba(251,146,60,0.06)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontSize: 10, color: "var(--on-surface)", fontFamily: mono }}>Clarifications for {item.syntheticName}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 999, border: "1px solid rgba(251,146,60,0.28)", background: "rgba(251,146,60,0.1)", color: "#fb923c", fontFamily: mono }}>{formatPreparedInputSourceLabel(item.source)}</span>
                        <button type="button" onClick={() => removePendingStructuredClarification(item.syntheticId)} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontFamily: mono, cursor: "pointer" }}>remove</button>
                      </div>
                    </div>
                    {item.answers.map((answer) => (
                      <label key={`${item.syntheticId}-${answer.questionId}`} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={{ fontSize: 9, color: "var(--on-surface-variant)", fontFamily: mono, lineHeight: 1.45 }}>{answer.questionLabel}</span>
                        <textarea rows={2} value={answer.answer} onChange={(e) => updatePendingStructuredClarificationAnswer({ syntheticId: item.syntheticId, questionId: answer.questionId, answer: e.target.value })} style={{ borderRadius: 6, border: "1px solid var(--surface-container)", background: "var(--surface-high)", color: "var(--on-surface)", padding: "8px 10px", fontSize: 10, fontFamily: mono, resize: "vertical" }} />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context provided — shown after team confirmation when user answered grounded questions */}
          {(directorPhase === "confirmed" || directorPhase === "skipped") &&
            sessionPayload &&
            sessionPayload.intakeAnswers.length > 0 && (() => {
              const answerById = new Map(
                sessionPayload.intakeAnswers.map((a) => [a.questionId, a.answer]),
              );
              const answered = (sessionPayload.intakeQuestions ?? []).filter(
                (q) => answerById.has(q.id),
              );
              if (answered.length === 0) return null;
              return (
                <div style={{ borderRadius: 7, border: "1px solid rgba(52,211,153,0.2)", background: "rgba(52,211,153,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "7px 10px", borderBottom: "1px solid rgba(52,211,153,0.15)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                    <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "#34d399", fontFamily: mono, margin: 0 }}>
                      Run context · {answered.length} answer{answered.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {answered.map((q) => (
                      <div key={q.id}>
                        <p style={{ fontSize: 9, color: "var(--t3)", fontFamily: mono, margin: "0 0 2px", lineHeight: 1.4 }}>{q.question}</p>
                        <p style={{ fontSize: 10, color: "var(--on-surface)", fontFamily: mono, margin: 0, lineHeight: 1.5 }}>{answerById.get(q.id)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}



        </div>

      ) : isSyntheticNodeSelected && selectedSyntheticNode ? (
        /* ─── Synthetic node panel ─── */
        <ThinkingGraphSyntheticNodePanel
          node={selectedSyntheticNode}
          edgeCount={selectedSyntheticEdgeCount}
          nodeRunStatus={runtimeByNodeId[selectedSyntheticNode.id]}
          chatUpdatedOpinion={chatUpdatedOpinions[selectedSyntheticNode.id]}
          nodeProgress={syntheticProgressByNodeId[selectedSyntheticNode.id]}
          latestOutput={outputsBySyntheticId[selectedSyntheticNode.id]}
          onDelete={handleDeleteSelectedRole}
          messages={chatsByNodeId[selectedSyntheticNode.id] ?? []}
          draft={chatDraftByNodeId[selectedSyntheticNode.id] ?? ""}
          onDraftChange={(v) => setChatDraftByNodeId((prev) => ({ ...prev, [selectedSyntheticNode.id]: v }))}
          onSend={async () => {
            const nodeId = selectedSyntheticNode.id;
            const text = (chatDraftByNodeId[nodeId] ?? "").trim();
            if (!text || !sessionPayload) return;
            await sendChatMessage({ sessionId: sessionPayload.sessionId, ideaPrompt, syntheticId: nodeId, userMessage: text });
          }}
          onToggleMessageInIteration={async (messageId, includeInNextIteration) => {
            if (!sessionPayload) return;
            await toggleChatMessageIterationUsage({ sessionId: sessionPayload.sessionId, syntheticId: selectedSyntheticNode.id, messageId, includeInNextIteration });
          }}
          onDeleteMessage={async (messageId) => {
            if (!sessionPayload) return;
            await removeChatMessage({ sessionId: sessionPayload.sessionId, syntheticId: selectedSyntheticNode.id, messageId });
          }}
          scrollRef={chatScrollRef}
          chatContainerRef={chatContainerRef}
          revisionEdges={revisionEdges}
          graphNodeNames={graphNodeNames}
        />
      ) : (
        <p style={{ fontSize: 10, color: "var(--t3)", fontFamily: mono, lineHeight: 1.6, textAlign: "center", marginTop: "auto", marginBottom: "auto" }}>
          Select a node or edge<br />to see its details.
        </p>
      )}
    </aside>
  );
}
