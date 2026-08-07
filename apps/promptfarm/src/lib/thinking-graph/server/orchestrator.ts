import type { TranscriptEntry } from "../../planning/types";
import { getThinkingGraphRuntimeConfig } from "./config";
import { createSyntheticJsonOutput, type ModelProvider } from "./modelProvider";
import { profLog, iterationLog } from "./profiling";
import { buildIntakeContextBlock } from "./intakeBuilder";
import {
  validateSyntheticOutput,
  type SyntheticLikeOutput,
} from "./llm-core/shadowValidator";
import type { ValidationReport } from "./llm-core/nodeContracts";
import { assembleOutput } from "./structureAssembler";
import type {
  AdvisorReport,
  AssemblerContext,
  RunSummaryConflict,
  RunSummaryConflictEdge,
  RunSummaryReport,
  SyntheticBackendDescriptor,
  SyntheticClarificationRequest,
  SyntheticDirectedHandoff,
  SyntheticLlmContent,
  SyntheticOperationalReport,
  SyntheticRecommendedDecision,
  SyntheticConversationMessage,
  SyntheticOutputJson,
  SyntheticReadiness,
  SyntheticReport,
  SyntheticSession,
  SyntheticUserFacingAction,
  SyntheticUserFacingBlock,
  SyntheticUserFacingOption,
  SyntheticUserFacingQuestion,
  ThinkingGraphRunProgressEvent,
} from "./types";
import { isAdvisorReport, normalizeTokenUsage } from "./types";
import { buildRunSummaryReport } from "../reportSummary";

/**
 * Minimal context interface passed to buildRunInstruction.
 * Replaces the full ADK ReadonlyContext — the only thing the instruction
 * closure needs is state.get() to read the per-agent state snapshot.
 */
type AgentRunContext = {
  state: {
    get<T = unknown>(key: string, defaultValue?: T): T | undefined;
  };
};

export type RunChainInput = {
  session: SyntheticSession;
  syntheticIds?: string[];
  projectFilesContext?: string | null;
  onProgress?: (event: ThinkingGraphRunProgressEvent) => void | Promise<void>;
  agentStaggerMs?: number;
};

export type RunChainResult = {
  runId: string;
  completedAt: string;
  transcript: TranscriptEntry[];
  outputsBySyntheticId: Record<string, SyntheticOutputJson>;
  runSummary: RunSummaryReport | null;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type ChatInput = {
  session: SyntheticSession;
  syntheticId: string;
  userMessage: string;
  onTextDelta?: (textDelta: string) => void | Promise<void>;
};

export type ChatResult = {
  replyText: string;
  conversation: SyntheticConversationMessage[];
};

export interface SyntheticOrchestrator {
  readonly descriptor: SyntheticBackendDescriptor;
  runChain(input: RunChainInput): Promise<RunChainResult>;
  chat(input: ChatInput): Promise<ChatResult>;
}

type StoredSyntheticOutput = {
  syntheticId: string;
  syntheticName: string;
  domain?: string;
  summary: string;
  acceptedAssumptions?: string[];
  findings?: string[];
  details: string;
  recommendation: string;
  changesFromPrevious: string[];
  appliedInputs: string[];
  ignoredInputs: string[];
  keyRisks: string[];
  concernLevels: {
    feasibility: number;
    risk: number;
    complexityLabel: "low" | "medium" | "high";
  };
  handoff: string | null;
  handoffFacts?: string[];
  upstreamContext: string[];
  directedHandoffs?: SyntheticDirectedHandoff[];
  operational?: SyntheticOperationalReport | null;
  operationalParseError?: boolean;
  /** Set only when the agent exhausted its retry budget — never shown verbatim to the user. */
  qualityGateMessage?: string;
};

type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

type DecisionRequiredOption = {
  id: string;
  label: string;
  description: string;
};

type DecisionRequiredPayload = {
  type: "decision_required";
  syntheticId: string;
  title: string;
  question: string;
  options: DecisionRequiredOption[];
  required: true;
};

type ResponseLanguageCode = "ru" | "en";


function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function outputKeyForSyntheticId(syntheticId: string): string {
  return `synthetic_output__${syntheticId}`;
}

function detectResponseLanguage(text: string): ResponseLanguageCode {
  const sample = text.trim();
  if (!sample) {
    return "en";
  }

  const cyrillicMatches = sample.match(/[А-Яа-яЁё]/g)?.length ?? 0;
  const latinMatches = sample.match(/[A-Za-z]/g)?.length ?? 0;

  if (cyrillicMatches > latinMatches) {
    return "ru";
  }

  return "en";
}

function responseLanguageInstruction(language: ResponseLanguageCode): string {
  if (language === "ru") {
    return "Respond in Russian. Keep JSON keys/schema unchanged, but write all text field values in Russian.";
  }
  return "Respond in English. Keep JSON keys/schema unchanged.";
}

function resolveRunResponseLanguage(input: {
  ideaPrompt: string;
  conversation: SyntheticConversationMessage[];
}): ResponseLanguageCode {
  const latestUserMessage = [...input.conversation]
    .reverse()
    .find((message) => message.role === "user");

  const languageSource = latestUserMessage?.text ?? input.ideaPrompt;
  return detectResponseLanguage(languageSource);
}

/**
 * Full-mesh context: every synthetic receives every other synthetic's output
 * as context by default. Explicit edges only modify the FRAMING/LABEL of that
 * context, not whether it is included.
 *
 * Returns all peer synthetic IDs (excluding the agent itself and any non-synthetic
 * structural nodes — those never appear in session.synthetics).
 */
function getInboundContextSourceIds(
  session: SyntheticSession,
  syntheticId: string,
): string[] {
  return session.synthetics
    .filter((s) => s.id !== syntheticId)
    .map((s) => s.id);
}

/**
 * Full-mesh context with edge-based framing.
 *
 * Returns ALL peer synthetics; each peer's context label is determined by the
 * explicit relationship edge (if any):
 *
 *   tension      — both sides framed as "opposing position" (bidirectional)
 *   oversight    — framed as "work under your review" for the reviewing agent
 *                  (edge.from = reviewer, edge.to = reviewed)
 *   amplification — framed as "amplified signal" for the target agent
 *                  (edge.from = amplifier, edge.to = receiver)
 *   (no edge)    — framed as "peer finding" (collegial default)
 */
function getInboundContextSourcesWithType(
  session: SyntheticSession,
  syntheticId: string,
): Array<{ sourceId: string; edgeType: string }> {
  const result: Array<{ sourceId: string; edgeType: string }> = [];

  for (const peer of session.synthetics) {
    if (peer.id === syntheticId) continue;

    let edgeType = "peer";

    // Tension is bidirectional: check both directions
    const hasTension = session.edges.some(
      (e) =>
        e.type === "tension" &&
        ((e.from === peer.id && e.to === syntheticId) ||
          (e.from === syntheticId && e.to === peer.id)),
    );

    // Oversight: syntheticId is the reviewer, peer.id is the reviewed
    // (edge from=syntheticId, to=peer.id → syntheticId reviews peer's work)
    const isThisAgentReviewing = session.edges.some(
      (e) =>
        e.type === "oversight" &&
        e.from === syntheticId &&
        e.to === peer.id,
    );

    // Amplification: peer amplifies this agent's concerns
    // (edge from=peer.id, to=syntheticId → peer amplifies syntheticId)
    const isPeerAmplifyingThis = session.edges.some(
      (e) =>
        e.type === "amplification" &&
        e.from === peer.id &&
        e.to === syntheticId,
    );

    if (hasTension) {
      edgeType = "tension";
    } else if (isThisAgentReviewing) {
      edgeType = "oversight";
    } else if (isPeerAmplifyingThis) {
      edgeType = "amplification";
    }

    result.push({ sourceId: peer.id, edgeType });
  }

  return result;
}

function safeParseOutput(value: unknown): StoredSyntheticOutput | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return safeParseOutput(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredSyntheticOutput>;
  const rawOperationalCandidate =
    candidate.operational && typeof candidate.operational === "object"
      ? candidate.operational
      : candidate;
  const operationalShapeHint =
    (candidate.operational && typeof candidate.operational === "object") ||
    "acceptedAssumptions" in candidate ||
    "findings" in candidate ||
    "missingInformation" in candidate ||
    "clarificationRequests" in candidate ||
    "recommendedDecisions" in candidate ||
    "nextSteps" in candidate ||
    "readiness" in candidate ||
    "artifactsReady" in candidate;
  if (
    typeof candidate.syntheticId !== "string" ||
    typeof candidate.syntheticName !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.details !== "string" ||
    typeof candidate.recommendation !== "string" ||
    !Array.isArray(candidate.changesFromPrevious) ||
    !candidate.changesFromPrevious.every((item) => typeof item === "string") ||
    !Array.isArray(candidate.appliedInputs) ||
    !candidate.appliedInputs.every((item) => typeof item === "string") ||
    !Array.isArray(candidate.ignoredInputs) ||
    !candidate.ignoredInputs.every((item) => typeof item === "string") ||
    !Array.isArray(candidate.keyRisks) ||
    !candidate.keyRisks.every((risk) => typeof risk === "string") ||
    !candidate.concernLevels ||
    typeof candidate.concernLevels.feasibility !== "number" ||
    typeof candidate.concernLevels.risk !== "number" ||
    !["low", "medium", "high"].includes(candidate.concernLevels.complexityLabel)
  ) {
    return null;
  }

  const operational =
    buildOperationalReportFromUnknown({
      value: rawOperationalCandidate,
      session: null,
      syntheticId: candidate.syntheticId,
      syntheticName: candidate.syntheticName,
      domain:
        typeof candidate.domain === "string" ? candidate.domain : "general",
      handoff: typeof candidate.handoff === "string" ? candidate.handoff : null,
    }) ?? null;

  return {
    syntheticId: candidate.syntheticId,
    syntheticName: candidate.syntheticName,
    domain: typeof candidate.domain === "string" ? candidate.domain : undefined,
    summary: candidate.summary,
    details: candidate.details,
    recommendation: candidate.recommendation,
    changesFromPrevious: candidate.changesFromPrevious,
    appliedInputs: candidate.appliedInputs,
    ignoredInputs: candidate.ignoredInputs,
    keyRisks: candidate.keyRisks,
    concernLevels: (() => {
      const rawF = candidate.concernLevels.feasibility;
      const rawR = candidate.concernLevels.risk;
      // Detect scale from the maximum raw value across both fields:
      //   max <= 1   → model used 0–1 float scale  → multiply by 100
      //   max <= 10  → model used 0–10 integer scale → multiply by 10
      //   otherwise  → already 0–100
      const maxRaw = Math.max(rawF, rawR);
      const scale = maxRaw <= 1 ? 100 : 1;
      return {
        feasibility: Math.min(100, Math.round(rawF * scale)),
        risk: Math.min(100, Math.round(rawR * scale)),
        complexityLabel: (candidate.concernLevels.complexityLabel ?? (candidate.concernLevels as { complexity?: string }).complexity) as "low" | "medium" | "high",
      };
    })(),
    handoff: typeof candidate.handoff === "string" ? candidate.handoff : null,
    upstreamContext: [],
    directedHandoffs: buildOperationalDirectedHandoffs(
      candidate.directedHandoffs,
    ),
    operational,
    operationalParseError: Boolean(operationalShapeHint && !operational),
  };
}

/**
 * Parses the new minimal LLM output format (SyntheticLlmContent).
 * Does NOT require structural fields (details, recommendation, userFacing, etc.)
 * which are now assembled deterministically by structureAssembler.ts.
 */
function safeParseLlmContent(value: unknown): SyntheticLlmContent | null {
  if (!value) {
    return null;
  }

  // Handle raw JSON strings (direct LLM response text).
  if (typeof value === "string") {
    try {
      return safeParseLlmContent(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (typeof value !== "object") {
    return null;
  }

  const c = value as Record<string, unknown>;

  // Reject old-format payloads that nest findings/risks under `operational`.
  // If `operational` is present as an object but the top-level new-format arrays
  // (findings, risks) are absent, this is a legacy output — fall back to
  // safeParseOutput so fields aren't silently dropped.
  if (
    c.operational && typeof c.operational === "object" &&
    !Array.isArray(c.findings) && !Array.isArray(c.risks)
  ) {
    return null;
  }

  if (
    typeof c.syntheticId !== "string" ||
    typeof c.syntheticName !== "string" ||
    typeof c.summary !== "string" ||
    !Array.isArray(c.clarificationRequests) ||
    !Array.isArray(c.recommendedDecisions) ||
    !c.concernLevels ||
    typeof (c.concernLevels as Record<string, unknown>).feasibility !== "number" ||
    typeof (c.concernLevels as Record<string, unknown>).risk !== "number"
  ) {
    return null;
  }

  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const parseClarificationRequests = (arr: unknown[]): SyntheticClarificationRequest[] =>
    arr
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : String(Math.random()),
        question: typeof item.question === "string" ? item.question : "",
        whyItMatters: typeof item.whyItMatters === "string" ? item.whyItMatters : "",
        required: Boolean(item.required),
        ...(item.priority === 1 || item.priority === 2 || item.priority === 3
          ? { priority: item.priority as 1 | 2 | 3 }
          : {}),
      }))
      .filter((item) => item.question.trim().length > 0);

  const parseRecommendedDecisions = (arr: unknown[]): SyntheticRecommendedDecision[] =>
    arr
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => {
        const urgencyRaw = item.urgency;
        const urgency: "blocking" | "important" | "optional" | undefined =
          urgencyRaw === "blocking" || urgencyRaw === "important" || urgencyRaw === "optional"
            ? urgencyRaw
            : undefined;

        // Accept both `optionNotes` (LLM-facing name introduced in Step 16)
        // and `optionReasons` (internal field name). Merge them so either form
        // produced by the LLM is preserved. `optionNotes` takes precedence when
        // both exist for the same key.
        function toStringRecord(v: unknown): Record<string, string> | undefined {
          if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
          const raw = v as Record<string, unknown>;
          const valid = Object.entries(raw).every(
            ([k, val]) => typeof k === "string" && typeof val === "string",
          );
          return valid ? (raw as Record<string, string>) : undefined;
        }
        const fromOptionReasons = toStringRecord(item.optionReasons);
        const fromOptionNotes = toStringRecord(item.optionNotes);
        const merged: Record<string, string> | undefined =
          fromOptionReasons || fromOptionNotes
            ? { ...(fromOptionReasons ?? {}), ...(fromOptionNotes ?? {}) }
            : undefined;

        return {
          id: typeof item.id === "string" ? item.id : String(Math.random()),
          title: typeof item.title === "string" ? item.title : "",
          options: toStringArray(item.options),
          recommendedOption:
            typeof item.recommendedOption === "string" ? item.recommendedOption : null,
          reason: typeof item.reason === "string" ? item.reason : "",
          ...(merged ? { optionReasons: merged } : {}),
          ...(urgency ? { urgency } : {}),
        };
      })
      .filter((item) => item.title.trim().length > 0);

  const cl = c.concernLevels as Record<string, unknown>;
  const rawF = cl.feasibility as number;
  const rawR = cl.risk as number;
  const maxRaw = Math.max(rawF, rawR);
  const scale = maxRaw <= 1 ? 100 : maxRaw <= 10 ? 10 : 1;
  const complexityRaw = cl.complexityLabel ?? cl.complexity; // support legacy field name during migration
  const complexityLabel: "low" | "medium" | "high" =
    complexityRaw === "low" || complexityRaw === "medium" || complexityRaw === "high"
      ? complexityRaw
      : "medium";

  return {
    syntheticId: c.syntheticId,
    syntheticName: c.syntheticName,
    summary: c.summary,
    domain: typeof c.domain === "string" ? c.domain : "general",
    acceptedAssumptions: toStringArray(c.acceptedAssumptions),
    findings: toStringArray(c.findings),
    risks: toStringArray(c.risks),
    missingInformation: toStringArray(c.missingInformation),
    clarificationRequests: parseClarificationRequests(
      c.clarificationRequests as unknown[],
    ),
    recommendedDecisions: parseRecommendedDecisions(
      c.recommendedDecisions as unknown[],
    ),
    nextSteps: toStringArray(c.nextSteps),
    appliedInputs: toStringArray(c.appliedInputs),
    ignoredInputs: toStringArray(c.ignoredInputs),
    changesFromPrevious: toStringArray(c.changesFromPrevious),
    keyRisks: toStringArray(c.keyRisks),
    concernLevels: {
      feasibility: Math.min(100, Math.round(rawF * scale)),
      risk: Math.min(100, Math.round(rawR * scale)),
      complexityLabel,
    },
    artifactsReady: toStringArray(c.artifactsReady),
    handoffFacts: toStringArray(c.handoffFacts),
  };
}

function stripJsonCodeFences(value: string): string {
  return value
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// Returns all top-level balanced JSON objects found in the text, in order.
// Handles nested objects and strings (including escaped quotes).
function extractAllTopLevelJsonObjects(value: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(value.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

function normalizeJsonCandidate(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();

  // If there are multiple top-level JSON objects (e.g. retry left a draft behind),
  // prefer the last one — it is the most refined version.
  const allObjects = extractAllTopLevelJsonObjects(trimmed);
  if (allObjects.length > 0) {
    candidates.add(allObjects[allObjects.length - 1]);
    if (allObjects.length > 1) {
      candidates.add(allObjects[0]);
    }
  }

  candidates.add(trimmed);

  const unfenced = stripJsonCodeFences(trimmed);
  if (unfenced) {
    candidates.add(unfenced);
  }

  const fencedBlock = trimmed
    .match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
    ?.trim();
  if (fencedBlock) {
    candidates.add(fencedBlock);
    const fencedObjects = extractAllTopLevelJsonObjects(fencedBlock);
    if (fencedObjects.length > 0) {
      candidates.add(fencedObjects[fencedObjects.length - 1]);
    }
  }

  return [...candidates];
}


function deriveDetailsFromOperational(
  operational: SyntheticOperationalReport | null | undefined,
  fallbackDetails: string,
): string {
  if (!operational) {
    return fallbackDetails;
  }

  const sections = [
    operational.findings.length > 0
      ? `Findings: ${operational.findings.join("; ")}`
      : null,
    operational.missingInformation.length > 0
      ? `Missing information: ${operational.missingInformation.join("; ")}`
      : null,
    operational.readiness.blocked
      ? `Blocked by: ${operational.readiness.blockers.join("; ")}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return sections.length > 0 ? sections.join(" ") : fallbackDetails;
}

function deriveRecommendationFromOperational(
  operational: SyntheticOperationalReport | null | undefined,
  fallbackRecommendation: string,
): string {
  if (!operational) {
    return fallbackRecommendation;
  }

  let base: string;
  if (operational.nextSteps.length > 0) {
    base = operational.nextSteps.join(" ");
  } else if (operational.clarificationRequests.length > 0) {
    base = operational.clarificationRequests
      .map((item) => `Clarify: ${item.question}`)
      .join(" ");
  } else {
    base = fallbackRecommendation;
  }

  // When the agent is blocked, ensure every blocker is covered in the recommendation
  // so the display text never creates a false sense of completeness.
  if (operational.readiness.blocked && operational.readiness.blockers.length > 0) {
    const baseLower = base.toLowerCase();
    const uncoveredBlockers = operational.readiness.blockers.filter((blocker) => {
      // A blocker is "covered" if its key tokens appear somewhere in the base text.
      const tokens = blocker
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 3);
      if (tokens.length === 0) return false;
      const coveredTokenCount = tokens.filter((t) => baseLower.includes(t)).length;
      // Consider covered if >50 % of meaningful tokens appear in the base text.
      return coveredTokenCount / tokens.length < 0.5;
    });

    if (uncoveredBlockers.length > 0) {
      const suffix = `Also resolve: ${uncoveredBlockers.join("; ")}.`;
      base = `${base.trimEnd()} ${suffix}`;
    }
  }

  return base;
}

function deriveKeyRisksFromOperational(
  operational: SyntheticOperationalReport | null | undefined,
  fallbackRisks: string[],
): string[] {
  if (!operational) {
    return fallbackRisks;
  }

  const derived = [...operational.risks, ...operational.readiness.blockers]
    .map((item) => item.trim())
    .filter(Boolean);

  return derived.length > 0 ? [...new Set(derived)].slice(0, 4) : fallbackRisks;
}

function hasOperationalContractPayload(
  output: StoredSyntheticOutput | null | undefined,
): boolean {
  return Boolean(output?.operational);
}

function buildOperationalReadiness(value: unknown): SyntheticReadiness | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SyntheticReadiness>;
  if (
    typeof candidate.canContinue !== "boolean" ||
    typeof candidate.blocked !== "boolean" ||
    !Array.isArray(candidate.blockers) ||
    !candidate.blockers.every((item) => typeof item === "string") ||
    (candidate.status !== "ready_for_next_node" &&
      candidate.status !== "needs_clarification" &&
      candidate.status !== "blocked" &&
      candidate.status !== "partial_progress")
  ) {
    return null;
  }

  return {
    canContinue: candidate.canContinue,
    blocked: candidate.blocked,
    blockers: candidate.blockers,
    status: candidate.status,
  };
}

function buildOperationalClarificationRequests(
  value: unknown,
): SyntheticClarificationRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is SyntheticClarificationRequest =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { question?: unknown }).question === "string" &&
      typeof (item as { whyItMatters?: unknown }).whyItMatters === "string" &&
      typeof (item as { required?: unknown }).required === "boolean" &&
      ((item as { priority?: unknown }).priority === undefined ||
        (item as { priority?: unknown }).priority === 1 ||
        (item as { priority?: unknown }).priority === 2 ||
        (item as { priority?: unknown }).priority === 3),
  );
}

function buildUserFacingOptions(value: unknown): SyntheticUserFacingOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<SyntheticUserFacingOption>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.summary !== "string" ||
      !Array.isArray(candidate.pros) ||
      !candidate.pros.every((entry) => typeof entry === "string") ||
      !Array.isArray(candidate.cons) ||
      !candidate.cons.every((entry) => typeof entry === "string") ||
      typeof candidate.recommended !== "boolean"
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        label: candidate.label,
        summary: candidate.summary,
        pros: candidate.pros,
        cons: candidate.cons,
        recommended: candidate.recommended,
      },
    ];
  });
}

function buildUserFacingQuestions(
  value: unknown,
): SyntheticUserFacingQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<SyntheticUserFacingQuestion>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.question !== "string" ||
      typeof candidate.whyItMatters !== "string" ||
      !(
        candidate.suggestedAnswer === null ||
        typeof candidate.suggestedAnswer === "string"
      ) ||
      typeof candidate.required !== "boolean"
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        label: candidate.label,
        question: candidate.question,
        whyItMatters: candidate.whyItMatters,
        suggestedAnswer: candidate.suggestedAnswer,
        required: candidate.required,
      },
    ];
  });
}

function buildUserFacingActions(value: unknown): SyntheticUserFacingAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const actions: SyntheticUserFacingAction[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const candidate = item as Partial<SyntheticUserFacingAction>;
    if (typeof candidate.label !== "string") {
      return;
    }

    if (
      candidate.type === "continue" ||
      candidate.type === "accept_defaults" ||
      candidate.type === "answer_questions"
    ) {
      actions.push({ type: candidate.type, label: candidate.label });
      return;
    }

    if (
      (candidate.type === "choose_option" ||
        candidate.type === "resolve_conflict") &&
      typeof (candidate as { optionId?: unknown }).optionId === "string"
    ) {
      actions.push({
        type: candidate.type,
        label: candidate.label,
        optionId: (candidate as { optionId: string }).optionId,
      });
      return;
    }
  });

  return actions;
}

function buildUserFacingBlockFromUnknown(
  value: unknown,
): SyntheticUserFacingBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    state?: unknown;
    title?: unknown;
    summary?: unknown;
    whatWeKnow?: unknown;
    whatIsNeededNow?: unknown;
    whoActsNext?: unknown;
    nextStep?: unknown;
    options?: unknown;
    questions?: unknown;
    actions?: unknown;
  };

  if (
    (candidate.state !== "ready" &&
      candidate.state !== "decision_required" &&
      candidate.state !== "user_input_required" &&
      candidate.state !== "conflict") ||
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string" ||
    (candidate.whoActsNext !== "system" && candidate.whoActsNext !== "user") ||
    !(candidate.nextStep === null || typeof candidate.nextStep === "string")
  ) {
    return null;
  }

  const whatWeKnow = Array.isArray(candidate.whatWeKnow)
    ? candidate.whatWeKnow.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const fact = item as { label?: unknown; value?: unknown };
        if (typeof fact.label !== "string" || typeof fact.value !== "string") {
          return [];
        }
        return [{ label: fact.label, value: fact.value }];
      })
    : [];

  const whatIsNeededNow = Array.isArray(candidate.whatIsNeededNow)
    ? candidate.whatIsNeededNow.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return {
    state: candidate.state,
    title: candidate.title,
    summary: candidate.summary,
    whatWeKnow,
    whatIsNeededNow,
    whoActsNext: candidate.whoActsNext,
    nextStep: candidate.nextStep,
    options: buildUserFacingOptions(candidate.options),
    questions: buildUserFacingQuestions(candidate.questions),
    actions: buildUserFacingActions(candidate.actions),
  };
}

function deriveUserFacingBlock(input: {
  syntheticId: string;
  syntheticName: string;
  summary: string;
  details: string;
  recommendation: string;
  missingInformation: string[];
  clarificationRequests: SyntheticClarificationRequest[];
  recommendedDecisions: SyntheticRecommendedDecision[];
  nextSteps: string[];
  readiness: SyntheticReadiness;
  userFacing: SyntheticUserFacingBlock | null;
}): SyntheticUserFacingBlock {
  if (input.userFacing) {
    return input.userFacing;
  }

  const whatWeKnow = [
    { label: "Agent", value: input.syntheticName },
    { label: "Readiness", value: input.readiness.status },
  ];

  const requiredQuestions: SyntheticUserFacingQuestion[] =
    input.clarificationRequests.map((item) => ({
      id: item.id,
      label: item.question,
      question: item.question,
      whyItMatters: item.whyItMatters,
      suggestedAnswer: null,
      required: item.required,
    }));

  const decisionOptions: SyntheticUserFacingOption[] =
    input.recommendedDecisions.map((item) => ({
      id: item.id,
      label: item.recommendedOption ?? item.title,
      summary: item.reason || item.title,
      pros: item.recommendedOption
        ? [`Recommended: ${item.recommendedOption}`]
        : [],
      cons: item.options
        .filter((option) => option !== item.recommendedOption)
        .map((option) => `Not selected: ${option}`),
      recommended: Boolean(item.recommendedOption),
    }));

  if (
    input.readiness.blocked ||
    input.readiness.status === "needs_clarification" ||
    requiredQuestions.some((item) => item.required)
  ) {
    const hasSuggestedDefaults = requiredQuestions.some(
      (item) =>
        typeof item.suggestedAnswer === "string" &&
        item.suggestedAnswer.length > 0,
    );

    return {
      state: "user_input_required",
      title: "User Input Required",
      summary:
        input.summary ||
        "The system needs user-owned inputs before continuing.",
      whatWeKnow,
      whatIsNeededNow: [
        ...input.missingInformation,
        ...requiredQuestions.map((item) => item.label),
      ].filter(Boolean),
      whoActsNext: "user",
      nextStep: null,
      options: [],
      questions: requiredQuestions,
      actions: [
        ...(hasSuggestedDefaults
          ? [
              {
                type: "accept_defaults",
                label: "Accept Suggested Defaults",
              } as const,
            ]
          : []),
        { type: "answer_questions", label: "Provide Required Input" } as const,
      ],
    };
  }

  if (decisionOptions.length >= 2) {
    return {
      state: "decision_required",
      title: "Decision Required",
      summary:
        input.summary || "A user choice is needed between viable options.",
      whatWeKnow,
      whatIsNeededNow: input.missingInformation,
      whoActsNext: "user",
      nextStep: null,
      options: decisionOptions.slice(0, 3),
      questions: [],
      actions: decisionOptions.slice(0, 3).map((option) => ({
        type: "choose_option" as const,
        label: `Choose ${option.label}`,
        optionId: option.id,
      })),
    };
  }

  return {
    state: "ready",
    title: "Ready",
    summary: input.summary || input.details,
    whatWeKnow,
    whatIsNeededNow: input.missingInformation,
    whoActsNext: "system",
    nextStep: input.nextSteps[0] ?? input.recommendation,
    options: [],
    questions: [],
    actions: [{ type: "continue", label: "Continue" }],
  };
}

function buildOperationalRecommendedDecisions(
  value: unknown,
): SyntheticRecommendedDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): SyntheticRecommendedDecision[] => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { id?: unknown }).id !== "string" ||
      typeof (item as { title?: unknown }).title !== "string" ||
      !Array.isArray((item as { options?: unknown }).options) ||
      !((item as { options?: unknown[] }).options ?? []).every(
        (option) => typeof option === "string",
      ) ||
      ((item as { recommendedOption?: unknown }).recommendedOption !== null &&
        typeof (item as { recommendedOption?: unknown }).recommendedOption !== "string") ||
      typeof (item as { reason?: unknown }).reason !== "string"
    ) {
      return [];
    }

    const candidate = item as SyntheticRecommendedDecision & {
      optionReasons?: unknown;
      optionNotes?: unknown;
    };

    // Validate and collect optionReasons if present — must be a plain object with string values
    function toValidStringRecord(v: unknown): Record<string, string> | undefined {
      if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
      const raw = v as Record<string, unknown>;
      const valid = Object.entries(raw).every(
        ([k, val]) => typeof k === "string" && typeof val === "string",
      );
      return valid ? (raw as Record<string, string>) : undefined;
    }

    // Accept both optionReasons (internal name) and optionNotes (LLM-facing alias
    // introduced in Step 16). Merge them; optionNotes takes precedence per key so
    // that newly-generated outputs override any stale stored optionReasons values.
    const fromOptionReasons = toValidStringRecord(candidate.optionReasons);
    const fromOptionNotes = toValidStringRecord(candidate.optionNotes);
    const optionReasons: Record<string, string> | undefined =
      fromOptionReasons || fromOptionNotes
        ? { ...(fromOptionReasons ?? {}), ...(fromOptionNotes ?? {}) }
        : undefined;

    // Validate urgency if present
    const rawUrgency = (candidate as { urgency?: unknown }).urgency;
    const urgency: "blocking" | "important" | "optional" | undefined =
      rawUrgency === "blocking" || rawUrgency === "important" || rawUrgency === "optional"
        ? rawUrgency
        : undefined;

    return [
      {
        id: candidate.id,
        title: candidate.title,
        options: candidate.options,
        recommendedOption: candidate.recommendedOption,
        reason: candidate.reason,
        ...(optionReasons ? { optionReasons } : {}),
        ...(urgency ? { urgency } : {}),
      },
    ];
  });
}

function buildOperationalDirectedHandoffs(
  value: unknown,
): SyntheticDirectedHandoff[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<SyntheticDirectedHandoff>;
    if (typeof candidate.toSyntheticId !== "string") {
      return [];
    }

    return [
      {
        toSyntheticId: candidate.toSyntheticId,
        facts: Array.isArray(candidate.facts)
          ? candidate.facts.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
        constraints: Array.isArray(candidate.constraints)
          ? candidate.constraints.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
        openDecisions: Array.isArray(candidate.openDecisions)
          ? candidate.openDecisions.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
        blockedByUser: Array.isArray(candidate.blockedByUser)
          ? candidate.blockedByUser.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
        nextFocus: Array.isArray(candidate.nextFocus)
          ? candidate.nextFocus.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
      },
    ];
  });
}

function synthesizeDirectedHandoffs(input: {
  session: SyntheticSession;
  syntheticId: string;
  handoff: string | null;
  findings: string[];
  missingInformation: string[];
  nextSteps: string[];
  clarificationRequests: SyntheticClarificationRequest[];
  recommendedDecisions: SyntheticRecommendedDecision[];
}): SyntheticDirectedHandoff[] {
  // Downstream recipients for directed handoffs = agents connected by explicit
  // semantic edges (tension, oversight, amplification). Tension is bidirectional.
  const downstreamIds = uniqueNonEmpty([
    ...input.session.edges
      .filter(
        (edge) =>
          edge.type !== "structural" &&
          (edge.from === input.syntheticId ||
            (edge.type === "tension" && edge.to === input.syntheticId)),
      )
      .map((edge) =>
        edge.from === input.syntheticId ? edge.to : edge.from,
      ),
  ]);

  if (downstreamIds.length === 0) {
    return [];
  }

  return downstreamIds.map((toSyntheticId) => {
    const recipient =
      input.session.synthetics.find(
        (synthetic) => synthetic.id === toSyntheticId,
      ) ?? null;
    const recipientLabel = recipient?.name ?? toSyntheticId;

    return {
      toSyntheticId,
      facts: uniqueNonEmpty([
        ...input.findings.slice(0, 2),
        ...(input.handoff
          ? [`Downstream context for ${recipientLabel}: ${input.handoff}`]
          : []),
      ]),
      constraints: uniqueNonEmpty(
        input.nextSteps.length > 0
          ? input.nextSteps.slice(0, 2)
          : input.findings.slice(0, 1),
      ),
      openDecisions: uniqueNonEmpty(
        input.recommendedDecisions
          .slice(0, 2)
          .map((item) =>
            item.recommendedOption
              ? `${item.title}: prefer ${item.recommendedOption}`
              : item.title,
          ),
      ),
      blockedByUser: uniqueNonEmpty([
        ...input.missingInformation.slice(0, 2),
        ...input.clarificationRequests
          .filter((item) => item.required)
          .slice(0, 2)
          .map((item) => item.question),
      ]),
      nextFocus: uniqueNonEmpty(
        input.nextSteps.length > 0
          ? input.nextSteps.slice(0, 2)
          : input.handoff
            ? [`${recipientLabel} should continue from: ${input.handoff}`]
            : recipient?.role
              ? [`Continue with the next role focus: ${recipient.role}`]
              : [],
      ),
    };
  });
}

function listDownstreamRecipients(input: {
  session: SyntheticSession;
  syntheticId: string;
}): string[] {
  // Downstream = agents connected by explicit semantic edges (tension, oversight, amplification).
  // Tension is bidirectional: include both directions.
  const downstreamIds = uniqueNonEmpty([
    ...input.session.edges
      .filter(
        (edge) =>
          edge.type !== "structural" &&
          (edge.from === input.syntheticId ||
            (edge.type === "tension" && edge.to === input.syntheticId)),
      )
      .map((edge) =>
        edge.from === input.syntheticId ? edge.to : edge.from,
      ),
  ]);

  return downstreamIds.map((syntheticId) => {
    const synthetic =
      input.session.synthetics.find((item) => item.id === syntheticId) ?? null;
    return synthetic
      ? `${synthetic.name} (${synthetic.id})`
      : syntheticId;
  });
}

function buildOperationalReportFromUnknown(input: {
  value: unknown;
  session?: SyntheticSession | null;
  syntheticId: string;
  syntheticName: string;
  domain: string;
  handoff: string | null;
}): SyntheticOperationalReport | null {
  if (!input.value || typeof input.value !== "object") {
    return null;
  }

  const candidate = input.value as {
    summary?: unknown;
    acceptedAssumptions?: unknown;
    findings?: unknown;
    risks?: unknown;
    missingInformation?: unknown;
    clarificationRequests?: unknown;
    recommendedDecisions?: unknown;
    directedHandoffs?: unknown;
    nextSteps?: unknown;
    readiness?: unknown;
    artifactsReady?: unknown;
    userFacing?: unknown;
  };

  if (typeof candidate.summary !== "string") {
    return null;
  }

  const readiness = buildOperationalReadiness(candidate.readiness);
  if (!readiness) {
    return null;
  }

  const acceptedAssumptions = Array.isArray(candidate.acceptedAssumptions)
    ? candidate.acceptedAssumptions.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const findings = Array.isArray(candidate.findings)
    ? candidate.findings.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const risks = Array.isArray(candidate.risks)
    ? candidate.risks.filter((item): item is string => typeof item === "string")
    : [];
  const missingInformation = Array.isArray(candidate.missingInformation)
    ? candidate.missingInformation.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const nextSteps = Array.isArray(candidate.nextSteps)
    ? candidate.nextSteps.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const artifactsReady = Array.isArray(candidate.artifactsReady)
    ? candidate.artifactsReady.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
  const clarificationRequests = buildOperationalClarificationRequests(
    candidate.clarificationRequests,
  );
  const recommendedDecisions = buildOperationalRecommendedDecisions(
    candidate.recommendedDecisions,
  );
  const directedHandoffsRaw = buildOperationalDirectedHandoffs(
    candidate.directedHandoffs,
  );

  // Filter out handoffs referencing agents that don't exist in this session,
  // or that point back to the producing agent itself (self-handoff).
  const validSyntheticIds = new Set(
    input.session?.synthetics.map((s) => s.id) ?? [],
  );
  const directedHandoffs =
    validSyntheticIds.size > 0
      ? directedHandoffsRaw.filter((h) => {
          const inSession = validSyntheticIds.has(h.toSyntheticId);
          const isSelf = h.toSyntheticId === input.syntheticId;
          if ((!inSession || isSelf) && process.env.NODE_ENV !== "production") {
            console.warn(
              "[thinking-graph][orchestrator] dropping directedHandoff",
              {
                reason: !inSession ? "not_in_session" : "self_reference",
                toSyntheticId: h.toSyntheticId,
                producerSyntheticId: input.syntheticId,
              },
            );
          }
          return inSession && !isSelf;
        })
      : directedHandoffsRaw;

  const userFacing = deriveUserFacingBlock({
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    summary: candidate.summary,
    details: "",
    recommendation: "",
    missingInformation,
    clarificationRequests,
    recommendedDecisions,
    nextSteps,
    readiness,
    userFacing: buildUserFacingBlockFromUnknown(candidate.userFacing),
  });

  return {
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    domain: input.domain,
    summary: candidate.summary,
    acceptedAssumptions,
    findings,
    risks,
    missingInformation,
    clarificationRequests,
    recommendedDecisions,
    nextSteps,
    readiness,
    artifactsReady,
    handoff: input.handoff,
    directedHandoffs:
      directedHandoffs.length > 0
        ? directedHandoffs
        : input.session
          ? synthesizeDirectedHandoffs({
              session: input.session,
              syntheticId: input.syntheticId,
              handoff: input.handoff,
              findings,
              missingInformation,
              nextSteps,
              clarificationRequests,
              recommendedDecisions,
            })
          : [],
    userFacing,
  };
}

function tryParseJsonString(value: string): StoredSyntheticOutput | null {
  for (const candidate of normalizeJsonCandidate(value)) {
    try {
      return safeParseOutput(JSON.parse(candidate));
    } catch {
      // Fall through.
    }
  }

  return null;
}

function parseOutputsFromTexts(
  texts: string[],
): Record<string, StoredSyntheticOutput> {
  const outputsBySyntheticId: Record<string, StoredSyntheticOutput> = {};

  for (const text of texts) {
    const parsed = tryParseJsonString(text);
    if (!parsed) {
      continue;
    }

    outputsBySyntheticId[parsed.syntheticId] = parsed;
  }

  return outputsBySyntheticId;
}

function serializeOutput(
  output: StoredSyntheticOutput,
  backend: {
    provider: string;
    model: string;
  },
  raw?: unknown,
): SyntheticOutputJson {
  const operational =
    output.operational ??
    buildOperationalReportFromUnknown({
      value: output.operational,
      session: null,
      syntheticId: output.syntheticId,
      syntheticName: output.syntheticName,
      domain: output.domain ?? "general",
      handoff: output.handoff ?? null,
    });

  return createSyntheticJsonOutput({
    syntheticId: output.syntheticId,
    syntheticName: output.syntheticName,
    summary: output.summary,
    details: deriveDetailsFromOperational(operational, output.details),
    recommendation: deriveRecommendationFromOperational(
      operational,
      output.recommendation,
    ),
    changesFromPrevious: output.changesFromPrevious,
    appliedInputs: output.appliedInputs,
    ignoredInputs: output.ignoredInputs,
    keyRisks: deriveKeyRisksFromOperational(operational, output.keyRisks),
    concernLevels: output.concernLevels,
    operational,
    handoff: output.handoff ?? undefined,
    upstreamContext: output.upstreamContext,
    directedHandoffs:
      output.directedHandoffs ?? operational?.directedHandoffs ?? [],
    provider: backend.provider,
    model: backend.model,
    tokenUsage: normalizeTokenUsage(raw),
    raw,
    outputQuality: extractOutputQuality(raw),
  });
}

function extractOutputQuality(
  raw: unknown,
): SyntheticReport["outputQuality"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const q = (raw as Record<string, unknown>).quality;
  if (!q || typeof q !== "object") return undefined;
  const c = q as Record<string, unknown>;
  if (
    typeof c.validationAttempts !== "number" ||
    (c.validationStatus !== "pass" && c.validationStatus !== "fail") ||
    typeof c.usedLegacyCompatibilityFallback !== "boolean"
  ) {
    return undefined;
  }
  return {
    validationAttempts: c.validationAttempts,
    validationStatus: c.validationStatus,
    usedLegacyCompatibilityFallback: c.usedLegacyCompatibilityFallback,
  };
}

function normalizeOutputForSynthetic(input: {
  output: StoredSyntheticOutput;
  syntheticId: string;
  syntheticName: string;
}): StoredSyntheticOutput {
  return {
    ...input.output,
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
  };
}

function normalizeForSimilarity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeForSimilarity(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  const union = new Set([...left, ...right]);
  const intersectionSize = [...left].filter((token) => right.has(token)).length;
  return union.size === 0 ? 0 : intersectionSize / union.size;
}

function getSyntheticOutputSummary(output: SyntheticOutputJson): string {
  return isAdvisorReport(output) ? output.topRecommendation : output.summary;
}

function getSyntheticOutputDetails(output: SyntheticOutputJson): string {
  if (!isAdvisorReport(output)) {
    return output.details;
  }

  return [
    output.topRecommendation,
    ...output.strategicOptions.map(
      (option) => `${option.label}: ${option.rationale}`,
    ),
    ...output.conflictResolution.map(
      (item) => `${item.conflictId}: ${item.suggestedPath}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function getSyntheticOutputRecommendation(output: SyntheticOutputJson): string {
  if (!isAdvisorReport(output)) {
    return output.recommendation;
  }

  return output.strategicOptions[0]?.rationale ?? output.topRecommendation;
}

function getSyntheticOutputKeyRisks(output: SyntheticOutputJson): string[] {
  return isAdvisorReport(output) ? [] : output.keyRisks;
}

function getSyntheticOutputConcernLevels(output: SyntheticOutputJson) {
  return isAdvisorReport(output) ? null : output.concernLevels;
}

function getSyntheticOperational(output: SyntheticOutputJson) {
  return isAdvisorReport(output) ? null : output.operational ?? null;
}

function isLowNoveltyConflictResolution(input: {
  ideaPrompt: string;
  syntheticId: string;
  previousOutput?: StoredSyntheticOutput;
  nextOutput: StoredSyntheticOutput;
}): boolean {
  const hasMandatoryDirective = input.ideaPrompt.includes(
    "Conflict-resolution directive (mandatory for this iteration):",
  );
  if (!hasMandatoryDirective || !input.previousOutput) {
    return false;
  }
  if (
    !shouldApplyStrictCheckToSynthetic({
      ideaPrompt: input.ideaPrompt,
      syntheticId: input.syntheticId,
    })
  ) {
    return false;
  }
  if (
    hasUserDecisionSelectedForSynthetic(input.ideaPrompt, input.syntheticId)
  ) {
    return false;
  }

  const previousText = `${input.previousOutput.summary}\n${input.previousOutput.details}\n${input.previousOutput.recommendation}`;
  const nextText = `${input.nextOutput.summary}\n${input.nextOutput.details}\n${input.nextOutput.recommendation}`;

  const similarity = jaccardSimilarity(
    tokenSet(previousText),
    tokenSet(nextText),
  );
  return similarity >= 0.78;
}

function hasConcreteTradeoffSignal(text: string): boolean {
  const normalized = text.toLowerCase();
  return [
    "chosen",
    "rejected",
    "deprioritized",
    "deprioritize",
    "defer",
    "deferred",
    "prioritize",
    "focus on",
    "trade-off",
    "tradeoff",
    "vs ",
    "versus",
  ].some((token) => normalized.includes(token));
}

function hasConcreteStepSignal(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim());
  const bulletOrNumberedCount = lines.filter(
    (line) => line.startsWith("- ") || /^\d+\./.test(line),
  ).length;
  return bulletOrNumberedCount >= 2;
}

function requiresStrictConflictResolution(ideaPrompt: string): boolean {
  return (
    ideaPrompt.includes(
      "Conflict-resolution directive (mandatory for this iteration):",
    ) || ideaPrompt.includes("User decision selected for")
  );
}

function extractDecisionTargetSyntheticIds(ideaPrompt: string): Set<string> {
  const matches = Array.from(
    ideaPrompt.matchAll(/User decision selected for\s+([^\n\r:]+):/gi),
  );
  return new Set(
    matches
      .map((match) => (match[1] ? match[1].trim() : ""))
      .filter((value) => value.length > 0),
  );
}

function extractConflictRaisedBySyntheticId(ideaPrompt: string): string | null {
  const matches = Array.from(
    ideaPrompt.matchAll(/- Raised by:\s*([^\n\r]+)/gi),
  );
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch?.[1]) {
    return null;
  }
  return lastMatch[1].trim() || null;
}

function hasUserDecisionSelectedForSynthetic(
  ideaPrompt: string,
  syntheticId: string,
): boolean {
  const escaped = syntheticId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`User decision selected for\\s+${escaped}:`, "i");
  return regex.test(ideaPrompt);
}

function shouldApplyStrictCheckToSynthetic(input: {
  ideaPrompt: string;
  syntheticId: string;
}): boolean {
  const raisedBySyntheticId = extractConflictRaisedBySyntheticId(
    input.ideaPrompt,
  );
  if (raisedBySyntheticId) {
    return raisedBySyntheticId === input.syntheticId;
  }

  const decisionTargets = extractDecisionTargetSyntheticIds(input.ideaPrompt);
  if (decisionTargets.size > 0) {
    return decisionTargets.has(input.syntheticId);
  }

  return false;
}

function isMissingConcreteConflictResolution(input: {
  ideaPrompt: string;
  syntheticId: string;
  output: StoredSyntheticOutput;
}): boolean {
  if (!requiresStrictConflictResolution(input.ideaPrompt)) {
    return false;
  }
  if (
    !shouldApplyStrictCheckToSynthetic({
      ideaPrompt: input.ideaPrompt,
      syntheticId: input.syntheticId,
    })
  ) {
    return false;
  }

  const combinedText = [
    input.output.summary,
    input.output.details,
    input.output.recommendation,
    ...input.output.changesFromPrevious,
  ].join("\n");

  const hasSteps = hasConcreteStepSignal(combinedText);
  const hasTradeoff = hasConcreteTradeoffSignal(combinedText);
  if (
    hasUserDecisionSelectedForSynthetic(input.ideaPrompt, input.syntheticId)
  ) {
    return !hasSteps;
  }
  return !hasTradeoff || !hasSteps;
}

function stripResolvedDecisionsFromOutput(input: {
  output: StoredSyntheticOutput;
  resolvedDecisions: SyntheticSession["resolvedDecisions"];
}): StoredSyntheticOutput {
  const resolved = input.resolvedDecisions ?? [];
  if (resolved.length === 0) {
    return input.output;
  }

  const { output } = input;
  if (!output.operational) {
    return output;
  }

  // Build normalized keyword sets for matching
  const resolvedKeywords = resolved.map((d) =>
    [d.decisionTitle, d.optionLabel].join(" ").toLowerCase(),
  );

  function isAboutResolvedDecision(text: string): boolean {
    const lower = text.toLowerCase();
    return resolvedKeywords.some((kw) => {
      const words = kw.split(/\s+/).filter((w) => w.length > 3);
      return words.length > 0 && words.filter((w) => lower.includes(w)).length >= Math.ceil(words.length * 0.5);
    });
  }

  const filteredClarifications = (
    output.operational.clarificationRequests ?? []
  ).filter((cr) => !isAboutResolvedDecision(cr.question));

  const filteredDecisions = (
    output.operational.recommendedDecisions ?? []
  ).filter((rd) => !isAboutResolvedDecision(rd.title));

  if (
    filteredClarifications.length === (output.operational.clarificationRequests ?? []).length &&
    filteredDecisions.length === (output.operational.recommendedDecisions ?? []).length
  ) {
    return output;
  }

  return {
    ...output,
    operational: {
      ...output.operational,
      clarificationRequests: filteredClarifications,
      recommendedDecisions: filteredDecisions,
    },
  };
}

function isLowNoveltyAgainstStoredOutput(input: {
  previousOutput: StoredSyntheticOutput;
  nextOutput: StoredSyntheticOutput;
}): boolean {
  const previousText = `${input.previousOutput.summary}\n${input.previousOutput.details}\n${input.previousOutput.recommendation}`;
  const nextText = `${input.nextOutput.summary}\n${input.nextOutput.details}\n${input.nextOutput.recommendation}`;
  const similarity = jaccardSimilarity(
    tokenSet(previousText),
    tokenSet(nextText),
  );
  return similarity >= 0.82;
}

function isLowNoveltyText(left: string, right: string): boolean {
  return jaccardSimilarity(tokenSet(left), tokenSet(right)) >= 0.9;
}

/**
 * Builds a compact delta-oriented context block from the prior output.
 * This replaces the full JSON injection so the model cannot simply
 * reproduce the previous output verbatim.
 */
function buildPriorOutputContext(
  priorOutput: StoredSyntheticOutput,
  conversation: SyntheticConversationMessage[],
): string {
  const lines: string[] = [
    "Previous iteration context (do NOT copy this — revise, deepen, or contrast it):",
    `- Last summary: "${priorOutput.summary}"`,
  ];

  if (priorOutput.keyRisks && priorOutput.keyRisks.length > 0) {
    lines.push(`- Risks already identified: ${priorOutput.keyRisks.slice(0, 3).join(" | ")}`);
  }

  if (priorOutput.recommendation) {
    lines.push(`- Last recommendation: "${priorOutput.recommendation.slice(0, 200)}"`);
  }

  const operational = priorOutput.operational;
  if (operational) {
    if (operational.missingInformation && operational.missingInformation.length > 0) {
      lines.push(`- Still unresolved from last run: ${operational.missingInformation.slice(0, 2).join("; ")}`);
    }
    if (operational.nextSteps && operational.nextSteps.length > 0) {
      lines.push(`- Next steps from last run: ${operational.nextSteps.slice(0, 2).join("; ")}`);
    }
  }

  if (conversation.length === 0) {
    lines.push(
      "",
      "WARNING: No clarification was applied since the last run.",
      "You MUST advance the analysis — do not reproduce the previous summary.",
      "Required: add at least one new concrete finding, quantify an existing risk, or examine a tradeoff not covered in the previous summary.",
    );
  } else {
    lines.push(
      "",
      `${conversation.length} clarification(s) were applied since the last run — incorporate them explicitly and explain what changed.`,
    );
  }

  return lines.join("\n");
}

function buildBlockedConflictResolutionOutput(input: {
  syntheticId: string;
  syntheticName: string;
  output: StoredSyntheticOutput;
}): StoredSyntheticOutput {
  return {
    ...input.output,
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    summary:
      "Conflict directive was not resolved with materially new decisions in this iteration.",
    details:
      "The proposed resolution substantially repeated the prior iteration. A concrete trade-off decision is still missing. Provide a specific choice, explain what is deprioritized, and define execution steps with measurable checks.",
    recommendation:
      "Resolve this conflict explicitly by naming one chosen direction, one rejected alternative, and 2-5 concrete implementation steps tied to role-specific constraints.",
    changesFromPrevious: [
      ...input.output.changesFromPrevious,
      "Server quality gate flagged low-novelty conflict resolution output.",
    ],
    ignoredInputs: [
      ...input.output.ignoredInputs,
      "Mandatory conflict-resolution directive was not satisfied with a materially new plan.",
    ],
    concernLevels: {
      feasibility: Math.max(
        0,
        Math.min(100, input.output.concernLevels.feasibility - 10),
      ),
      risk: Math.max(80, input.output.concernLevels.risk),
      complexityLabel: "high",
    },
    handoff:
      input.output.handoff ??
      "Downstream roles should challenge this unresolved conflict until a concrete decision is made.",
  };
}

function buildQualityGateBlockedOutput(input: {
  syntheticId: string;
  syntheticName: string;
  output: StoredSyntheticOutput;
  validationReport: ValidationReport;
}): StoredSyntheticOutput {
  const requiredFixes =
    input.validationReport.revisionRequest?.requiredFixes ?? [];
  const userActions = requiredFixes.map((fix) =>
    toUserActionFromRequiredFix(fix),
  );

  return {
    ...input.output,
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    // Preserve the agent's actual summary — it contains the real finding.
    // The quality gate status is surfaced via qualityGateMessage, not by overwriting summary.
    qualityGateMessage:
      "Shadow validator: output passed retry budget with unresolved violations",
    changesFromPrevious: [
      ...input.output.changesFromPrevious.filter(
        (s) => !s.includes("Shadow validator") && !s.includes("Validator revision"),
      ),
      "Output required multiple retries — review open questions below",
    ],
    ignoredInputs: input.output.ignoredInputs.filter(
      (s) => !s.includes("Validator revision request") && !s.startsWith("Pending clarification:"),
    ),
    concernLevels: {
      feasibility: Math.max(
        0,
        Math.min(100, input.output.concernLevels.feasibility - 15),
      ),
      risk: Math.max(85, input.output.concernLevels.risk),
      complexityLabel: "high",
    },
    handoff:
      input.output.handoff ??
      "Downstream should treat this node as blocked_by_quality_gate.",
  };
}

/**
 * Builds a deferred placeholder output for an agent that cannot run because
 * one or more of its upstream dependencies have not yet produced output in
 * the current session memory.
 *
 * The placeholder is stored as the agent's output for this run so the UI
 * shows a clear "waiting for peer" state rather than stale or missing data.
 * The agent should be re-run once all upstream peers have completed.
 */
function buildWaitingForUpstreamOutput(input: {
  syntheticId: string;
  syntheticName: string;
  missingUpstreamIds: string[];
  backend: { provider: string; model: string };
}): StoredSyntheticOutput {
  const missingList = input.missingUpstreamIds.join(", ");
  return {
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    domain: "general",
    summary: `Waiting for upstream agents to complete before this agent can run.`,
    details: `This agent depends on output from: ${missingList}. Re-run the chain once those agents have completed.`,
    recommendation: `Complete upstream agents (${missingList}) and re-run.`,
    changesFromPrevious: ["Agent deferred — upstream context not yet available."],
    appliedInputs: [],
    ignoredInputs: [`Upstream context from ${missingList} was not available.`],
    keyRisks: [
      "Cross-agent reasoning will be incomplete until all upstream agents have run.",
      "This agent's output is a placeholder and should not be used for planning.",
    ],
    concernLevels: {
      feasibility: 0,
      risk: 80,
      complexityLabel: "low",
    },
    handoff: null,
    upstreamContext: [],
    operational: {
      syntheticId: input.syntheticId,
      syntheticName: input.syntheticName,
      domain: "general",
      summary: `Waiting for upstream agents: ${missingList}.`,
      acceptedAssumptions: [],
      findings: [],
      risks: ["Agent deferred — upstream context not yet available."],
      missingInformation: input.missingUpstreamIds.map(
        (id) => `Output from upstream agent "${id}"`,
      ),
      clarificationRequests: [],
      recommendedDecisions: [],
      nextSteps: [`Re-run the chain after upstream agents complete: ${missingList}`],
      readiness: {
        canContinue: false,
        blocked: true,
        blockers: input.missingUpstreamIds.map(
          (id) => `Upstream agent "${id}" has not produced output yet.`,
        ),
        status: "waiting_for_upstream",
      },
      artifactsReady: [],
      handoff: null,
      userFacing: {
        state: "user_input_required",
        title: "Waiting for peer agents",
        summary: `This agent is waiting for output from: ${missingList}. Re-run the chain to proceed.`,
        whatWeKnow: [],
        whatIsNeededNow: input.missingUpstreamIds.map(
          (id) => `Run upstream agent: ${id}`,
        ),
        whoActsNext: "user",
        nextStep: `Re-run the chain after: ${missingList}`,
        options: [],
        questions: [],
        actions: [{ type: "continue", label: "Re-run chain" }],
      },
    },
  };
}

function toUserActionFromRequiredFix(requiredFix: string): string {
  const normalized = requiredFix.toLowerCase();

  if (normalized.includes("handoff")) {
    return "Specify the next owner for this output and what exactly they should do next.";
  }

  if (normalized.includes("risk")) {
    return "Add at least 2 concrete risks that could break execution.";
  }

  if (
    normalized.includes("summary") ||
    normalized.includes("recommendation") ||
    normalized.includes("actionable specificity")
  ) {
    return "Rewrite the recommendation as 2-4 concrete implementation steps.";
  }

  if (normalized.includes("role perspective")) {
    return "Keep this response strictly in the current role perspective.";
  }

  return `Clarify this item: ${requiredFix}`;
}

function isBlockedConflictResolutionOutput(
  output: StoredSyntheticOutput,
): boolean {
  return output.summary.startsWith(
    "Conflict directive was not resolved with materially new decisions",
  );
}

function buildDecisionRequiredPayload(input: {
  syntheticId: string;
  syntheticName: string;
}): DecisionRequiredPayload {
  return {
    type: "decision_required",
    syntheticId: input.syntheticId,
    title: `Decision required for ${input.syntheticName}`,
    question:
      "Pick one resolution strategy to force a concrete trade-off in the next iteration.",
    options: [
      {
        id: "pick_primary_objective",
        label: "Pick one primary objective",
        description:
          "Choose one must-win objective for this iteration and explicitly defer competing goals.",
      },
      {
        id: "cut_competing_requirement",
        label: "Cut one competing requirement",
        description:
          "Name one requirement to deprioritize now, with reason and impact on scope.",
      },
      {
        id: "timebox_experiment",
        label: "Run a timeboxed experiment",
        description:
          "Keep both goals but reduce scope to a short experiment with pass/fail checks.",
      },
    ],
    required: true,
  };
}

function buildUpstreamContext(
  session: SyntheticSession,
  syntheticId: string,
): string[] {
  const sourceIds = getInboundContextSourceIds(session, syntheticId);
  if (sourceIds.length === 0) {
    return [];
  }

  return sourceIds
    .map((sourceId) => session.memoryBySyntheticId[sourceId]?.latestOutput)
    .filter((output): output is SyntheticOutputJson => Boolean(output))
    .map((output) => JSON.stringify(output));
}

function buildSequentialUpstreamContext(input: {
  session: SyntheticSession;
  syntheticId: string;
  context: AgentRunContext;
}): string[] {
  const sourceIds = getInboundContextSourceIds(
    input.session,
    input.syntheticId,
  );
  if (sourceIds.length === 0) {
    return [];
  }

  return sourceIds
    .map((sourceId) =>
      safeParseOutput(
        input.context.state.get<unknown>(outputKeyForSyntheticId(sourceId)),
      ),
    )
    .filter((output): output is StoredSyntheticOutput => Boolean(output))
    .map((output) => JSON.stringify(output));
}

function buildUpstreamContextFromAccumulatedState(input: {
  session: SyntheticSession;
  syntheticId: string;
  state: Record<string, unknown>;
}): string[] {
  const sourceIds = getInboundContextSourceIds(
    input.session,
    input.syntheticId,
  );
  if (sourceIds.length === 0) {
    return [];
  }

  return sourceIds
    .map((sourceId) =>
      safeParseOutput(input.state[outputKeyForSyntheticId(sourceId)]),
    )
    .filter((output): output is StoredSyntheticOutput => Boolean(output))
    .map((output) => JSON.stringify(output));
}

function formatDirectedHandoffForPrompt(input: {
  fromSyntheticId: string;
  handoff: SyntheticDirectedHandoff;
}): string {
  const sections = [
    `From ${input.fromSyntheticId} -> ${input.handoff.toSyntheticId}`,
    input.handoff.facts.length > 0
      ? `Facts:\n- ${input.handoff.facts.join("\n- ")}`
      : null,
    input.handoff.constraints.length > 0
      ? `Constraints:\n- ${input.handoff.constraints.join("\n- ")}`
      : null,
    input.handoff.openDecisions.length > 0
      ? `Open decisions:\n- ${input.handoff.openDecisions.join("\n- ")}`
      : null,
    input.handoff.blockedByUser.length > 0
      ? `Blocked by user:\n- ${input.handoff.blockedByUser.join("\n- ")}`
      : null,
    input.handoff.nextFocus.length > 0
      ? `Next focus:\n- ${input.handoff.nextFocus.join("\n- ")}`
      : null,
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n");
}

function buildRecipientSpecificContextPacket(input: {
  session: SyntheticSession;
  syntheticId: string;
  stateSource: "context" | "state";
  context?: AgentRunContext;
  state?: Record<string, unknown>;
}): {
  globalContext: string[];
  directHandoffs: string[];
  filteredInheritedContext: string[];
} {
  const inboundSources = getInboundContextSourcesWithType(
    input.session,
    input.syntheticId,
  );
  const sourceIds = inboundSources.map((s) => s.sourceId);
  const edgeTypeBySourceId = new Map(inboundSources.map((s) => [s.sourceId, s.edgeType]));

  if (sourceIds.length === 0) {
    return {
      globalContext: [],
      directHandoffs: [],
      filteredInheritedContext: [],
    };
  }

  const parsedOutputs = sourceIds
    .map((sourceId) => {
      const output =
        input.stateSource === "context"
          ? safeParseOutput(
              input.context?.state.get<unknown>(
                outputKeyForSyntheticId(sourceId),
              ),
            )
          : safeParseOutput(input.state?.[outputKeyForSyntheticId(sourceId)]);

      return output
        ? {
            sourceId,
            output,
          }
        : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        sourceId: string;
        output: StoredSyntheticOutput;
      } => Boolean(entry),
    );

  const directHandoffs = parsedOutputs.flatMap(({ sourceId, output }) => {
    const candidate =
      output.directedHandoffs?.filter(
        (handoff) => handoff.toSyntheticId === input.syntheticId,
      ) ?? [];

    if (candidate.length > 0) {
      return candidate.map((handoff) =>
        formatDirectedHandoffForPrompt({
          fromSyntheticId: sourceId,
          handoff,
        }),
      );
    }

    // Fallback: synthesize a handoff from operational data so downstream agents
    // receive findings, risks, and constraints — not just a one-line summary.
    const op = output.operational;
    const facts = uniqueNonEmpty([
      ...(output.summary ? [output.summary] : []),
      ...(op?.findings ?? []).slice(0, 3),
    ]);
    const constraints = uniqueNonEmpty([
      ...(op?.risks ?? []).slice(0, 2),
      ...(op?.missingInformation ?? []).slice(0, 1),
    ]);
    const nextFocus = uniqueNonEmpty([
      ...(output.handoff ? [output.handoff] : []),
      ...(op?.nextSteps ?? []).slice(0, 2),
    ]);

    if (facts.length === 0 && constraints.length === 0 && nextFocus.length === 0) {
      return [];
    }

    return [
      formatDirectedHandoffForPrompt({
        fromSyntheticId: sourceId,
        handoff: {
          toSyntheticId: input.syntheticId,
          facts,
          constraints,
          openDecisions:
            op?.recommendedDecisions
              .slice(0, 2)
              .map((item) =>
                item.recommendedOption
                  ? `${item.title}: prefer ${item.recommendedOption}`
                  : item.title,
              ) ?? [],
          blockedByUser:
            op?.clarificationRequests
              .filter((item) => item.required)
              .slice(0, 2)
              .map((item) => item.question) ?? [],
          nextFocus,
        },
      }),
    ];
  });

  const filteredInheritedContext = uniqueNonEmpty(
    parsedOutputs.flatMap(({ sourceId, output }) => {
      const sourceLabel = output.syntheticName || output.syntheticId;
      const edgeType = edgeTypeBySourceId.get(sourceId) ?? "peer";
      // Prefix context items with their relationship framing so agents understand
      // whether this is a tension opponent, something under review, an amplified signal,
      // or a default peer colleague.
      const prefix =
        edgeType === "tension"
          ? `[${sourceLabel}] Opposing position — push back on this:`
          : edgeType === "oversight"
            ? `[${sourceLabel}] Work you are reviewing:`
            : edgeType === "amplification"
              ? `[${sourceLabel}] Amplified signal — weight this heavily:`
              : `[${sourceLabel}] Peer finding:`;
      const riskPrefix = `[${sourceLabel}] Risk:`;
      return [
        ...(output.operational?.findings ?? []).slice(0, 2).map((f) => `${prefix} ${f}`),
        ...(output.operational?.risks ?? []).slice(0, 2).map((r) => `${riskPrefix} ${r}`),
        ...(output.operational?.missingInformation ?? []).slice(0, 2),
        ...(output.operational?.nextSteps ?? []).slice(0, 2),
      ];
    }),
  );

  return {
    globalContext: [],
    directHandoffs,
    filteredInheritedContext,
  };
}

// ---------------------------------------------------------------------------
// Advisor / Strategist helpers
// ---------------------------------------------------------------------------

/**
 * Builds the system instruction for an Advisor/Strategist node.
 * Called after ALL regular agent outputs are available so the advisor can
 * read them all and synthesise a top-level strategic view.
 */
function buildAdvisorInstruction(input: {
  session: SyntheticSession;
  syntheticId: string;
  syntheticName: string;
  role: string;
  outputsBySyntheticId: Record<string, SyntheticOutputJson>;
  projectFilesContext?: string | null;
  preVerdict?: { verdict: "go" | "conditional" | "no_go"; blockingAgentName?: string; blockingCondition?: string } | null;
}): string {
  const agentSummaries = input.session.synthetics
    .filter((s) => s.id !== input.syntheticId && input.outputsBySyntheticId[s.id])
    .map((s) => {
      const out = input.outputsBySyntheticId[s.id];
      if (!out || isAdvisorReport(out)) return null;
      return [
        `## [${s.code}] ${s.name}`,
        `Summary: ${out.summary}`,
        out.recommendation ? `Recommendation: ${out.recommendation}` : null,
        out.keyRisks?.length ? `Key risks: ${out.keyRisks.slice(0, 2).join("; ")}` : null,
        out.operational?.readiness?.blocked
          ? `Blocked: ${out.operational.readiness.blockers.join("; ")}`
          : null,
        out.operational?.recommendedDecisions?.length
          ? `Open decisions: ${out.operational.recommendedDecisions.map((d) => d.title).join(", ")}`
          : null,
      ].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const ideaPrompt = input.session.ideaPrompt;

  const verdictBlock = input.preVerdict
    ? (() => {
        const v = input.preVerdict;
        if (v.verdict === "no_go" && v.blockingAgentName) {
          return `Current run verdict: NO-GO\nBlocking agent: ${v.blockingAgentName}${v.blockingCondition ? ` — "${v.blockingCondition}"` : ""}\nYour topRecommendation must explain this verdict and state what specifically must change for it to become GO.`;
        }
        if (v.verdict === "conditional") {
          return `Current run verdict: CONDITIONAL\nSome agents have open concerns. Your topRecommendation should address the most important unresolved condition.`;
        }
        return `Current run verdict: GO\nAll agents cleared. Your topRecommendation should focus on the highest-impact next action.`;
      })()
    : null;

  const lines = [
    `You are [${input.syntheticId}] ${input.syntheticName}.`,
    `Your role: ${input.role}`,
    "You run LAST in the pipeline and have access to every other agent's completed output.",
    "Your job is cross-agent synthesis — not domain analysis. Do not repeat what individual agents said. Extract the strategic signal from the noise.",
    "Respond in JSON only. Do not wrap the JSON in markdown fences.",
    `Idea prompt: ${ideaPrompt}`,
    input.projectFilesContext,
    input.projectFilesContext
      ? "Project file context rule: preserve exact file facts in your strategicOptions rationale or topRecommendation when they materially constrain the plan."
      : null,
    verdictBlock,
    "Agent outputs (all agents have completed this run):",
    agentSummaries || "No agent outputs available.",
    "Return a JSON object with exactly these fields:",
    '- "syntheticId": string — your node id',
    '- "syntheticName": string — your node name',
    '- "topRecommendation": string — the single most important action the user should take right now, in one clear sentence',
    '- "strategicOptions": { "label": string, "rationale": string, "tradeoff": string }[] — 2 to 3 strategic paths; each must name a concrete option, explain why it makes sense given the agent findings, and state what the user gives up',
    '- "conflictResolution": { "conflictId": string, "suggestedPath": string, "whyThisPath": string }[] — one entry per active conflict between agents; conflictId should identify the agents involved (e.g. "ENG_vs_FIN"); suggestedPath is a concrete next action that resolves or defuses the tension',
    "Do not add extra fields. Do not pad with generic statements.",
  ];

  return lines.join("\n");
}

/**
 * Parses the raw LLM response from an Advisor node into an AdvisorReport.
 * Returns null if the response does not match the expected schema.
 */
function safeParseAdvisorOutput(input: {
  text: string;
  syntheticId: string;
  syntheticName: string;
  backend: { provider: string; model: string };
  raw?: unknown;
}): AdvisorReport | null {
  let parsed: unknown;
  try {
    const jsonStart = input.text.indexOf("{");
    const jsonEnd = input.text.lastIndexOf("}");
    const jsonStr =
      jsonStart !== -1 && jsonEnd > jsonStart
        ? input.text.slice(jsonStart, jsonEnd + 1)
        : input.text;
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const c = parsed as Record<string, unknown>;

  if (typeof c.topRecommendation !== "string" || !c.topRecommendation.trim()) {
    return null;
  }

  const parseStrategicOptions = (arr: unknown) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        label: typeof item.label === "string" ? item.label : "",
        rationale: typeof item.rationale === "string" ? item.rationale : "",
        tradeoff: typeof item.tradeoff === "string" ? item.tradeoff : "",
        category: typeof item.category === "string" ? item.category.toLowerCase().trim() : null,
      }))
      .filter((item) => item.label.trim().length > 0);
  };

  const parseConflictResolutions = (arr: unknown) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        conflictId: typeof item.conflictId === "string" ? item.conflictId : "",
        suggestedPath: typeof item.suggestedPath === "string" ? item.suggestedPath : "",
        whyThisPath: typeof item.whyThisPath === "string" ? item.whyThisPath : "",
      }))
      .filter((item) => item.conflictId.trim().length > 0);
  };

  return {
    kind: "advisor",
    syntheticId: typeof c.syntheticId === "string" ? c.syntheticId : input.syntheticId,
    syntheticName: typeof c.syntheticName === "string" ? c.syntheticName : input.syntheticName,
    topRecommendation: c.topRecommendation,
    strategicOptions: parseStrategicOptions(c.strategicOptions),
    conflictResolution: parseConflictResolutions(c.conflictResolution),
    model: { provider: input.backend.provider, model: input.backend.model },
    tokenUsage: normalizeTokenUsage(input.raw),
    raw: input.raw ?? null,
  };
}

// ---------------------------------------------------------------------------
// Aggregator helpers
// ---------------------------------------------------------------------------

function buildAggregatorInstruction(input: {
  session: SyntheticSession;
  outputsBySyntheticId: Record<string, SyntheticOutputJson>;
  projectFilesContext?: string | null;
}): string {
  const agentSummaries = input.session.synthetics
    .filter((s) => input.outputsBySyntheticId[s.id])
    .map((s) => {
      const output = input.outputsBySyntheticId[s.id]!;
      const operational = getSyntheticOperational(output);
      const concernLevels = getSyntheticOutputConcernLevels(output);
      const findings = operational?.findings ?? [];
      const findingsStr = findings.length > 0
        ? `\n  Findings: ${findings.slice(0, 3).join(" | ")}`
        : "";
      return [
        `[${s.code}] ${s.name} (${s.role.slice(0, 300)})`,
        `  ID: ${s.id}`,
        `  Summary: ${getSyntheticOutputSummary(output)}`,
        `  Key Risks: ${getSyntheticOutputKeyRisks(output).slice(0, 3).join(" | ")}`,
        `  Recommendation: ${getSyntheticOutputRecommendation(output).slice(0, 200) || "none"}`,
        `  Concern Levels: feasibility=${concernLevels?.feasibility ?? 0}% risk=${concernLevels?.risk ?? 0}%`,
        findingsStr,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");

  const edgeDescriptions = input.session.edges
    .map((edge) => {
      const from = input.session.synthetics.find((s) => s.id === edge.from);
      const to = input.session.synthetics.find((s) => s.id === edge.to);
      if (!from || !to) return null;
      if (edge.type === "structural") return null;
      const labels: Record<string, string> = {
        tension: `${from.name} ↔ ${to.name} (tension): structurally opposing mandates — both argue from their role constraints`,
        oversight: `${from.name} → ${to.name} (oversight): ${from.name} has formal authority to review ${to.name}'s work`,
        amplification: `${from.name} → ${to.name} (amplification): ${from.name}'s findings elevate and concretise ${to.name}'s concerns`,
      };
      return labels[edge.type] ?? `${from.name} → ${to.name} (${edge.type})`;
    })
    .filter(Boolean)
    .join("\n");

  const tensionEdges = input.session.edges.filter((e) => e.type === "tension");

  return [
    "You are the cross-agent synthesis layer for a structured team simulation.",
    "Analyze all agent outputs in context of their graph relationships and produce a unified cross-team report.",
    "",
    `Idea prompt: ${input.session.ideaPrompt}`,
    input.projectFilesContext ? `\n${input.projectFilesContext}` : null,
    input.projectFilesContext
      ? "Project file context rule: include exact file facts in the executive brief or action items when they materially constrain the plan."
      : null,
    "",
    "## Agent Outputs",
    agentSummaries || "(no outputs yet)",
    "",
    edgeDescriptions
      ? `## Graph Relationships\n${edgeDescriptions}`
      : "## Graph Relationships\nNo explicit relationships defined.",
    "",
    "## Instructions",
    "Using the relationship context above, synthesize a cross-agent report.",
    "For tension edges: identify the specific structural conflict and propose a concrete resolution path.",
    "For oversight edges: assess whether the reviewer's concerns are satisfied by the reviewed agent's output.",
    "For amplification edges: explain how one agent's findings strengthen or make concrete the other agent's concerns.",
    "Even without explicit edges, detect emergent tensions between any agents with opposing recommendations.",
    "",
    "Return ONLY valid JSON, no markdown fences:",
    JSON.stringify({
      executiveBrief: [
        {
          sentence: "One key cross-team finding — specific, not generic.",
          sourceIds: ["exact-syntheticId-of-agent-whose-finding-drives-this-sentence"],
        },
      ],
      actionItems: ["3-5 concrete prioritized next steps from the combined analysis"],
      biggestConflict: { title: "...", description: "...", raisedBy: "agent name", suggestion: "..." },
      conflictMap: [{ fromSyntheticId: "exact-id", toSyntheticId: "exact-id", title: "...", description: "...", suggestion: "...", severity: "medium or high" }],
    }, null, 2),
    "executiveBrief rules: 2-4 actionable items. Format: 'RECOMMENDATION: X' or 'KEY FINDING: X' or 'BLOCKER: X'. Each sentence must be 1-2 lines max, concise and specific to this project (no generic statements). sourceIds must list agents that drove each sentence. Avoid lengthy explanations — state what's true, not why it's true (the why is in agent details).",
    "",
    tensionEdges.length > 0
      ? `conflictMap must have exactly ${tensionEdges.length} entr${tensionEdges.length === 1 ? "y" : "ies"} matching the tension-type edges.`
      : [
          "No explicit tension edges were drawn, but you MUST still detect emergent tensions.",
          'Search for opposing recommendations: e.g. one agent wants to expand scope while another warns about timeline. Fill "conflictMap" with 1-2 entries for any real tensions you find.',
          'If there are truly no tensions at all, set "conflictMap" to [] and "biggestConflict" to null.',
        ].join(" "),
    "Use the exact syntheticId values from the agent data above.",
    "Keep all string values under 200 characters.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function parseAggregatorOutput(text: string): {
  executiveBrief: import("./types").BriefSentence[];
  actionItems: string[];
  biggestConflict: RunSummaryConflict | null;
  conflictMap: RunSummaryConflictEdge[];
} | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]) as {
      executiveBrief?: unknown;
      actionItems?: unknown;
      biggestConflict?: unknown;
      conflictMap?: unknown;
    };

    // Parse executiveBrief in both formats — backwards-compatible:
    //   New: [{ sentence: string, sourceIds: string[] }]  (from updated prompt)
    //   Old: [string]  (model returned plain strings — wraps with empty sourceIds)
    const executiveBrief: import("./types").BriefSentence[] = [];

    if (Array.isArray(data.executiveBrief)) {
      for (const item of data.executiveBrief) {
        if (typeof item === "string" && item.trim()) {
          executiveBrief.push({ sentence: item.trim(), sourceIds: [] });
        } else if (item && typeof item === "object") {
          const s = (item as Record<string, unknown>).sentence;
          const ids = (item as Record<string, unknown>).sourceIds;
          const sentence = typeof s === "string" ? s.trim() : "";
          const sourceIds = Array.isArray(ids)
            ? ids.filter((id): id is string => typeof id === "string")
            : [];
          if (sentence) executiveBrief.push({ sentence, sourceIds });
        }
      }
    }
    const actionItems = Array.isArray(data.actionItems)
      ? data.actionItems.filter((s): s is string => typeof s === "string")
      : [];

    let biggestConflict: RunSummaryConflict | null = null;
    if (data.biggestConflict && typeof data.biggestConflict === "object") {
      const bc = data.biggestConflict as Record<string, unknown>;
      biggestConflict = {
        title: typeof bc.title === "string" ? bc.title : "",
        description: typeof bc.description === "string" ? bc.description : "",
        raisedBy: typeof bc.raisedBy === "string" ? bc.raisedBy : null,
        suggestion: typeof bc.suggestion === "string" ? bc.suggestion : "",
      };
    }

    const conflictMap: RunSummaryConflictEdge[] = Array.isArray(data.conflictMap)
      ? data.conflictMap.flatMap((item): RunSummaryConflictEdge[] => {
          if (!item || typeof item !== "object") return [];
          const c = item as Record<string, unknown>;
          if (typeof c.fromSyntheticId !== "string" || typeof c.toSyntheticId !== "string") return [];
          return [
            {
              fromSyntheticId: c.fromSyntheticId,
              toSyntheticId: c.toSyntheticId,
              title: typeof c.title === "string" ? c.title : "Conflict",
              description: typeof c.description === "string" ? c.description : "",
              suggestion: typeof c.suggestion === "string" ? c.suggestion : "",
              severity: c.severity === "high" ? "high" : "medium",
            },
          ];
        })
      : [];

    return { executiveBrief, actionItems, biggestConflict, conflictMap };
  } catch {
    return null;
  }
}

function buildDomainExamples(identifiedDomain: string | undefined): {
  decisionsExample: string;
  clarificationExample: string;
} {
  const d = (identifiedDomain ?? "").toLowerCase().replace(/-/g, "_");
  if (d.includes("game") || d === "gamedev") {
    return {
      decisionsExample: 'GP offers "Unity" vs "Godot", UX offers "Minimalist HUD" vs "Diegetic HUD", GD offers "Precision Platformer" vs "Metroidvania"',
      clarificationExample: '"Which engine — Unity or Godot?"',
    };
  }
  if (d.includes("saas") || d.includes("b2b") || d.includes("b2c")) {
    return {
      decisionsExample: 'CTO offers "Build custom auth" vs "Use Auth0/Clerk", PM offers "Freemium" vs "Free trial + paid", CMO offers "Product-led growth" vs "Sales-led growth"',
      clarificationExample: '"Which authentication strategy — build in-house or use a managed provider like Auth0?"',
    };
  }
  if (d.includes("startup") || d.includes("business") || d.includes("marketplace") || d.includes("platform") || d.includes("venture")) {
    return {
      decisionsExample: 'Founder offers "Bootstrap to revenue" vs "Raise a pre-seed round", CTO offers "Build MVP in-house" vs "Hire an agency for v1", CMO offers "Content-led inbound" vs "Outbound cold outreach"',
      clarificationExample: '"What is the go-to-market motion — bootstrap to first revenue, or raise capital and scale fast?"',
    };
  }
  if (d.includes("health") || d.includes("fitness") || d.includes("medical")) {
    return {
      decisionsExample: 'Tech offers "Native iOS/Android" vs "React Native cross-platform", PM offers "Subscription" vs "One-time purchase", Legal offers "Consumer wellness (exempt)" vs "Clinical-grade HIPAA-compliant"',
      clarificationExample: '"What regulatory tier applies — consumer wellness or clinical-grade HIPAA?"',
    };
  }
  if (d.includes("education") || d.includes("edtech") || d.includes("learning")) {
    return {
      decisionsExample: 'Tech offers "Web app" vs "Native mobile app", PM offers "B2C to learners" vs "B2B to institutions", Content offers "Synchronous live sessions" vs "Async self-paced"',
      clarificationExample: '"Who is the primary learner — K-12 students, adult professionals, or corporate teams?"',
    };
  }
  return {
    decisionsExample: 'Tech offers "Build custom" vs "Buy third-party solution", PM offers "Launch MVP now" vs "Validate further first", Finance offers "Bootstrap" vs "Raise seed round"',
    clarificationExample: '"Which deployment model — cloud-hosted SaaS or self-hosted on-premises?"',
  };
}

export function buildRunInstruction(input: {
  session: SyntheticSession;
  syntheticId: string;
  syntheticName: string;
  syntheticCode: string;
  role: string;
  attempt: number;
  retryFromOutput?: StoredSyntheticOutput | null;
  retryRequiredFixes?: string[];
  retryViolations?: Array<{ code: string; message: string; severity: string }>;
  retryReason?: "self_repeat" | "validator_fail";
  projectFilesContext?: string | null;
}): (context: AgentRunContext) => string {
  return (context) => {
    let ideaPrompt =
      context.state.get<string>("ideaPrompt", input.session.ideaPrompt) ?? "";

    // Inject proposed improvements directly into the idea text
    const improvements = (input.session.proposedImprovements ?? []).filter(
      (p) => p.syntheticId === input.syntheticId,
    );
    if (improvements.length > 0) {
      const improvementsBlock = improvements
        .map((p) => `- To address "${p.riskDescription}": ${p.proposal}`)
        .join("\n");
      ideaPrompt += `\n\nUser-proposed improvements to address identified risks:\n${improvementsBlock}`;
    }

    const priorOutput =
      input.session.memoryBySyntheticId[input.syntheticId]?.latestOutput;
    iterationLog("orchestrator_agent_prompt", {
      syntheticId: input.syntheticId,
      ideaPromptPreview: ideaPrompt.slice(0, 500),
      preparedInputs: input.session.preparedInputs,
      hasPreviousOutput: Boolean(priorOutput),
      latestOutputSummaryPreview: priorOutput
        ? JSON.stringify(priorOutput).slice(0, 200)
        : null,
      memoryKeys: Object.keys(input.session.memoryBySyntheticId),
    });
    const conversation = (
      input.session.memoryBySyntheticId[input.syntheticId]?.conversation ?? []
    ).filter((message) => message.includeInNextIteration);
    const responseLanguage = resolveRunResponseLanguage({
      ideaPrompt,
      conversation,
    });
    const recipientContext = buildRecipientSpecificContextPacket({
      session: input.session,
      syntheticId: input.syntheticId,
      stateSource: "context",
      context,
    });
    const downstreamRecipients = listDownstreamRecipients({
      session: input.session,
      syntheticId: input.syntheticId,
    });
    const otherRoles = input.session.synthetics
      .filter((synthetic) => synthetic.id !== input.syntheticId)
      .map((synthetic) => `[${synthetic.code}] ${synthetic.name}`);
    const domainExamples = buildDomainExamples(input.session.directorOutput?.identifiedDomain);

    return [
      `You are [${input.syntheticCode}] ${input.syntheticName}.`,
      `Your role responsibilities: ${input.role}`,
      "Role lock (strict):",
      `- Never switch role identity. You must remain [${input.syntheticCode}] ${input.syntheticName}.`,
      "- Never answer from another synthetic's perspective.",
      "- Never copy another synthetic's recommendation verbatim.",
      "- If another role made a similar point, restate it only through your own role responsibilities and constraints.",
      otherRoles.length > 0
        ? `Other roles in this run (do NOT impersonate):\n${otherRoles.join("\n")}`
        : "Other roles in this run: none.",
      (() => {
        const dir = input.session.directorOutput;
        if (dir?.domainSummary) return `Project domain context: ${dir.domainSummary}`;
        if (dir?.identifiedDomain && dir.identifiedDomain !== "general")
          return `Project domain: ${dir.identifiedDomain.replace(/[_-]/g, " ")}.`;
        return null;
      })(),
      "Respond in JSON only.",
      "Do not wrap the JSON in markdown fences.",
      'Do not add prefatory text like "Here is the structured response" or "Final answer below".',
      "Focus entirely on analytical content — findings, risks, clarifications, decisions. Do not pad output with generic placeholders.",
      responseLanguageInstruction(responseLanguage),
      input.attempt <= 1
        ? "Build on your previous simulation output rather than writing a generic role description from scratch."
        : null,
      "When previous output, upstream context, or applied clarifications exist, explicitly explain what changed in this iteration.",
      'Any "User decision selected for ..." block in the idea prompt is a GLOBALLY resolved project decision. All roles must treat it as a hard fact regardless of which role is named. Do NOT re-raise it as a clarification request, open decision, or blocker. Remove it from missingInformation and blockers.',
      (() => {
        const resolved = input.session.resolvedDecisions ?? [];
        if (resolved.length === 0) return null;
        const lines = [
          "PERMANENTLY RESOLVED DECISIONS — these were chosen by the user in a prior iteration and are FINAL. Do NOT include them in clarificationRequests, recommendedDecisions, missingInformation, or blockers:",
          ...resolved.map(
            (d) =>
              `- ${d.decisionTitle}: "${d.optionLabel}" — ${d.optionDescription}`,
          ),
        ];
        return lines.join("\n");
      })(),
      (() => {
        const solutions = (input.session.recommendedSolutions ?? []).filter(
          (s) => s.syntheticId === input.syntheticId,
        );
        if (solutions.length === 0) return null;
        const lines = [
          "RECOMMENDED SOLUTIONS — the user has proposed mitigations for risks you identified. Evaluate whether these solutions address the risks effectively:",
          ...solutions.map(
            (s) => `- For risk "${s.riskDescription}": ${s.solution}`,
          ),
        ];
        return lines.join("\n");
      })(),
      buildIntakeContextBlock(input.session),
      `Idea prompt: ${ideaPrompt}`,
      input.projectFilesContext,
      priorOutput && !isAdvisorReport(priorOutput)
        ? buildPriorOutputContext(priorOutput, conversation)
        : "Previous synthetic output: none.",
      conversation.length > 0
        ? `Applied clarification history for this iteration:\n${conversation
            .map((message) => `${message.role}: ${message.text}`)
            .join("\n")}`
        : null,
      "Only treat applied clarification history as iteration context. Ignore non-applied chat messages.",
      "If the user clarified or narrowed the task in applied messages, incorporate that clarification into this iteration instead of repeating a generic baseline answer.",
      "Do not copy phrasing from upstream summaries/recommendations. Your wording must stay role-specific and materially distinct from other synthetics.",
      "If your recommendation overlaps with another role, keep the action but explain a different reason from your own role lens.",
      recipientContext.directHandoffs.length > 0
        ? `Direct handoffs for your role:\n${recipientContext.directHandoffs.join("\n\n")}`
        : "Direct handoffs for your role: none.",
      downstreamRecipients.length > 0
        ? `Your downstream recipients:\n- ${downstreamRecipients.join("\n- ")}`
        : "Your downstream recipients: none.",
      recipientContext.filteredInheritedContext.length > 0
        ? `Filtered inherited context:\n- ${recipientContext.filteredInheritedContext.join("\n- ")}`
        : "Filtered inherited context: none.",
      "Use direct handoffs as context for your analysis. Do not restate unrelated upstream material.",
      downstreamRecipients.length > 0
        ? 'Populate "handoffFacts" with 1-3 concrete facts the downstream roles will need in the NEXT iteration — these facts are not consumed by other agents in this same run, they are carried forward to the next run. Be specific to this project, not generic.'
        : null,
      "If you reused a previous recommendation unchanged, state why it still holds.",
      "If you ignored any recommendation or clarification, explain why it was not applied in this iteration.",
      input.attempt > 1 && input.retryFromOutput
        ? (() => {
            const isSelfRepeat = input.retryReason === "self_repeat";
            const prevFindings = hasOperationalContractPayload(input.retryFromOutput)
              ? (input.retryFromOutput.operational?.findings ?? [])
              : [];
            const prevRisks = hasOperationalContractPayload(input.retryFromOutput)
              ? (input.retryFromOutput.operational?.risks ?? [])
              : [];
            const prevDecisionTitles = hasOperationalContractPayload(input.retryFromOutput)
              ? (input.retryFromOutput.operational?.recommendedDecisions ?? []).map((d) => d.title)
              : [];
            const prevAssumptions = hasOperationalContractPayload(input.retryFromOutput)
              ? (input.retryFromOutput.operational?.acceptedAssumptions ?? [])
              : [];

            const lines: (string | null)[] = [
              `--- RETRY ATTEMPT ${input.attempt} — read carefully before producing output ---`,
              isSelfRepeat
                ? [
                    "REASON: Your previous draft was rejected for low novelty — it repeated the same points. You must explore genuinely different dimensions this time.",
                    "Specifically, change ALL of the following:",
                    prevFindings.length > 0
                      ? `  • findings: your previous draft covered [${prevFindings.slice(0, 2).map((f) => `"${f.slice(0, 60)}"`).join(", ")}]. Write findings about DIFFERENT aspects of this idea — a different technical angle, a different user segment, a different constraint.`
                      : "  • findings: write about a completely different aspect of this idea than what you wrote before.",
                    prevRisks.length > 0
                      ? `  • risks: your previous risks were [${prevRisks.slice(0, 2).map((r) => `"${r.slice(0, 60)}"`).join(", ")}]. Name DIFFERENT failure modes — if you focused on technical risk before, shift to market, legal, or execution risk.`
                      : "  • risks: identify failure modes from a different risk category than before.",
                    prevDecisionTitles.length > 0
                      ? `  • recommendedDecisions: your previous decisions were [${prevDecisionTitles.slice(0, 2).map((t) => `"${t}"`).join(", ")}]. Frame a DIFFERENT set of trade-offs relevant to your role — decisions your previous draft did not surface.`
                      : "  • recommendedDecisions: surface trade-offs your previous draft did not raise.",
                    prevAssumptions.length > 0
                      ? `  • challenge at least one assumption: your previous draft accepted [${prevAssumptions.slice(0, 1).map((a) => `"${a.slice(0, 80)}"`).join(", ")}]. Question whether this assumption actually holds for this specific idea.`
                      : null,
                  ].filter(Boolean).join("\n")
                : "REASON: Your previous draft failed the quality gate. Fix the specific violations listed below before producing output.",
            ];

            if (input.retryViolations && input.retryViolations.length > 0) {
              lines.push(
                `Violations to fix (${input.retryViolations.length} total):`,
                ...input.retryViolations.map(
                  (v, i) =>
                    `  ${i + 1}. [${v.severity.toUpperCase()}] ${v.code}: ${v.message}`,
                ),
              );
            }

            if (input.retryRequiredFixes && input.retryRequiredFixes.length > 0) {
              lines.push(
                "Required corrections — implement EVERY item, do not skip any:",
                ...input.retryRequiredFixes.map((fix, i) => `  ${i + 1}. ${fix}`),
              );
            }

            lines.push(
              isSelfRepeat
                ? `Previous draft summary (shown for reference — you MUST use different phrasing and different findings): "${input.retryFromOutput.summary}"`
                : `Previous draft summary (keep this intent, fix the violations above): "${input.retryFromOutput.summary}"`,
              isSelfRepeat
                ? `Previous draft recommendation (shown for reference — you MUST reframe this from a different angle): "${input.retryFromOutput.recommendation}"`
                : `Previous draft recommendation (keep this intent, fix the violations above): "${input.retryFromOutput.recommendation}"`,
              hasOperationalContractPayload(input.retryFromOutput)
                ? "Your previous draft had an operational payload but still failed. Fix only the specific violations listed above — do not restructure fields that were already correct."
                : 'Your previous draft lacked an operational payload entirely. This attempt MUST include a valid "operational" object with readiness and nextSteps or clarificationRequests.',
              "Produce output that directly addresses each violation. If a field was empty or too short, write a substantive value. If a count was wrong (e.g. 4 options instead of 2-3), correct the count.",
              "--- END RETRY CONTEXT ---",
            );

            return lines.filter(Boolean).join("\n");
          })()
        : null,
      "Return a concise JSON object with these fields:",
      '- "syntheticId": string',
      '- "syntheticName": string',
      '- "summary": string — one sentence describing what you found about this specific idea',
      '- "domain": string matching your role domain',
      '- "acceptedAssumptions": string[] — what you took as given',
      '- "findings": string[] — concrete observations from your role perspective',
      '- "risks": string[] — project-specific risks, not generic role disclaimers',
      '- "missingInformation": string[] — what you need but do not have yet',
      '- "clarificationRequests": { "id": string, "question": string, "whyItMatters": string, "required": boolean, "priority"?: 1|2|3 }[] — concrete questions; mark required=true only for blockers; set priority=1 for questions that must be answered before any work can proceed, priority=2 for normal, priority=3 for low/deferred',
      `- "recommendedDecisions": { "id": string, "title": string, "options": string[], "recommendedOption": string | null, "reason": string, "urgency"?: "blocking"|"important"|"optional", "optionNotes"?: Record<string,string> }[] — always include at least one entry from your role domain. Options must be 2-4 concrete named choices specific to this project (e.g. ${domainExamples.decisionsExample}). Never emit generic placeholders like "Option A" or "Basic/Advanced version". If options is empty, omit the entry. Set urgency="blocking" when the decision gates further progress, urgency="optional" for low-impact or deferrable choices. Populate optionNotes with a brief trade-off note for each NON-recommended option keyed by its exact label (e.g. {"Swipe gestures": "Natural feel but introduces mis-swipe at high speeds"}). Do NOT include the recommended option in optionNotes — its reason is already captured in the "reason" field.`,
      '- "nextSteps": string[] — what should happen next. When readiness.blocked is true, every item in readiness.blockers MUST have a corresponding next step that addresses it.',
      '- "artifactsReady": string[]',
      '- "changesFromPrevious": string[] — what changed vs previous output',
      '- "appliedInputs": string[]',
      '- "ignoredInputs": string[]',
      '- "keyRisks": string[] — 2 to 4 concise project-specific failure modes or design risks. Each item must describe something that could go WRONG (a risk), NOT an open question or missing information. Do NOT copy items from clarificationRequests or missingInformation into keyRisks — those are separate fields.',
      '- "concernLevels": { "feasibility": integer 0-100 (0 = completely infeasible, 100 = trivially feasible; e.g. 25 = major blockers, 55 = doable with effort, 80 = straightforward), "risk": integer 0-100 (0 = no risk, 100 = near-certain failure; e.g. 20 = low risk, 55 = significant risk, 85 = critical risk), "complexityLabel": "low" | "medium" | "high" } — IMPORTANT: always use the 0-100 integer scale, never 0-10 or 0-1',
      '- "handoffFacts": string[] — 1-3 concrete facts downstream roles will need in the next iteration; empty array if no downstream recipients. Each fact MUST name a specific constraint, figure, decision, or dependency (e.g. "MVP dev budget capped at $30k — rules out native iOS build", NOT "budget constraints exist"). Generic statements will be flagged.',
      'IMPORTANT — recommendation coverage: The top-level "recommendation" field (derived from nextSteps) must reference EVERY blocker in readiness.blockers. If there are N blockers, the recommendation must address all N, even if briefly. Do not summarise only the most important one.',
      input.projectFilesContext
        ? 'PROJECT FILE CONTEXT RULE: acceptedAssumptions MUST include 1-3 exact facts copied from PROJECT FILE CONTEXT, and findings MUST include at least one exact file fact. Preserve literal values such as codename, labels, numeric counts, and export formats.'
        : null,
      (() => {
        // Role-specific schema guidance: inject domain-specific field hints based on role keywords
        const roleLower = input.role.toLowerCase();
        const roleCode = input.syntheticCode.toUpperCase();
        const hints: string[] = [];
        if (roleLower.includes("finance") || roleLower.includes("econom") || roleLower.includes("monetis") || roleLower.includes("monetiz") || roleCode === "FIN") {
          hints.push('Role-specific: your "findings" MUST include at least one line with a concrete cost estimate or burn rate (e.g. "MVP dev cost ~$40k over 3 months"). Your "risks" must name at least one financial risk with a dollar or percentage figure.');
        }
        if (roleLower.includes("legal") || roleLower.includes("compliance") || roleLower.includes("regulat") || roleCode === "LG") {
          hints.push('Role-specific: your "findings" MUST name at least one specific compliance item or law/regulation by name (e.g. GDPR Art. 13, App Store Review Guideline 3.1.1). Your "risks" must flag at least one named legal exposure.');
        }
        if (roleLower.includes("game designer") || roleLower.includes("mda") || roleCode === "GD") {
          hints.push('Role-specific: your "findings" MUST reference at least one MDA lens (Mechanics, Dynamics, or Aesthetics). Identify any degenerate mechanics or dominant strategies if present.');
        }
        if (roleLower.includes("ux") || roleLower.includes("usability") || roleLower.includes("nielsen") || roleCode === "UX") {
          hints.push('Role-specific: your "findings" MUST reference at least one Nielsen usability heuristic by name (e.g. "Visibility of System Status", "Error Prevention"). Flag any onboarding or cognitive-load issues.');
        }
        if (roleLower.includes("programmer") || roleLower.includes("engineer") || roleLower.includes("technical") || roleCode === "GP" || roleCode === "EP") {
          hints.push('Role-specific: your "findings" MUST name at least one concrete technical constraint relevant to this idea (e.g. target platform, infrastructure choice, or a key dependency). Your "risks" must flag at least one architecture, scaling, or performance risk with a specific technical detail.');
        }
        if (roleLower.includes("cto") || roleLower.includes("technical co-founder") || roleLower.includes("build-vs-buy")) {
          hints.push('Role-specific: your "findings" MUST name at least one explicit build-vs-buy decision with your recommended option and reasoning. Your "risks" must include at least one tech-debt, hiring, or vendor lock-in risk tied to the architectural choice.');
        }
        if (roleLower.includes("qa") || roleLower.includes("quality") || roleCode === "QA") {
          hints.push('Role-specific: your "findings" MUST name at least one testability gap or missing acceptance criterion. Your "risks" must include at least one edge case or regression risk.');
        }
        if (roleLower.includes("producer") || roleLower.includes("project manager") || roleCode === "PM") {
          hints.push('Role-specific: your "findings" MUST include at least one milestone or critical-path observation. Your "risks" must flag at least one scope or timeline risk with a specific impact estimate.');
        }
        if (roleLower.includes("product") && (roleLower.includes("manager") || roleLower.includes("scope") || roleLower.includes("prioritis") || roleLower.includes("prioritiz") || roleLower.includes("roadmap"))) {
          hints.push('Role-specific: your "findings" MUST name at least one scope item to cut from the MVP and apply one prioritisation framework (RICE, MoSCoW, or Jobs-to-be-Done) by name. Your "risks" must flag at least one scope-creep item that risks derailing the roadmap.');
        }
        if (roleLower.includes("founder") || roleLower.includes("first-principles") || roleLower.includes("survivorship")) {
          hints.push('Role-specific: your "findings" MUST include a TAM/SAM estimate or a comparable market-size signal. Your "risks" must call out at least one survivorship-bias assumption — a hidden reason similar ideas have failed that this plan has not addressed.');
        }
        if (roleLower.includes("marketing") || roleLower.includes("cmo") || roleLower.includes("go-to-market") || roleLower.includes("brand positioning") || roleLower.includes("channel selection")) {
          hints.push('Role-specific: your "findings" MUST name at least one specific acquisition channel with a rough CAC estimate and state whether the ICP (Ideal Customer Profile) is well-defined. Your "risks" must flag at least one brand or positioning risk specific to this market segment.');
        }
        if (roleLower.includes("growth") || roleLower.includes("acquisition loop") || roleLower.includes("retention mechanic") || roleLower.includes("viral")) {
          hints.push('Role-specific: your "findings" MUST name at least one concrete growth lever (e.g. referral loop, activation trigger, retention hook) and a measurable target metric (e.g. D7 retention %, viral coefficient). Your "risks" must flag at least one vanity metric the team might optimise instead of the real north-star.');
        }
        if (roleLower.includes("sales") || roleLower.includes("pipeline") || roleLower.includes("deal cycle") || roleCode === "VS") {
          hints.push('Role-specific: your "findings" MUST name at least one specific sales objection this product will face and how to handle it, plus your estimate of average deal cycle length. Your "risks" must flag at least one gap in the pricing strategy or ICP definition.');
        }
        if (roleLower.includes("investor") || roleLower.includes("venture") || roleLower.includes("angel") || roleLower.includes("portfolio")) {
          hints.push('Role-specific: your "findings" MUST assess at least three of: market size, team-market fit, defensibility/moat, traction signals, "why now". Your "risks" must name at least one classic investor red flag (e.g. weak moat, premature scaling, unsustainable CAC, or missing "why now").');
        }
        return hints.length > 0 ? hints.join("\n") : null;
      })(),
      'Mandatory: return at least one item in "nextSteps" or at least one item in "clarificationRequests".',
      'Mandatory: "summary" must be project-specific — one sentence about this exact idea, never a copy of your role description.',
      'Mandatory: "findings" and "risks" must name concrete project-specific details, not generic disclaimers.',
      'Mandatory: "recommendedDecisions" must have at least one entry with 2-4 named options from your role domain.',
      'Mandatory: do not emit generic option labels like "Basic version", "Advanced version", "Option A". Use real named choices.',
      `Mandatory: "clarificationRequests" questions must name the exact missing input (e.g. ${domainExamples.clarificationExample}), not ask vague open-ended questions.`,
      "Output format: use concise strings (1-2 sentences per item). Keep arrays focused — 2-4 items per array is ideal; never pad with generic filler to reach a count.",
      `Final self-check: syntheticId must be "${input.syntheticId}", syntheticName must be "${input.syntheticName}".`,
    ]
      .filter((section): section is string => Boolean(section))
      .join("\n\n");
  };
}

function previewText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function buildChatInstruction(input: {
  session: SyntheticSession;
  syntheticId: string;
  syntheticName: string;
  role: string;
  priorOutput: SyntheticOutputJson | undefined;
  conversation: SyntheticConversationMessage[];
}): string {
  const recipientContext = buildRecipientSpecificContextPacket({
    session: input.session,
    syntheticId: input.syntheticId,
    stateSource: "state",
    state: Object.fromEntries(
      Object.entries(input.session.memoryBySyntheticId).map(
        ([syntheticId, memory]) => [
          outputKeyForSyntheticId(syntheticId),
          memory.latestOutput,
        ],
      ),
    ),
  });
  const responseLanguage = detectResponseLanguage(
    input.conversation[input.conversation.length - 1]?.text ??
      input.session.ideaPrompt,
  );
  const downstreamRecipients = listDownstreamRecipients({
    session: input.session,
    syntheticId: input.syntheticId,
  });

  return [
    `You are ${input.syntheticName}.`,
    `Your role: ${input.role}`,
    "You are answering a direct user question about your previous recommendation.",
    "Respond in plain text, not JSON.",
    responseLanguage === "ru" ? "Respond in Russian." : "Respond in English.",
    "Be specific to the user's game idea and to your role.",
    "If the user asks what you meant, explain the practical implication for this exact project.",
    "Do not rewrite the synthetic report. This answer is only a chat reply.",
    `Idea prompt: ${input.session.ideaPrompt}`,
    recipientContext.directHandoffs.length > 0
      ? `Direct handoffs for your role:\n${recipientContext.directHandoffs.join("\n\n")}`
      : "Direct handoffs for your role: none.",
    downstreamRecipients.length > 0
      ? `Your downstream recipients:\n- ${downstreamRecipients.join("\n- ")}`
      : "Your downstream recipients: none.",
    recipientContext.filteredInheritedContext.length > 0
      ? `Filtered inherited context:\n- ${recipientContext.filteredInheritedContext.join("\n- ")}`
      : "Filtered inherited context: none.",
    input.priorOutput
      ? `Previous output:\n${JSON.stringify(input.priorOutput, null, 2)}`
      : "Previous output: none.",
    input.conversation.length > 0
      ? `Conversation history:\n${input.conversation
          .map((message) => `${message.role}: ${message.text}`)
          .join("\n")}`
      : "Conversation history: none.",
    "Answer in 1 to 4 short paragraphs or bullets with concrete explanation.",
  ].join("\n\n");
}

function isForcedTradeoffChatPrompt(userMessage: string): boolean {
  const normalized = userMessage.toLowerCase();
  return (
    normalized.includes("resolve it now with a forced trade-off") ||
    normalized.includes("answer strictly in this structure")
  );
}

function createForcedTradeoffChatSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      chosenDirection: { type: "string" },
      rejectedAlternative: { type: "string" },
      implementationSteps: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 5,
      },
      residualRisks: {
        type: "array",
        items: { type: "string" },
      },
      blocker: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      unblockAction: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
    required: [
      "chosenDirection",
      "rejectedAlternative",
      "implementationSteps",
      "residualRisks",
      "blocker",
      "unblockAction",
    ],
  };
}

function parseForcedTradeoffChatJson(value: unknown): {
  chosenDirection: string;
  rejectedAlternative: string;
  implementationSteps: string[];
  residualRisks: string[];
  blocker: string | null;
  unblockAction: string | null;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    chosenDirection?: unknown;
    rejectedAlternative?: unknown;
    implementationSteps?: unknown;
    residualRisks?: unknown;
    blocker?: unknown;
    unblockAction?: unknown;
  };

  if (
    typeof candidate.chosenDirection !== "string" ||
    typeof candidate.rejectedAlternative !== "string" ||
    !Array.isArray(candidate.implementationSteps) ||
    !candidate.implementationSteps.every((item) => typeof item === "string") ||
    !Array.isArray(candidate.residualRisks) ||
    !candidate.residualRisks.every((item) => typeof item === "string")
  ) {
    return null;
  }

  return {
    chosenDirection: candidate.chosenDirection,
    rejectedAlternative: candidate.rejectedAlternative,
    implementationSteps: candidate.implementationSteps,
    residualRisks: candidate.residualRisks,
    blocker: typeof candidate.blocker === "string" ? candidate.blocker : null,
    unblockAction:
      typeof candidate.unblockAction === "string"
        ? candidate.unblockAction
        : null,
  };
}

function formatForcedTradeoffChatReply(input: {
  chosenDirection: string;
  rejectedAlternative: string;
  implementationSteps: string[];
  residualRisks: string[];
  blocker: string | null;
  unblockAction: string | null;
}): string {
  const lines = [
    `- chosenDirection: ${input.chosenDirection}`,
    `- rejectedAlternative: ${input.rejectedAlternative}`,
    "- implementationSteps:",
    ...input.implementationSteps.map(
      (step, index) => `  ${index + 1}. ${step}`,
    ),
    "- residualRisks:",
    ...(input.residualRisks.length > 0
      ? input.residualRisks.map((risk) => `  - ${risk}`)
      : ["  - none identified"]),
  ];

  if (input.blocker || input.unblockAction) {
    lines.push(
      `- blocker: ${input.blocker ?? "none"}`,
      `- unblockAction: ${input.unblockAction ?? "none"}`,
    );
  }

  return lines.join("\n");
}

function createOutputSchema(): Record<string, unknown> {
  // Structural fields (userFacing, readiness, directedHandoffs, handoff,
  // details, recommendation) are intentionally excluded — they are assembled
  // deterministically by structureAssembler.ts after the LLM call.
  return {
    type: "object",
    properties: {
      syntheticId: { type: "string" },
      syntheticName: { type: "string" },
      summary: { type: "string" },
      domain: { type: "string" },
      acceptedAssumptions: {
        type: "array",
        items: { type: "string" },
      },
      findings: {
        type: "array",
        items: { type: "string" },
      },
      risks: {
        type: "array",
        items: { type: "string" },
      },
      missingInformation: {
        type: "array",
        items: { type: "string" },
      },
      clarificationRequests: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            whyItMatters: { type: "string" },
            required: { type: "boolean" },
            priority: {
              type: "number",
              enum: [1, 2, 3],
              description: "1 = ask immediately (blocking), 2 = normal, 3 = low / can defer",
            },
          },
          required: ["id", "question", "whyItMatters", "required"],
        },
      },
      recommendedDecisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            options: {
              type: "array",
              items: { type: "string" },
            },
            recommendedOption: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            reason: { type: "string" },
            optionReasons: {
              type: "object",
              description: "Per-option trade-off notes keyed by option label. Provide a brief reason for each non-recommended option so users understand the trade-offs.",
              additionalProperties: { type: "string" },
            },
            optionNotes: {
              type: "object",
              description: "Alias for optionReasons — use this field to provide a brief trade-off note for each NON-recommended option, keyed by its exact label. Do not include the recommended option here; its reasoning belongs in 'reason'.",
              additionalProperties: { type: "string" },
            },
            urgency: {
              type: "string",
              enum: ["blocking", "important", "optional"],
              description: "How urgently this decision must be resolved. Use 'blocking' when the decision gates further progress (e.g. grid size affects all other work). Use 'important' for normal decisions. Use 'optional' for low-impact or deferrable choices.",
            },
          },
          required: ["id", "title", "options", "recommendedOption", "reason"],
        },
      },
      nextSteps: {
        type: "array",
        items: { type: "string" },
      },
      artifactsReady: {
        type: "array",
        items: { type: "string" },
      },
      changesFromPrevious: {
        type: "array",
        items: { type: "string" },
      },
      appliedInputs: {
        type: "array",
        items: { type: "string" },
      },
      ignoredInputs: {
        type: "array",
        items: { type: "string" },
      },
      keyRisks: {
        type: "array",
        items: { type: "string" },
      },
      concernLevels: {
        type: "object",
        properties: {
          feasibility: { type: "number" },
          risk: { type: "number" },
          complexityLabel: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
        },
        required: ["feasibility", "risk", "complexityLabel"],
      },
      handoffFacts: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "syntheticId",
      "syntheticName",
      "summary",
      "domain",
      "acceptedAssumptions",
      "findings",
      "risks",
      "missingInformation",
      "clarificationRequests",
      "recommendedDecisions",
      "nextSteps",
      "artifactsReady",
      "changesFromPrevious",
      "appliedInputs",
      "ignoredInputs",
      "keyRisks",
      "concernLevels",
      "handoffFacts",
    ],
  };
}

/**
 * Try to parse raw LLM text as SyntheticLlmContent (new minimal format).
 * Uses normalizeJsonCandidate to handle code-fenced or multi-object responses.
 */
function tryParseLlmContent(text: string): SyntheticLlmContent | null {
  for (const candidate of normalizeJsonCandidate(text)) {
    try {
      const content = safeParseLlmContent(JSON.parse(candidate));
      if (content) return content;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export class AdkSyntheticOrchestrator implements SyntheticOrchestrator {
  readonly descriptor: SyntheticBackendDescriptor = {
    kind: "direct_llm",
    label: "Direct LLM",
  };

  constructor(readonly modelProvider: ModelProvider) {}

  async runChain(input: RunChainInput): Promise<RunChainResult> {
    const runtimeConfig = getThinkingGraphRuntimeConfig();
    const outputSchema = createOutputSchema();
    const backend = {
      provider: this.modelProvider.descriptor.kind,
      model: this.modelProvider.descriptor.model ?? "unknown",
    };
    const outputsBySyntheticId: Record<string, SyntheticOutputJson> = {};
    const transcript: TranscriptEntry[] = [];
    const syntheticIdsToRun = new Set(
      input.syntheticIds?.length
        ? input.syntheticIds
        : input.session.synthetics.map((synthetic) => synthetic.id),
    );
    const syntheticsToRun = input.session.synthetics.filter((synthetic) =>
      syntheticIdsToRun.has(synthetic.id),
    );
    // Advisor nodes run after all regular agents so they can read live outputs.
    const regularSynthetics = syntheticsToRun.filter((s) => s.nodeRole !== "advisor");
    const advisorSynthetics = syntheticsToRun.filter((s) => s.nodeRole === "advisor");
    const totalAgents = syntheticsToRun.length;
    const accumulatedState: Record<string, unknown> = {
      ideaPrompt: input.session.ideaPrompt,
      ...Object.fromEntries(
        Object.entries(input.session.memoryBySyntheticId)
          .map(([syntheticId, memory]) => [
            outputKeyForSyntheticId(syntheticId),
            memory.latestOutput ?? null,
          ])
          .filter(([, output]) => output !== null),
      ),
    };
    const runId = `adk-run-${Date.now()}`;
    const usageBySyntheticId: Record<string, TokenUsage> = {};
    const inputContextBySyntheticId: Record<
      string,
      {
        ideaPromptPreview: string;
        hasPreviousOutput: boolean;
        appliedClarificationCount: number;
        appliedClarificationPreview: string[];
        upstreamSourceIds: string[];
        upstreamContextCount: number;
        upstreamContextPreview: string[];
        upstreamSummaryPreview: string[];
      }
    > = {};

    let completedCount = 0;
    const frozenInitialState = { ...accumulatedState };
    // Track which synthetic IDs have completed output in THIS run (not prior memory).
    // Used by the upstream-readiness gate so it never fires against stale session data.
    const completedThisRun = new Set<string>();

    // All regular agents start concurrently. Ollama (or any model provider) is the
    // natural concurrency gate — it queues requests internally. Cloud providers
    // handle rate limits at the HTTP level (429 responses). No artificial
    // Node.js semaphore is needed here.
    //
    // This used to stagger each agent's start by `agentIndex * 5000ms`, on the
    // assumption that earlier-indexed agents would reliably finish first. That
    // assumption was false — with 3+ agents it routinely raced the
    // upstream-readiness gate below: an agent that hadn't been reached yet
    // (still waiting out its own artificial delay) looked identical to one
    // that would never complete, so the gate deferred it with a placeholder
    // output instead of a real one. Without the stagger, every agent reaches
    // the readiness check in the same tick (`Array.map` invokes all the async
    // callbacks synchronously; JS doesn't context-switch between them until
    // the first `await`), so `completedThisRun` is reliably still empty for
    // everyone at that point — no false "some peers done, some not" reads.
    await Promise.all(
      regularSynthetics.map(async (synthetic) => {
        await input.onProgress?.({
          type: "agent_started",
          sessionId: input.session.id,
          syntheticId: synthetic.id,
          totalAgents,
          completedAgents: completedCount,
        });

        const priorOutput =
          input.session.memoryBySyntheticId[synthetic.id]?.latestOutput;
        const conversation = (
          input.session.memoryBySyntheticId[synthetic.id]?.conversation ?? []
        ).filter((message) => message.includeInNextIteration);
        const upstreamContext = buildUpstreamContextFromAccumulatedState({
          session: input.session,
          syntheticId: synthetic.id,
          state: frozenInitialState,
        });
        const upstreamSourceIds = getInboundContextSourceIds(
          input.session,
          synthetic.id,
      );
      const upstreamSummaryPreview = upstreamContext
        .map((entry) => safeParseOutput(entry))
        .filter((output): output is StoredSyntheticOutput => Boolean(output))
        .map(
          (output) =>
            `${output.syntheticId}: ${previewText(output.summary, 160)}`,
        );

      inputContextBySyntheticId[synthetic.id] = {
        ideaPromptPreview: previewText(input.session.ideaPrompt, 220),
        hasPreviousOutput: Boolean(priorOutput),
        appliedClarificationCount: conversation.length,
        appliedClarificationPreview: conversation.map((message) =>
          previewText(`${message.role}: ${message.text}`, 220),
        ),
        upstreamSourceIds,
        upstreamContextCount: upstreamContext.length,
        upstreamContextPreview: upstreamContext.map((entry) =>
          previewText(entry, 220),
        ),
        upstreamSummaryPreview,
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("[thinking-graph][orchestrator] synthetic input context", {
          syntheticId: synthetic.id,
          ...inputContextBySyntheticId[synthetic.id],
        });
      }

      // ── Upstream-readiness gate ─────────────────────────────────────────
      // Defer this agent only when at least one peer has ALREADY completed in
      // THIS run AND some peers have not. We check `completedThisRun` — NOT
      // `frozenInitialState` — because frozenInitialState is seeded from prior
      // session memory, which would cause every agent to be deferred on re-runs.
      const anyPeerCompletedThisRun = upstreamSourceIds.some((id) => completedThisRun.has(id));
      const missingUpstreamIds = anyPeerCompletedThisRun
        ? upstreamSourceIds.filter((id) => !completedThisRun.has(id))
        : [];

      if (missingUpstreamIds.length > 0) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[thinking-graph][orchestrator] deferring agent — upstream context missing",
            { syntheticId: synthetic.id, missingUpstreamIds },
          );
        }

        const deferredOutput = buildWaitingForUpstreamOutput({
          syntheticId: synthetic.id,
          syntheticName: synthetic.name,
          missingUpstreamIds,
          backend,
        });

        const deferredJson = serializeOutput(deferredOutput, backend, {
          source: "deferred_waiting_for_upstream",
          tokenUsage: null,
          inputContext: inputContextBySyntheticId[synthetic.id] ?? null,
          validation: [],
          attempt: 0,
          quality: {
            hasOperational: true,
            usedLegacyCompatibilityFallback: false,
            operationalEnforcement: runtimeConfig.operationalEnforcement,
            validationStatus: "pass",
            validationAttempts: 0,
          },
          decisionRequired: null,
        });

        outputsBySyntheticId[synthetic.id] = deferredJson;
        accumulatedState[outputKeyForSyntheticId(synthetic.id)] = deferredOutput;

        completedCount += 1;
        await input.onProgress?.({
          type: "agent_completed",
          sessionId: input.session.id,
          syntheticId: synthetic.id,
          totalAgents,
          completedAgents: completedCount,
          output: deferredJson,
        });
        return; // skip the LLM loop for this agent
      }
      // ── End upstream-readiness gate ─────────────────────────────────────

      const maxAttempts = 3;
      let retryFromOutput: StoredSyntheticOutput | null = null;
      let acceptedOutput: StoredSyntheticOutput | null = null;
      let acceptedParsed: StoredSyntheticOutput | null = null;
      let acceptedAttempt = 1;
      let retryRequiredFixes: string[] = [];
      let retryViolations: Array<{ code: string; message: string; severity: string }> = [];
      let retryReason: "self_repeat" | "validator_fail" = "validator_fail";
      const validationHistory: ValidationReport[] = [];

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const isRerun = Boolean(priorOutput);
        // A "minor rerun" is one where the agent's own previous output already
        // reported no changes AND the user has not injected new clarification
        // messages.  In that case there is nothing materially new to explore, so
        // we keep the temperature at the stable first-run level (0.35) instead of
        // escalating to 0.60.  This prevents spurious output variance when the
        // user simply re-runs without changing anything meaningful.
        const isMinorRerun =
          isRerun &&
          conversation.length === 0 &&
          priorOutput != null &&
          "changesFromPrevious" in priorOutput &&
          ((priorOutput as { changesFromPrevious?: string[] }).changesFromPrevious?.length ?? 0) === 0
        // Base temperature: higher for re-runs to avoid repeating the previous iteration.
        // Minor reruns are exempt — they keep the deterministic 0.35 level.
        const baseTemperature = synthetic.config?.temperature ?? (isRerun && !isMinorRerun ? 0.6 : 0.35);
        // Retry temperature: step up by 0.15 per retry attempt to force lexical diversity
        // and break out of low-novelty loops. Capped at 0.9 to keep JSON coherence.
        const attemptTemperature =
          attempt === 1
            ? baseTemperature
            : Math.min(0.9, baseTemperature + (attempt - 1) * 0.15);

        // Build a lightweight per-agent context that exposes the initial accumulated
        // state snapshot. Each agent gets its own shallow copy so completions by one
        // agent during a parallel run don't pollute another agent's context reads.
        const agentStateSnapshot: Record<string, unknown> = { ...accumulatedState };
        const agentContext: AgentRunContext = {
          state: {
            get<T = unknown>(key: string, defaultValue?: T): T | undefined {
              return (agentStateSnapshot[key] as T | undefined) ?? defaultValue;
            },
          },
        };

        // Resolve the instruction with the per-agent context snapshot.
        const instruction = buildRunInstruction({
          session: input.session,
          syntheticId: synthetic.id,
          syntheticName: synthetic.name,
          syntheticCode: synthetic.code,
          role: synthetic.role,
          attempt,
          retryFromOutput,
          retryRequiredFixes,
          retryViolations,
          retryReason,
          projectFilesContext: input.projectFilesContext,
        })(agentContext);

        const userMessage =
          input.session.ideaPrompt ||
          "Run the thinking chain for the current idea.";

        // Direct LLM call — no ADK runner/session overhead.
        let fullText = "";
        // Schema-constrained calls can go 20-40s+ with zero bytes written to
        // the SSE stream (see ClaudeCliModelProvider — onTextDelta only fires
        // once, at the end). A heartbeat keeps the connection demonstrably
        // alive so it isn't dropped as idle before run_completed arrives.
        const heartbeat = setInterval(() => {
          void input.onProgress?.({ type: "heartbeat", sessionId: input.session.id });
        }, 15_000);
        try {
          if (this.modelProvider.streamText) {
            const result = await this.modelProvider.streamText({
              messages: [
                { role: "system", content: instruction },
                { role: "user", content: userMessage },
              ],
              temperature: attemptTemperature,
              maxTokens: 4000,
              responseSchema: outputSchema,
              onTextDelta: async (textDelta) => {
                fullText += textDelta;
                await input.onProgress?.({
                  type: "agent_chunk",
                  sessionId: input.session.id,
                  syntheticId: synthetic.id,
                  textDelta,
                });
              },
            });
            usageBySyntheticId[synthetic.id] = result.usage;
          } else {
            const result = await this.modelProvider.generate({
              messages: [
                { role: "system", content: instruction },
                { role: "user", content: userMessage },
              ],
              temperature: attemptTemperature,
              maxTokens: 4000,
              responseSchema: outputSchema,
            });
            fullText = result.text;
            usageBySyntheticId[synthetic.id] = result.usage;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const is429 = msg.includes("429") || msg.toLowerCase().includes("rate_limit") || msg.toLowerCase().includes("rate limit");
          const isTransient = msg.toLowerCase().includes("fetch failed") || msg.toLowerCase().includes("econnrefused") || msg.toLowerCase().includes("econnreset") || msg.toLowerCase().includes("etimedout");
          if (is429 && attempt < maxAttempts) {
            const backoffMs = Math.min(60_000, 15_000 * Math.pow(2, attempt - 1));
            console.warn(`[thinking-graph][orchestrator] 429 rate limit on "${synthetic.id}" attempt ${attempt}, backing off ${backoffMs}ms`);
            await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          if (isTransient && attempt < maxAttempts) {
            const backoffMs = 8_000 * attempt;
            const cause = err instanceof Error ? (err.cause as Error | undefined)?.message ?? err.cause : undefined;
            console.warn(`[thinking-graph][orchestrator] transient network error on "${synthetic.id}" attempt ${attempt}, retrying in ${backoffMs}ms: ${msg}${cause ? ` (cause: ${cause})` : ""}`);
            await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }
          throw new Error(
            `LLM call failed for synthetic "${synthetic.id}" (attempt ${attempt}): ${msg}`,
          );
        } finally {
          clearInterval(heartbeat);
        }

        if (!fullText.trim()) {
          throw new Error(
            `Thinking graph run failed before synthetic "${synthetic.id}" produced output. Check the model name and server logs.`,
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.log("[thinking-graph][orchestrator] raw LLM response", {
            syntheticId: synthetic.id,
            attempt,
            temperature: attemptTemperature,
            textPreview: fullText.slice(0, 300),
          });
        }

        // Try new minimal LLM format first (SyntheticLlmContent → assembleOutput).
        // Fall back to legacy safeParseOutput for backwards compatibility.
        const llmContent = tryParseLlmContent(fullText);
        const assembledFromContent: StoredSyntheticOutput | null = llmContent
          ? (() => {
              const downstreamRecipients = input.session.synthetics
                .filter((s) =>
                  input.session.edges.some(
                    (e) =>
                      e.from === synthetic.id &&
                      e.to === s.id &&
                      e.type !== "structural",
                  ),
                )
                .map((s) => ({ id: s.id, name: s.name }));
              const relatedEdges = input.session.edges
                .filter(
                  (e) =>
                    (e.type === "tension" || e.type === "oversight") &&
                    (e.from === synthetic.id || e.to === synthetic.id),
                )
                .map((e) => {
                  const counterpartId = e.from === synthetic.id ? e.to : e.from;
                  const counterpart = input.session.synthetics.find((s) => s.id === counterpartId);
                  return {
                    edgeId: e.id,
                    counterpartId,
                    counterpartName: counterpart?.name ?? counterpartId,
                  };
                });
              const assemblerContext: AssemblerContext = {
                syntheticId: synthetic.id,
                syntheticName: synthetic.name,
                ideaPrompt: input.session.ideaPrompt,
                downstreamRecipients,
                upstreamContext,
                provider: backend.provider,
                model: backend.model,
                ...(relatedEdges.length > 0 ? { relatedEdges } : {}),
              };
              const assembled = assembleOutput(llmContent, assemblerContext);
              return {
                syntheticId: assembled.syntheticId,
                syntheticName: assembled.syntheticName,
                domain: assembled.operational.domain,
                summary: assembled.summary,
                details: assembled.details,
                recommendation: assembled.recommendation,
                changesFromPrevious: assembled.changesFromPrevious,
                appliedInputs: assembled.appliedInputs,
                ignoredInputs: assembled.ignoredInputs,
                keyRisks: assembled.keyRisks,
                concernLevels: assembled.concernLevels,
                handoff: assembled.handoff,
                upstreamContext: assembled.upstreamContext,
                directedHandoffs: assembled.directedHandoffs,
                operational: assembled.operational,
              };
            })()
          : null;

        const parsed = assembledFromContent ?? tryParseJsonString(fullText);
        const output = parsed ?? {
          syntheticId: synthetic.id,
          syntheticName: synthetic.name,
          domain: synthetic.role,
          summary: "No structured output was produced.",
          acceptedAssumptions: [],
          findings: [],
          risks: [
            "Structured synthetic output was missing.",
            "The panel is showing fallback error data instead of a real report.",
          ],
          missingInformation: [
            "The model did not return a valid operational JSON payload.",
          ],
          clarificationRequests: [
            {
              id: "repair_invalid_output_schema",
              question:
                "Should this node be rerun after fixing the structured output contract?",
              whyItMatters:
                "Without a valid structured output the pipeline cannot trust this node state.",
              required: true,
            },
          ],
          recommendedDecisions: [],
          nextSteps: [
            "Repair the node output schema and rerun this synthetic.",
          ],
          readiness: {
            canContinue: false,
            blocked: true,
            blockers: ["Structured synthetic output was missing."],
            status: "blocked",
          },
          artifactsReady: [],
          details:
            "The agent did not return valid JSON matching the expected output schema.",
          recommendation:
            "Check the model output and rerun the synthetic chain after fixing the schema mismatch.",
          changesFromPrevious: [
            "No structured revision was produced for this iteration.",
          ],
          appliedInputs: [],
          ignoredInputs: [
            "Previous outputs or clarifications could not be validated because the model output did not match the schema.",
          ],
          keyRisks: [
            "Structured synthetic output was missing.",
            "The panel is showing fallback error data instead of a real report.",
          ],
          concernLevels: {
            feasibility: 0,
            risk: 100,
            complexityLabel: "high",
          },
          handoff: null,
          upstreamContext: [],
          operational: null,
        };
        const normalizedOutput = normalizeOutputForSynthetic({
          output,
          syntheticId: synthetic.id,
          syntheticName: synthetic.name,
        });
        const qualityCheckedOutput = isLowNoveltyConflictResolution({
          ideaPrompt: input.session.ideaPrompt,
          syntheticId: synthetic.id,
          previousOutput:
            priorOutput && !isAdvisorReport(priorOutput)
              ? priorOutput
              : undefined,
          nextOutput: normalizedOutput,
        })
          ? buildBlockedConflictResolutionOutput({
              syntheticId: synthetic.id,
              syntheticName: synthetic.name,
              output: normalizedOutput,
            })
          : normalizedOutput;
        const strictResolutionCheckedOutput =
          isMissingConcreteConflictResolution({
            ideaPrompt: input.session.ideaPrompt,
            syntheticId: synthetic.id,
            output: qualityCheckedOutput,
          })
            ? buildBlockedConflictResolutionOutput({
                syntheticId: synthetic.id,
                syntheticName: synthetic.name,
                output: qualityCheckedOutput,
              })
            : qualityCheckedOutput;

        const resolvedDecisionsStrippedOutput = (() => {
          const base = stripResolvedDecisionsFromOutput({
            output: strictResolutionCheckedOutput,
            resolvedDecisions: input.session.resolvedDecisions,
          });
          // Inject nextSteps entries for any required clarifications not already
          // mentioned, so downstream consumers always have an explicit action item
          // even when the model omitted it.
          const existingSteps = base.operational?.nextSteps ?? [];
          const missing = (base.operational?.clarificationRequests ?? []).filter(
            (q) =>
              q.required &&
              !existingSteps.some((step) =>
                step.toLowerCase().includes(q.id.toLowerCase()),
              ),
          );
          if (missing.length === 0) return base;
          return {
            ...base,
            operational: {
              ...base.operational!,
              nextSteps: [
                ...existingSteps,
                ...missing.map((q) => `Clarify ${q.id}: ${q.question}`),
              ],
            },
          };
        })();

        // Check novelty against the last retry draft (intra-attempt repetition)
        // AND against the stored session output from the previous run (cross-run repetition).
        const isRepeatOfRetryDraft =
          retryFromOutput !== null &&
          isLowNoveltyAgainstStoredOutput({
            previousOutput: retryFromOutput,
            nextOutput: resolvedDecisionsStrippedOutput,
          });
        const isRepeatOfPriorRun =
          Boolean(priorOutput) &&
          attempt === 1 &&
          isLowNoveltyAgainstStoredOutput({
            previousOutput: {
              ...priorOutput,
              upstreamContext: [],
              directedHandoffs: undefined,
              operational: undefined,
            } as unknown as StoredSyntheticOutput,
            nextOutput: resolvedDecisionsStrippedOutput,
          });
        const isSelfRepeat = isRepeatOfRetryDraft || isRepeatOfPriorRun;

        const validationReport = validateSyntheticOutput({
          producerNodeId: synthetic.id,
          attempt,
          output: {
            summary: resolvedDecisionsStrippedOutput.summary,
            details: resolvedDecisionsStrippedOutput.details,
            recommendation: resolvedDecisionsStrippedOutput.recommendation,
            handoff: resolvedDecisionsStrippedOutput.handoff,
            keyRisks: resolvedDecisionsStrippedOutput.keyRisks,
            handoffFacts: resolvedDecisionsStrippedOutput.handoffFacts ?? [],
            appliedInputs: resolvedDecisionsStrippedOutput.appliedInputs,
            ignoredInputs: resolvedDecisionsStrippedOutput.ignoredInputs,
            operationalSchemaInvalid:
              resolvedDecisionsStrippedOutput.operationalParseError === true,
            operational:
              (resolvedDecisionsStrippedOutput.operational ??
                null) as SyntheticLikeOutput["operational"],
          },
          upstreamContextCount: upstreamContext.length,
          hasDownstream: input.session.edges.some(
            (edge) => edge.type !== "structural" && edge.from === synthetic.id,
          ),
          operationalEnforcement: runtimeConfig.operationalEnforcement,
        });
        validationHistory.push(validationReport);

        if (
          (isSelfRepeat || validationReport.status === "fail") &&
          attempt < maxAttempts
        ) {
          retryFromOutput = resolvedDecisionsStrippedOutput;
          retryReason = isSelfRepeat ? "self_repeat" : "validator_fail";
          retryRequiredFixes =
            validationReport.revisionRequest?.requiredFixes ?? [];
          retryViolations = validationReport.violations ?? [];
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[thinking-graph][orchestrator] retrying synthetic after quality gate",
              {
                syntheticId: synthetic.id,
                attempt,
                reason: isSelfRepeat ? "self_repeat" : "validator_fail",
                requiredFixes: retryRequiredFixes,
              },
            );
          }
          continue;
        }

        acceptedOutput =
          validationReport.status === "fail"
            ? buildQualityGateBlockedOutput({
                syntheticId: synthetic.id,
                syntheticName: synthetic.name,
                output: resolvedDecisionsStrippedOutput,
                validationReport,
              })
            : resolvedDecisionsStrippedOutput;
        acceptedParsed = parsed;
        acceptedAttempt = attempt;
        break;
      }

      const finalOutput = acceptedOutput ?? {
        syntheticId: synthetic.id,
        syntheticName: synthetic.name,
        domain: synthetic.role,
        summary: "No structured output was produced.",
        acceptedAssumptions: [],
        findings: [],
        risks: [
          "Structured synthetic output was missing.",
          "The panel is showing fallback error data instead of a real report.",
        ],
        missingInformation: [
          "The model did not return a valid operational JSON payload.",
        ],
        clarificationRequests: [
          {
            id: "repair_invalid_output_schema",
            question:
              "Should this node be rerun after fixing the structured output contract?",
            whyItMatters:
              "Without a valid structured output the pipeline cannot trust this node state.",
            required: true,
          },
        ],
        recommendedDecisions: [],
        nextSteps: ["Repair the node output schema and rerun this synthetic."],
        readiness: {
          canContinue: false,
          blocked: true,
          blockers: ["Structured synthetic output was missing."],
          status: "blocked",
        },
        artifactsReady: [],
        details:
          "The agent did not return valid JSON matching the expected output schema.",
        recommendation:
          "Check the model output and rerun the synthetic chain after fixing the schema mismatch.",
        changesFromPrevious: [
          "No structured revision was produced for this iteration.",
        ],
        appliedInputs: [],
        ignoredInputs: [
          "Previous outputs or clarifications could not be validated because the model output did not match the schema.",
        ],
        keyRisks: [
          "Structured synthetic output was missing.",
          "The panel is showing fallback error data instead of a real report.",
        ],
        concernLevels: {
          feasibility: 0,
          risk: 100,
          complexityLabel: "high",
        },
        handoff: null,
        upstreamContext: [],
        operational: null,
      };

      if (
        process.env.NODE_ENV !== "production" &&
        acceptedParsed &&
        (acceptedParsed.syntheticId !== synthetic.id ||
          acceptedParsed.syntheticName !== synthetic.name)
      ) {
        console.warn(
          "[thinking-graph][orchestrator] output id/name mismatch; normalized to current synthetic",
          {
            expected: { syntheticId: synthetic.id, syntheticName: synthetic.name },
            actual: { syntheticId: acceptedParsed.syntheticId, syntheticName: acceptedParsed.syntheticName },
          },
        );
      }

      const raw = {
        source: acceptedParsed ? "direct_llm" : "unparsed",
        tokenUsage: usageBySyntheticId[synthetic.id] ?? null,
        inputContext: inputContextBySyntheticId[synthetic.id] ?? null,
        validation: validationHistory,
        attempt: acceptedAttempt,
        quality: {
          hasOperational: hasOperationalContractPayload(finalOutput),
          usedLegacyCompatibilityFallback: !hasOperationalContractPayload(finalOutput),
          operationalEnforcement: runtimeConfig.operationalEnforcement,
          validationStatus:
            validationHistory[validationHistory.length - 1]?.status ?? "pass",
          validationAttempts: validationHistory.length,
        },
        decisionRequired: isBlockedConflictResolutionOutput(finalOutput)
          ? buildDecisionRequiredPayload({
              syntheticId: synthetic.id,
              syntheticName: synthetic.name,
            })
          : null,
      };

      if (
        process.env.NODE_ENV !== "production" &&
        !hasOperationalContractPayload(finalOutput)
      ) {
        console.warn(
          "[thinking-graph][orchestrator] accepted legacy-compatible output",
          {
            syntheticId: synthetic.id,
            attempt: acceptedAttempt,
            operationalEnforcement: runtimeConfig.operationalEnforcement,
            validationStatuses: validationHistory.map((entry) => entry.status),
          },
        );
      }

      const serializedOutput = serializeOutput(finalOutput, backend, raw);
      outputsBySyntheticId[synthetic.id] = serializedOutput;
      completedThisRun.add(synthetic.id);
      transcript.push({
        id: `tr-${Date.now()}-${synthetic.id}`,
        syntheticId: synthetic.id,
        type: "opinion",
        text: JSON.stringify(serializedOutput),
      });
      await input.onProgress?.({
        type: "agent_completed",
        sessionId: input.session.id,
        syntheticId: synthetic.id,
        totalAgents,
        completedAgents: ++completedCount,
        output: serializedOutput,
      });
      }),
    );

    // Pre-compute the deterministic verdict from regular agent outputs before advisor runs.
    // This lets the advisor explain the verdict rather than just narrate agent findings.
    const preVerdictSummary = buildRunSummaryReport({
      ideaPrompt: input.session.ideaPrompt,
      synthetics: regularSynthetics,
      edges: input.session.edges,
      outputsBySyntheticId: Object.fromEntries(
        regularSynthetics.map((s) => [s.id, outputsBySyntheticId[s.id] ?? null]),
      ),
    });
    const blockingGate = preVerdictSummary.domainGates.find((g) => g.verdict === "no_go");
    const preVerdict = {
      verdict: preVerdictSummary.overallVerdict,
      blockingAgentName: blockingGate?.syntheticName,
      blockingCondition: blockingGate?.condition ?? undefined,
    };

    // Run advisor nodes sequentially after all regular agents complete.
    // Each advisor receives the full live outputsBySyntheticId so it can
    // read every agent's current-run result, not just prior-run data.
    for (const synthetic of advisorSynthetics) {
      await input.onProgress?.({
        type: "agent_started",
        sessionId: input.session.id,
        syntheticId: synthetic.id,
        totalAgents,
        completedAgents: completedCount,
      });

      const instruction = buildAdvisorInstruction({
        session: input.session,
        syntheticId: synthetic.id,
        syntheticName: synthetic.name,
        role: synthetic.role,
        outputsBySyntheticId,
        projectFilesContext: input.projectFilesContext,
        preVerdict,
      });

      const userMessage =
        input.session.ideaPrompt ||
        "Run the advisor synthesis for the current idea.";

      let fullText = "";
      try {
        if (this.modelProvider.streamText) {
          const result = await this.modelProvider.streamText({
            messages: [
              { role: "system", content: instruction },
              { role: "user", content: userMessage },
            ],
            temperature: 0.3,
            maxTokens: 2500,
            onTextDelta: async (textDelta) => {
              fullText += textDelta;
              await input.onProgress?.({
                type: "agent_chunk",
                sessionId: input.session.id,
                syntheticId: synthetic.id,
                textDelta,
              });
            },
          });
          usageBySyntheticId[synthetic.id] = result.usage;
        } else {
          const result = await this.modelProvider.generate({
            messages: [
              { role: "system", content: instruction },
              { role: "user", content: userMessage },
            ],
            temperature: 0.3,
            maxTokens: 2500,
          });
          fullText = result.text;
          usageBySyntheticId[synthetic.id] = result.usage;
        }
      } catch (err) {
        throw new Error(
          `LLM call failed for advisor "${synthetic.id}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      const advisorRaw = { source: "advisor_llm", tokenUsage: usageBySyntheticId[synthetic.id] ?? null };
      const advisorOutput = safeParseAdvisorOutput({
        text: fullText,
        syntheticId: synthetic.id,
        syntheticName: synthetic.name,
        backend,
        raw: advisorRaw,
      }) ?? {
        kind: "advisor" as const,
        syntheticId: synthetic.id,
        syntheticName: synthetic.name,
        topRecommendation: "No structured output was produced by the advisor.",
        strategicOptions: [],
        conflictResolution: [],
        model: backend,
        tokenUsage: normalizeTokenUsage(advisorRaw),
        raw: null,
      };

      // Ensure the typed tokenUsage field is always populated on the parsed path too.
      if (!advisorOutput.tokenUsage) {
        (advisorOutput as import("./types").AdvisorReport).tokenUsage =
          normalizeTokenUsage(advisorRaw);
      }

      outputsBySyntheticId[synthetic.id] = advisorOutput;
      transcript.push({
        id: `tr-${Date.now()}-${synthetic.id}`,
        syntheticId: synthetic.id,
        type: "opinion",
        text: JSON.stringify(advisorOutput),
      });
      await input.onProgress?.({
        type: "agent_completed",
        sessionId: input.session.id,
        syntheticId: synthetic.id,
        totalAgents,
        completedAgents: ++completedCount,
        output: advisorOutput,
      });
    }

    // Emit per-agent and run-level token summary to profiling log.
    const agentTokenRows = syntheticsToRun.map((synthetic) => {
      const usage = usageBySyntheticId[synthetic.id] ?? {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      };
      return {
        syntheticId: synthetic.id,
        syntheticName: synthetic.name,
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      };
    });
    const runTotals = agentTokenRows.reduce(
      (acc, row) => ({
        prompt_tokens:
          acc.prompt_tokens !== null && row.prompt_tokens !== null
            ? acc.prompt_tokens + row.prompt_tokens
            : (acc.prompt_tokens ?? row.prompt_tokens),
        completion_tokens:
          acc.completion_tokens !== null && row.completion_tokens !== null
            ? acc.completion_tokens + row.completion_tokens
            : (acc.completion_tokens ?? row.completion_tokens),
        total_tokens:
          acc.total_tokens !== null && row.total_tokens !== null
            ? acc.total_tokens + row.total_tokens
            : (acc.total_tokens ?? row.total_tokens),
      }),
      {
        prompt_tokens: null as number | null,
        completion_tokens: null as number | null,
        total_tokens: null as number | null,
      },
    );
    profLog({
      event: "run_token_summary",
      runId,
      agents: agentTokenRows,
      run_prompt_tokens: runTotals.prompt_tokens,
      run_completion_tokens: runTotals.completion_tokens,
      run_total_tokens: runTotals.total_tokens,
    });

    const runSummary = await this.runAggregator({
      session: input.session,
      outputsBySyntheticId,
      projectFilesContext: input.projectFilesContext,
      onProgress: input.onProgress,
    });

    return {
      runId,
      completedAt: new Date().toISOString(),
      transcript,
      outputsBySyntheticId,
      runSummary,
      tokenUsage: {
        promptTokens: runTotals.prompt_tokens ?? 0,
        completionTokens: runTotals.completion_tokens ?? 0,
        totalTokens: runTotals.total_tokens ?? 0,
      },
    };
  }

  private async runAggregator(input: {
    session: SyntheticSession;
    outputsBySyntheticId: Record<string, SyntheticOutputJson>;
    projectFilesContext?: string | null;
    onProgress?: (event: ThinkingGraphRunProgressEvent) => void | Promise<void>;
  }): Promise<RunSummaryReport | null> {
    const { session, outputsBySyntheticId, onProgress } = input;

    const outputCount = Object.values(outputsBySyntheticId).filter(Boolean).length;
    if (outputCount === 0) return null;

    await onProgress?.({ type: "aggregator_started", sessionId: session.id });

    const instruction = buildAggregatorInstruction({
      session,
      outputsBySyntheticId,
      projectFilesContext: input.projectFilesContext,
    });
    const deterministicSummary = buildRunSummaryReport({
      ideaPrompt: session.ideaPrompt,
      synthetics: session.synthetics,
      edges: session.edges,
      outputsBySyntheticId: Object.fromEntries(
        session.synthetics.map((s) => [s.id, outputsBySyntheticId[s.id] ?? null]),
      ),
    });
    let fullText = "";
    let aggregationFailed = false;

    try {
      if (this.modelProvider.streamText && this.modelProvider.descriptor.kind !== "claude") {
        await this.modelProvider.streamText({
          messages: [
            { role: "system", content: instruction },
            { role: "user", content: "Produce the cross-agent synthesis report now." },
          ],
          temperature: 0.3,
          maxTokens: 800,
          onTextDelta: async (textDelta) => {
            fullText += textDelta;
            await onProgress?.({
              type: "aggregator_chunk",
              sessionId: session.id,
              textDelta,
            });
          },
        });
      } else {
        const result = await this.modelProvider.generate({
          messages: [
            { role: "system", content: instruction },
            { role: "user", content: "Produce the cross-agent synthesis report now." },
          ],
          temperature: 0.3,
          maxTokens: 800,
        });
        fullText = result.text;
      }
    } catch (error) {
      console.error("[thinking-graph][aggregator] aggregation LLM call failed", error);
      aggregationFailed = true;
    }

    const aggregatorInsights =
      aggregationFailed || !fullText.trim() ? null : parseAggregatorOutput(fullText);

    const runSummary: RunSummaryReport = {
      ...deterministicSummary,
      ...(aggregatorInsights
        ? {
            executiveBrief:
              aggregatorInsights.executiveBrief.length > 0
                ? aggregatorInsights.executiveBrief
                : deterministicSummary.executiveBrief,
            actionItems:
              aggregatorInsights.actionItems.length > 0
                ? aggregatorInsights.actionItems
                : deterministicSummary.actionItems,
            biggestConflict:
              aggregatorInsights.biggestConflict ?? deterministicSummary.biggestConflict,
            conflictMap:
              aggregatorInsights.conflictMap.length > 0
                ? aggregatorInsights.conflictMap
                : deterministicSummary.conflictMap,
          }
        : {}),
    };

    await onProgress?.({
      type: "aggregator_completed",
      sessionId: session.id,
      runSummary,
    });

    return runSummary;
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const synthetic = input.session.synthetics.find(
      (node) => node.id === input.syntheticId,
    );
    if (!synthetic) {
      throw new Error(
        `Synthetic "${input.syntheticId}" does not exist in session "${input.session.id}".`,
      );
    }

    const messages = [
      {
        role: "system" as const,
        content: buildChatInstruction({
          session: input.session,
          syntheticId: synthetic.id,
          syntheticName: synthetic.name,
          role: synthetic.role,
          priorOutput:
            input.session.memoryBySyntheticId[synthetic.id]?.latestOutput,
          conversation:
            input.session.memoryBySyntheticId[synthetic.id]?.conversation ?? [],
        }),
      },
      {
        role: "user" as const,
        content: input.userMessage,
      },
    ];

    if (isForcedTradeoffChatPrompt(input.userMessage)) {
      const forcedMessages = [
        {
          role: "system" as const,
          content: [
            `You are ${synthetic.name}.`,
            `Your role: ${synthetic.role}`,
            "Return JSON only using the provided schema.",
            "Stay strictly within the current game idea context.",
            "Do not invent unrelated products/domains or generic placeholders.",
            `Idea prompt: ${input.session.ideaPrompt}`,
            input.session.memoryBySyntheticId[synthetic.id]?.latestOutput
              ? `Previous output:\n${JSON.stringify(
                  input.session.memoryBySyntheticId[synthetic.id]?.latestOutput,
                  null,
                  2,
                )}`
              : "Previous output: none.",
            `User request:\n${input.userMessage}`,
          ].join("\n\n"),
        },
        {
          role: "user" as const,
          content:
            "Provide concrete trade-off resolution with measurable steps. If unresolved, include blocker and unblockAction.",
        },
      ];

      const structured = await this.modelProvider.generate({
        messages: forcedMessages,
        temperature: 0.2,
        maxTokens: 900,
        responseSchema: createForcedTradeoffChatSchema(),
      });

      const parsedStructured =
        tryParseJsonString(structured.text) ??
        parseForcedTradeoffChatJson(
          (() => {
            try {
              return JSON.parse(structured.text);
            } catch {
              return null;
            }
          })(),
        );

      const normalizedStructured =
        parseForcedTradeoffChatJson(parsedStructured) ??
        parseForcedTradeoffChatJson(
          (() => {
            try {
              return JSON.parse(structured.text);
            } catch {
              return null;
            }
          })(),
        );

      if (normalizedStructured) {
        const replyText = formatForcedTradeoffChatReply(normalizedStructured);
        const conversation: SyntheticConversationMessage[] = [
          ...(input.session.memoryBySyntheticId[synthetic.id]?.conversation ??
            []),
          {
            id: `msg-user-${Date.now()}`,
            syntheticId: synthetic.id,
            role: "user",
            text: input.userMessage,
            createdAt: new Date().toISOString(),
            includeInNextIteration: false,
          },
          {
            id: `msg-synthetic-${Date.now()}`,
            syntheticId: synthetic.id,
            role: "synthetic",
            text: replyText,
            createdAt: new Date().toISOString(),
            includeInNextIteration: false,
          },
        ];

        return {
          replyText,
          conversation,
        };
      }
    }

    const generateReply = async (overrideMessages?: typeof messages) => {
      if (input.onTextDelta && this.modelProvider.streamText) {
        return this.modelProvider.streamText({
          messages: overrideMessages ?? messages,
          temperature: 0.3,
          maxTokens: 900,
          onTextDelta: input.onTextDelta,
        });
      }
      return this.modelProvider.generate({
        messages: overrideMessages ?? messages,
        temperature: 0.3,
        maxTokens: 900,
      });
    };

    const response = await generateReply();
    let replyText = response.text.trim();
    if (!replyText) {
      throw new Error(
        `Thinking graph chat failed before synthetic "${synthetic.id}" produced a reply.`,
      );
    }

    const previousSyntheticReply = (
      input.session.memoryBySyntheticId[synthetic.id]?.conversation ?? []
    )
      .filter((message) => message.role === "synthetic")
      .slice(-1)[0]?.text;

    if (
      previousSyntheticReply &&
      isLowNoveltyText(previousSyntheticReply, replyText)
    ) {
      const rethinkMessages = [
        ...messages,
        {
          role: "system" as const,
          content: [
            "Your previous reply repeated earlier wording.",
            "Rethink and answer with materially different phrasing and concrete trade-off details.",
            "Do not repeat the same chosenDirection/rejectedAlternative wording.",
            "If you cannot add novelty, explicitly state blocker and one unblock action.",
          ].join("\n"),
        },
      ];
      const retryResponse = await generateReply(rethinkMessages);
      const retryText = retryResponse.text.trim();
      if (retryText) {
        replyText = retryText;
      }
    }

    const conversation: SyntheticConversationMessage[] = [
      ...(input.session.memoryBySyntheticId[synthetic.id]?.conversation ?? []),
      {
        id: `msg-user-${Date.now()}`,
        syntheticId: synthetic.id,
        role: "user",
        text: input.userMessage,
        createdAt: new Date().toISOString(),
        includeInNextIteration: false,
      },
      {
        id: `msg-synthetic-${Date.now()}`,
        syntheticId: synthetic.id,
        role: "synthetic",
        text: replyText,
        createdAt: new Date().toISOString(),
        includeInNextIteration: false,
      },
    ];

    return {
      replyText,
      conversation,
    };
  }

  async chatWithIdeaSession(input: {
    session: SyntheticSession;
    userMessage: string;
    ideaConversation: SyntheticConversationMessage[];
    onTextDelta?: (textDelta: string) => void | Promise<void>;
  }): Promise<ChatResult> {
    const { session } = input;
    const responseLanguage = detectResponseLanguage(
      input.ideaConversation[input.ideaConversation.length - 1]?.text ??
        session.ideaPrompt,
    );

    const allOutputs = session.synthetics
      .map((synthetic) => {
        const output = session.memoryBySyntheticId[synthetic.id]?.latestOutput;
        if (!output) return null;
        const summary = getSyntheticOutputSummary(output);
        const recommendation = getSyntheticOutputRecommendation(output);
        return `[${synthetic.name}] ${summary}${recommendation ? ` → ${recommendation}` : ""}`;
      })
      .filter((line): line is string => Boolean(line));

    const systemPrompt = [
      "You are the PromptFarm session assistant.",
      "You help the user think through their project idea by drawing on the full simulation context.",
      responseLanguage === "ru" ? "Respond in Russian." : "Respond in English.",
      `Idea prompt: ${session.ideaPrompt || "(not set)"}`,
      session.synthetics.length > 0
        ? `Roles in the simulation:\n${session.synthetics.map((s) => `- [${s.code}] ${s.name}: ${s.role}`).join("\n")}`
        : "Roles: none yet.",
      allOutputs.length > 0
        ? `Latest agent summaries:\n${allOutputs.join("\n")}`
        : "Agent outputs: none yet — no run has been completed.",
      input.ideaConversation.length > 0
        ? `Conversation history:\n${input.ideaConversation.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n")}`
        : "Conversation history: none.",
      "Answer in 1–4 short paragraphs or bullet points.",
      "Be concrete and specific to this project idea.",
    ].join("\n\n");

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: input.userMessage },
    ];

    const generateReply = async () => {
      if (input.onTextDelta && this.modelProvider.streamText) {
        return this.modelProvider.streamText({
          messages,
          temperature: 0.35,
          maxTokens: 900,
          onTextDelta: input.onTextDelta,
        });
      }
      return this.modelProvider.generate({ messages, temperature: 0.35, maxTokens: 900 });
    };

    const response = await generateReply();
    const replyText = response.text.trim();
    if (!replyText) {
      throw new Error("Idea session chat produced an empty reply.");
    }

    const conversation: SyntheticConversationMessage[] = [
      ...input.ideaConversation,
      {
        id: `msg-user-${Date.now()}`,
        syntheticId: "__idea__",
        role: "user",
        text: input.userMessage,
        createdAt: new Date().toISOString(),
        includeInNextIteration: false,
      },
      {
        id: `msg-synthetic-${Date.now()}`,
        syntheticId: "__idea__",
        role: "synthetic",
        text: replyText,
        createdAt: new Date().toISOString(),
        includeInNextIteration: false,
      },
    ];

    return { replyText, conversation };
  }
}
