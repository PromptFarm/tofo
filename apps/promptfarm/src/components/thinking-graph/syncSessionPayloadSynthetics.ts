import type { SyntheticNode } from "@/lib/planning/types";
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";

function uniqueSyntheticsById(synthetics: SyntheticNode[]): SyntheticNode[] {
  const seen = new Set<string>();
  const result: SyntheticNode[] = [];

  for (const synthetic of synthetics) {
    if (seen.has(synthetic.id)) {
      continue;
    }
    seen.add(synthetic.id);
    result.push(synthetic);
  }

  return result;
}

function pruneRecordByVisibleSyntheticIds<T>(
  record: Record<string, T>,
  visibleSyntheticIds: Set<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([syntheticId]) => visibleSyntheticIds.has(syntheticId)),
  );
}

export function syncSessionPayloadSynthetics(
  payload: SyntheticGraphPayload,
  visibleSynthetics: SyntheticNode[],
): SyntheticGraphPayload {
  const nextSynthetics = uniqueSyntheticsById(visibleSynthetics);
  const visibleSyntheticIds = new Set(nextSynthetics.map((synthetic) => synthetic.id));

  return {
    ...payload,
    synthetics: nextSynthetics.map((synthetic) => ({ ...synthetic })),
    outputsBySyntheticId: pruneRecordByVisibleSyntheticIds(
      payload.outputsBySyntheticId,
      visibleSyntheticIds,
    ),
    conversationsBySyntheticId: pruneRecordByVisibleSyntheticIds(
      payload.conversationsBySyntheticId,
      visibleSyntheticIds,
    ),
  };
}
