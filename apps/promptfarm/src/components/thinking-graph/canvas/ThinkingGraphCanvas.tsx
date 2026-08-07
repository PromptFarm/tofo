"use client";

import { useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type XYPosition,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

import { GRAPH_EDGE_TYPES, GRAPH_NODE_TYPES } from "../graphRegistry";
import { isPivotDragging } from "../dragState";

type ThinkingGraphCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  hasIdea: boolean;
  showProcessGraph: boolean;
  isRunInProgress: boolean;
  isOutcomeReady: boolean;
  selectedNodeId: string | null;
  directorPhase?: string;
  onSelectNode: (nodeId: string | null) => void;
  onSelectedEdgeChange: (edgeId: string | null) => void;
  onHoveredNodeChange: (nodeId: string | null) => void;
  onConnect: (connection: Connection) => void;
  onReconnect: Parameters<typeof ReactFlow>[0]["onReconnect"];
  onDropRole: (templateId: string, position: XYPosition) => void;
};

export function ThinkingGraphCanvas({
  nodes: nextNodes,
  edges: nextEdges,
  hasIdea,
  showProcessGraph,
  isRunInProgress,
  isOutcomeReady,
  selectedNodeId,
  directorPhase = "idle",
  onSelectNode,
  onSelectedEdgeChange,
  onHoveredNodeChange,
  onConnect,
  onReconnect,
  onDropRole,
}: ThinkingGraphCanvasProps) {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    Node,
    Edge
  > | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(nextNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(nextEdges);

  // Track which node IDs have been seen to detect new arrivals for entrance animation
  const prevNodeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Detect nodes that are new in this batch (not seen in the previous nextNodes)
    const prevIds = prevNodeIdsRef.current;
    const newEntries = new Map<string, number>();
    let entryIdx = 0;
    nextNodes.forEach((node) => {
      if (!prevIds.has(node.id)) {
        newEntries.set(node.id, entryIdx++);
      }
    });
    prevNodeIdsRef.current = new Set(nextNodes.map((n) => n.id));

    setNodes((prevNodes) => {
      const prevById = new Map(prevNodes.map((node) => [node.id, node]));

      return nextNodes.map((nextNode) => {
        const prevNode = prevById.get(nextNode.id);
        const entryIndex = newEntries.get(nextNode.id);

        if (!prevNode) {
          // Brand-new node: inject entryIndex for staggered entrance animation
          return entryIndex !== undefined
            ? { ...nextNode, data: { ...nextNode.data, entryIndex } }
            : nextNode;
        }

        return {
          ...nextNode,
          position: prevNode.position,
          selected: prevNode.selected,
          measured: prevNode.measured,
        };
      });
    });
  }, [nextNodes, setNodes]);

  useEffect(() => {
    if (isPivotDragging) return;
    setEdges(nextEdges);
  }, [nextEdges, setEdges]);

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }
    if (!hasIdea || nextNodes.length === 0) {
      return;
    }
    // Don't refit while ghost nodes are cycling — that would pan the camera on every appearance
    if (directorPhase === "running") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({ padding: 0.35, duration: 260 });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasIdea, nextNodes.length, reactFlowInstance, showProcessGraph, directorPhase]);

  useEffect(() => {
    if (selectedNodeId) {
      onHoveredNodeChange(null);
    }
  }, [onHoveredNodeChange, selectedNodeId]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={GRAPH_NODE_TYPES}
        edgeTypes={GRAPH_EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        onInit={setReactFlowInstance}
        onConnect={onConnect}
        onReconnect={onReconnect}
        nodesDraggable
        nodesConnectable={showProcessGraph && !isRunInProgress}
        edgesReconnectable={showProcessGraph && !isRunInProgress}
        onNodeClick={(_, node) => {
          const nodeData = node.data as {
            nodeType?: string;
            disabled?: boolean;
          };
          if (
            nodeData.nodeType === "outcome" &&
            (nodeData.disabled || !isOutcomeReady)
          ) {
            return;
          }
          onSelectedEdgeChange(null);
          onSelectNode(node.id);
        }}
        onEdgeClick={(_, edge) => {
          onHoveredNodeChange(null);
          onSelectNode(null);
          onSelectedEdgeChange(edge.id);
        }}
        onNodeMouseEnter={(_, node) => {
          if (!selectedNodeId && !isRunInProgress) {
            onHoveredNodeChange(node.id);
          }
        }}
        onNodeMouseLeave={() => {
          if (!selectedNodeId && !isRunInProgress) {
            onHoveredNodeChange(null);
          }
        }}
        onPaneClick={() => {
          onHoveredNodeChange(null);
          onSelectNode(null);
          onSelectedEdgeChange(null);
        }}
        proOptions={{ hideAttribution: true }}
        elevateEdgesOnSelect={true}
        connectionLineType={ConnectionLineType.Straight}
        style={{ background: "transparent" }}
        onDrop={(event) => {
          event.preventDefault();
          if (!reactFlowInstance) {
            return;
          }

          setDragOverCanvas(false);
          const templateId = event.dataTransfer.getData("application/pf-role");
          if (!templateId) {
            return;
          }
          onDropRole(
            templateId,
            reactFlowInstance.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
          );
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragOverCanvas(true);
        }}
        onDragLeave={() => setDragOverCanvas(false)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1}
          color="var(--grid-dot)"
        />
      </ReactFlow>

      {dragOverCanvas && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            border: `2px dashed var(--primary)`,
            borderRadius: 4,
            background: "var(--primary-container)",
            opacity: 0.18,
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
