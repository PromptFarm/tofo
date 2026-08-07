import type { RunStats } from "@/lib/run-context";
import type { IterationNode, SyntheticNode } from "@/lib/planning/types";
import type {
  PersistentItem,
  RunSummaryConflict,
  SyntheticGraphPayload,
  SyntheticOutputJson,
  SyntheticReport,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
  SyntheticPreparedInputSource,
} from "@/lib/thinking-graph/server/types";
import { isAdvisorReport } from "@/lib/thinking-graph/server/types";
import type { RuntimeNodeStatus, SimulationRun, SyntheticDisplayStatus } from "./runtime/runtimeTypes";

// ---------------------------------------------------------------------------
// Inline types (used across multiple utils)
// ---------------------------------------------------------------------------

export type DecisionRequiredPayload = {
  type: "decision_required";
  syntheticId: string;
  familyId?: string | null;
  title: string;
  question: string;
  options: { id: string; label: string; description: string }[];
  recommendedOptionId?: string | null;
  required: true;
  /** Edge that triggered this decision (e.g. a tension edge between two agents). */
  relatedEdgeId?: string | null;
  /** The other synthetic node on that edge — counterpart in a conflict or oversight. */
  relatedNodeId?: string | null;
  /** Display name of the counterpart node, for UI rendering without a lookup. */
  relatedNodeName?: string | null;
};

export type AppliedDecisionSelection = SyntheticPreparedDecision;

export type AppliedStructuredClarification = SyntheticPreparedClarification;

function getOutputRecommendationText(
  output: SyntheticOutputJson | null | undefined,
): string | null {
  if (!output) return null;
  if ("recommendation" in output) {
    const report = output as SyntheticReport;
    return (
      report.recommendation?.trim() ||
      report.handoff?.trim() ||
      report.summary?.trim() ||
      null
    );
  }
  return output.topRecommendation?.trim() || null;
}

// ---------------------------------------------------------------------------
// Token usage accumulation
// ---------------------------------------------------------------------------

export function accumulateTokenUsageAcrossRuns(
  runs: SimulationRun[],
  upToRunId?: string | null,
): RunStats["tokenUsage"] {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let hasPromptTokens = false;
  let hasCompletionTokens = false;
  let hasTotalTokens = false;

  for (const run of runs) {
    const usage = run.stats?.tokenUsage;
    if (usage?.promptTokens !== null && usage?.promptTokens !== undefined) {
      promptTokens += usage.promptTokens;
      hasPromptTokens = true;
    }
    if (
      usage?.completionTokens !== null &&
      usage?.completionTokens !== undefined
    ) {
      completionTokens += usage.completionTokens;
      hasCompletionTokens = true;
    }
    if (usage?.totalTokens !== null && usage?.totalTokens !== undefined) {
      totalTokens += usage.totalTokens;
      hasTotalTokens = true;
    }

    if (upToRunId && run.id === upToRunId) {
      break;
    }
  }

  return {
    promptTokens: hasPromptTokens ? promptTokens : null,
    completionTokens: hasCompletionTokens ? completionTokens : null,
    totalTokens: hasTotalTokens ? totalTokens : null,
  };
}

export function withCumulativeTokenUsage(
  stats: RunStats | null | undefined,
  runs: SimulationRun[],
  upToRunId?: string | null,
): RunStats | null {
  if (!stats) {
    return null;
  }

  return {
    ...stats,
    tokenUsage: accumulateTokenUsageAcrossRuns(runs, upToRunId),
  };
}

// ---------------------------------------------------------------------------
// Graph traversal
// ---------------------------------------------------------------------------

export function getDownstreamNodes(
  nodeIds: string[],
  sourceNodeIds: Set<string>,
  dependencyEdges: { from: string; to: string }[],
): Set<string> {
  const feedsInto = new Map<string, Set<string>>(
    nodeIds.map((id) => [id, new Set()]),
  );
  dependencyEdges.forEach(({ from, to }) => {
    feedsInto.get(from)?.add(to);
  });
  const result = new Set<string>(sourceNodeIds);
  const queue = [...sourceNodeIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of feedsInto.get(current) ?? new Set<string>()) {
      if (!result.has(next)) {
        result.add(next);
        queue.push(next);
      }
    }
  }
  return result;
}

export function getVisibleSynthetics(revision: IterationNode): SyntheticNode[] {
  const run = revision.graphRevision.run;
  return run.stage === "proposal" || run.stage === "editing"
    ? run.proposedSynthetics
    : run.activeSynthetics;
}

export function hasDependencyCycle(
  nodeIds: string[],
  edges: { from: string; to: string }[],
): boolean {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const outMap = new Map<string, string[]>(
    nodeIds.map((id) => [id, [] as string[]]),
  );

  edges.forEach((edge) => {
    if (!inDegree.has(edge.from) || !inDegree.has(edge.to)) {
      return;
    }
    outMap.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((count, nodeId) => {
    if (count === 0) {
      queue.push(nodeId);
    }
  });

  let visitedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    visitedCount += 1;
    (outMap.get(current) ?? []).forEach((next) => {
      const nextCount = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    });
  }

  return visitedCount !== nodeIds.length;
}

// ---------------------------------------------------------------------------
// Edge / handle helpers
// ---------------------------------------------------------------------------

export function getHandlesBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right-source", targetHandle: "left-target" }
      : { sourceHandle: "left-source", targetHandle: "right-target" };
  }

  return dy >= 0
    ? { sourceHandle: "bottom-source", targetHandle: "top-target" }
    : { sourceHandle: "top-source", targetHandle: "bottom-target" };
}

export function getEdgeTypeOpacity(
  hasActiveNode: boolean,
  isConnectedToActive: boolean,
): number {
  if (!hasActiveNode) {
    return 0.82;
  }
  return isConnectedToActive ? 1 : 0.1;
}

export function getSyntheticDisplayStatus(
  runtimeStatus: RuntimeNodeStatus | undefined,
): SyntheticDisplayStatus {
  if (runtimeStatus === "running") return "running";
  if (runtimeStatus === "done") return "done";
  if (runtimeStatus === "conflict") return "conflict";
  if (runtimeStatus === "blocked") return "blocked";
  if (runtimeStatus === "needs_rerun") return "needs_rerun";
  if (runtimeStatus === "needs_rerun_conflict") return "needs_rerun_conflict";
  return "ready";
}

// ---------------------------------------------------------------------------
// Prompt composition
// ---------------------------------------------------------------------------

export function buildAppliedChatDigest(input: {
  payload: SyntheticGraphPayload | null;
  synthetics: SyntheticNode[];
}): string[] {
  if (!input.payload) {
    return [];
  }

  const syntheticNameById = Object.fromEntries(
    input.synthetics.map((synthetic) => [synthetic.id, synthetic.name]),
  );

  return Object.entries(input.payload.conversationsBySyntheticId).flatMap(
    ([syntheticId, messages]) => {
      const syntheticName = syntheticNameById[syntheticId] ?? syntheticId;

      return messages
        .filter((message) => message.includeInNextIteration)
        .map((message) => `${syntheticName}: ${message.text}`);
    },
  );
}

export function composeIterationDraft(input: {
  basePrompt: string;
  recommendationDigest: string[];
  appliedChatDigest: string[];
}): string {
  const sections = [input.basePrompt.trim()].filter(Boolean);

  if (input.recommendationDigest.length > 0) {
    sections.push(
      [
        "Integrate the following synthetic recommendations into the next iteration:",
        ...input.recommendationDigest.map((line) => `- ${line}`),
      ].join("\n"),
    );
  }

  if (input.appliedChatDigest.length > 0) {
    sections.push(
      [
        "Apply these user-approved chat clarifications as hard constraints for the next iteration:",
        ...input.appliedChatDigest.map((line) => `- ${line}`),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

export function composeAppliedChatSection(appliedChatDigest: string[]): string {
  if (appliedChatDigest.length === 0) {
    return "";
  }
  return [
    "Apply these user-approved chat clarifications as hard constraints for the next iteration:",
    ...appliedChatDigest.map((line) => `- ${line}`),
  ].join("\n");
}

export function buildRecommendationDigestFromOutputs(input: {
  synthetics: SyntheticNode[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null | undefined>;
}): string[] {
  return input.synthetics.flatMap((synthetic) => {
    const output = input.outputsBySyntheticId[synthetic.id];
    const recommendation = getOutputRecommendationText(output);

    if (!recommendation) {
      return [];
    }

    return [`${synthetic.name}: ${recommendation}`];
  });
}

export function composeConflictDirective(conflict: RunSummaryConflict): string {
  return [
    "Conflict-resolution directive (mandatory for this iteration):",
    `- Raised by: ${conflict.raisedBy ?? "system"}`,
    `- Conflict: ${conflict.description}`,
    `- Suggested path: ${conflict.suggestion}`,
    "- This conflict must be explicitly resolved in this iteration.",
    "- Do not repeat previous wording without substantive changes.",
    "- In your output, provide concrete resolution evidence:",
    "  - resolutionDecision: what exact decision you made to resolve the conflict",
    "  - whyThisResolvesConflict: why this decision resolves the tension",
    "  - implementationSteps: 2 to 5 concrete next steps",
    "  - residualRisks: remaining risks after the decision",
    "- If you cannot resolve the conflict yet, state the exact blocker and what is required to unblock it.",
  ].join("\n");
}

export function summarizePreparedInputSources(
  items: Array<{ source?: SyntheticPreparedInputSource }>,
): "defaults" | "manual" | "mixed" {
  const hasDefaults = items.some((item) => item.source === "defaults");
  const hasManual = items.some(
    (item) => item.source === undefined || item.source === "manual_edit",
  );

  if (hasDefaults && hasManual) {
    return "mixed";
  }

  return hasDefaults ? "defaults" : "manual";
}

export function composeDecisionSelectionDirective(input: {
  decision: DecisionRequiredPayload;
  optionId: string;
}): string {
  const option = input.decision.options.find((item) => item.id === input.optionId);
  if (!option) {
    return "";
  }

  return [
    `User decision selected for ${input.decision.syntheticId}:`,
    `- Decision family: ${input.decision.familyId ?? input.decision.title}`,
    `- Decision title: ${input.decision.title}`,
    `- Selected option: ${option.label}`,
    `- Why selected: ${option.description}`,
    "- Treat this as a hard constraint for this iteration.",
    "- Reflect the chosen option in one concrete trade-off tied to the active conflict.",
    "- Scope lock: do not output a full project plan; output conflict-scoped resolution only.",
    "- Limit execution steps to 2-3 measurable items with owner, deliverable, done_when.",
    "- Explicitly state what is out_of_scope in this iteration.",
  ].join("\n");
}

export function normalizeDecisionDirectivesInPrompt(prompt: string): string {
  const lines = prompt.split("\n");
  const decisionBlocks: {
    syntheticId: string;
    start: number;
    end: number;
  }[] = [];
  const clarificationBlocks: {
    syntheticId: string;
    start: number;
    end: number;
  }[] = [];
  const conflictBlocks: { start: number; end: number }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]?.trim() ?? "";
    if (line.startsWith("Conflict-resolution directive (mandatory")) {
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]?.trim() ?? "";
        if (
          next.startsWith("User decision selected for ") ||
          next.startsWith("User clarification answers for ") ||
          next.startsWith("Integrate the following synthetic recommendations") ||
          next.startsWith("Apply these user-approved chat clarifications") ||
          next.startsWith("Conflict-resolution directive (mandatory")
        ) {
          break;
        }
        j += 1;
      }
      conflictBlocks.push({ start: i, end: j - 1 });
      i = j;
      continue;
    }

    const match = line.match(/^User decision selected for (.+):$/);
    if (match?.[1]) {
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j]?.trim() ?? "";
        if (
          next.startsWith("User decision selected for ") ||
          next.startsWith("User clarification answers for ") ||
          next.startsWith("Integrate the following synthetic recommendations") ||
          next.startsWith("Apply these user-approved chat clarifications") ||
          next.startsWith("Conflict-resolution directive (mandatory")
        ) {
          break;
        }
        j += 1;
      }

      decisionBlocks.push({
        syntheticId: match[1].trim(),
        start: i,
        end: j - 1,
      });
      i = j;
      continue;
    }

    const clarificationMatch = line.match(/^User clarification answers for (.+):$/);
    if (!clarificationMatch?.[1]) {
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j]?.trim() ?? "";
      if (
        next.startsWith("User decision selected for ") ||
        next.startsWith("User clarification answers for ") ||
        next.startsWith("Integrate the following synthetic recommendations") ||
        next.startsWith("Apply these user-approved chat clarifications") ||
        next.startsWith("Conflict-resolution directive (mandatory")
      ) {
        break;
      }
      j += 1;
    }

    clarificationBlocks.push({
      syntheticId: clarificationMatch[1].trim(),
      start: i,
      end: j - 1,
    });
    i = j;
  }

  if (
    decisionBlocks.length <= 1 &&
    clarificationBlocks.length <= 1 &&
    conflictBlocks.length <= 1
  ) {
    return prompt;
  }

  const latestStartBySynthetic = new Map<string, number>();
  decisionBlocks.forEach((block) => {
    latestStartBySynthetic.set(block.syntheticId, block.start);
  });

  const removeLineIndexes = new Set<number>();
  decisionBlocks.forEach((block) => {
    const latestStart = latestStartBySynthetic.get(block.syntheticId);
    if (latestStart === block.start) {
      return;
    }
    for (let k = block.start; k <= block.end; k += 1) {
      removeLineIndexes.add(k);
    }
  });
  const latestClarificationStartBySynthetic = new Map<string, number>();
  clarificationBlocks.forEach((block) => {
    latestClarificationStartBySynthetic.set(block.syntheticId, block.start);
  });
  clarificationBlocks.forEach((block) => {
    const latestStart = latestClarificationStartBySynthetic.get(block.syntheticId);
    if (latestStart === block.start) {
      return;
    }
    for (let k = block.start; k <= block.end; k += 1) {
      removeLineIndexes.add(k);
    }
  });
  if (conflictBlocks.length > 1) {
    const latestConflictStart = conflictBlocks[conflictBlocks.length - 1]?.start;
    conflictBlocks.forEach((block) => {
      if (block.start === latestConflictStart) {
        return;
      }
      for (let k = block.start; k <= block.end; k += 1) {
        removeLineIndexes.add(k);
      }
    });
  }

  return lines
    .filter((_, index) => !removeLineIndexes.has(index))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mergePromptSections(base: string, extraSections: string[]): string {
  const sections = [base.trim(), ...extraSections.map((item) => item.trim())].filter(
    Boolean,
  );
  return sections.join("\n\n");
}

export function mergePromptDraftWithIdea(input: {
  ideaPrompt: string;
  draftPrompt: string;
}): string {
  const idea = input.ideaPrompt.trim();
  const draft = input.draftPrompt.trim();
  if (!idea) return draft;
  if (!draft) return idea;
  if (idea === draft) return draft;
  if (idea.includes(draft)) return idea;
  if (draft.includes(idea)) return draft;
  const structuredMarkers = [
    "Integrate the following synthetic recommendations into the next iteration:",
    "Apply these user-approved chat clarifications as hard constraints for the next iteration:",
    "Conflict-resolution directive (mandatory for this iteration):",
    "User decision selected for ",
    "User clarification answers for ",
  ];
  const draftLooksStructured = structuredMarkers.some((marker) =>
    draft.includes(marker),
  );
  if (draftLooksStructured) {
    return draft;
  }
  return mergePromptSections(idea, [draft]);
}

export function composeStructuredClarificationDirective(
  input: AppliedStructuredClarification,
): string {
  return [
    `User clarification answers for ${input.syntheticId}:`,
    `- Synthetic name: ${input.syntheticName}`,
    ...input.answers.flatMap((answer) => [
      `- Question (${answer.questionId}): ${answer.questionLabel}`,
      `- Approved answer: ${answer.answer}`,
    ]),
    "- Treat these answers as hard constraints for the next iteration.",
    "- Do not re-ask these exact questions unless a new blocker appears.",
  ].join("\n");
}

export function ensureAppliedChatDigestInPrompt(input: {
  prompt: string;
  appliedChatDigest: string[];
}): string {
  if (input.appliedChatDigest.length === 0) {
    return input.prompt;
  }
  const header =
    "Apply these user-approved chat clarifications as hard constraints for the next iteration:";
  if (input.prompt.includes(header)) {
    return input.prompt;
  }
  const chatSection = composeAppliedChatSection(input.appliedChatDigest);
  if (!chatSection) {
    return input.prompt;
  }
  return mergePromptSections(input.prompt, [chatSection]);
}

export function saveJsonSnapshotToFile(input: {
  filenamePrefix: string;
  payload: unknown;
}): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${input.filenamePrefix}-${timestamp}.json`;
  const blob = new Blob([JSON.stringify(input.payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function composeResponsibleAgentQuestion(conflict: RunSummaryConflict): string {
  return [
    "You raised this conflict. Resolve it now with one concrete trade-off for this iteration only.",
    `Conflict: ${conflict.description}`,
    `Suggested path to refine: ${conflict.suggestion}`,
    "Scope lock (strict):",
    "- Do not produce a full project plan.",
    "- Limit output to this conflict only.",
    "- Keep implementationSteps to 2-3 items max, each tied to this conflict.",
    "- Each step must include: owner, deliverable, done_when.",
    "Answer strictly in this structure:",
    "- conflictPair: the two competing objectives in this conflict (X vs Y)",
    "- chosenDirection: what we choose for this iteration and why",
    "- rejectedAlternative: what we explicitly defer/reject now and why",
    "- iterationScope: in_scope and out_of_scope for this iteration",
    "- implementationSteps: 2-3 conflict-scoped measurable steps only",
    "- doneWhen: 2-3 verifiable checks proving this conflict is resolved for this iteration",
    "- residualRisks: 1-2 remaining risks after this decision",
    "If still unresolved, state exact blocker and required unblock action.",
  ].join("\n");
}

export function composeRoutingClarificationQuestion(input: {
  conflict: RunSummaryConflict
  targetSyntheticName: string
  optionLabel: string
  optionDescription: string
}): string {
  return [
    `Resolve this blocker for the next handoff to ${input.targetSyntheticName}.`,
    `Conflict: ${input.conflict.description}`,
    `Suggested path: ${input.conflict.suggestion}`,
    `Clarification needed: ${input.optionLabel}`,
    `Constraint: ${input.optionDescription}`,
    "Answer only for the next handoff.",
    "Choose the smallest possible next-step handoff that unblocks the pipeline now.",
    "The deliverable must be one immediate artifact or task for the next iteration only.",
    "The deliverable must be phrased as a concrete action with a narrow object and boundary.",
    "Bad deliverables are broad nouns or vague completion claims like: full spec, complete design doc, full implementation plan, or technical discovery.",
    "Good deliverables look like: draft movement tuning brief, define HUD widget states, write collision edge-case checklist, prototype jump arc constants, or review onboarding wireframe.",
    "The done_when line must describe one observable check for this exact deliverable, not generic document completeness.",
    "Do not ask for a broad project evaluation, full technical discovery, or a complete design plan unless the conflict explicitly requires that.",
    "Prefer a concrete handoff like: implementation brief, wireframe pass, mechanic spec, engine spike, HUD task, or validation checklist.",
    "Return exactly these lines:",
    `- owner: ${input.targetSyntheticName}`,
    "- deliverable: one narrow next action in the format <verb> <artifact_or_task> for <specific scope>",
    "- done_when: one observable check in the format <artifact_or_task exists and contains X/Y/Z> or <task was completed and verified by N>",
    "- why_this_owner: one short reason this owner is the right next step",
    "Do not produce a full project plan.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Persistent items extraction
// ---------------------------------------------------------------------------

/**
 * Append a structured block of open persistent items to a prompt.
 * Returns the prompt unchanged if there are no open items.
 * Items are grouped by type so agents see a clear, scannable section.
 */
export function appendPersistentItemsToPrompt(
  prompt: string,
  openItems: PersistentItem[],
): string {
  if (openItems.length === 0) return prompt;

  const clarifications = openItems.filter((i) => i.type === "clarification");
  const risks = openItems.filter((i) => i.type === "risk-fact");
  const missing = openItems.filter((i) => i.type === "missing-info");

  const lines: string[] = ["\n\n---"];

  if (clarifications.length > 0) {
    lines.push(
      "Open clarifications (not yet answered — treat as unresolved blockers that must appear in your analysis):",
    );
    for (const item of clarifications) {
      lines.push(`- [${item.raisedByName}]: "${item.text}"`);
    }
  }

  if (risks.length > 0) {
    lines.push(
      "Persistent risks (inherited from prior runs — you MUST either confirm the risk still applies or explain specifically why it is now closed):",
    );
    for (const item of risks) {
      lines.push(`- [${item.raisedByName}]: "${item.text}"`);
    }
  }

  if (missing.length > 0) {
    lines.push(
      "Missing information (blocks confident assessment — acknowledge each gap or explain how it has been resolved):",
    );
    for (const item of missing) {
      lines.push(`- [${item.raisedByName}]: "${item.text}"`);
    }
  }

  lines.push("---");

  return prompt + lines.join("\n");
}

/**
 * Extract risk-fact and missing-info items from a completed run's outputs.
 * Called once per run; deduplication against already-open items is handled
 * by the store's addPersistentItems action.
 */
export function extractPersistentItems(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  synthetics: SyntheticNode[],
  runId: string,
): PersistentItem[] {
  const items: PersistentItem[] = [];
  const nameById = new Map(synthetics.map((s) => [s.id, s.name]));

  for (const [syntheticId, output] of Object.entries(outputsBySyntheticId)) {
    if (!output || isAdvisorReport(output)) continue;

    const raisedByName = nameById.get(syntheticId) ?? syntheticId;

    for (const risk of output.keyRisks) {
      const text = risk.trim();
      if (!text) continue;
      items.push({
        id: `${runId}-${syntheticId}-risk-${Math.random().toString(36).slice(2)}`,
        type: "risk-fact",
        text,
        raisedBy: syntheticId,
        raisedByName,
        raisedInRunId: runId,
      });
    }

    const missingInfo = output.operational?.missingInformation ?? [];
    for (const info of missingInfo) {
      const text = info.trim();
      if (!text) continue;
      items.push({
        id: `${runId}-${syntheticId}-missing-${Math.random().toString(36).slice(2)}`,
        type: "missing-info",
        text,
        raisedBy: syntheticId,
        raisedByName,
        raisedInRunId: runId,
      });
    }
  }

  return items;
}
