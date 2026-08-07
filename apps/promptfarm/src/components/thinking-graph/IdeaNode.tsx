"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface IdeaNodeData {
  nodeType: "idea" | "synthetic" | "outcome";
  code?: string;
  name: string;
  role?: string;
  status?:
    | "proposed"
    | "active"
    | "ready"
    | "thinking"
    | "running"
    | "idle"
    | "done"
    | "conflict"
    | "blocked"
    | "needs_rerun"
    | "needs_rerun_conflict";
  active?: boolean;
  dimmed?: boolean;
  hovered?: boolean;
  inPath?: boolean;
  disabled?: boolean;
  isDirty?: boolean;
  hasStaleUpstream?: boolean;
  entryIndex?: number;
  isGhost?: boolean;
  [key: string]: unknown;
}

// Hex values used only for rgba tinting (border, glow, avatar bg, shadow)
const STATUS_COLORS: Record<string, string> = {
  done:                 "#34d399",
  thinking:             "#a78bfa",
  running:              "#fb923c",
  active:               "#a78bfa",
  conflict:             "#34d399",
  blocked:              "#f87171",
  waiting:              "#60a5fa",
  ready:                "#60a5fa",
  proposed:             "#60a5fa",
  idle:                 "#454870",
  needs_rerun:          "#f59e0b",
  needs_rerun_conflict: "#f59e0b",
};

const CONFLICT_BADGE_COLOR = "#fbbf24";

function getStatusColor(status?: string): string {
  return status ? (STATUS_COLORS[status] ?? "#454870") : "#454870";
}

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "167, 139, 250";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ── Dimensions ──────────────────────────────────────────────────────────────
const CARD_W  = 172;
const CARD_H  = 64;
const AV_SIZE = 28;   // avatar circle diameter
const AV_LEFT = 9;    // avatar left offset from card edge
const TEXT_LEFT = AV_LEFT + AV_SIZE + 8; // text area starts at 45px

function IdeaNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as IdeaNodeData;
  const isRFSelected = Boolean(selected);
  const isHovered    = Boolean(nodeData.hovered);
  const isActive     = Boolean(nodeData.active);
  const isDirty      = Boolean(nodeData.isDirty);
  const isHighlighted = isRFSelected || isHovered || isActive;
  const entryIndex   = typeof nodeData.entryIndex === "number" ? nodeData.entryIndex : undefined;
  const isGhost      = Boolean(nodeData.isGhost);

  const baseColor = getStatusColor(nodeData.status);
  const rgb       = hexToRgb(baseColor);

  const isOutcome  = nodeData.nodeType === "outcome";
  const isIdea     = nodeData.nodeType === "idea";
  const isSynthetic = nodeData.nodeType === "synthetic";

  // Label hierarchy: role title (bold top), name/subtitle (muted bottom)
  const topLabel = isIdea ? "Idea" : isOutcome ? "Outcome" : (nodeData.role ?? nodeData.name);
  const subLabel = isIdea ? "Starting point" : isOutcome ? "Final output" : nodeData.name;
  const abbr     = nodeData.code ?? (isOutcome ? "✓" : "✦");

  const isThinking = nodeData.status === "thinking" || nodeData.status === "active";
  const isDoneStatus = nodeData.status === "done" || nodeData.status === "conflict";
  const showStatusChip = isThinking || isDoneStatus;
  const hasStaleUpstream = Boolean(nodeData.hasStaleUpstream);

  // Card border
  const borderColor = isRFSelected
    ? `rgba(${rgb}, 0.72)`
    : isThinking
      ? `rgba(${rgb}, 0.45)`
      : isDoneStatus
        ? `rgba(${rgb}, 0.35)`
        : isHovered || isActive
          ? `rgba(${rgb}, 0.40)`
          : `rgba(${rgb}, 0.22)`;

  const boxShadow = isRFSelected
    ? `0 0 0 2px rgba(${rgb}, 0.18), 0 4px 20px rgba(${rgb}, 0.12)`
    : isHovered || isActive
      ? `0 0 0 1px rgba(${rgb}, 0.10), 0 2px 10px rgba(${rgb}, 0.08)`
      : undefined;

  const handleVisible = (isRFSelected || isHovered) && !isOutcome && !isIdea;

  return (
    <div
      className={isGhost ? "node-ghost" : entryIndex !== undefined ? "node-enter" : undefined}
      style={{
        position: "relative",
        width: CARD_W,
        height: CARD_H,
        opacity: (nodeData.dimmed || nodeData.disabled) ? 0.22 : 1,
        transition: "opacity 0.2s",
        animationDelay:    entryIndex !== undefined ? `${entryIndex * 80}ms` : undefined,
        animationDuration: isGhost ? `${1.8 + (entryIndex ?? 0) * 0.35}s` : undefined,
      }}
    >
      {/* Target handles */}
      <Handle type="target" id="top-target"    position={Position.Top}    style={{ top: 0,    left: "50%",  transform: "translate(-50%, -50%)", width: 10, height: 10 }} className="!bg-transparent !border-0 !opacity-0" />
      <Handle type="target" id="right-target"  position={Position.Right}  style={{ top: "50%", right: 0,  transform: "translate(50%, -50%)",   width: 10, height: 10 }} className="!bg-transparent !border-0 !opacity-0" />
      <Handle type="target" id="bottom-target" position={Position.Bottom} style={{ bottom: 0, left: "50%", transform: "translate(-50%, 50%)",  width: 10, height: 10 }} className="!bg-transparent !border-0 !opacity-0" />
      <Handle type="target" id="left-target"   position={Position.Left}   style={{ top: "50%", left: 0,   transform: "translate(-50%, -50%)", width: 10, height: 10 }} className="!bg-transparent !border-0 !opacity-0" />

      {/* Card */}
      <div
        className={
          (isThinking) && !isRFSelected
            ? "node-ring-think"
            : isDirty && !isRFSelected && !isHovered
              ? "node-card-dirty"
              : undefined
        }
        style={{
          width: CARD_W,
          height: CARD_H,
          borderRadius: 10,
          border: `1px solid ${borderColor}`,
          background: "var(--surface)",
          overflow: "hidden",
          position: "relative",
          boxShadow,
          transition: "border-color 0.18s, box-shadow 0.18s",
        }}
      >
        {/* Left accent bar */}
        <div style={{
          position: "absolute", left: 0, top: 10, bottom: 10,
          width: 3, borderRadius: "0 2px 2px 0",
          background: baseColor,
        }} />

        {/* Avatar */}
        <div style={{
          position: "absolute", left: AV_LEFT, top: "50%", transform: "translateY(-50%)",
          width: AV_SIZE, height: AV_SIZE, borderRadius: "50%",
          background: `rgba(${rgb}, 0.15)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {isIdea ? (
            <span style={{ fontSize: 13, lineHeight: 1 }}>💡</span>
          ) : isOutcome ? (
            <span style={{ fontSize: 13, lineHeight: 1 }}>📋</span>
          ) : (
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: baseColor,
              fontFamily: "var(--font-jetbrains-mono), monospace",
              letterSpacing: "0.3px", lineHeight: 1,
            }}>
              {abbr}
            </span>
          )}
        </div>

        {/* Text area */}
        <div style={{
          position: "absolute",
          left: TEXT_LEFT,
          right: showStatusChip ? 72 : 8,
          top: "50%", transform: "translateY(-50%)",
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: isHighlighted ? "var(--on-surface)" : "var(--on-surface-variant)",
            fontFamily: "var(--font-manrope), var(--font-jetbrains-mono), sans-serif",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            lineHeight: 1.25,
            transition: "color 0.18s",
          }}>
            {topLabel}
          </div>

          {/* Subtitle / status indicator */}
          {nodeData.status === "conflict" ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4, lineHeight: 1, marginTop: 3 }}>
              <span style={{ fontSize: 9, color: "#34d399", fontFamily: "var(--font-jetbrains-mono), monospace", display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
                done
              </span>
              <span style={{
                fontSize: 7, fontWeight: 700, lineHeight: 1,
                padding: "1px 4px", borderRadius: 3,
                background: `${CONFLICT_BADGE_COLOR}22`,
                border: `1px solid ${CONFLICT_BADGE_COLOR}55`,
                color: CONFLICT_BADGE_COLOR,
                fontFamily: "var(--font-jetbrains-mono), monospace",
                flexShrink: 0,
              }}>
                ⚡ conflict
              </span>
            </span>
          ) : nodeData.status === "blocked" ? (
            <span style={{ fontSize: 9, color: "#f87171", fontFamily: "var(--font-jetbrains-mono), monospace", lineHeight: 1, display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#f87171", display: "inline-block" }} />
              blocked
            </span>
          ) : nodeData.status === "needs_rerun" ? (
            <span style={{ fontSize: 9, color: "#f59e0b", fontFamily: "var(--font-jetbrains-mono), monospace", lineHeight: 1, display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
              re-run needed
            </span>
          ) : nodeData.status === "needs_rerun_conflict" ? (
            <span style={{ fontSize: 9, color: "#f59e0b", fontFamily: "var(--font-jetbrains-mono), monospace", lineHeight: 1, marginTop: 3, display: "block" }}>
              ↔ re-run (conflict)
            </span>
          ) : (
            <div style={{
              fontSize: 10,
              color: "var(--t3)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.3, marginTop: 3,
            }}>
              {subLabel}
            </div>
          )}
        </div>

        {/* Status chip (top-right) */}
        {showStatusChip && (
          <div style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            padding: "4px 8px", borderRadius: 7,
            background: isThinking ? "var(--primary-container)" : "var(--color-success-bg-subtle)",
            border: `1px solid ${isThinking ? "var(--primary-border)" : "var(--color-success-border)"}`,
            fontSize: 9, fontWeight: 600, whiteSpace: "nowrap",
            color: isThinking ? "var(--primary)" : "var(--color-success-text)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            letterSpacing: "0.02em",
          }}>
            {isThinking ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </span>
            ) : "✓ Done"}
          </div>
        )}
      </div>

      {/* Source handles */}
      <Handle type="source" id="top-source"    position={Position.Top}    isConnectableStart={!isIdea} style={{ top: 0,    left: "50%",  transform: "translate(-50%, -50%)", width: 10, height: 10, background: "transparent", border: "none", opacity: 0, cursor: "crosshair" }} />
      <Handle type="source" id="right-source"  position={Position.Right}  isConnectableStart={!isIdea} style={{ top: "50%", right: 0,  transform: "translate(50%, -50%)",   width: 10, height: 10, background: "transparent", border: "none", opacity: 0, cursor: "crosshair" }} />
      <Handle type="source" id="bottom-source" position={Position.Bottom} isConnectableStart={!isIdea} style={{ bottom: 0, left: "50%", transform: "translate(-50%, 50%)",  width: 10, height: 10, background: "transparent", border: "none", opacity: 0, cursor: "crosshair" }} />
      <Handle type="source" id="left-source"   position={Position.Left}   isConnectableStart={!isIdea} style={{ top: "50%", left: 0,   transform: "translate(-50%, -50%)", width: 10, height: 10, background: "transparent", border: "none", opacity: 0, cursor: "crosshair" }} />

      {/* Dirty dot */}
      {isDirty && !isGhost && (
        <div style={{ position: "absolute", top: -3, right: -3, width: 6, height: 6, borderRadius: "50%", background: "#fb923c", border: "1.5px solid var(--surface-lowest)", pointerEvents: "none", zIndex: 1 }} />
      )}

      {/* Stale upstream badge — shown when this agent ran but some peers were skipped */}
      {hasStaleUpstream && !isGhost && (
        <div
          title="This agent ran with stale context — some upstream peers were skipped in the last run"
          style={{
            position: "absolute",
            bottom: -9,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 1,
            background: "rgba(161,120,35,0.18)",
            border: "1px solid rgba(245,158,11,0.38)",
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 7,
            fontWeight: 600,
            color: "#f59e0b",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          ⚠ stale ctx
        </div>
      )}

      {/* Glow handle dots — visible when hovered or selected */}
      {handleVisible && (<>
        <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: baseColor, border: "2px solid var(--surface-lowest)", boxShadow: `0 0 5px 2px rgba(${rgb}, 0.5)`, cursor: "crosshair", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", right: -4, transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: baseColor, border: "2px solid var(--surface-lowest)", boxShadow: `0 0 5px 2px rgba(${rgb}, 0.5)`, cursor: "crosshair", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: baseColor, border: "2px solid var(--surface-lowest)", boxShadow: `0 0 5px 2px rgba(${rgb}, 0.5)`, cursor: "crosshair", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: -4, transform: "translateY(-50%)", width: 8, height: 8, borderRadius: "50%", background: baseColor, border: "2px solid var(--surface-lowest)", boxShadow: `0 0 5px 2px rgba(${rgb}, 0.5)`, cursor: "crosshair", pointerEvents: "none" }} />
      </>)}

      {/* Connect hint */}
      {handleVisible && (
        <div style={{
          position: "absolute", top: -24, left: "50%", transform: "translateX(-50%)",
          pointerEvents: "none", whiteSpace: "nowrap",
          background: "var(--surface-high)", border: "1px solid var(--border-solid)",
          borderRadius: 4, padding: "2px 6px",
          fontSize: 8, letterSpacing: "0.06em",
          color: "var(--on-surface-variant)",
          fontFamily: "var(--font-jetbrains-mono), monospace",
          opacity: 0.85,
        }}>
          drag handle to connect
        </div>
      )}
    </div>
  );
}

export const IdeaNode = memo(IdeaNodeComponent);
