import { useMemo } from "react";
import { type Edge, type Node } from "@xyflow/react";
import type { IterationNode, SyntheticEdge } from "@/lib/planning/types";
import type { RuntimeNodeStatus } from "../runtime/runtimeTypes";
import {
  getEdgeTypeOpacity,
  getHandlesBetween,
  getSyntheticDisplayStatus,
  getVisibleSynthetics,
} from "../thinkingGraphUtils";

type GraphStats = {
  in: number;
  out: number;
  conflict: number;
};

export type GraphData = {
  nodes: Node[];
  edges: Edge[];
  nodeNames: Record<string, string>;
  statsByNode: Record<string, GraphStats>;
};

export function useThinkingGraphGraphData(input: {
  theme: string;
  hasIdea: boolean;
  showProcessGraph: boolean;
  selectedRevision: IterationNode | null;
  visibleSynthetics: ReturnType<typeof getVisibleSynthetics>;
  ideaNodeId: string;
  outcomeNodeId: string;
  activeNodeId: string | null;
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isRunInProgress: boolean;
  isOutcomeReady: boolean;
  runtimeByNodeId: Record<string, RuntimeNodeStatus | undefined>;
  chatUpdatedNodeIds: Set<string>;
  revisionEdges: SyntheticEdge[];
  onRevisionEdgesChange: (edges: SyntheticEdge[]) => void;
  /** Director phase — drives the idea node visual state */
  directorPhase?: string;
  /** Ghost synthetics shown while Director is scanning (cycling names, faded) */
  ghostSynthetics?: import("@/lib/planning/types").SyntheticNode[];
  /** Proposed synthetics to show while Director awaits confirmation (before real session synthetics load) */
  proposedSynthetics?: import("@/lib/planning/types").SyntheticNode[];
  /**
   * Set of synthetic IDs that actually ran in the most recent execution.
   * When this is smaller than the total synthetic count a partial rerun occurred,
   * and any node in this set has stale upstream context from the skipped peers.
   */
  lastRunSyntheticIds?: Set<string>;
}): GraphData {
  const {
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
    directorPhase = "idle",
  } = input;
  const ghostSynthetics = input.ghostSynthetics ?? [];
  const proposedSynthetics = input.proposedSynthetics ?? [];
  const lastRunSyntheticIds = input.lastRunSyntheticIds ?? new Set<string>();

  // theme is intentionally included in deps for reactive re-computation on theme change
  void theme;

    return useMemo<GraphData>(() => {
    if (!selectedRevision || !hasIdea) {
      return { nodes: [], edges: [], nodeNames: {}, statsByNode: {} };
    }

    // A partial rerun occurred when lastRunSyntheticIds is non-empty and does
    // not cover all synthetics in the current graph.
    const totalSyntheticCount = visibleSynthetics.length;
    const isPartialRun =
      lastRunSyntheticIds.size > 0 &&
      lastRunSyntheticIds.size < totalSyntheticCount;

    // While Director is scanning, show ghost nodes around the Idea node instead of the
    // real (empty) graph so the canvas communicates "thinking, assembling a team".
    if (directorPhase === "running" && ghostSynthetics.length > 0) {
      const ghostIdea: Node = {
        id: ideaNodeId,
        type: "idea",
        position: { x: 460, y: 60 },
        data: { nodeType: "idea", name: "Idea", status: "thinking" },
      };
      const ghostNodes: Node[] = ghostSynthetics.map((s, idx) => ({
        id: s.id,
        type: "idea",
        position: { x: s.layout.x, y: s.layout.y },
        data: { nodeType: "synthetic", code: s.code, name: s.name, role: s.role, status: "thinking", isGhost: true, entryIndex: idx },
      }));
      const allGhostNodes = [ghostIdea, ...ghostNodes];
      const ghostNodeNames = Object.fromEntries(allGhostNodes.map((n) => [n.id, (n.data as { name?: string }).name ?? n.id]));
      const ghostStats: Record<string, { in: number; out: number; conflict: number }> = {};
      allGhostNodes.forEach((n) => { ghostStats[n.id] = { in: 0, out: 0, conflict: 0 }; });
      return { nodes: allGhostNodes, edges: [], nodeNames: ghostNodeNames, statsByNode: ghostStats };
    }

    // While Director awaits or is applying confirmation, keep the proposed synthetics on canvas
    // so the graph doesn't flash old nodes during the API round-trip.
    const syntheticNodes =
      (directorPhase === "awaiting_confirmation" || directorPhase === "confirming") && proposedSynthetics.length > 0
        ? proposedSynthetics
        : visibleSynthetics;

    const minX = syntheticNodes.length
      ? Math.min(...syntheticNodes.map((node) => node.layout.x))
      : 260;
    const maxX = syntheticNodes.length
      ? Math.max(...syntheticNodes.map((node) => node.layout.x))
      : 620;
    const minY = syntheticNodes.length
      ? Math.min(...syntheticNodes.map((node) => node.layout.y))
      : 220;
    const maxY = syntheticNodes.length
      ? Math.max(...syntheticNodes.map((node) => node.layout.y))
      : 420;
    const centerX = (minX + maxX) / 2;

    const ideaNodeStatus =
      directorPhase === "running" ? "thinking" :
      directorPhase === "awaiting_confirmation" || directorPhase === "confirming" ? "active" :
      "done";

    const ideaNode: Node = {
      id: ideaNodeId,
      type: "idea",
      position: { x: centerX, y: minY - 160 },
      data: { nodeType: "idea", name: "Idea", status: ideaNodeStatus },
    };

    const rawNodes: Node[] = showProcessGraph
      ? [
          ideaNode,
          ...syntheticNodes.map((synthetic) => ({
            id: synthetic.id,
            type: "idea",
            position: {
              x: synthetic.layout.x,
              y: synthetic.layout.y,
            },
            data: {
              nodeType: "synthetic",
              code: synthetic.code,
              name: synthetic.name,
              role: synthetic.role,
              status: getSyntheticDisplayStatus(runtimeByNodeId[synthetic.id]),
            },
          })),
          {
            id: outcomeNodeId,
            type: "idea",
            position: { x: centerX + 80, y: maxY + 180 },
            data: {
              nodeType: "outcome",
              name: "Outcome",
              status: isOutcomeReady ? "done" : isRunInProgress ? "thinking" : "idle",
              disabled: !isOutcomeReady && !isRunInProgress,
            },
          },
        ]
      : [ideaNode];

    const nodePositions = new Map(
      rawNodes.map((node) => [node.id, node.position]),
    );
    const nodeNames = Object.fromEntries(
      rawNodes.map((node) => [
        node.id,
        (node.data as { name?: string }).name ?? node.id,
      ]),
    );

    const buildEdge = (
      id: string,
      source: string,
      target: string,
      edgeType: SyntheticEdge["type"],
      knownSourceHandle?: string,
      knownTargetHandle?: string,
      waypoints?: { x: number; y: number }[],
    ): Edge => {
      let sourceHandle: string;
      let targetHandle: string;
      if (knownSourceHandle && knownTargetHandle) {
        sourceHandle = knownSourceHandle;
        targetHandle = knownTargetHandle;
      } else {
        const sourcePos = nodePositions.get(source) ?? { x: 0, y: 0 };
        const targetPos = nodePositions.get(target) ?? { x: 0, y: 0 };
        ({ sourceHandle, targetHandle } = getHandlesBetween(
          sourcePos,
          targetPos,
        ));
      }

      const edgeColor =
        edgeType === "structural"
          ? "var(--edge-structural)"
          : edgeType === "tension"
            ? "var(--edge-tension)"
            : edgeType === "oversight"
              ? "var(--edge-oversight)"
              : edgeType === "amplification"
                ? "var(--edge-amplification)"
                : "var(--edge-default)";

      const isStructural = source === ideaNodeId || target === outcomeNodeId;

      return {
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        style: {
          stroke: edgeColor,
          strokeWidth: 1.5,
        },
        data: {
          edgeType,
          isStructural,
          waypoints: waypoints ?? [],
          onWaypointsChange: isStructural
            ? undefined
            : (nextWaypoints: { x: number; y: number }[]) => {
                onRevisionEdgesChange(
                  revisionEdges.map((e) =>
                    e.id === id ? { ...e, waypoints: nextWaypoints } : e,
                  ),
                );
              },
        },
        type: "flow",
      };
    };

    const visibleSyntheticIds = new Set(
      showProcessGraph ? syntheticNodes.map((node) => node.id) : [],
    );
    const mapGraphNodeId = (nodeId: string): string | null => {
      if (nodeId === "idea") {
        return ideaNodeId;
      }
      if (nodeId === "outcome" || nodeId === "out") {
        return outcomeNodeId;
      }
      if (visibleSyntheticIds.has(nodeId)) {
        return nodeId;
      }
      return null;
    };

    // While Director is showing proposed nodes (awaiting confirmation or applying it),
    // the revisionEdges are stale (from the previous session) and must NOT be rendered —
    // they would create duplicate or phantom edges that overlap with the hub-and-spoke
    // orchestration edges generated below.  Only resume semantic edge rendering once
    // the phase reaches "confirmed" (or "skipped") and revisionEdges reflect the new graph.
    const isShowingProposedNodes =
      (directorPhase === "awaiting_confirmation" || directorPhase === "confirming") &&
      proposedSynthetics.length > 0;

    const runSemanticEdges = showProcessGraph && !isShowingProposedNodes
      ? revisionEdges
          .map((edge) => {
            const sourceId = mapGraphNodeId(edge.from);
            const targetId = mapGraphNodeId(edge.to);

            if (!sourceId || !targetId || sourceId === targetId) {
              return null;
            }

            return buildEdge(
              edge.id,
              sourceId,
              targetId,
              edge.type,
              edge.sourceHandle,
              edge.targetHandle,
              edge.waypoints,
            );
          })
          .filter((edge): edge is Edge => Boolean(edge))
      : [];

    // During awaiting/confirming, revisionEdges are the OLD session edges (pre-confirmation)
    // whose node IDs don't match the proposed synthetic IDs — force hub-and-spoke generation.
    const hasExplicitStructuralEdges =
      (directorPhase === "awaiting_confirmation" || directorPhase === "confirming") && proposedSynthetics.length > 0
        ? false
        : showProcessGraph
          ? revisionEdges.some(
              (edge) =>
                edge.from === "idea" ||
                edge.to === "idea" ||
                edge.from === "outcome" ||
                edge.to === "outcome" ||
                edge.from === "out" ||
                edge.to === "out",
            )
          : true;

    const orchestrationEdges: Edge[] = hasExplicitStructuralEdges
      ? []
      : [
          ...syntheticNodes.map((synthetic) =>
            buildEdge(`${ideaNodeId}-${synthetic.id}`, ideaNodeId, synthetic.id, "structural"),
          ),
          ...syntheticNodes.map((synthetic) =>
            buildEdge(`${synthetic.id}-${outcomeNodeId}`, synthetic.id, outcomeNodeId, "structural"),
          ),
        ];

    const allEdges = [...runSemanticEdges, ...orchestrationEdges];

    const statsByNode: Record<string, GraphStats> = {};
    rawNodes.forEach((node) => {
      statsByNode[node.id] = { in: 0, out: 0, conflict: 0 };
    });

    // biome-ignore lint/complexity/noForEach: keep existing pattern
    allEdges.forEach((edge) => {
      if (statsByNode[edge.source]) {
        statsByNode[edge.source].out += 1;
      }
      if (statsByNode[edge.target]) {
        statsByNode[edge.target].in += 1;
      }
      if (
        (edge.data as { edgeType?: string } | undefined)?.edgeType ===
        "tension"
      ) {
        if (statsByNode[edge.source]) {
          statsByNode[edge.source].conflict += 1;
        }
        if (statsByNode[edge.target]) {
          statsByNode[edge.target].conflict += 1;
        }
      }
    });

    const connectedNodeIds = new Set<string>();
    if (activeNodeId) {
      connectedNodeIds.add(activeNodeId);
      allEdges.forEach((edge) => {
        if (edge.source === activeNodeId || edge.target === activeNodeId) {
          connectedNodeIds.add(edge.source);
          connectedNodeIds.add(edge.target);
        }
      });
    }

    const styledNodes = rawNodes.map((node) => {
      const data = node.data as Record<string, unknown>;
      const nodeType = data.nodeType as "idea" | "synthetic" | "outcome";
      const runtimeState = runtimeByNodeId[node.id];
      const isRuntimeRunningNode =
        isRunInProgress &&
        nodeType === "synthetic" &&
        runtimeState === "running";
      const isRuntimeDimmedNode =
        isRunInProgress && nodeType === "synthetic" && runtimeState === "idle";
      const isDisabledOutcome = nodeType === "outcome" && !isOutcomeReady && !isRunInProgress;
      const isDirty =
        nodeType === "synthetic" && chatUpdatedNodeIds.has(node.id);
      // "Stale upstream context": this agent ran in the last (partial) run,
      // but at least one peer agent was skipped — so it read old upstream output.
      const hasStaleUpstream =
        nodeType === "synthetic" &&
        isPartialRun &&
        lastRunSyntheticIds.has(node.id);

      return {
        ...node,
        data: {
          ...data,
          active:
            isRuntimeRunningNode ||
            (activeNodeId ? node.id === activeNodeId : false),
          dimmed:
            isRuntimeDimmedNode ||
            isDisabledOutcome ||
            (activeNodeId ? !connectedNodeIds.has(node.id) : false),
          hovered:
            Boolean(hoveredNodeId) &&
            !selectedNodeId &&
            node.id === hoveredNodeId,
          inPath:
            !isRunInProgress && activeNodeId && node.id !== activeNodeId
              ? connectedNodeIds.has(node.id)
              : false,
          isDirty,
          hasStaleUpstream,
        },
      };
    });

    const styledEdges = allEdges.map((edge) => {
      const hasActiveNode = Boolean(activeNodeId);
      const isConnectedToActive = activeNodeId
        ? edge.source === activeNodeId || edge.target === activeNodeId
        : false;
      const isSelectedEdge = edge.id === selectedEdgeId;

      return {
        ...edge,
        style: {
          ...(edge.style ?? {}),
          stroke: isSelectedEdge ? "var(--primary)" : edge.style?.stroke,
          strokeWidth: isSelectedEdge ? 2.4 : edge.style?.strokeWidth,
          opacity: getEdgeTypeOpacity(
            isRunInProgress ? false : hasActiveNode,
            isConnectedToActive,
          ),
        },
        data: {
          ...(edge.data as Record<string, unknown>),
          isSelectedEdge,
          hasActiveNode: isRunInProgress ? false : hasActiveNode,
          isConnectedToActive: isRunInProgress ? true : isConnectedToActive,
          isRunInProgress,
        },
      };
    });

    return {
      nodes: styledNodes,
      edges: styledEdges,
      nodeNames,
      statsByNode,
    };
  }, [
    theme,
    directorPhase,
    chatUpdatedNodeIds,
    hasIdea,
    showProcessGraph,
    selectedRevision,
    activeNodeId,
    ideaNodeId,
    hoveredNodeId,
    isOutcomeReady,
    isRunInProgress,
    outcomeNodeId,
    revisionEdges,
    selectedEdgeId,
    runtimeByNodeId,
    visibleSynthetics,
    ghostSynthetics,
    proposedSynthetics,
    selectedNodeId,
    onRevisionEdgesChange,
    lastRunSyntheticIds,
  ]);
}
