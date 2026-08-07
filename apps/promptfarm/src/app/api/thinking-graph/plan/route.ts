import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { generatePlan } from "@/lib/thinking-graph/plan/planOrchestrator";
import { savePlan, getPlansForRun } from "@/lib/db-client";
import type {
  PlanApiRequest,
  PlanApiResponse,
  PlanFormatId,
  PlanInput,
  GeneratedPlanOutput,
} from "@/lib/thinking-graph/plan/planTypes";
import type { SyntheticOutputJson, RunSummaryReport } from "@/lib/thinking-graph/server/types";

const VALID_FORMATS = new Set<PlanFormatId>(["sprints", "phases", "backlog", "roles"]);

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const plans = await getPlansForRun(user.id, runId) as Partial<Record<PlanFormatId, GeneratedPlanOutput>>;
    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ plans: {} });
  }
}

export async function POST(request: Request): Promise<NextResponse<PlanApiResponse>> {
  let body: PlanApiRequest;
  try {
    body = (await request.json()) as PlanApiRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!VALID_FORMATS.has(body.format)) {
    return NextResponse.json({ ok: false, error: `Invalid format "${body.format}".` }, { status: 400 });
  }

  let expertOutputs: Array<{ syntheticId: string; syntheticName: string; role: string; output: SyntheticOutputJson }>;
  let summaryReport: RunSummaryReport;
  try {
    expertOutputs = JSON.parse(body.expertOutputsJson) as typeof expertOutputs;
    summaryReport = JSON.parse(body.summaryReportJson) as RunSummaryReport;
  } catch {
    return NextResponse.json({ ok: false, error: "Could not parse expertOutputsJson or summaryReportJson." }, { status: 400 });
  }

  const input: PlanInput = {
    ideaPrompt:         body.ideaPrompt,
    verdict:            body.verdict,
    expertOutputs,
    summaryReport,
    risks:              body.risks ?? [],
    userAnswers:        body.userAnswers ?? [],
    format:             body.format,
    velocityAssumption: body.velocityAssumption,
  };

  try {
    const plan = await generatePlan(input);

    // Persist to DB if runId provided — silently skip on failure so generation always returns
    if (body.runId) {
      const user = await getCurrentAppUser();
      if (user) {
        savePlan(user.id, body.runId, body.format, plan.title, plan).catch(err => {
          console.warn("[plan] failed to persist plan to DB:", err);
        });
      }
    }

    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan generation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
