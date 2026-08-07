/**
 * Pure helper functions shared across OutcomeReport tabs.
 * No React components here — only data-transformation utilities.
 */
import type {
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticReport,
  SyntheticUserFacingBlock,
  SyntheticReadinessStatus,
} from "@/lib/thinking-graph/server/types";
import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types";
import type {
  ClassifiedNextMove,
  DecisionRequiredOption,
  DecisionRequiredPayload,
  NextMoveMode,
  ValidationReportLike,
  AgentCardViewModel,
} from "./OutcomeReport.types";

export { formatPreparedClarificationHeader, formatPreparedDecisionInline } from "@/lib/thinking-graph/userFacingPresentation";

export const MONO = "var(--font-jetbrains-mono), monospace";
export const SANS = "var(--font-manrope), system-ui, sans-serif";

type SyntheticReportWithOperational = SyntheticReport & {
  operational: NonNullable<SyntheticReport["operational"]>;
};

type SyntheticUserFacingFromOperational = NonNullable<
  SyntheticReportWithOperational["operational"]["userFacing"]
>;

function asSyntheticReport(
  output: SyntheticOutputJson | null | undefined,
): SyntheticReport | null {
  if (!output || !("details" in output)) return null;
  return output;
}

function hasOperationalOutput(
  output: SyntheticOutputJson | null | undefined,
): output is SyntheticReportWithOperational {
  return Boolean(asSyntheticReport(output)?.operational);
}

function getOperational(
  output: SyntheticOutputJson | null | undefined,
) {
  return asSyntheticReport(output)?.operational ?? null;
}

function getOutputSummary(
  output: SyntheticOutputJson | null | undefined,
): string | null {
  if (!output) return null;
  if ("summary" in output && typeof output.summary === "string") {
    return output.summary;
  }
  if ("topRecommendation" in output && typeof output.topRecommendation === "string") {
    return output.topRecommendation;
  }
  return null;
}

// ── Token usage ──────────────────────────────────────────────────────────────

export function extractTokenUsage(output: SyntheticOutputJson | null): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
} {
  const raw = output?.raw;
  if (!raw || typeof raw !== "object")
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  const usage = (raw as { tokenUsage?: unknown }).tokenUsage;
  if (!usage || typeof usage !== "object")
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  const u = usage as { promptTokens?: unknown; completionTokens?: unknown; totalTokens?: unknown };
  const promptTokens = typeof u.promptTokens === "number" ? u.promptTokens : null;
  const completionTokens = typeof u.completionTokens === "number" ? u.completionTokens : null;
  const totalTokens =
    typeof u.totalTokens === "number"
      ? u.totalTokens
      : promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null;
  return { promptTokens, completionTokens, totalTokens };
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Operational output collectors ────────────────────────────────────────────

export function collectOperationalOutputs(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): SyntheticReportWithOperational[] {
  return Object.values(outputsBySyntheticId).filter(hasOperationalOutput);
}

export function collectOperationalReadinessEntries(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): Array<{
  syntheticId: string;
  syntheticName: string;
  status: SyntheticReadinessStatus;
  blocked: boolean;
  blockers: string[];
  displayStatus: string;
}> {
  return collectOperationalOutputs(outputsBySyntheticId).map((output) => {
    const readiness = output.operational!.readiness;
    const userFacingState = output.operational?.userFacing?.state;
    return {
      syntheticId: output.syntheticId,
      syntheticName: output.syntheticName,
      status: readiness.status,
      blocked: readiness.blocked,
      blockers: readiness.blockers,
      displayStatus:
        getUserFacingStateLabel(userFacingState) ??
        formatReadinessStatus(readiness.status),
    };
  });
}

export function collectOperationalClarificationEntries(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
) {
  return collectOperationalOutputs(outputsBySyntheticId).flatMap((output) =>
    output.operational!.clarificationRequests.map((item) => ({
      syntheticId: output.syntheticId,
      syntheticName: output.syntheticName,
      id: item.id,
      question: item.question,
      whyItMatters: item.whyItMatters,
      required: item.required,
    })),
  );
}

export function collectOperationalDecisionEntries(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
) {
  return collectOperationalOutputs(outputsBySyntheticId).flatMap((output) =>
    output.operational!.recommendedDecisions.map((item) => ({
      syntheticId: output.syntheticId,
      syntheticName: output.syntheticName,
      id: item.id,
      title: item.title,
      options: item.options,
      recommendedOption: item.recommendedOption,
      reason: item.reason,
    })),
  );
}

export function collectOperationalArtifactEntries(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
) {
  return collectOperationalOutputs(outputsBySyntheticId).flatMap((output) => {
    const negativePattern =
      /\b(not ready|not created|not developed|not defined|missing|unresolved|не |не\s|нет |не создан|не разработан|не определен|не определён)\b/i;
    return output
      .operational!.artifactsReady.filter((item) => !negativePattern.test(item))
      .map((item) => ({
        syntheticId: output.syntheticId,
        syntheticName: output.syntheticName,
        artifact: item,
      }));
  });
}

export function collectOperationalMissingEntries(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
) {
  const negativePattern =
    /\b(not ready|not created|not developed|not defined|missing|unresolved|не |не\s|нет |не создан|не разработан|не определен|не определён)\b/i;
  return collectOperationalOutputs(outputsBySyntheticId).flatMap((output) => [
    ...output.operational!.missingInformation.map((item) => ({
      syntheticId: output.syntheticId,
      syntheticName: output.syntheticName,
      item,
    })),
    ...output
      .operational!.artifactsReady.filter((item) => negativePattern.test(item))
      .map((item) => ({
        syntheticId: output.syntheticId,
        syntheticName: output.syntheticName,
        item,
      })),
  ]);
}

// ── Handoff collectors ───────────────────────────────────────────────────────

export function getPassedDirectedHandoffs(
  output: SyntheticOutputJson | null | undefined,
) {
  const report = asSyntheticReport(output);
  return report?.directedHandoffs ?? report?.operational?.directedHandoffs ?? [];
}

export function getReceivedDirectedHandoffs(input: {
  syntheticId: string;
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
}) {
  return Object.values(input.outputsBySyntheticId).flatMap((output) => {
    if (!output) return [];
    const matching = getPassedDirectedHandoffs(output).filter(
      (handoff) => handoff.toSyntheticId === input.syntheticId,
    );
    return matching.map((handoff) => ({
      fromSyntheticId: output.syntheticId,
      fromSyntheticName: output.syntheticName,
      handoff,
    }));
  });
}

export function collectHandoffRows(input: {
  synthetics: SyntheticNode[];
  edges: SyntheticEdge[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>;
}) {
  const syntheticNames = new Map(
    input.synthetics.map((s) => [s.id, s.name] as const),
  );
  return input.edges
    .filter((edge) => edge.type !== "structural")
    .map((edge) => {
      const sourceOutput = input.outputsBySyntheticId[edge.from];
      const handoff =
        getPassedDirectedHandoffs(sourceOutput).find(
          (item) => item.toSyntheticId === edge.to,
        ) ?? null;
      return {
        fromSyntheticId: edge.from,
        fromSyntheticName: syntheticNames.get(edge.from) ?? edge.from,
        toSyntheticId: edge.to,
        toSyntheticName: syntheticNames.get(edge.to) ?? edge.to,
        handoff,
        usesFallback: handoff === null,
      };
    });
}

// ── Card helpers ─────────────────────────────────────────────────────────────

export function getOperationalCardSummary(
  output: SyntheticOutputJson | null | undefined,
): string | null {
  const operational = getOperational(output);
  if (operational?.userFacing) return operational.userFacing.summary;
  if (!operational) return getOutputSummary(output);
  return operational.summary || operational.findings[0] || getOutputSummary(output);
}

export function getOperationalCardAction(
  output: SyntheticOutputJson | null | undefined,
): string | null {
  const operational = getOperational(output);
  if (operational?.userFacing) {
    const block = operational.userFacing;
    if (block.state === "user_input_required")
      return block.questions[0]?.question ?? block.whatIsNeededNow[0] ?? null;
    if (block.state === "decision_required" || block.state === "conflict")
      return block.options.find((item) => item.recommended)?.label ?? block.options[0]?.label ?? null;
    return block.nextStep ?? null;
  }
  if (!operational) return asSyntheticReport(output)?.recommendation ?? getOutputSummary(output);
  return (
    operational.nextSteps[0] ||
    operational.clarificationRequests[0]?.question ||
    operational.recommendedDecisions[0]?.title ||
    null
  );
}

export function getOperationalCardReadiness(
  output: SyntheticOutputJson | null | undefined,
): string | null {
  const operational = getOperational(output);
  if (operational?.userFacing)
    return getUserFacingStateLabel(operational.userFacing.state);
  if (!operational) {
    const report = asSyntheticReport(output);
    return report
      ? `Feasibility ${report.concernLevels.feasibility}% • Risk ${report.concernLevels.risk}% • Complexity ${complexityLabel(report.concernLevels.complexityLabel)}`
      : null;
  }
  return `${operational.readiness.status}${
    operational.readiness.blockers.length > 0
      ? ` • ${operational.readiness.blockers.join("; ")}`
      : ""
  }`;
}

export function getUserFacingCardNeeds(
  output: SyntheticOutputJson | null | undefined,
): string[] {
  const block = getOperational(output)?.userFacing;
  if (!block) return [];
  if (block.state === "ready") return [];
  if (block.state === "user_input_required")
    return [...block.whatIsNeededNow, ...block.questions.map((item) => item.label || item.question)];
  if (block.state === "decision_required" || block.state === "conflict")
    return block.options.map((item) => (item.recommended ? `${item.label} (recommended)` : item.label));
  return [];
}

// ── AgentCardViewModel ────────────────────────────────────────────────────────

/**
 * Single pass over `output` that derives every value `PerAgentCard` needs.
 * Replaces three independent tree-walks (`getOperationalCardSummary`,
 * `getOperationalCardAction`, `getOperationalCardReadiness`) with one.
 */
export function deriveAgentCardViewModel(
  output: SyntheticOutputJson | null,
): AgentCardViewModel {
  const NULL_TOKEN_USAGE = { promptTokens: null, completionTokens: null, totalTokens: null };

  if (!output) {
    return {
      summary: null,
      action: null,
      readiness: null,
      readinessColor: "var(--on-surface-variant)",
      statusTier: "pending",
      userFacingState: null,
      tokenUsage: NULL_TOKEN_USAGE,
    };
  }

  const tokenUsage = output.tokenUsage ?? NULL_TOKEN_USAGE;
  const operational = getOperational(output);
  const userFacing = operational?.userFacing ?? null;
  const state = userFacing?.state ?? null;

  // ── summary ──────────────────────────────────────────────────────────────
  const summary: string | null =
    userFacing?.summary ??
    operational?.summary ??
    operational?.findings[0] ??
    getOutputSummary(output) ??
    null;

  // ── action ────────────────────────────────────────────────────────────────
  let action: string | null = null;
  if (userFacing) {
    if (state === "user_input_required") {
      action = userFacing.questions[0]?.question ?? userFacing.whatIsNeededNow[0] ?? null;
    } else if (state === "decision_required" || state === "conflict") {
      action =
        userFacing.options.find((o) => o.recommended)?.label ??
        userFacing.options[0]?.label ??
        null;
    } else {
      action = userFacing.nextStep ?? null;
    }
  } else if (operational) {
    action =
      operational.nextSteps[0] ??
      operational.clarificationRequests[0]?.question ??
      operational.recommendedDecisions[0]?.title ??
      null;
  } else {
    action = asSyntheticReport(output)?.recommendation ?? getOutputSummary(output);
  }

  // ── readiness text ────────────────────────────────────────────────────────
  let readiness: string | null = null;
  if (userFacing) {
    readiness = getUserFacingStateLabel(state);
  } else if (operational) {
    const r = operational.readiness;
    readiness = r.blockers.length > 0
      ? `${r.status} · ${r.blockers.join("; ")}`
      : r.status;
  } else {
    const report = asSyntheticReport(output);
    if (report) {
      const cl = report.concernLevels;
      readiness = `Feasibility ${cl.feasibility}% • Risk ${cl.risk}% • Complexity ${cl.complexityLabel}`;
    }
  }

  // ── colour + tier ─────────────────────────────────────────────────────────
  type Tier = AgentCardViewModel["statusTier"];
  const isBlocked = operational?.readiness.blocked ?? false;

  let statusTier: Tier;
  let readinessColor: string;

  if (state === "ready") {
    statusTier = "ready";
    readinessColor = "var(--color-success-text)";
  } else if (state === "decision_required") {
    statusTier = "decision";
    readinessColor = "var(--color-info-text)";
  } else if (state === "user_input_required") {
    statusTier = "blocked";
    readinessColor = "var(--color-warning-text)";
  } else if (state === "conflict") {
    statusTier = "conflict";
    readinessColor = "var(--color-error-text)";
  } else if (isBlocked) {
    statusTier = "blocked";
    readinessColor = "var(--color-warning-text)";
  } else if (operational) {
    // has operational output but no userFacing — treat as ready-ish
    statusTier = "ready";
    readinessColor = "var(--on-surface-variant)";
  } else {
    statusTier = "pending";
    readinessColor = "var(--on-surface-variant)";
  }

  return { summary, action, readiness, readinessColor, statusTier, userFacingState: state, tokenUsage };
}

// ── Label helpers ─────────────────────────────────────────────────────────────

export function riskBadge(risk: number): { label: string; bg: string; color: string } {
  if (risk >= 70) return { label: "high risk", bg: "var(--color-error-bg)", color: "var(--color-error-text)" };
  if (risk >= 45) return { label: "watch", bg: "var(--color-warning-bg)", color: "var(--color-warning-text)" };
  return { label: "stable", bg: "var(--color-success-bg)", color: "var(--color-success-text)" };
}

export function isAgentRoutingDecisionOption(optionId: string | null | undefined): boolean {
  return optionId === "define_handoff_owner";
}

export function meterColor(value: number, highMeansBad = false): string {
  if (highMeansBad)
    return value >= 70 ? "var(--color-error-text)" : value >= 45 ? "var(--color-warning-text)" : "var(--color-success-text)";
  return value >= 65 ? "var(--color-success-text)" : value >= 40 ? "var(--color-warning-text)" : "var(--color-error-text)";
}

export function complexityLabel(value: SyntheticReport["concernLevels"]["complexityLabel"]): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatReadinessStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function getUserFacingStateLabel(
  state: SyntheticUserFacingBlock["state"] | null | undefined,
): string | null {
  if (state === "ready") return "ready";
  if (state === "user_input_required") return "user input required";
  if (state === "decision_required") return "decision required";
  if (state === "conflict") return "conflict";
  return null;
}

export function getUserFacingActionTitle(
  state: SyntheticUserFacingBlock["state"] | null | undefined,
): string | null {
  if (state === "ready") return "Next Action";
  if (state === "user_input_required") return "Needs From User";
  if (state === "decision_required") return "Decision Required";
  if (state === "conflict") return "Conflict";
  return null;
}

export function normalizeForUiDedup(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

export function ownerLabel(owner: ClassifiedNextMove["owner"]): string {
  if (owner === "assistant") return "AI can do this";
  if (owner === "user") return "Your decision";
  return "You + AI";
}

export function modeLabel(mode: NextMoveMode): string {
  if (mode === "self") return "I'll handle this";
  if (mode === "assistant") return "Help me with this";
  return "Skip for now";
}

export function toDecisionFamilyId(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildNextMovesFromDecisionFamilies(
  summaryReport: RunSummaryReport,
): ClassifiedNextMove[] {
  return summaryReport.decisionFamilies.map((family) => {
    const action = family.recommendedOptionLabel
      ? `Choose ${family.familyTitle}: prefer ${family.recommendedOptionLabel}`
      : `Choose ${family.familyTitle}`;
    return {
      action,
      owner: "user" as const,
      recommendedMode: "self" as const,
      intent: "decide" as const,
      decisionFamilyId: family.familyId,
      syntheticId: family.contributorSyntheticIds[0],
    };
  });
}

/**
 * When set to `false`, `buildNextMovesFromAdvisor` will NOT fall back to the
 * keyword heuristic for moves that have no recognised Advisor category.
 * Flip this to `false` once Advisor coverage is sufficient across all runs.
 */
export const ENABLE_CLASSIFY_HEURISTIC_FALLBACK = true;

/**
 * Maps an Advisor-emitted `category` string to the owner/mode/intent triple.
 * Returns `null` for unrecognised or missing categories so the caller can
 * decide whether to apply the keyword heuristic fallback.
 */
function resolveAdvisorCategory(category: string | null | undefined): Pick<
  ClassifiedNextMove,
  "owner" | "recommendedMode" | "intent"
> | null {
  switch (category?.toLowerCase().trim()) {
    case "decide":
      return { owner: "user", recommendedMode: "self", intent: "decide" };
    case "research":
      return { owner: "assistant", recommendedMode: "assistant", intent: "research" };
    case "build":
    case "implement":
      return { owner: "shared", recommendedMode: "assistant", intent: "build" };
    case "validate":
    case "review":
    case "test":
      return { owner: "shared", recommendedMode: "assistant", intent: "validate" };
    case "defer":
    case "wait":
      return { owner: "shared", recommendedMode: "defer", intent: "defer" };
    default:
      return null;
  }
}

/**
 * Builds `ClassifiedNextMove[]` from Advisor `strategicOptions`.
 *
 * Priority:
 * 1. Use `option.category` when present and recognised.
 * 2. Fall back to `classifyNextMove()` keyword heuristic when
 *    `ENABLE_CLASSIFY_HEURISTIC_FALLBACK === true`.
 * 3. Emit a generic "shared / assistant / heuristic" move when the fallback
 *    is disabled and the category is missing/unrecognised.
 */
export function buildNextMovesFromAdvisor(
  strategicOptions: import("@/lib/thinking-graph/server/types").AdvisorStrategicOption[],
): ClassifiedNextMove[] {
  return strategicOptions.map((opt) => {
    const fromCategory = resolveAdvisorCategory(opt.category);

    if (fromCategory) {
      return {
        action: opt.label,
        ...fromCategory,
        rationale: opt.rationale || undefined,
        tradeoff: opt.tradeoff || undefined,
      };
    }

    if (ENABLE_CLASSIFY_HEURISTIC_FALLBACK) {
      const heuristic = classifyNextMove(opt.label);
      return {
        ...heuristic,
        intent: "heuristic" as const,
        rationale: opt.rationale || undefined,
        tradeoff: opt.tradeoff || undefined,
      };
    }

    // Fallback disabled + no category → generic shared move
    return {
      action: opt.label,
      owner: "shared" as const,
      recommendedMode: "assistant" as const,
      intent: "build" as const,
      rationale: opt.rationale || undefined,
      tradeoff: opt.tradeoff || undefined,
    };
  });
}

export function classifyNextMove(action: string): ClassifiedNextMove {
  const normalized = action.trim().toLowerCase();
  const startsWithAny = (...values: string[]) => values.some((v) => normalized.startsWith(v));
  const includesAny = (...values: string[]) => values.some((v) => normalized.includes(v));

  if (startsWithAny("choose ", "decide ", "confirm ", "clarify ", "answer ") || includesAny("which ", "select ", "approve ", "pick "))
    return { action, owner: "user", recommendedMode: "self", intent: "heuristic" };
  if (includesAny("player feedback", "iterate on", "after feedback", "playtest", "after testing"))
    return { action, owner: "shared", recommendedMode: "defer", intent: "heuristic" };
  if (includesAny("research", "gather inspiration", "reference board", "mood board", "competitive audit", "benchmark"))
    return { action, owner: "assistant", recommendedMode: "assistant", intent: "heuristic" };
  if (includesAny("write", "documentation", "spec", "brief", "outline", "concept", "concept-art", "concept art", "draft"))
    return { action, owner: "assistant", recommendedMode: "assistant", intent: "heuristic" };
  if (includesAny("prototype", "implement", "build", "create", "wireframe", "mockup", "flow", "hud", "menu", "level design", "enemy design"))
    return { action, owner: "shared", recommendedMode: "assistant", intent: "heuristic" };
  if (includesAny("review", "evaluate", "validate", "check", "test"))
    return { action, owner: "shared", recommendedMode: "assistant", intent: "heuristic" };
  if (includesAny("finalize", "lock", "sign off"))
    return { action, owner: "user", recommendedMode: "self", intent: "heuristic" };
  return { action, owner: "shared", recommendedMode: "assistant", intent: "heuristic" };
}

export function hasConcreteTradeoffSignal(text: string): boolean {
  const normalized = text.toLowerCase();
  return ["chosen", "rejected", "deprioritized", "trade-off", "tradeoff", "vs ", "versus"].some((token) =>
    normalized.includes(token),
  );
}

// ── DecisionRequired builders ────────────────────────────────────────────────

export function parseValidationReports(
  output: SyntheticOutputJson | null | undefined,
): ValidationReportLike[] {
  const raw = output?.raw;
  if (!raw || typeof raw !== "object") return [];
  const candidate = raw as { validation?: unknown };
  if (!Array.isArray(candidate.validation)) return [];
  return candidate.validation.filter(
    (item): item is ValidationReportLike => Boolean(item) && typeof item === "object",
  );
}

export function extractRequiredFixesFromValidation(
  output: SyntheticOutputJson | null | undefined,
): string[] {
  const reports = parseValidationReports(output);
  const fixes = reports.flatMap((report) => report.revisionRequest?.requiredFixes ?? []);
  return [...new Set(fixes.map((item) => item.trim()).filter(Boolean))];
}

export function toDecisionOptionFromFix(input: { fix: string; syntheticId: string }): DecisionRequiredOption {
  const normalized = input.fix.toLowerCase();
  if (normalized.includes("handoff"))
    return { id: "define_handoff_owner", label: "Define handoff owner and deliverable", description: "Set exactly: owner, deliverable, and done-when criteria." };
  if (normalized.includes("risk"))
    return { id: "surface_top_risks", label: "Commit top execution risks", description: "List 2-3 concrete risks with trigger + mitigation." };
  if (normalized.includes("summary") || normalized.includes("recommendation") || normalized.includes("actionable specificity"))
    return { id: "rewrite_as_steps", label: "Rewrite as implementation steps", description: "Convert the recommendation into 2-4 measurable steps." };
  if (normalized.includes("role perspective"))
    return { id: "stay_in_role", label: "Resolve strictly in current role", description: "Restate the decision from the assigned role only." };
  return { id: `resolve_fix_${input.syntheticId}`, label: "Resolve missing clarification", description: `Address this blocker directly: ${input.fix}` };
}

export function parseDecisionRequired(
  output: SyntheticOutputJson | null | undefined,
): DecisionRequiredPayload | null {
  // ── Path 1: legacy raw.decisionRequired (pre-assembler outputs) ──────────
  const raw = output?.raw;
  if (raw && typeof raw === "object") {
    const payload = (raw as { decisionRequired?: unknown }).decisionRequired;
    if (payload && typeof payload === "object") {
      const candidate = payload as Partial<DecisionRequiredPayload>;
      if (
        candidate.type === "decision_required" &&
        typeof candidate.syntheticId === "string" &&
        typeof candidate.title === "string" &&
        typeof candidate.question === "string" &&
        Array.isArray(candidate.options)
      ) {
        const options = candidate.options.filter(
          (option): option is DecisionRequiredOption =>
            Boolean(option) &&
            typeof option === "object" &&
            typeof (option as { id?: unknown }).id === "string" &&
            typeof (option as { label?: unknown }).label === "string" &&
            typeof (option as { description?: unknown }).description === "string",
        );
        if (options.length > 0) {
          return {
            type: "decision_required",
            syntheticId: candidate.syntheticId,
            familyId:
              typeof candidate.familyId === "string" && candidate.familyId.trim().length > 0
                ? candidate.familyId
                : toDecisionFamilyId(candidate.title),
            title: candidate.title,
            question: candidate.question,
            options,
            recommendedOptionId:
              typeof candidate.recommendedOptionId === "string" &&
              options.some((o) => o.id === candidate.recommendedOptionId)
                ? candidate.recommendedOptionId
                : (options[0]?.id ?? null),
            required: true,
            ...(typeof candidate.relatedEdgeId === "string" ? { relatedEdgeId: candidate.relatedEdgeId } : {}),
            ...(typeof candidate.relatedNodeId === "string" ? { relatedNodeId: candidate.relatedNodeId } : {}),
            ...(typeof candidate.relatedNodeName === "string" ? { relatedNodeName: candidate.relatedNodeName } : {}),
          };
        }
      }
    }
  }

  // ── Path 2: operational.userFacing (current structureAssembler path) ─────
  // The assembler writes the decision to operational.userFacing, not to
  // raw.decisionRequired, so Path 1 always returns null for assembler outputs.
  const uf = (output as { operational?: { userFacing?: SyntheticUserFacingBlock | null } | null } | undefined)
    ?.operational?.userFacing;
  if (uf?.state === "decision_required" && uf.options.length > 0) {
    const options: DecisionRequiredOption[] = uf.options.map((o) => ({
      id: o.id,
      label: o.label,
      // Use the option-specific summary as the description; fall back to label.
      description: o.summary && o.summary !== o.label ? o.summary : o.label,
    }));
    const recommendedOption = uf.options.find((o) => o.recommended);
    return {
      type: "decision_required",
      syntheticId: output!.syntheticId,
      familyId: toDecisionFamilyId(uf.title),
      title: uf.title,
      question: uf.summary,
      options,
      recommendedOptionId: recommendedOption?.id ?? options[0]?.id ?? null,
      required: true,
      ...(uf.relatedEdgeId ? { relatedEdgeId: uf.relatedEdgeId } : {}),
      ...(uf.relatedNodeId ? { relatedNodeId: uf.relatedNodeId } : {}),
      ...(uf.relatedNodeName ? { relatedNodeName: uf.relatedNodeName } : {}),
    };
  }

  return null;
}

export function selectPrimaryUserFacingBlock(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  summaryReport: RunSummaryReport,
): { syntheticId: string; syntheticName: string; block: SyntheticUserFacingFromOperational } | null {
  const outputs = Object.values(outputsBySyntheticId).filter(
    (output): output is SyntheticReportWithOperational =>
      Boolean(getOperational(output)?.userFacing),
  );
  const raisedBy =
    summaryReport.biggestConflict?.raisedBy &&
    getOperational(outputsBySyntheticId[summaryReport.biggestConflict.raisedBy])?.userFacing
      ? outputsBySyntheticId[summaryReport.biggestConflict.raisedBy]
      : null;

  const raisedByOperational = getOperational(raisedBy);
  if (raisedByOperational?.userFacing)
    return { syntheticId: raisedBy!.syntheticId, syntheticName: raisedBy!.syntheticName, block: raisedByOperational.userFacing };

  const actionable = outputs.find((o) => {
    const state = o.operational.userFacing?.state;
    return state === "user_input_required" || state === "decision_required";
  });
  if (actionable?.operational?.userFacing)
    return { syntheticId: actionable.syntheticId, syntheticName: actionable.syntheticName, block: actionable.operational.userFacing };

  const first = outputs[0];
  if (!first?.operational?.userFacing) return null;
  return { syntheticId: first.syntheticId, syntheticName: first.syntheticName, block: first.operational.userFacing };
}

export function applyDecisionOptionSelection(input: {
  decision: DecisionRequiredPayload;
  optionId: string;
  onApplyDecisionOption?: (payload: {
    decision: DecisionRequiredPayload;
    optionId: string;
    source?: import("@/lib/thinking-graph/server/types").SyntheticPreparedInputSource;
  }) => void;
}) {
  const option = input.decision.options.find((item) => item.id === input.optionId);
  if (!option || isAgentRoutingDecisionOption(option.id)) return;
  input.onApplyDecisionOption?.({
    decision: input.decision,
    optionId: option.id,
    source: option.id === input.decision.recommendedOptionId ? "defaults" : "manual_edit",
  });
}

export function matchAdvisorResolution(
  conflict: import("@/lib/thinking-graph/server/types").RunSummaryConflictEdge,
  resolutions: import("@/lib/thinking-graph/server/types").AdvisorConflictResolution[],
  codeById: Map<string, string>,
): import("@/lib/thinking-graph/server/types").AdvisorConflictResolution | null {
  const fromCode = (codeById.get(conflict.fromSyntheticId) ?? conflict.fromSyntheticId).toUpperCase();
  const toCode = (codeById.get(conflict.toSyntheticId) ?? conflict.toSyntheticId).toUpperCase();
  return resolutions.find((r) => {
    const id = r.conflictId.toUpperCase();
    return id.includes(fromCode) && id.includes(toCode);
  }) ?? null;
}
