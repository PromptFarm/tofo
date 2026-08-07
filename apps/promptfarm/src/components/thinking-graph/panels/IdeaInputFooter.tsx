import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatPreparedInputSourceLabel } from "@/lib/thinking-graph/userFacingPresentation";
import {
  selectProjectFilesEntry,
  useProjectFilesStore,
} from "../state/useProjectFilesStore";

const TYPEWRITER_PHRASES = [
  "A SaaS tool that helps remote teams run async standups…",
  "A fitness app that adapts training plans to your recovery data…",
  "An online course platform focused on creative professionals…",
  "A marketplace connecting local freelancers with small businesses…",
  "A subscription box for curated indie books and zines…",
  "A community platform for independent restaurant owners…",
  "An AI-powered personal finance coach for young adults…",
  "A B2B analytics dashboard for subscription revenue metrics…",
  "A mental wellness app built around daily micro-habits…",
  "A talent discovery platform for emerging musicians…",
  "A no-code tool for building internal business workflows…",
  "A peer-learning network for mid-career professionals…",
];

function useTypewriterPlaceholder(phrases: string[], enabled: boolean): string {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const current = phrases[phraseIdx % phrases.length];

    if (!deleting) {
      if (charIdx < current.length) {
        const t = setTimeout(() => {
          setDisplayed(current.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        }, 48);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setDeleting(true), 1800);
      return () => clearTimeout(t);
    } else {
      if (charIdx > 0) {
        const t = setTimeout(() => {
          setDisplayed(current.slice(0, charIdx - 1));
          setCharIdx((c) => c - 1);
        }, 28);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => {
        setPhraseIdx((i) => i + 1);
        setDeleting(false);
      }, 380);
      return () => clearTimeout(t);
    }
  }, [enabled, phrases, phraseIdx, charIdx, deleting]);

  return displayed;
}
import type {
  AppliedDecisionSelection,
  AppliedStructuredClarification,
} from "../thinkingGraphUtils";
import type {
  SyntheticIntakeQuestion,
  SyntheticIntakeAnswer,
} from "@/lib/thinking-graph/server/types";

export interface IdeaInputFooterProps {
  hasIdea: boolean;
  projectId: string | null;
  ideaPrompt: string;
  thinkingInput: string;
  setThinkingInput: (v: string) => void;
  isRunInProgress: boolean;
  runStatus: string;
  runErrorMessage: string | null;
  previousExpanded: boolean;
  setPreviousExpanded: (v: boolean) => void;
  activeRunId: string | null;
  rootPrompt: string;
  completedAgentCount: number;
  syntheticNodeIds: string[];
  simulationHistoryLength: number;
  outputsBySyntheticId: Record<string, any>;
  pendingAppliedDecisions: AppliedDecisionSelection[];
  pendingStructuredClarifications: AppliedStructuredClarification[];
  draftNextIteration: () => void;
  savePromptSnapshot: () => void;
  submitIdea: () => void;
  stopThinkingRun: () => void;
  removePendingAppliedDecision: (syntheticId: string) => void;
  removePendingStructuredClarification: (syntheticId: string) => void;
  updatePendingStructuredClarificationAnswer: (params: {
    syntheticId: string;
    questionId: string;
    answer: string;
  }) => void;
  intakeQuestions?: SyntheticIntakeQuestion[];
  intakeAnswers?: SyntheticIntakeAnswer[];
}

export function IdeaInputFooter({
  hasIdea,
  projectId,
  ideaPrompt,
  thinkingInput,
  setThinkingInput,
  isRunInProgress,
  runStatus,
  runErrorMessage,
  previousExpanded,
  setPreviousExpanded,
  activeRunId,
  rootPrompt,
  completedAgentCount,
  syntheticNodeIds,
  simulationHistoryLength,
  outputsBySyntheticId,
  pendingAppliedDecisions,
  pendingStructuredClarifications,
  draftNextIteration,
  savePromptSnapshot,
  submitIdea,
  stopThinkingRun,
  removePendingAppliedDecision,
  removePendingStructuredClarification,
  updatePendingStructuredClarificationAnswer,
  intakeQuestions = [],
  intakeAnswers = [],
}: IdeaInputFooterProps) {
  const animatedPlaceholder = useTypewriterPlaceholder(
    TYPEWRITER_PHRASES,
    !hasIdea && !thinkingInput,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { files: attachedFiles, error: fileError } = useProjectFilesStore((state) =>
    selectProjectFilesEntry(state, projectId),
  );
  const ensureFiles = useProjectFilesStore((state) => state.ensureFiles);
  const uploadFile = useProjectFilesStore((state) => state.uploadFile);
  const removeFile = useProjectFilesStore((state) => state.deleteFile);
  const [fileBusy, setFileBusy] = useState(false);
  const answerByQuestionId = new Map(
    intakeAnswers.map((a) => [a.questionId, a.answer]),
  );
  const answeredIntake = intakeQuestions.filter((q) =>
    answerByQuestionId.has(q.id),
  );

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void ensureFiles(projectId);
  }, [ensureFiles, projectId]);

  async function handleFileSelected(file: File | undefined) {
    if (!projectId || !file) return;

    setFileBusy(true);
    try {
      await uploadFile(projectId, file);
    } catch {
      // Store owns the visible error state.
    } finally {
      setFileBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!projectId) return;

    setFileBusy(true);
    try {
      await removeFile(projectId, fileId);
    } catch {
      // Store owns the visible error state.
    } finally {
      setFileBusy(false);
    }
  }

  function formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  const fileButtonBusy = fileBusy && !isRunInProgress;
  return (
    <>
      <style>{`
        @keyframes promptfarm-file-ring-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          width: "min(52rem, calc(100% - 2.5rem))",
          borderRadius: 12,
          border: "1px solid var(--surface-container)",
          background: "var(--panel-bg)",
          backdropFilter: "blur(12px)",
          overflow: "hidden",
        }}
      >
        {/* Previous context reference — shown once an idea has been submitted */}
        {hasIdea && ideaPrompt && (
          <div
            style={{
              borderBottom: "1px solid var(--surface-container)",
              background: "var(--surface-low)",
            }}
          >
            {/* header row */}
            <div
              style={{
                padding: "7px 14px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: "0.8px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  flexShrink: 0,
                }}
              >
                Current context
              </span>
              {simulationHistoryLength === 0 &&
                Object.values(outputsBySyntheticId).some((value) =>
                  Boolean(value),
                ) && (
                  <span
                    style={{
                      fontSize: 7,
                      color: "#fbbf24",
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      border: "1px solid rgba(251,191,36,0.35)",
                      background: "rgba(251,191,36,0.08)",
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}
                    title="Local run history is empty while outputs exist. Iteration context may be out of sync."
                  >
                    history out of sync
                  </span>
                )}
              {pendingAppliedDecisions.length > 0 && (
                <span
                  style={{
                    fontSize: 7,
                    color: "#f59e0b",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    border: "1px solid rgba(245,158,11,0.35)",
                    background: "rgba(245,158,11,0.08)",
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                  title="A decision was selected but not executed yet. Start a new run to apply it."
                >
                  choice saved, rerun needed
                </span>
              )}
              {pendingStructuredClarifications.length > 0 && (
                <span
                  style={{
                    fontSize: 7,
                    color: "#fb923c",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    border: "1px solid rgba(251,146,60,0.35)",
                    background: "rgba(251,146,60,0.08)",
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                  title="Structured clarification answers were prepared. Start a new run to apply them."
                >
                  answers saved, rerun needed
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {/* Edit button — loads previous text into the input for redacting */}
                <button
                  type="button"
                  onClick={() => {
                    setThinkingInput(ideaPrompt);
                    setPreviousExpanded(false);
                  }}
                  disabled={isRunInProgress}
                  title="Load into editor to revise"
                  style={{
                    fontSize: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--surface-container)",
                    background: "transparent",
                    color: "var(--on-surface-variant)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    cursor: isRunInProgress ? "default" : "pointer",
                    opacity: isRunInProgress ? 0.4 : 1,
                  }}
                >
                  Edit idea ✎
                </button>
                <button
                  type="button"
                  onClick={draftNextIteration}
                  disabled={isRunInProgress || !activeRunId || !rootPrompt}
                  title="Build the next iteration from the original prompt plus agent recommendations"
                  style={{
                    fontSize: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid rgba(167,139,250,0.35)",
                    background: "rgba(167,139,250,0.08)",
                    color: "var(--primary)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    cursor:
                      isRunInProgress || !activeRunId || !rootPrompt
                        ? "default"
                        : "pointer",
                    opacity:
                      isRunInProgress || !activeRunId || !rootPrompt ? 0.4 : 1,
                  }}
                >
                  {"Next iteration ->"}
                </button>
                <button
                  type="button"
                  onClick={savePromptSnapshot}
                  title="Download prompt/debug snapshot JSON"
                  style={{
                    fontSize: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid rgba(96,165,250,0.35)",
                    background: "rgba(96,165,250,0.08)",
                    color: "#60a5fa",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    cursor: "pointer",
                  }}
                >
                  Save Snapshot
                </button>
                {/* Expand / collapse button */}
                <button
                  type="button"
                  onClick={() => setPreviousExpanded(!previousExpanded)}
                  title={previousExpanded ? "Collapse" : "Expand"}
                  style={{
                    fontSize: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--surface-container)",
                    background: previousExpanded
                      ? "var(--surface-container)"
                      : "transparent",
                    color: "var(--on-surface-variant)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    cursor: "pointer",
                  }}
                >
                  {previousExpanded ? "↑ Collapse" : "↕ Expand"}
                </button>
              </div>
            </div>

            {/* text body */}
            <div
              style={{
                padding: "6px 14px 9px",
                maxHeight: previousExpanded ? 200 : 52,
                overflowY: previousExpanded ? "auto" : "hidden",
                transition: "max-height 0.2s ease",
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  color: "var(--on-surface-variant)",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  lineHeight: 1.6,
                  opacity: 0.8,
                  ...(previousExpanded
                    ? {}
                    : {
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }),
                }}
              >
                {ideaPrompt}
              </p>

              {/* Intake answers */}
              {previousExpanded && answeredIntake.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    borderTop: "1px solid var(--surface-container)",
                    paddingTop: 8,
                  }}
                >
                  <p
                    style={{
                      fontSize: 7,
                      letterSpacing: "0.8px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      marginBottom: 4,
                    }}
                  >
                    Addons ({answeredIntake.length})
                  </p>
                  {answeredIntake.map((q) => (
                    <div key={q.id}>
                      <p
                        style={{
                          fontSize: 9,
                          color: "var(--t3)",
                          fontFamily: "var(--font-jetbrains-mono), monospace",
                          lineHeight: 1.5,
                          marginBottom: 1,
                        }}
                      >
                        {q.question}
                      </p>
                      <p
                        style={{
                          fontSize: 9,
                          color: "var(--on-surface-variant)",
                          fontFamily: "var(--font-jetbrains-mono), monospace",
                          lineHeight: 1.5,
                          paddingLeft: 8,
                          borderLeft: "2px solid rgba(167,139,250,0.3)",
                        }}
                      >
                        {answerByQuestionId.get(q.id)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input area */}
        <div style={{ padding: "12px 14px" }}>
          {(pendingAppliedDecisions.length > 0 ||
            pendingStructuredClarifications.length > 0) && (
            <div
              style={{
                marginBottom: 10,
                borderRadius: 8,
                border: "1px solid var(--surface-container)",
                background: "var(--surface-low)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--surface-container)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <p
                  style={{
                    fontSize: 9,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    color: "var(--t3)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  Saved For Next Run
                </p>
                <span
                  style={{
                    fontSize: 8,
                    color: "var(--t3)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  check before rerun
                </span>
              </div>
              <div
                style={{
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {pendingAppliedDecisions.map((decision) => (
                  <div
                    key={`decision-${decision.syntheticId}-${decision.optionId}`}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(167,139,250,0.25)",
                      background: "rgba(167,139,250,0.06)",
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--on-surface)",
                          fontFamily: "var(--font-jetbrains-mono), monospace",
                        }}
                      >
                        Choice for {decision.syntheticId}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid rgba(167,139,250,0.28)",
                            background: "rgba(167,139,250,0.1)",
                            color: "var(--primary)",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                          }}
                        >
                          {formatPreparedInputSourceLabel(decision.source)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            removePendingAppliedDecision(decision.syntheticId)
                          }
                          style={{
                            fontSize: 8,
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "1px solid rgba(248,113,113,0.3)",
                            background: "rgba(248,113,113,0.08)",
                            color: "#f87171",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            cursor: "pointer",
                          }}
                        >
                          remove
                        </button>
                      </div>
                    </div>
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--on-surface-variant)",
                        lineHeight: 1.5,
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                      }}
                    >
                      {decision.decisionTitle}: {decision.optionLabel}
                    </p>
                    {decision.relatedNodeName && (
                      <span style={{ fontSize: 8, color: "var(--t3)", fontFamily: "var(--font-jetbrains-mono), monospace", letterSpacing: "0.03em" }}>
                        resolves relation with {decision.relatedNodeName}
                      </span>
                    )}
                  </div>
                ))}

                {pendingStructuredClarifications.map((item) => (
                  <div
                    key={`clarification-${item.syntheticId}`}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(251,146,60,0.25)",
                      background: "rgba(251,146,60,0.06)",
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--on-surface)",
                          fontFamily: "var(--font-jetbrains-mono), monospace",
                        }}
                      >
                        Clarifications for {item.syntheticName}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid rgba(251,146,60,0.28)",
                            background: "rgba(251,146,60,0.1)",
                            color: "#fb923c",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                          }}
                        >
                          {formatPreparedInputSourceLabel(item.source)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            removePendingStructuredClarification(
                              item.syntheticId,
                            )
                          }
                          style={{
                            fontSize: 8,
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "1px solid rgba(248,113,113,0.3)",
                            background: "rgba(248,113,113,0.08)",
                            color: "#f87171",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            cursor: "pointer",
                          }}
                        >
                          remove
                        </button>
                      </div>
                    </div>
                    {item.answers.map((answer) => (
                      <label
                        key={`${item.syntheticId}-${answer.questionId}`}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--on-surface-variant)",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            lineHeight: 1.45,
                          }}
                        >
                          {answer.questionLabel}
                        </span>
                        <textarea
                          rows={2}
                          value={answer.answer}
                          onChange={(event) =>
                            updatePendingStructuredClarificationAnswer({
                              syntheticId: item.syntheticId,
                              questionId: answer.questionId,
                              answer: event.target.value,
                            })
                          }
                          style={{
                            borderRadius: 6,
                            border: "1px solid var(--surface-container)",
                            background: "var(--surface-high)",
                            color: "var(--on-surface)",
                            padding: "8px 10px",
                            fontSize: 10,
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            resize: "vertical",
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(attachedFiles.length > 0 || fileError) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: "0 2px 8px",
              }}
            >
              {attachedFiles.map((file) => (
                <span
                  key={file.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    maxWidth: "100%",
                    borderRadius: 6,
                    border: "1px solid var(--surface-container)",
                    background: "var(--surface-low)",
                    color: "var(--on-surface-variant)",
                    padding: "4px 7px",
                    fontSize: 9,
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  <Paperclip size={11} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 220,
                    }}
                  >
                    {file.originalName}
                  </span>
                  <span style={{ color: "var(--t3)" }}>
                    {formatFileSize(file.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDeleteFile(file.id)}
                    disabled={fileBusy || isRunInProgress}
                    aria-label={`Remove ${file.originalName}`}
                    style={{
                      position: "relative",
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: "1px solid var(--surface-container)",
                      background: "transparent",
                      color: "var(--t3)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: fileBusy || isRunInProgress ? "not-allowed" : "pointer",
                    }}
                  >
                    <X
                      size={10}
                      style={{
                        animation: fileBusy
                          ? "promptfarm-file-ring-spin 0.8s linear infinite"
                          : undefined,
                      }}
                    />
                  </button>
                </span>
              ))}
              {fileError && (
                <span
                  style={{
                    color: "#f87171",
                    fontSize: 9,
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                  }}
                >
                  {fileError}
                </span>
              )}
            </div>
          )}
          <div style={{ position: "relative" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,text/csv,application/json"
              style={{ display: "none" }}
              onChange={(event) => {
                void handleFileSelected(event.currentTarget.files?.[0]);
              }}
            />
            <textarea
              value={thinkingInput}
              onChange={(event) => setThinkingInput(event.target.value)}
              placeholder={
                hasIdea
                  ? "Refine or add context to the idea…"
                  : animatedPlaceholder
              }
              style={{
                width: "100%",
                height: 72,
                resize: "none",
                background: "transparent",
                paddingRight: 94,
                fontSize: 11,
                color: "var(--on-surface)",
                outline: "none",
                border: "none",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                lineHeight: 1.65,
              }}
              disabled={isRunInProgress}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!projectId || fileBusy || isRunInProgress}
              style={{
                position: "absolute",
                right: 42,
                bottom: 0,
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--surface-low)",
                border: "1px solid var(--surface-container)",
                color: fileBusy ? "var(--t3)" : "var(--on-surface-variant)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: !projectId || fileBusy || isRunInProgress ? "not-allowed" : "pointer",
                opacity: !projectId ? 0.35 : 1,
                transition: "all 0.15s",
              }}
              aria-label={
                projectId
                  ? "Attach text file to project"
                  : "Create or open a project before attaching files"
              }
            >
              {fileButtonBusy && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: -4,
                    borderRadius: "50%",
                    border: "2px solid rgba(167,139,250,0.18)",
                    borderTopColor: "#a78bfa",
                    borderRightColor: "rgba(52,211,153,0.85)",
                    animation: "promptfarm-file-ring-spin 0.75s linear infinite",
                  }}
                />
              )}
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              onClick={isRunInProgress ? stopThinkingRun : submitIdea}
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: isRunInProgress
                  ? "var(--danger-bg)"
                  : pendingAppliedDecisions.length > 0
                    ? "rgba(52,211,153,0.15)"
                    : "var(--primary-container)",
                border: `1px solid ${
                  isRunInProgress
                    ? "var(--danger-border)"
                    : pendingAppliedDecisions.length > 0
                      ? "rgba(52,211,153,0.5)"
                      : "var(--primary-border)"
                }`,
                color: isRunInProgress
                  ? "#f87171"
                  : pendingAppliedDecisions.length > 0
                    ? "#34d399"
                    : "#a78bfa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity:
                  !isRunInProgress && thinkingInput.trim().length === 0
                    ? 0.35
                    : 1,
                transition: "all 0.15s",
              }}
              disabled={!isRunInProgress && thinkingInput.trim().length === 0}
              aria-label={isRunInProgress ? "Stop thinking run" : "Submit idea"}
            >
              {isRunInProgress ? <Square size={12} /> : <ArrowUp size={14} />}
            </button>
          </div>
          <p
            style={{
              marginTop: 6,
              fontSize: 9,
              color: "var(--t3)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
            }}
          >
            {!hasIdea
              ? null
              : runStatus === "running"
                ? `${completedAgentCount} / ${syntheticNodeIds.length} agents running…`
                : runStatus === "error"
                  ? runErrorMessage
                  : syntheticNodeIds.length === 0
                    ? "Add roles from the left panel — drag them onto the canvas or click +"
                    : runStatus === "done"
                      ? "Run complete — see results in the top bar."
                      : `${syntheticNodeIds.length} role${syntheticNodeIds.length !== 1 ? "s" : ""} on canvas · click Run Simulation to begin`}
          </p>
        </div>
      </div>
    </>
  );
}
