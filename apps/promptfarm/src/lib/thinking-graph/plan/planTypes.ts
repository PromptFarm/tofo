import type { SyntheticOutputJson, RunSummaryReport } from "../server/types";

// ── Format ────────────────────────────────────────────────────────────────────

export type PlanFormatId = "sprints" | "phases" | "backlog" | "roles";

// ── Input ─────────────────────────────────────────────────────────────────────

export type PlanRiskEntry = {
  text: string;
  level: "high" | "medium" | "low";
  syntheticName: string;
  /** "new" = surfaced, "accepted" = owner acknowledged, "mitigated" = solution defined */
  status: "new" | "accepted" | "mitigated";
  mitigationNote?: string;
};

export type PlanInput = {
  /** Idea prompt that was simulated */
  ideaPrompt: string;
  verdict: {
    overall: "go" | "conditional" | "no_go";
    blockingAgent?: string;
  };
  expertOutputs: Array<{
    syntheticId: string;
    syntheticName: string;
    role: string;
    output: SyntheticOutputJson;
  }>;
  summaryReport: RunSummaryReport;
  risks: PlanRiskEntry[];
  userAnswers: Array<{ question: string; answer: string }>;
  format: PlanFormatId;
  /** Story points the team can complete per sprint. Default: 20 */
  velocityAssumption?: number;
};

// ── Output — task atom ─────────────────────────────────────────────────────────

export type PlanStoryPoints = 1 | 2 | 3 | 5 | 8 | 13;

export type PlanTaskItem = {
  id: string;
  type: "epic" | "story" | "task";
  title: string;
  description: string;
  story_points: PlanStoryPoints;
  source_synthetic: string;
  role: string;
};

/** Sprint task item — extends base with optional dependency and assignee fields */
export type SprintItemDependent = PlanTaskItem & {
  assignee_role?: string;
  depends_on?: string[];
};

// ── Output — format-specific structures ───────────────────────────────────────

export type PlanSprintGroup = {
  id: string;
  title: string;
  goal: string;
  duration_weeks: number;
  total_points: number;
  items: SprintItemDependent[];
};

/** Phase item — story_points is optional (include when estimable, omit otherwise) */
export type PhaseItemDependent = Omit<PlanTaskItem, "story_points"> & {
  story_points?: PlanStoryPoints;
  depends_on?: string[];
};

export type PlanPhaseGroup = {
  id: string;
  title: string;
  description: string;
  exit_criteria: string;
  items: PhaseItemDependent[];
};

export type BacklogItemDependent = PlanTaskItem & {
  priority: "high" | "medium" | "low";
  depends_on?: string[];
};

export type BacklogGroup = {
  id: string;
  title: string;
  items: BacklogItemDependent[];
};

/** Role task — no epics allowed; has task-level inputs/outputs for data-flow tracing */
export type RoleItemDependent = Omit<PlanTaskItem, "type"> & {
  type: "story" | "task";
  inputs?: string[];
  outputs?: string[];
  depends_on?: string[];
};

export type RoleGroup = {
  id: string;
  title: string;
  synthetic_id: string;
  execution_mode: "human" | "agent";
  inputs: string[];
  outputs: string[];
  items: RoleItemDependent[];
};

// ── Output — discriminated union ──────────────────────────────────────────────

export type SprintPlanOutput = {
  format: "sprints";
  title: string;
  summary: string;
  generated_from_iteration: number;
  velocity_assumption: number;
  groups: PlanSprintGroup[];
};

export type PhasesPlanOutput = {
  format: "phases";
  title: string;
  summary: string;
  generated_from_iteration: number;
  groups: PlanPhaseGroup[];
};

export type BacklogPlanOutput = {
  format: "backlog";
  title: string;
  summary: string;
  generated_from_iteration: number;
  groups: BacklogGroup[];
};

export type RolesPlanOutput = {
  format: "roles";
  title: string;
  summary: string;
  generated_from_iteration: number;
  groups: RoleGroup[];
};

export type GeneratedPlanOutput =
  | SprintPlanOutput
  | PhasesPlanOutput
  | BacklogPlanOutput
  | RolesPlanOutput;

// ── API ───────────────────────────────────────────────────────────────────────

export type PlanApiRequest = Omit<PlanInput, "summaryReport" | "expertOutputs"> & {
  /** Serialised SyntheticOutputJson[] — avoids sending the full summaryReport subtree */
  expertOutputsJson: string;
  summaryReportJson: string;
  /** Run ID — when present the server persists the generated plan to DB */
  runId?: string;
};

export type PlanApiResponse =
  | { ok: true; plan: GeneratedPlanOutput }
  | { ok: false; error: string };
