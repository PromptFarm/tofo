/**
 * Stable module-level registries for ReactFlow node and edge types.
 *
 * These MUST live outside any React component (and outside any file that
 * defines a component) so the object references never change between renders,
 * remounts, or React Strict Mode double-invocations.
 *
 * ReactFlow compares nodeTypes/edgeTypes by reference on every render and
 * fires warning #002 if they differ:
 * https://reactflow.dev/error#002
 */
import type { EdgeTypes, NodeTypes } from "@xyflow/react";
import { IdeaNode } from "./IdeaNode";
import { FlowEdge } from "./FlowEdge";

export const GRAPH_NODE_TYPES: NodeTypes = {
  idea: IdeaNode,
} as const;

export const GRAPH_EDGE_TYPES: EdgeTypes = {
  flow: FlowEdge,
} as const;

