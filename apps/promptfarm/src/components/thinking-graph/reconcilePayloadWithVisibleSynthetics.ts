import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types";
import type { SyntheticNode } from "@/lib/planning/types";
import { syncSessionPayloadSynthetics } from "./syncSessionPayloadSynthetics";

export function reconcilePayloadWithVisibleSynthetics(
  payload: SyntheticGraphPayload,
  visibleSynthetics: SyntheticNode[],
): SyntheticGraphPayload {
  if (visibleSynthetics.length === 0) {
    return payload;
  }

  return syncSessionPayloadSynthetics(payload, visibleSynthetics);
}
