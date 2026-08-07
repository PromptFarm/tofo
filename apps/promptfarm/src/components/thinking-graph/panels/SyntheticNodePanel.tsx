"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { ArrowUp } from "lucide-react";

import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import {
  isSyntheticOutputJson,
  type SyntheticComplexity,
  type SyntheticOutputJson,
  type SyntheticReport,
} from "@/lib/thinking-graph/server/types";

import type {
  ChatMessage,
  ChatUpdatedOpinion,
  SyntheticNodeProgress,
  RuntimeNodeStatus,
} from "../runtime/runtimeTypes";

function prettyJson(value: SyntheticOutputJson | null | undefined): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

function shouldRenderTypingDots(message: ChatMessage): boolean {
  return Boolean(message.pending) && message.text.trim().length === 0;
}

function asSyntheticReport(
  report: SyntheticOutputJson | null | undefined,
): SyntheticReport | null {
  if (!report || !("details" in report)) return null;
  return report;
}

function ReportSkeleton({
  mono,
}: {
  mono: string;
}) {
  const line = (width: string) => (
    <div
      style={{
        width,
        height: 8,
        borderRadius: 999,
        background: "var(--surface-container)",
        opacity: 0.7,
      }}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p
          style={{
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--t3)",
            marginBottom: 7,
            fontFamily: mono,
          }}
        >
          Report Pending
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {line("92%")}
          {line("100%")}
          {line("78%")}
        </div>
        <p
          style={{
            fontSize: 10,
            color: "var(--t3)",
            lineHeight: 1.6,
            fontFamily: mono,
            marginTop: 10,
          }}
        >
          This synthetic has not produced its first structured report yet. The
          report card will appear after the run completes.
        </p>
      </div>

      <div>
        <p
          style={{
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--t3)",
            marginBottom: 7,
            fontFamily: mono,
          }}
        >
          Upcoming Sections
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {line("48%")}
          {line("83%")}
          {line("66%")}
          {line("57%")}
        </div>
      </div>
    </div>
  );
}

function LiveRunPreview({
  mono,
  recommendation,
  risks,
}: {
  mono: string;
  recommendation: string;
  risks: { color: string; text: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <p
          style={{
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#fb923c",
            marginBottom: 7,
            fontFamily: mono,
          }}
        >
          Live Run Preview
        </p>
        <p
          style={{
            fontSize: 10,
            color: "var(--on-surface-variant)",
            lineHeight: 1.6,
            fontFamily: mono,
            margin: 0,
          }}
        >
          The agent is still running. This panel shows the latest streamed recommendation until the structured report is finalized.
        </p>
      </div>

      <div>
        <p
          style={{
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--t3)",
            marginBottom: 7,
            fontFamily: mono,
          }}
        >
          Current Recommendation
        </p>
        <div
          style={{
            borderLeft: "2px solid #fb923c",
            background: "rgba(251,146,60,0.08)",
            borderRadius: "0 6px 6px 0",
            padding: "8px 10px",
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: "var(--on-surface-variant)",
              lineHeight: 1.6,
              fontFamily: mono,
              margin: 0,
            }}
          >
            {recommendation}
          </p>
        </div>
      </div>

      <div>
        <p
          style={{
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "var(--t3)",
            marginBottom: 7,
            fontFamily: mono,
          }}
        >
          Streaming Signals
        </p>
        {risks.length === 0 ? (
          <p
            style={{
              fontSize: 10,
              color: "var(--t3)",
              lineHeight: 1.5,
              fontFamily: mono,
              margin: 0,
            }}
          >
            Waiting for the first streamed model signals.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {risks.map((risk, index) => (
              <div
                key={index}
                style={{ display: "flex", alignItems: "flex-start", gap: 7 }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: risk.color,
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--on-surface-variant)",
                    lineHeight: 1.5,
                    fontFamily: mono,
                  }}
                >
                  {risk.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function complexityToPresentation(complexity: SyntheticComplexity): {
  pct: number;
  color: string;
  label: string;
} {
  if (complexity === "high") {
    return { pct: 90, color: "#f87171", label: "high" };
  }
  if (complexity === "medium") {
    return { pct: 60, color: "#fb923c", label: "medium" };
  }
  return { pct: 30, color: "#34d399", label: "low" };
}

function getStatusPresentation(status: RuntimeNodeStatus | undefined): {
  badgeText: string;
  badgeColor: string;
  badgeRgb: string;
} {
  if (status === "conflict") {
    return { badgeText: "conflict", badgeColor: "#fbbf24", badgeRgb: "251,191,36" };
  }
  if (status === "blocked") {
    return { badgeText: "blocked", badgeColor: "#f87171", badgeRgb: "248,113,113" };
  }
  if (status === "running") {
    return { badgeText: "running", badgeColor: "#fb923c", badgeRgb: "251,146,60" };
  }
  if (status === "done") {
    return { badgeText: "done", badgeColor: "#34d399", badgeRgb: "52,211,153" };
  }
  return { badgeText: "ready", badgeColor: "#60a5fa", badgeRgb: "96,165,250" };
}

function getProgressPresentation(
  progress: SyntheticNodeProgress | undefined,
): {
  label: string;
  accent: string;
  track: string;
} {
  if (!progress) {
    return {
      label: "Waiting to start",
      accent: "#60a5fa",
      track: "rgba(96,165,250,0.18)",
    };
  }

  if (progress.phase === "error") {
    return {
      label: progress.label,
      accent: "#f87171",
      track: "rgba(248,113,113,0.18)",
    };
  }

  if (progress.phase === "done") {
    return {
      label: progress.label,
      accent: "#34d399",
      track: "rgba(52,211,153,0.18)",
    };
  }

  if (progress.phase === "queued") {
    return {
      label: progress.label,
      accent: "#60a5fa",
      track: "rgba(96,165,250,0.18)",
    };
  }

  if (progress.phase === "preparing") {
    return {
      label: progress.label,
      accent: "#fbbf24",
      track: "rgba(251,191,36,0.18)",
    };
  }

  if (progress.phase === "finalizing") {
    return {
      label: progress.label,
      accent: "#34d399",
      track: "rgba(52,211,153,0.18)",
    };
  }

  return {
    label: progress.label,
    accent: "#fb923c",
    track: "rgba(251,146,60,0.18)",
  };
}

function AgentOpinionCard({
  node,
  report,
  nodeRunStatus,
  nodeProgress,
  chatUpdatedOpinion,
  appliedContextCount,
  isReportExpanded,
  onToggleReportExpanded,
}: {
  node: SyntheticNode;
  report: SyntheticOutputJson | null;
  nodeRunStatus: RuntimeNodeStatus | undefined;
  nodeProgress?: SyntheticNodeProgress;
  chatUpdatedOpinion?: ChatUpdatedOpinion;
  appliedContextCount: number;
  isReportExpanded: boolean;
  onToggleReportExpanded: () => void;
}) {
  const mono = "var(--font-jetbrains-mono), monospace";
  const activeReport =
    report && isSyntheticOutputJson(report) ? asSyntheticReport(report) : null;
  const activeRecommendation =
    chatUpdatedOpinion?.recommendation ??
    activeReport?.recommendation ??
    "Run the synthetic to generate a recommendation.";
  const detailText =
    activeReport?.details ??
    "Run the synthetic to generate a structured report for this role.";
  const risks =
    chatUpdatedOpinion?.risks ??
    activeReport?.keyRisks.map((risk, index) => ({
      color: index === 0 ? "#f87171" : index === 1 ? "#fb923c" : "#34d399",
      text: risk,
    })) ??
    [];
  const feasibility = activeReport?.concernLevels.feasibility ?? 0;
  const riskScore = activeReport?.concernLevels.risk ?? 0;
  const complexity = complexityToPresentation(
    activeReport?.concernLevels.complexityLabel ?? "medium",
  );
  const { badgeText, badgeColor, badgeRgb } = getStatusPresentation(nodeRunStatus);
  const progressPresentation = getProgressPresentation(nodeProgress);
  const showLivePreview =
    !activeReport && nodeRunStatus === "running";
  const showSkeleton = !activeReport && !showLivePreview;

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--surface-container)",
        background: "var(--surface-high)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "10px 12px 9px",
          borderBottom: "1px solid var(--surface-container)",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          cursor: "pointer",
        }}
        onClick={onToggleReportExpanded}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(52, 211, 153, 0.15)",
            border: "1px solid rgba(52, 211, 153, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 13,
            color: "#34d399",
          }}
        >
          {"\u2699"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--on-surface)",
              lineHeight: 1.2,
              fontFamily: mono,
            }}
          >
            {node.name}
          </p>
          <p
            style={{
              fontSize: 9,
              color: "var(--t3)",
              marginTop: 3,
              fontFamily: mono,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.role}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--t3)",
              fontFamily: mono,
              width: 14,
              textAlign: "center",
            }}
          >
            {isReportExpanded ? "\u25be" : "\u25b8"}
          </span>
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 20,
              background: `rgba(${badgeRgb}, 0.12)`,
              color: badgeColor,
              fontFamily: mono,
              letterSpacing: "0.5px",
              border: `1px solid rgba(${badgeRgb}, 0.28)`,
            }}
          >
            {badgeText}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {showSkeleton ? (
          isReportExpanded ? <ReportSkeleton mono={mono} /> : null
        ) : showLivePreview ? (
          isReportExpanded ? (
            <>
              {nodeProgress ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: progressPresentation.track,
                    border: `1px solid ${progressPresentation.track}`,
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
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          color: progressPresentation.accent,
                          margin: 0,
                          fontFamily: mono,
                        }}
                      >
                        Processing
                      </p>
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--on-surface-variant)",
                          lineHeight: 1.5,
                          fontFamily: mono,
                          margin: "4px 0 0",
                        }}
                      >
                        {progressPresentation.label}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: progressPresentation.accent,
                        fontFamily: mono,
                        flexShrink: 0,
                      }}
                    >
                      {Math.max(0, Math.min(100, nodeProgress.progressPercent))}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, nodeProgress.progressPercent))}%`,
                        height: "100%",
                        background: progressPresentation.accent,
                        borderRadius: 999,
                        transition: "width 0.35s ease",
                      }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: 9,
                      color: "var(--t3)",
                      lineHeight: 1.5,
                      fontFamily: mono,
                      margin: 0,
                    }}
                  >
                    {nodeProgress.completedAgents > 0 || nodeProgress.totalAgents > 0
                      ? `${nodeProgress.completedAgents}/${nodeProgress.totalAgents} agents completed in this run`
                      : "Synthetic run is active"}
                  </p>
                </div>
              ) : null}

              <LiveRunPreview
                mono={mono}
                recommendation={activeRecommendation}
                risks={risks}
              />
            </>
          ) : null
        ) : (
          <>
            {isReportExpanded && (
              <>
                <div>
                  <p
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      marginBottom: 7,
                      fontFamily: mono,
                    }}
                  >
                    Summary
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--on-surface-variant)",
                      lineHeight: 1.6,
                      fontFamily: mono,
                      margin: 0,
                    }}
                  >
                    {activeReport?.summary ?? "Run the synthetic to generate a summary."}
                  </p>
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      marginBottom: 7,
                      fontFamily: mono,
                    }}
                  >
                    Details
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--on-surface-variant)",
                      lineHeight: 1.6,
                      fontFamily: mono,
                      margin: 0,
                    }}
                  >
                    {detailText}
                  </p>
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      marginBottom: 7,
                      fontFamily: mono,
                    }}
                  >
                    Key Risks
                  </p>
                  {risks.length === 0 ? (
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--t3)",
                        lineHeight: 1.5,
                        fontFamily: mono,
                        margin: 0,
                      }}
                    >
                      No explicit risks were returned in the latest report.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {risks.map((risk, index) => (
                        <div
                          key={index}
                          style={{ display: "flex", alignItems: "flex-start", gap: 7 }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: risk.color,
                              flexShrink: 0,
                              marginTop: 4,
                            }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--on-surface-variant)",
                              lineHeight: 1.5,
                              fontFamily: mono,
                            }}
                          >
                            {risk.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                      marginBottom: 7,
                      fontFamily: mono,
                    }}
                  >
                    Recommendation
                  </p>
                  <div
                    style={{
                      borderLeft: "2px solid #34d399",
                      background: "rgba(52,211,153,0.06)",
                      borderRadius: "0 6px 6px 0",
                      padding: "8px 10px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--on-surface-variant)",
                        lineHeight: 1.6,
                        fontFamily: mono,
                        margin: 0,
                      }}
                    >
                      {activeRecommendation}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div>
              <p
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                  marginBottom: 8,
                  fontFamily: mono,
                }}
              >
                Concern Level
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  {
                    label: "Feasibility",
                    pct: feasibility,
                    color: "#34d399",
                    valueText: `${feasibility}%`,
                  },
                  {
                    label: "Risk",
                    pct: riskScore,
                    color: "#fbbf24",
                    valueText: `${riskScore}%`,
                  },
                  {
                    label: "Complexity",
                    pct: complexity.pct,
                    color: complexity.color,
                    valueText: complexity.label,
                  },
                ].map(({ label, pct, color, valueText }) => (
                  <div
                    key={label}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        width: 64,
                        fontSize: 9,
                        color: "var(--on-surface-variant)",
                        fontFamily: mono,
                        flexShrink: 0,
                      }}
                    >
                      {label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 4,
                        background: "var(--surface-container)",
                        borderRadius: 99,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: color,
                          borderRadius: 99,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: 36,
                        fontSize: 9,
                        color,
                        fontWeight: 600,
                        fontFamily: mono,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {valueText}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid var(--surface-container)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 8,
            fontFamily: mono,
            color: appliedContextCount > 0 ? "#fb923c" : "var(--t3)",
          }}
        >
          {appliedContextCount > 0
            ? `${appliedContextCount} chat message${appliedContextCount === 1 ? "" : "s"} applied to next iteration`
            : showLivePreview
              ? "Agent is streaming. Structured report will appear after completion."
            : activeReport
              ? "Updated after run - structured report received"
              : "Waiting for first structured report"}
        </span>
      </div>
    </div>
  );
}

type SyntheticNodePanelProps = {
  node: SyntheticNode;
  edgeCount: number;
  nodeRunStatus: RuntimeNodeStatus | undefined;
  onDelete: () => void;
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onToggleMessageInIteration: (
    messageId: string,
    includeInNextIteration: boolean,
  ) => void;
  onDeleteMessage: (messageId: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  chatUpdatedOpinion?: ChatUpdatedOpinion;
  nodeProgress?: SyntheticNodeProgress;
  latestOutput?: SyntheticOutputJson | null;
  revisionEdges?: SyntheticEdge[];
  graphNodeNames?: Record<string, string>;
};

export function SyntheticNodePanel({
  node,
  edgeCount,
  nodeRunStatus,
  onDelete,
  messages,
  draft,
  onDraftChange,
  onSend,
  onToggleMessageInIteration,
  onDeleteMessage,
  scrollRef,
  chatContainerRef,
  chatUpdatedOpinion,
  nodeProgress,
  latestOutput,
  revisionEdges = [],
  graphNodeNames = {},
}: SyntheticNodePanelProps) {
  const [isReportExpanded, setIsReportExpanded] = useState(false);
  const [isRawDebugExpanded, setIsRawDebugExpanded] = useState(false);
  const appliedContextCount = messages.filter(
    (message) => message.includeInNextIteration,
  ).length;

  // Auto-expand the report card when a structured output first arrives
  const prevOutputRef = useRef<typeof latestOutput>(latestOutput);
  useEffect(() => {
    if (latestOutput && !prevOutputRef.current) {
      setIsReportExpanded(true);
    }
    prevOutputRef.current = latestOutput;
  }, [latestOutput]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* {latestOutput && (
        <div
          style={{
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
              fontSize: 9,
              color: "var(--t3)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              letterSpacing: "0.4px",
            }}
          >
            SYNTHETIC OUTPUT JSON
          </div>
          <pre
            style={{
              margin: 0,
              padding: "10px",
              fontSize: 9,
              lineHeight: 1.55,
              overflowX: "auto",
              color: "var(--on-surface-variant)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {prettyJson(latestOutput)}
          </pre>
        </div>
      )} */}

      <AgentOpinionCard
        node={node}
        report={latestOutput ?? null}
        nodeRunStatus={nodeRunStatus}
        nodeProgress={nodeProgress}
        chatUpdatedOpinion={chatUpdatedOpinion}
        appliedContextCount={appliedContextCount}
        isReportExpanded={isReportExpanded}
        onToggleReportExpanded={() => setIsReportExpanded((prev) => !prev)}
      />

      {(() => {
        const EDGE_COLORS: Record<string, string> = {
          tension: "#f87171",
          oversight: "#34d399",
          amplification: "#60a5fa",
        };
        const relationLabels = revisionEdges
          .filter((e) => (e.from === node.id || e.to === node.id) && e.type !== "structural")
          .map((e) => {
            const isSource = e.from === node.id;
            const peerId = isSource ? e.to : e.from;
            const peerName = graphNodeNames[peerId] ?? peerId;
            const label =
              e.type === "tension"
                ? `Tension with ${peerName}`
                : e.type === "oversight"
                  ? isSource ? `Oversees ${peerName}` : `Oversight from ${peerName}`
                  : e.type === "amplification"
                    ? isSource ? `Amplifies ${peerName}` : `Amplified by ${peerName}`
                    : `${e.type} — ${peerName}`;
            return { label, color: EDGE_COLORS[e.type] ?? "var(--t3)" };
          });
        if (relationLabels.length === 0) return null;
        return (
          <div style={{ borderRadius: 6, border: "1px solid var(--surface-container)", background: "var(--surface-low)", padding: "7px 9px", display: "flex", flexDirection: "column", gap: 5 }}>
            <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--t3)", fontFamily: "var(--font-jetbrains-mono), monospace", marginBottom: 1 }}>
              Graph relations
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {relationLabels.map(({ label, color }) => (
                <span
                  key={label}
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    color,
                    background: `${color}14`,
                    border: `1px solid ${color}30`,
                    borderRadius: 4,
                    padding: "2px 6px",
                    letterSpacing: "0.3px",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {latestOutput && (
        <div
          style={{
            borderRadius: 8,
            border: "1px solid var(--surface-container)",
            background: "var(--surface-low)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setIsRawDebugExpanded((prev) => !prev)}
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "none",
              borderBottom: isRawDebugExpanded
                ? "1px solid var(--surface-container)"
                : "none",
              background: "transparent",
              fontSize: 9,
              color: "var(--t3)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              letterSpacing: "0.4px",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {isRawDebugExpanded ? "\u25be" : "\u25b8"} DEBUG · RAW OUTPUT JSON
          </button>
          {isRawDebugExpanded && (
            <pre
              style={{
                margin: 0,
                padding: "10px",
                fontSize: 9,
                lineHeight: 1.55,
                overflowX: "auto",
                color: "var(--on-surface-variant)",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {prettyJson(latestOutput)}
            </pre>
          )}
        </div>
      )}

      {latestOutput?.tokenUsage && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "IN", value: latestOutput.tokenUsage.promptTokens },
            { label: "OUT", value: latestOutput.tokenUsage.completionTokens },
            { label: "TOTAL", value: latestOutput.tokenUsage.totalTokens },
          ].map(({ label, value }) =>
            value != null ? (
              <div
                key={label}
                style={{
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                  borderRadius: 5,
                  border: "1px solid var(--surface-container)",
                  background: "var(--surface-low)",
                  padding: "3px 8px",
                }}
              >
                <span style={{ fontSize: 8, fontFamily: "var(--font-jetbrains-mono), monospace", color: "var(--t3)", letterSpacing: "0.5px" }}>{label}</span>
                <span style={{ fontSize: 10, fontFamily: "var(--font-jetbrains-mono), monospace", color: "var(--on-surface-variant)", fontWeight: 600 }}>{value.toLocaleString()}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      <div
        ref={chatContainerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 7,
          border: "1px solid var(--surface-container)",
          overflow: "hidden",
          height: 260,
        }}
      >
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 10px 6px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {messages.length === 0 ? (
            <p
              style={{
                fontSize: 9,
                color: "var(--t3)",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                lineHeight: 1.6,
                margin: "auto 0",
              }}
            >
              Ask {node.name} anything about this idea. Mark useful messages to
              include them in the next iteration.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems:
                    message.role === "user" ? "flex-end" : "flex-start",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 7,
                    color: "var(--t3)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    letterSpacing: "0.5px",
                  }}
                >
                  {message.role === "user" ? "you" : node.name.toLowerCase()}
                </span>
                <div
                  style={{
                    maxWidth: "88%",
                    padding: "6px 9px",
                    borderRadius:
                      message.role === "user"
                        ? "8px 8px 2px 8px"
                        : "8px 8px 8px 2px",
                    background:
                      message.role === "user"
                        ? "var(--primary-container)"
                        : "var(--surface-low)",
                    border: `1px solid ${message.role === "user" ? "var(--primary-border)" : "var(--surface-container)"}`,
                    fontSize: 10,
                    color:
                      message.role === "user"
                        ? "var(--primary)"
                        : "var(--on-surface-variant)",
                    fontFamily: "var(--font-jetbrains-mono), monospace",
                    lineHeight: 1.55,
                  }}
                >
                  {shouldRenderTypingDots(message) ? (
                    <span
                      style={{
                        display: "flex",
                        gap: 3,
                        alignItems: "center",
                        padding: "1px 0",
                      }}
                    >
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </span>
                  ) : (
                    <span>
                      {message.text}
                      {message.pending && (
                        <span
                          style={{
                            display: "inline-block",
                            width: 6,
                            marginLeft: 2,
                            color: "var(--t3)",
                            opacity: 0.75,
                          }}
                        >
                          |
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {!message.pending && (
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() =>
                        onToggleMessageInIteration(
                          message.id,
                          !message.includeInNextIteration,
                        )
                      }
                      style={{
                        fontSize: 7,
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: `1px solid ${message.includeInNextIteration ? "rgba(251,191,36,0.4)" : "var(--surface-container)"}`,
                        background: message.includeInNextIteration
                          ? "rgba(251,191,36,0.08)"
                          : "transparent",
                        color: message.includeInNextIteration
                          ? "#fbbf24"
                          : "var(--t3)",
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        cursor: "pointer",
                      }}
                    >
                      {message.includeInNextIteration
                        ? "In next iteration"
                        : "Use in next iteration"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteMessage(message.id)}
                      style={{
                        fontSize: 7,
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--surface-container)",
                        background: "transparent",
                        color: "var(--t3)",
                        fontFamily: "var(--font-jetbrains-mono), monospace",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--surface-container)",
            padding: "8px",
            display: "flex",
            gap: 6,
            alignItems: "flex-end",
            background: "var(--surface-low)",
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={`Message ${node.name}...`}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 10,
              color: "var(--on-surface)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              lineHeight: 1.55,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!draft.trim()}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              background: draft.trim()
                ? "var(--primary-container)"
                : "transparent",
              border: `1px solid ${draft.trim() ? "var(--primary-border)" : "var(--surface-container)"}`,
              color: draft.trim() ? "var(--primary)" : "var(--t3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: draft.trim() ? "pointer" : "default",
              transition: "all 0.15s",
            }}
          >
            <ArrowUp size={12} />
          </button>
        </div>
      </div>

      {nodeRunStatus === "done" && (() => {
        const EDGE_COLORS: Record<string, string> = {
          tension: "#f87171",
          oversight: "#34d399",
          amplification: "#60a5fa",
        };
        const relationLabels = revisionEdges
          .filter(
            (e) =>
              (e.from === node.id || e.to === node.id) &&
              e.type !== "structural",
          )
          .map((e) => {
            const isSource = e.from === node.id;
            const peerId = isSource ? e.to : e.from;
            const peerName = graphNodeNames[peerId] ?? peerId;
            const label =
              e.type === "tension"
                ? `Tension with ${peerName}`
                : e.type === "oversight"
                  ? isSource
                    ? `Oversees ${peerName}`
                    : `Oversight from ${peerName}`
                  : e.type === "amplification"
                    ? isSource
                      ? `Amplifies ${peerName}`
                      : `Amplified by ${peerName}`
                    : `${e.type} — ${peerName}`;
            return { label, color: EDGE_COLORS[e.type] ?? "var(--t3)" };
          });
        if (relationLabels.length === 0) return null;
        return (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {relationLabels.map(({ label, color }) => (
              <span
                key={label}
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  color,
                  background: `${color}14`,
                  border: `1px solid ${color}30`,
                  borderRadius: 4,
                  padding: "2px 6px",
                  letterSpacing: "0.3px",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        );
      })()}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "var(--t3)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
          }}
        >
          {edgeCount} linked edge{edgeCount === 1 ? "" : "s"} |{" "}
          {nodeRunStatus ?? "ready"}
        </span>
        <button
          type="button"
          onClick={onDelete}
          style={{
            height: 30,
            padding: "0 14px",
            borderRadius: 6,
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger-text)",
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            flexShrink: 0,
            fontFamily: "var(--font-jetbrains-mono), monospace",
          }}
        >
          Delete node
        </button>
      </div>
    </div>
  );
}
