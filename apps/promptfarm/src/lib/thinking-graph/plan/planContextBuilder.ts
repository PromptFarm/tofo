import type { SimulationRun } from "@/components/thinking-graph/runtime/runtimeTypes";
import type { SyntheticReport } from "@/lib/thinking-graph/server/types";
import type { PlanApiRequest, PlanFormatId, PlanRiskEntry } from "./planTypes";

/**
 * Maps a completed SimulationRun into a PlanApiRequest ready to POST to
 * /api/thinking-graph/plan. Excludes advisor nodes (they don't produce
 * task-level outputs) and strips empty user answers so the orchestrator
 * never generates tasks from blank strings.
 */
export function buildPlanApiRequest(
  run: SimulationRun,
  format: PlanFormatId,
  userAnswers: Array<{ question: string; answer: string }>,
  velocityAssumption = 20,
): PlanApiRequest {
  const { summaryReport, outputsBySyntheticId, synthetics, prompt } = run;

  // Advisor nodes run last and produce strategic summaries, not task-level work
  const participants = synthetics.filter(s => s.nodeRole !== "advisor");

  const expertOutputs = participants.flatMap(s => {
    const output = outputsBySyntheticId[s.id];
    if (!output) return [];
    return [{ syntheticId: s.id, syntheticName: s.name, role: s.role, output }];
  });

  const risks: PlanRiskEntry[] = participants.flatMap(s => {
    const out = outputsBySyntheticId[s.id];
    if (!out || !("keyRisks" in out)) return [];
    const rep = out as SyntheticReport;
    const riskVal = rep.concernLevels?.risk ?? 0;
    const level = (riskVal >= 70 ? "high" : riskVal >= 40 ? "medium" : "low") as PlanRiskEntry["level"];
    return (rep.keyRisks ?? []).map(text => ({
      text,
      level,
      syntheticName: s.name,
      status: "new" as const,
    }));
  });

  // Only pass answers that have content — orchestrator must not generate
  // tasks from empty strings
  const filledAnswers = userAnswers.filter(qa => qa.answer.trim() !== "");

  return {
    runId:             run.id,
    ideaPrompt:        prompt,
    verdict:           { overall: summaryReport.overallVerdict },
    expertOutputsJson: JSON.stringify(expertOutputs),
    summaryReportJson: JSON.stringify(summaryReport),
    risks,
    userAnswers:       filledAnswers,
    format,
    velocityAssumption,
  };
}
