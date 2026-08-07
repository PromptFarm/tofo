"use client";

import React from "react";
import type { SimulationRun } from "../runtime/runtimeTypes";
import type { SyntheticRoleTemplate } from "../thinkingGraphConstants";
import {
  summarizePreparedInputSources,
} from "../thinkingGraphUtils";
import {
  formatPreparedClarificationTooltip,
  formatPreparedInputSourceLabel,
} from "@/lib/thinking-graph/userFacingPresentation";

export interface RolePaletteProps {
  isRolePanelExpanded: boolean;
  setIsRolePanelExpanded: (v: boolean) => void;
  hasIdea: boolean;
  filteredRoleTemplates: SyntheticRoleTemplate[];
  roleSearchTerm: string;
  setRoleSearchTerm: (v: string) => void;
  hoveredRoleId: string | null;
  setHoveredRoleId: (v: string | null) => void;
  handleAddRole: (templateId: string) => void;
  simulationHistory: SimulationRun[];
  activeRunId: string | null;
  switchToRun: (run: SimulationRun) => void;
  openHistoryView: (run: SimulationRun, mode: "report" | "plan") => void;
  planGeneratedRunIds: Set<string>;
}

export function RolePalette({
  isRolePanelExpanded,
  setIsRolePanelExpanded,
  hasIdea,
  filteredRoleTemplates,
  roleSearchTerm,
  setRoleSearchTerm,
  hoveredRoleId,
  setHoveredRoleId,
  handleAddRole,
  simulationHistory,
  activeRunId,
  switchToRun,
  openHistoryView,
  planGeneratedRunIds,
}: RolePaletteProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => setIsRolePanelExpanded(!isRolePanelExpanded)}
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          zIndex: 21,
          width: isRolePanelExpanded ? 26 : 34,
          height: 34,
          borderRadius: 7,
          border: "1px solid var(--surface-container)",
          background: "var(--panel-bg-solid)",
          color: "var(--on-surface-variant)",
          fontSize: 12,
          fontFamily: "var(--font-jetbrains-mono), monospace",
          cursor: "pointer",
        }}
        title={isRolePanelExpanded ? "Collapse roles panel" : "Expand roles panel"}
      >
        {isRolePanelExpanded ? "\u25c2" : "\u25b8"}
      </button>

      {isRolePanelExpanded && (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            zIndex: 20,
            width: "17rem",
            maxHeight: "calc(100% - 28px)",
            overflowY: "auto",
            borderRadius: 10,
            border: "1px solid var(--surface-container)",
            background: "var(--panel-bg-solid)",
            backdropFilter: "blur(16px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ── Role Palette ── */}
          <div style={{ padding: "12px 12px 10px" }}>
            <p
              style={{
                fontSize: 8,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: "var(--t3)",
                marginBottom: 8,
                fontFamily: "var(--font-jetbrains-mono), monospace",
              }}
            >
              Role Palette
            </p>

            {/* Search — at the top for discoverability */}
            <input
              value={roleSearchTerm}
              onChange={(e) => setRoleSearchTerm(e.target.value)}
              placeholder="Search roles…"
              style={{
                marginBottom: 8,
                width: "100%",
                height: 28,
                borderRadius: 5,
                border: "1px solid var(--surface-container)",
                background: "transparent",
                padding: "0 8px",
                fontSize: 9,
                color: "var(--on-surface)",
                outline: "none",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                boxSizing: "border-box",
              }}
            />

            {filteredRoleTemplates.length === 0 && roleSearchTerm ? (
              <p
                style={{
                  fontSize: 10,
                  color: "var(--t3)",
                  padding: "6px 0",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
              >
                No roles match.
              </p>
            ) : filteredRoleTemplates.length === 0 && !roleSearchTerm ? (
              <p
                style={{
                  fontSize: 9,
                  color: "var(--t3)",
                  padding: "6px 0",
                  lineHeight: 1.6,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
              >
                All roles are on the canvas.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {filteredRoleTemplates.map((template, idx) => {
                  const dotColors = [
                    "#a78bfa",
                    "#2dd4bf",
                    "#f87171",
                    "#60a5fa",
                    "#fbbf24",
                    "#f472b6",
                    "#34d399",
                    "#fb923c",
                    "#818cf8",
                    "#38bdf8",
                    "#4ade80",
                    "#e879f9",
                    "#c084fc",
                    "#fb923c",
                    "#38bdf8",
                    "#a78bfa",
                    "#34d399",
                  ];
                  const dot = dotColors[idx % dotColors.length];
                  return (
                    <div
                      key={template.id}
                      draggable={hasIdea}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/pf-role",
                          template.id,
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        borderRadius: 6,
                        background:
                          hoveredRoleId === template.id
                            ? "var(--surface-high)"
                            : "transparent",
                        padding: "7px 8px",
                        cursor: hasIdea ? "grab" : "default",
                        userSelect: "none",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={() => setHoveredRoleId(template.id)}
                      onMouseLeave={() => setHoveredRoleId(null)}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: dot,
                          flexShrink: 0,
                          boxShadow: `0 0 5px ${dot}88`,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--on-surface)",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            lineHeight: 1.2,
                          }}
                        >
                          {template.name}
                        </p>
                        <p
                          style={{
                            fontSize: 8,
                            color: "var(--t3)",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            marginTop: 2,
                            letterSpacing: "0.3px",
                          }}
                        >
                          {template.subtitle}
                        </p>
                      </div>
                      {hoveredRoleId === template.id ? (
                        <button
                          type="button"
                          onClick={() => handleAddRole(template.id)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            flexShrink: 0,
                            border: "1px solid var(--surface-container)",
                            background: "var(--surface-high)",
                            color: "var(--on-surface-variant)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            lineHeight: 1,
                            cursor: "pointer",
                            fontFamily: "monospace",
                          }}
                          title={`Add ${template.name}`}
                        >
                          +
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: 7,
                            color: "var(--t3)",
                            fontFamily: "var(--font-jetbrains-mono), monospace",
                            opacity: 0.5,
                            flexShrink: 0,
                          }}
                        >
                          drag
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* divider */}
          <div
            style={{
              height: 1,
              background: "var(--surface-container)",
              margin: "0 12px",
            }}
          />

          {/* ── Simulation History ── */}
          <div style={{ padding: "12px 12px 14px" }}>
            <p
              style={{
                fontSize: 8,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: "var(--t3)",
                marginBottom: 10,
                fontFamily: "var(--font-jetbrains-mono), monospace",
              }}
            >
              Simulation History
            </p>
            {simulationHistory.length === 0 ? (
              <p
                style={{
                  fontSize: 9,
                  color: "var(--t3)",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  lineHeight: 1.6,
                }}
              >
                History appears here after each run.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(() => {
                  const roots = simulationHistory.filter((r) => !r.parentId);
                  const childrenOf = (id: string) =>
                    simulationHistory.filter((r) => r.parentId === id);

                  const renderRun = (run: SimulationRun, depth: number) => {
                    const isCurrent = run.id === activeRunId;
                    const children = childrenOf(run.id);
                    const timeStr = run.createdAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const promptPreview =
                      run.prompt.length > 60
                        ? `${run.prompt.slice(0, 60)}…`
                        : run.prompt;
                    const isBranch = run.versionLabel.includes(".");
                    const versionColor = isBranch ? "#fb923c" : "#a78bfa";
                    const decisionSourceSummary =
                      (run.appliedDecisions?.length ?? 0) > 0
                        ? summarizePreparedInputSources(run.appliedDecisions)
                        : null;
                    const clarificationSourceSummary =
                      (run.appliedStructuredClarifications?.length ?? 0) > 0
                        ? summarizePreparedInputSources(
                            run.appliedStructuredClarifications,
                          )
                        : null;

                    return (
                      <div key={run.id}>
                        <div
                          style={{
                            display: "flex",
                            gap: 0,
                            marginLeft: depth * 14,
                          }}
                        >
                          {/* Branch connector line */}
                          {depth > 0 && (
                            <div
                              style={{
                                width: 10,
                                flexShrink: 0,
                                position: "relative",
                                marginRight: 4,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  bottom: "50%",
                                  left: 0,
                                  width: 1,
                                  background: "var(--surface-container)",
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "50%",
                                  left: 0,
                                  width: 10,
                                  height: 1,
                                  background: "var(--surface-container)",
                                }}
                              />
                            </div>
                          )}
                          {/* Card */}
                          <div
                            onClick={() => switchToRun(run)}
                            style={{
                              flex: 1,
                              borderRadius: 6,
                              border: isCurrent
                                ? `1px solid ${versionColor}99`
                                : "1px solid var(--surface-container)",
                              borderLeft: `3px solid ${isCurrent ? versionColor : "var(--surface-container)"}`,
                              background: isCurrent
                                ? `${versionColor}18`
                                : "transparent",
                              padding: "7px 9px",
                              cursor: isCurrent ? "default" : "pointer",
                              transition:
                                "border-color 0.12s, background 0.12s",
                              boxShadow: isCurrent
                                ? `0 0 0 1px ${versionColor}22, inset 0 0 12px ${versionColor}08`
                                : "none",
                            }}
                          >
                            {/* version + active + time */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                marginBottom: 3,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: isCurrent
                                    ? versionColor
                                    : `${versionColor}20`,
                                  border: `1px solid ${versionColor}44`,
                                  color: isCurrent ? "#000" : versionColor,
                                  fontFamily:
                                    "var(--font-jetbrains-mono), monospace",
                                }}
                              >
                                {run.versionLabel}
                              </span>
                              {isCurrent && (
                                <span
                                  style={{
                                    fontSize: 7,
                                    fontWeight: 700,
                                    padding: "1px 4px",
                                    borderRadius: 3,
                                    background: `${versionColor}25`,
                                    border: `1px solid ${versionColor}55`,
                                    color: versionColor,
                                    fontFamily:
                                      "var(--font-jetbrains-mono), monospace",
                                    letterSpacing: "0.5px",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  current
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: 7,
                                  color: "var(--t3)",
                                  fontFamily:
                                    "var(--font-jetbrains-mono), monospace",
                                  marginLeft: "auto",
                                }}
                              >
                                {timeStr}
                              </span>
                            </div>
                            {/* reason */}
                            <p
                              style={{
                                fontSize: 8,
                                color: "#fbbf24",
                                fontFamily:
                                  "var(--font-jetbrains-mono), monospace",
                                marginBottom: 3,
                                lineHeight: 1.35,
                              }}
                            >
                              {"↺ "}
                              {run.reason}
                            </p>
                            {/* prompt preview */}
                            <p
                              style={{
                                fontSize: 9,
                                fontFamily:
                                  "var(--font-jetbrains-mono), monospace",
                                lineHeight: 1.45,
                                color: isCurrent
                                  ? "var(--on-surface)"
                                  : "var(--on-surface-variant)",
                                opacity: isCurrent ? 1 : 0.65,
                              }}
                            >
                              {promptPreview}
                            </p>
                            {/* footer */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                marginTop: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 7,
                                  color: "var(--t3)",
                                  fontFamily:
                                    "var(--font-jetbrains-mono), monospace",
                                }}
                              >
                                {run.synthetics.length}
                                {"a · "}
                                {run.edges.length}
                                {"e"}
                              </span>
                              {(run.appliedDecisions?.length ?? 0) > 0 && (
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: "#a78bfa",
                                    fontFamily:
                                      "var(--font-jetbrains-mono), monospace",
                                    border: "1px solid rgba(167,139,250,0.35)",
                                    background: "rgba(167,139,250,0.08)",
                                    borderRadius: 3,
                                    padding: "1px 4px",
                                  }}
                                  title={run.appliedDecisions
                                    ?.map(
                                      (decision) =>
                                        `${decision.syntheticId}: ${decision.optionLabel} [${
                                          formatPreparedInputSourceLabel(decision.source)
                                        }]`,
                                    )
                                    .join("\n")}
                                >
                                  {run.appliedDecisions.length} decision
                                  {run.appliedDecisions.length === 1 ? "" : "s"}{" "}
                                  {decisionSourceSummary === "mixed"
                                    ? "mixed inputs used"
                                    : decisionSourceSummary === "defaults"
                                      ? "defaults used"
                                      : "manual edits used"}
                                </span>
                              )}
                              {(run.appliedStructuredClarifications?.length ?? 0) >
                                0 && (
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: "#fb923c",
                                    fontFamily:
                                      "var(--font-jetbrains-mono), monospace",
                                    border: "1px solid rgba(251,146,60,0.35)",
                                    background: "rgba(251,146,60,0.08)",
                                    borderRadius: 3,
                                    padding: "1px 4px",
                                  }}
                                  title={run.appliedStructuredClarifications
                                    ?.map(
                                      (clarification) =>
                                        formatPreparedClarificationTooltip(
                                          clarification,
                                        ),
                                    )
                                    .join("\n")}
                                >
                                  {run.appliedStructuredClarifications.length}{" "}
                                  clarification
                                  {run.appliedStructuredClarifications.length === 1
                                    ? ""
                                    : "s"}{" "}
                                  {clarificationSourceSummary === "mixed"
                                    ? "mixed inputs used"
                                    : clarificationSourceSummary === "defaults"
                                      ? "defaults used"
                                      : "manual edits used"}
                                </span>
                              )}
                              <div
                                style={{
                                  marginLeft: "auto",
                                  display: "flex",
                                  gap: 3,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openHistoryView(run, "report");
                                  }}
                                  style={{
                                    fontSize: 7,
                                    padding: "1px 6px",
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    border:
                                      "1px solid var(--surface-container)",
                                    background: "transparent",
                                    color: "var(--on-surface-variant)",
                                    fontFamily:
                                      "var(--font-jetbrains-mono), monospace",
                                  }}
                                >
                                  Outcome
                                </button>
                                {planGeneratedRunIds.has(run.id) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openHistoryView(run, "plan");
                                    }}
                                    style={{
                                      fontSize: 7,
                                      padding: "1px 6px",
                                      borderRadius: 3,
                                      cursor: "pointer",
                                      border: `1px solid ${versionColor}44`,
                                      background: `${versionColor}10`,
                                      color: versionColor,
                                      fontFamily:
                                        "var(--font-jetbrains-mono), monospace",
                                    }}
                                  >
                                    Plan
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Render children recursively */}
                        {children.length > 0 && (
                          <div
                            style={{
                              marginTop: 4,
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            {children.map((child) =>
                              renderRun(child, depth + 1),
                            )}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return roots.map((r) => renderRun(r, 0));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
