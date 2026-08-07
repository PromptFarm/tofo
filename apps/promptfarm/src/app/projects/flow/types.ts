import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { SyntheticNode } from "@/lib/planning/types";
import type {
  SyntheticIntakeAnswer,
  SyntheticIntakeQuestion,
} from "@/lib/thinking-graph/server/types";

// ── Context ────────────────────────────────────────────────────────────────────

export type FlowCtx = {
  // inputs (заполняются перед запуском runner)
  ideaPrompt: string;
  userProvidedName: string | null;
  selectedTeamId: string | null;
  domainTags: string[];
  autoPersonaIds: string[];
  autostart: boolean;
  pendingFiles: File[];
  draftProjectId: string | null;
  router: AppRouterInstance;
  onIntakeReady: () => Promise<SyntheticIntakeAnswer[]>;
  startRun?: () => void;

  // outputs (заполняются шагами по мере выполнения)
  projectId: string | null;
  projectName: string | null;
  sessionId: string | null;
  synthetics: SyntheticNode[];
  intakeQuestions: SyntheticIntakeQuestion[];
  intakeAnswers: SyntheticIntakeAnswer[];
  runId: string | null;
};

// ── Step schema (из JSON) ──────────────────────────────────────────────────────

export type FlowStep = {
  id: string;
  title: string;
  enabled: boolean;
  requires: (keyof FlowCtx)[];
  provides: (keyof FlowCtx)[];
  timeoutMs: number;
  onError: "throw" | "warn" | "skip";
  type?: "user";
};

// ── Step function ──────────────────────────────────────────────────────────────

export type StepFn = (ctx: FlowCtx) => Promise<FlowCtx>;

// ── Execution queue ────────────────────────────────────────────────────────────

export type StepStatus = "running" | "done" | "failed" | "timeout" | "skipped";

export type StepRecord = {
  stepId: string;
  startedAt: number;
  timeoutMs: number;
  status: StepStatus;
};

// ── Generator yield ────────────────────────────────────────────────────────────

export type StepTick = {
  stepId: string;
  title: string;
  ctx: FlowCtx;
  durationMs: number;
  skipped: boolean;
  phase: "start" | "done";
};
