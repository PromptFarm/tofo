import type { SyntheticEdge } from "@/lib/planning/types";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";

export function applyLocalSessionPayloadChange(
  prev: SyntheticGraphPayload | null,
  payload: SyntheticGraphPayload,
  revisionEdges: SyntheticEdge[],
): SyntheticGraphPayload {
  if (!prev) {
    return {
      ...payload,
      edges: revisionEdges,
    };
  }

  return {
    ...payload,
    edges: revisionEdges,
    runHistory: payload.runHistory ?? prev.runHistory,
    preparedInputs: payload.preparedInputs,
  };
}
