import type { SyntheticEdge } from "@/lib/planning/types";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";

function buildSyntheticMap(payload: SyntheticGraphPayload) {
  return new Map(payload.synthetics.map((synthetic) => [synthetic.id, synthetic]));
}

export function mergeIncomingSessionPayload(
  prev: SyntheticGraphPayload | null,
  incoming: SyntheticGraphPayload,
  revisionEdges: SyntheticEdge[],
): SyntheticGraphPayload {
  if (!prev) {
    return {
      ...incoming,
      edges: revisionEdges,
    };
  }

  const incomingSyntheticMap = buildSyntheticMap(incoming);
  const hasMissingLocalSynthetics = prev.synthetics.some(
    (synthetic) => !incomingSyntheticMap.has(synthetic.id),
  );
  const serverClearedInputs =
    incoming.preparedInputs.decisions.length === 0 &&
    incoming.preparedInputs.clarifications.length === 0;
  const hadInputs =
    prev.preparedInputs.decisions.length > 0 ||
    prev.preparedInputs.clarifications.length > 0;

  return {
    ...incoming,
    edges: revisionEdges,
    synthetics: hasMissingLocalSynthetics ? prev.synthetics : incoming.synthetics,
    outputsBySyntheticId: hasMissingLocalSynthetics
      ? prev.outputsBySyntheticId
      : incoming.outputsBySyntheticId,
    conversationsBySyntheticId: hasMissingLocalSynthetics
      ? prev.conversationsBySyntheticId
      : incoming.conversationsBySyntheticId,
    runHistory: incoming.runHistory ?? prev.runHistory,
    preparedInputs:
      serverClearedInputs && hadInputs
        ? prev.preparedInputs
        : incoming.preparedInputs,
  };
}
