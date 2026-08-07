/**
 * Local types for the OutcomeReport and its section components.
 * Single source of truth — import from here, do not redefine locally.
 */

export type DecisionRequiredOption = {
  id: string;
  label: string;
  description: string;
};

export type DecisionRequiredPayload = {
  type: "decision_required";
  syntheticId: string;
  familyId?: string | null;
  title: string;
  question: string;
  options: DecisionRequiredOption[];
  recommendedOptionId?: string | null;
  required: true;
  /** Urgency level — available after Step 2 backend fix; defaults to "blocking" for primary decisions */
  urgency?: "blocking" | "important" | "optional";
  /** Edge that triggered this decision (e.g. a tension edge between two agents). */
  relatedEdgeId?: string | null;
  /** The other synthetic node on that edge — counterpart in a conflict or oversight. */
  relatedNodeId?: string | null;
  /** Display name of the counterpart node, for UI rendering without a lookup. */
  relatedNodeName?: string | null;
};

export type RouteDecisionToAgentInput = {
  decision: DecisionRequiredPayload;
  optionId: string;
  targetSyntheticId: string;
};

export type NextMoveMode = "self" | "assistant" | "defer";

/**
 * Semantic intent of a next move.
 * - "decide"   — user must make a choice (maps to owner: "user", mode: "self")
 * - "research" — information gathering (maps to owner: "assistant", mode: "assistant")
 * - "build"    — implementation work (maps to owner: "shared", mode: "assistant")
 * - "validate" — review / test / QA (maps to owner: "shared", mode: "assistant")
 * - "defer"    — postpone, wait for external event (maps to owner: "shared", mode: "defer")
 *
 * "heuristic" means the value was derived by classifyNextMove() keyword matching,
 * not from a structured Advisor category — use this to display a caveat when needed.
 */
export type NextMoveIntent =
  | "decide"
  | "research"
  | "build"
  | "validate"
  | "defer"
  | "heuristic";

export type ClassifiedNextMove = {
  action: string;
  owner: "user" | "assistant" | "shared";
  recommendedMode: NextMoveMode;
  /**
   * Semantic intent. "heuristic" = derived by keyword fallback, all others =
   * from Advisor category field or decision-family shape.
   */
  intent: NextMoveIntent;
  decisionFamilyId?: string;
  syntheticId?: string;
  /** Present when derived from an Advisor node's strategicOptions */
  rationale?: string;
  /** Present when derived from an Advisor node's strategicOptions */
  tradeoff?: string;
};

export type ValidationReportLike = {
  revisionRequest?: {
    requiredFixes?: string[];
  } | null;
};

import type { TokenUsage, SyntheticUserFacingState } from "@/lib/thinking-graph/server/types";

export type AgentCardViewModel = {
  /** Primary prose summary for the card body */
  summary: string | null;
  /** The most relevant next action / question / option label */
  action: string | null;
  /** Human-readable readiness text (e.g. "user input required") */
  readiness: string | null;
  /** CSS colour token for the readiness text */
  readinessColor: string;
  /** Coarse status bucket used for left-border accent and sorting */
  statusTier: "ready" | "blocked" | "decision" | "conflict" | "pending";
  /** Raw userFacing state, null when the agent has no operational output */
  userFacingState: SyntheticUserFacingState | null;
  /** Token consumption for this agent's last run (all fields may be null) */
  tokenUsage: TokenUsage;
};

