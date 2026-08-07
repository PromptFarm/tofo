import type { SyntheticNode } from "@/lib/planning/types";

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

export function composeVisibleSynthetics(
  baseVisibleSynthetics: SyntheticNode[],
  addedSynthetics: SyntheticNode[],
  removedSyntheticIds: string[],
): SyntheticNode[] {
  const removedIds = new Set(removedSyntheticIds);
  const baseNodes = baseVisibleSynthetics.filter(
    (synthetic) => !removedIds.has(synthetic.id),
  );
  const baseIds = new Set(baseNodes.map((synthetic) => synthetic.id));
  const addedNodes = addedSynthetics.filter((synthetic) => !baseIds.has(synthetic.id));
  return uniqueSyntheticsById([...baseNodes, ...addedNodes]);
}
