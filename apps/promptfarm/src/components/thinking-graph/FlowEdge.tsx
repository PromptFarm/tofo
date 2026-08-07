"use client";

import { useEffect, useRef, useState } from "react";
import {
  useReactFlow,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";
import { setPivotDragging } from "./dragState";

type Pt = { x: number; y: number };

type FlowEdgeData = {
  hasActiveNode?: boolean;
  isConnectedToActive?: boolean;
  isSelectedEdge?: boolean;
  isStructural?: boolean;
  isRunInProgress?: boolean;
  edgeType?: "structural" | "tension" | "oversight" | "amplification";
  waypoints?: Pt[];
  onWaypointsChange?: (pts: Pt[]) => void;
};

const EDGE_COLOR_VARS: Record<string, string> = {
  structural:    "var(--edge-structural)",
  tension:       "var(--edge-tension)",
  oversight:     "var(--edge-oversight)",
  amplification: "var(--edge-amplification)",
};

function buildBentPathTo(src: Pt, ctrl: Pt, tgt: Pt, endPt: Pt): string {
  const cp1x = src.x + (2 / 3) * (ctrl.x - src.x);
  const cp1y = src.y + (2 / 3) * (ctrl.y - src.y);
  const cp2x = tgt.x + (2 / 3) * (ctrl.x - tgt.x);
  const cp2y = tgt.y + (2 / 3) * (ctrl.y - tgt.y);
  return `M ${src.x} ${src.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endPt.x} ${endPt.y}`;
}

// Build a cubic bezier that passes through `through` at t=0.5, ending at `endPt`.
function buildArcPathTo(src: Pt, through: Pt, tgt: Pt, endPt: Pt): string {
  const ctrl: Pt = {
    x: 2 * through.x - 0.5 * src.x - 0.5 * tgt.x,
    y: 2 * through.y - 0.5 * src.y - 0.5 * tgt.y,
  };
  return buildBentPathTo(src, ctrl, tgt, endPt);
}

function ctrlFromThrough(src: Pt, through: Pt, tgt: Pt): Pt {
  return {
    x: 2 * through.x - 0.5 * src.x - 0.5 * tgt.x,
    y: 2 * through.y - 0.5 * src.y - 0.5 * tgt.y,
  };
}

function cubicAt(src: Pt, ctrl: Pt, tgt: Pt, t: number): Pt {
  const cp1x = src.x + (2 / 3) * (ctrl.x - src.x);
  const cp1y = src.y + (2 / 3) * (ctrl.y - src.y);
  const cp2x = tgt.x + (2 / 3) * (ctrl.x - tgt.x);
  const cp2y = tgt.y + (2 / 3) * (ctrl.y - tgt.y);
  const mt = 1 - t;
  return {
    x: mt**3*src.x + 3*mt**2*t*cp1x + 3*mt*t**2*cp2x + t**3*tgt.x,
    y: mt**3*src.y + 3*mt**2*t*cp1y + 3*mt*t**2*cp2y + t**3*tgt.y,
  };
}

export function FlowEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps) {
  const edgeData          = (data ?? {}) as FlowEdgeData;
  const hasActiveNode     = Boolean(edgeData.hasActiveNode);
  const isConnected       = Boolean(edgeData.isConnectedToActive);
  const isSelected        = Boolean(edgeData.isSelectedEdge);
  const isStructural      = Boolean(edgeData.isStructural);
  const isRunInProgress   = Boolean(edgeData.isRunInProgress);
  const edgeType          = edgeData.edgeType ?? "structural";
  const waypointsProp     = edgeData.waypoints ?? [];
  const onWaypointsChange = edgeData.onWaypointsChange;
  const hasStartArrow     = edgeType === "tension";

  const { screenToFlowPosition } = useReactFlow();

  const [pivot, setPivot] = useState<Pt | null>(waypointsProp[0] ?? null);
  const draggingRef          = useRef(false);
  const onWaypointsChangeRef = useRef(onWaypointsChange);
  onWaypointsChangeRef.current = onWaypointsChange;

  // Keep latest endpoints accessible inside the window listener closure
  const endpointsRef = useRef({ sourceX, sourceY, targetX, targetY });
  endpointsRef.current = { sourceX, sourceY, targetX, targetY };

  // Track whether this is a conflict edge (has start arrow) for drag inversion
  const hasStartArrowRef = useRef(hasStartArrow);
  hasStartArrowRef.current = hasStartArrow;

  // Offset (in flow space) between the pivot dot center and the grab point
  const dragOffsetRef = useRef<Pt>({ x: 0, y: 0 });

  // Sync from parent only when not mid-drag
  useEffect(() => {
    if (draggingRef.current) return;
    setPivot(waypointsProp[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(waypointsProp[0])]);

  // Window capture listeners fire before React Flow's div-level pan handler
  useEffect(() => {
    // Both cp1 and cp2 are axis-locked. effectivePivot is stored directly;
    // each handle's length is set by projecting ep onto its axis.
    // visualToCtrl = identity: dragged position is stored as the new ep.
    const visualToCtrl = (visual: Pt): Pt => visual;

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      const cursor = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const visual: Pt = {
        x: cursor.x + dragOffsetRef.current.x,
        y: cursor.y + dragOffsetRef.current.y,
      };
      setPivot(visualToCtrl(visual));
    };

    const onUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      draggingRef.current = false;
      setPivotDragging(false);
      setPivot((current) => {
        const pts = current ? [current] : [];
        setTimeout(() => { onWaypointsChangeRef.current?.(pts); }, 0);
        return current;
      });
    };

    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup",   onUp,   { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup",   onUp,   { capture: true });
    };
  }, [screenToFlowPosition, sourcePosition, targetPosition]);

  const src: Pt = { x: sourceX, y: sourceY };
  const tgt: Pt = { x: targetX, y: targetY };

  const defaultThrough: Pt = {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  };

  const effectivePivot: Pt = pivot ?? defaultThrough;

  const color = isSelected
    ? "var(--primary)"
    : (EDGE_COLOR_VARS[edgeType] ?? "var(--edge-default)");

  const pathOpacity = isSelected ? 1
    : hasActiveNode ? (isConnected ? 0.55 : 0.04) : 0.2;
  const strokeWidth = isSelected ? 2 : isConnected ? 1.8 : 1.4;
  const dashArray = edgeType === "tension"       ? "6 4"
    : edgeType === "amplification" ? "2 4"
    : edgeType === "oversight"     ? "8 4"
    : undefined;


  const ARROW_LENGTH = 6;
  const ARROW_HALF   = 4;
  // How far the arrowhead tip is pulled back from the raw handle centre.
  // This must be large enough that the tip clears the node card on every side.
  const ENDPOINT_OFFSET = 8;

  const TARGET_DIR: Record<string, Pt> = {
    top:    { x:  0, y: -1 },
    bottom: { x:  0, y:  1 },
    left:   { x: -1, y:  0 },
    right:  { x:  1, y:  0 },
  };
  const inbound = TARGET_DIR[targetPosition] ?? TARGET_DIR.left;
  const ux = -inbound.x;
  const uy = -inbound.y;
  const perp: Pt = { x: -uy, y: ux };

  // tip: where the arrowhead point sits (pulled back from the raw handle centre)
  const tip: Pt = { x: targetX - ux * ENDPOINT_OFFSET, y: targetY - uy * ENDPOINT_OFFSET };
  // arrowBase: the flat base of the arrowhead triangle, also the path endpoint
  const arrowBase: Pt = { x: tip.x - ux * ARROW_LENGTH, y: tip.y - uy * ARROW_LENGTH };
  const baseL: Pt = { x: arrowBase.x - perp.x * ARROW_HALF, y: arrowBase.y - perp.y * ARROW_HALF };
  const baseR: Pt = { x: arrowBase.x + perp.x * ARROW_HALF, y: arrowBase.y + perp.y * ARROW_HALF };
  const arrowPoints = `${tip.x},${tip.y} ${baseL.x},${baseL.y} ${baseR.x},${baseR.y}`;

  const SOURCE_DIR: Record<string, Pt> = {
    top:    { x:  0, y: -1 },
    bottom: { x:  0, y:  1 },
    left:   { x: -1, y:  0 },
    right:  { x:  1, y:  0 },
  };
  const srcOutbound = SOURCE_DIR[sourcePosition] ?? SOURCE_DIR.right;
  const sux = srcOutbound.x;
  const suy = srcOutbound.y;
  const sperp: Pt = { x: -suy, y: sux };

  // Source arrowhead tip (conflict edges only) — offset outward from node
  const srcArrowTip: Pt = { x: sourceX + sux * ENDPOINT_OFFSET, y: sourceY + suy * ENDPOINT_OFFSET };
  const srcArrowBaseOuter: Pt = { x: srcArrowTip.x + sux * ARROW_LENGTH, y: srcArrowTip.y + suy * ARROW_LENGTH };
  const srcBaseL: Pt = { x: srcArrowBaseOuter.x - sperp.x * ARROW_HALF, y: srcArrowBaseOuter.y - sperp.y * ARROW_HALF };
  const srcBaseR: Pt = { x: srcArrowBaseOuter.x + sperp.x * ARROW_HALF, y: srcArrowBaseOuter.y + sperp.y * ARROW_HALF };
  const srcArrowPoints = `${srcArrowTip.x},${srcArrowTip.y} ${srcBaseL.x},${srcBaseL.y} ${srcBaseR.x},${srcBaseR.y}`;

  // Path starts from: after the source arrowhead (conflict), or just past the node edge (others)
  const pathSrc: Pt = hasStartArrow
    ? srcArrowBaseOuter
    : { x: sourceX + sux * ENDPOINT_OFFSET, y: sourceY + suy * ENDPOINT_OFFSET };

  const STRAIGHT_APPROACH = 20;

  // Bezier control points — axis-locked for clean 90° arrivals/departures
  const d1: Pt = { x: sux, y: suy };
  const d2: Pt = { x: -ux, y: -uy };

  const chordMidX = (pathSrc.x + arrowBase.x) / 2;
  const chordMidY = (pathSrc.y + arrowBase.y) / 2;
  const chordDx = arrowBase.x - pathSrc.x;
  const chordDy = arrowBase.y - pathSrc.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy) || 1;
  const perpX = -chordDy / chordLen;
  const perpY =  chordDx / chordLen;

  const lateral = (effectivePivot.x - chordMidX) * perpX + (effectivePivot.y - chordMidY) * perpY;

  const len1 = Math.max(STRAIGHT_APPROACH,
    (effectivePivot.x - pathSrc.x) * d1.x + (effectivePivot.y - pathSrc.y) * d1.y);
  const len2 = Math.max(STRAIGHT_APPROACH,
    (effectivePivot.x - arrowBase.x) * d2.x + (effectivePivot.y - arrowBase.y) * d2.y
    + Math.abs(lateral));

  const cp1: Pt = {
    x: pathSrc.x + len1 * d1.x,
    y: pathSrc.y + len1 * d1.y,
  };
  const cp2: Pt = {
    x: arrowBase.x + len2 * d2.x,
    y: arrowBase.y + len2 * d2.y,
  };

  // Path runs all the way to tip so arrowhead sits flush against path end — no gap
  const shortPath = `M ${pathSrc.x} ${pathSrc.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${tip.x} ${tip.y}`;

  // Handle dot at t=0.5 on the cubic (uses arrowBase endpoints for consistency)
  const handlePt: Pt = {
    x: 0.125*pathSrc.x + 0.375*cp1.x + 0.375*cp2.x + 0.125*tip.x,
    y: 0.125*pathSrc.y + 0.375*cp1.y + 0.375*cp2.y + 0.125*tip.y,
  };

  const startDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const cursor = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    dragOffsetRef.current = { x: handlePt.x - cursor.x, y: handlePt.y - cursor.y };
    draggingRef.current = true;
    setPivotDragging(true);
  };

  return (
    <>
      {/* Wide transparent stroke for easier click/hover */}
      <path d={shortPath} fill="none" stroke="transparent" strokeWidth={12}
        className="react-flow__edge-interaction" />

      <path d={shortPath} fill="none"
        style={{ stroke: color, transition: "opacity 0.18s, stroke-width 0.18s" }}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray} strokeLinecap="butt"
        opacity={pathOpacity} />

      {/* End arrowhead */}
      <polygon points={arrowPoints} style={{ fill: color }} opacity={pathOpacity} />

      {/* Start arrowhead for conflict edges: pinned to source, oriented along sourcePosition axis */}
      {hasStartArrow && (
        <polygon points={srcArrowPoints} style={{ fill: color }} opacity={pathOpacity} />
      )}

      {/* Traveling dot — behavior varies by edge type during a run */}
      {(() => {
        const baseOpacity = isSelected ? 0.9 : hasActiveNode ? (isConnected ? 0.6 : 0.08) : 0.5;
        const runningOpacity = isSelected ? 0.95 : 0.75;
        const particleOpacity = isRunInProgress ? runningOpacity : baseOpacity;

        if (isRunInProgress && edgeType === "tension") {
          return (
            <>
              <circle r={2.5} style={{ fill: color }} opacity={particleOpacity}>
                <animateMotion path={shortPath} dur="2.0s" repeatCount="indefinite" />
              </circle>
              <circle r={2} style={{ fill: color }} opacity={particleOpacity * 0.6}>
                <animateMotion path={shortPath} dur="2.0s" begin="-1.0s"
                  keyPoints="1;0" keyTimes="0;1" calcMode="linear"
                  repeatCount="indefinite" />
              </circle>
            </>
          );
        }

        if (isRunInProgress && edgeType === "amplification") {
          return (
            <circle r={2.5} style={{ fill: color }} opacity={particleOpacity}>
              <animateMotion path={shortPath} dur="1.6s" repeatCount="indefinite" />
            </circle>
          );
        }

        if (isRunInProgress && edgeType === "oversight") {
          return (
            <circle r={2.5} style={{ fill: color }} opacity={particleOpacity}>
              <animateMotion path={shortPath} dur="4.8s" repeatCount="indefinite" />
            </circle>
          );
        }

        return (
          <circle r={2} style={{ fill: color }} opacity={baseOpacity}>
            <animateMotion path={shortPath}
              dur={`${edgeType === "tension" ? 2.2 : 3.4}s`}
              repeatCount="indefinite" />
          </circle>
        );
      })()}

      {/* Waypoint bend handle — semantic edges only */}
      {isSelected && !isStructural && (
        <EdgeLabelRenderer>

          {/* Waypoint bend handle dot */}
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${handlePt.x}px, ${handlePt.y}px)`,
              pointerEvents: "all",
              cursor: "grab",
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onPointerDown={startDrag}
          >
            <div style={{
              position: "absolute",
              width: 16, height: 16,
              borderRadius: "50%",
              background: color,
              opacity: 0.18,
              border: `1.5px solid ${color}`,
            }} />
            <div style={{
              position: "relative",
              width: 7, height: 7,
              borderRadius: "50%",
              background: color,
              border: "1.5px solid var(--surface-lowest)",
              flexShrink: 0,
            }} />
          </div>

        </EdgeLabelRenderer>
      )}
    </>
  );
}
