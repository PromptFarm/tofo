import type { DomainVerdict, RunSummaryReport } from "@/lib/thinking-graph/server/types";

export type RunDelta = {
  /** Agent names whose verdict improved (no_go/conditional → go). */
  improvedDomains: string[];
  /** Agent names whose verdict worsened (go/conditional → no_go). */
  worsenedDomains: string[];
  /** Conflict titles present in current but absent in previous. */
  newConflicts: string[];
  /** Conflict titles present in previous but absent in current. */
  resolvedConflicts: string[];
  /** Change in number of open decision families. Positive = more decisions, negative = fewer. */
  openDecisionsDelta: number;
  /** Overall direction: "better" when more domains improved than worsened, "worse" for the inverse. */
  direction: "better" | "worse" | "same";
};

/** Returns true when verdict b is strictly worse than verdict a. */
function isWorse(a: DomainVerdict, b: DomainVerdict): boolean {
  const rank: Record<DomainVerdict, number> = { go: 0, conditional: 1, no_go: 2 };
  return rank[b] > rank[a];
}

/** Returns true when verdict b is strictly better than verdict a. */
function isBetter(a: DomainVerdict, b: DomainVerdict): boolean {
  const rank: Record<DomainVerdict, number> = { go: 0, conditional: 1, no_go: 2 };
  return rank[b] < rank[a];
}

/**
 * Computes the delta between a current run summary and the immediately preceding one.
 * Pure function — no side effects, no LLM calls.
 */
export function computeRunDelta(
  current: RunSummaryReport,
  previous: RunSummaryReport,
): RunDelta {
  // ── Domain verdict changes ──────────────────────────────────────────────

  const previousVerdictById = new Map<string, DomainVerdict>(
    previous.domainGates.map((g) => [g.syntheticId, g.verdict]),
  );

  const improvedDomains: string[] = [];
  const worsenedDomains: string[] = [];

  for (const gate of current.domainGates) {
    const prev = previousVerdictById.get(gate.syntheticId);
    if (prev === undefined) continue; // new agent — not a change
    if (isBetter(prev, gate.verdict)) improvedDomains.push(gate.syntheticName);
    else if (isWorse(prev, gate.verdict)) worsenedDomains.push(gate.syntheticName);
  }

  // ── Conflict changes ────────────────────────────────────────────────────

  const previousConflictTitles = new Set(
    previous.conflictMap.map((c) => c.title.trim().toLowerCase()),
  );
  const currentConflictTitles = new Set(
    current.conflictMap.map((c) => c.title.trim().toLowerCase()),
  );

  // Preserve original casing for display
  const newConflicts = current.conflictMap
    .filter((c) => !previousConflictTitles.has(c.title.trim().toLowerCase()))
    .map((c) => c.title);

  const resolvedConflicts = previous.conflictMap
    .filter((c) => !currentConflictTitles.has(c.title.trim().toLowerCase()))
    .map((c) => c.title);

  // ── Open decision delta ─────────────────────────────────────────────────

  const openDecisionsDelta =
    current.decisionFamilies.length - previous.decisionFamilies.length;

  // ── Overall direction ───────────────────────────────────────────────────

  let direction: RunDelta["direction"];
  if (improvedDomains.length > worsenedDomains.length) {
    direction = "better";
  } else if (worsenedDomains.length > improvedDomains.length) {
    direction = "worse";
  } else {
    direction = "same";
  }

  return {
    improvedDomains,
    worsenedDomains,
    newConflicts,
    resolvedConflicts,
    openDecisionsDelta,
    direction,
  };
}
