import type { PlanFormatId, PlanInput } from "./planTypes";
import type { SyntheticReport, AdvisorReport, SyntheticOutputJson } from "../server/types";

// ── Output JSON schemas (inlined in the system prompt) ────────────────────────

const TASK_SCHEMA_COMMENT = `
Each task object must match this exact shape:
{
  "id":               string  — unique, kebab-case, e.g. "t-setup-auth",
  "type":             "epic" | "story" | "task",
  "title":            string  — max 80 chars, sentence case, no trailing punctuation,
  "description":      string  — max 300 chars, explain WHAT to do and WHY it matters,
  "story_points":     1 | 2 | 3 | 5 | 8 | 13,
  "source_synthetic": string  — exact name of the expert whose output drives this task,
  "role":             string  — that expert's role label (e.g. "Engineering", "Design")
}`.trim();

const FORMAT_SCHEMAS: Record<PlanFormatId, string> = {
  sprints: `
SPRINTS FORMAT RULES:
- Maximum 4 sprints
- Each sprint duration_weeks must be 2
- total_points per sprint must not exceed velocity_assumption
- Items within a sprint must be ordered: epics first, then stories, then tasks
- depends_on must only reference items in the SAME or EARLIER sprint (never a later sprint)
- Each sprint goal must be measurable: start with a verb, describe a deliverable
  Good: "Implement time-rewind buffer and validate performance on low-end devices"
  Bad: "Do technical work"
- velocity_assumption default is 20 if not provided

Return a JSON object with this exact shape:
{
  "format": "sprints",
  "title":  string  — short project/iteration title,
  "summary": string  — 1-2 sentences explaining why tasks are ordered this way,
  "generated_from_iteration": number  — iteration number (use 1 if unknown),
  "velocity_assumption": number  — story points per sprint budget used,
  "groups": [
    {
      "id": "sprint_1",
      "title": "Sprint 1 · weeks 1–2",
      "goal":  string  — measurable sprint goal, starts with a verb,
      "duration_weeks": 2,
      "total_points": number  — must equal the sum of all item story_points,
      "items": [
        {
          ...all task fields...,
          "assignee_role": string  — optional role label,
          "depends_on": ["item_id"]  — optional, same or earlier sprint items only
        }
      ]
    }
  ]
}
Order groups by dependency: foundation first, launch last.
${TASK_SCHEMA_COMMENT}`.trim(),

  phases: `
PHASES FORMAT RULES:
- Minimum 2 phases, maximum 5
- Phases must follow logical progression: first phase = research/validation, last phase = launch/release
- exit_criteria must be a single measurable sentence
  Good: "Prototype runs at 60fps on Galaxy A12 with rewind mechanic working"
  Bad: "Phase is done"
- Items within a phase are not time-boxed — story_points are optional, include only when estimable
- depends_on may reference items in the same phase or any earlier phase

Return a JSON object with this exact shape:
{
  "format": "phases",
  "title":  string  — short project/iteration title,
  "summary": string  — 1-2 sentences explaining the overall phase progression,
  "generated_from_iteration": number  — iteration number (use 1 if unknown),
  "groups": [
    {
      "id": "phase_1",
      "title": string  — e.g. "Prototype",
      "description": string  — what this phase achieves,
      "exit_criteria": string  — single measurable sentence proving the phase is done,
      "items": [
        {
          ...all task fields...,
          "story_points": number | ""  — use "" when not yet estimable,
          "depends_on": ["item_id"]  — optional, same or earlier phase items only
        }
      ]
    }
  ]
}
${TASK_SCHEMA_COMMENT}`.trim(),

  backlog: `
BACKLOG FORMAT RULES:
- Exactly ONE group with id "backlog"
- Maximum 20 items total
- Items must be sorted by priority: high first, then medium, then low
- Every item must have a priority field
- Items with depends_on must reference items with equal or higher priority
  (a low-priority item must not depend on a high-priority item — that would block the high-priority work)

Return a JSON object with this exact shape:
{
  "format": "backlog",
  "title":  string  — short project/iteration title,
  "summary": string  — 1-2 sentences describing the scope and rationale,
  "generated_from_iteration": number  — iteration number (use 1 if unknown),
  "groups": [
    {
      "id": "backlog",
      "title": "Backlog",
      "items": [
        {
          ...all task fields...,
          "priority": "high" | "medium" | "low",
          "depends_on": ["item_id"]  — optional, must reference equal or higher priority items
        }
      ]
    }
  ]
}
${TASK_SCHEMA_COMMENT}`.trim(),

  roles: `
ROLES FORMAT RULES:
- One group per synthetic that participated in the simulation
- execution_mode defaults to "human" — only set "agent" if the role is clearly automatable
  (data fetching, report generation, monitoring, etc.)
- inputs: what this role RECEIVES from other roles to do their work
- outputs: what this role DELIVERS that other roles depend on
- inputs and outputs must form a coherent data-flow graph —
  if Role A outputs "risk analysis", Role B's inputs should reference it
- Tasks must be written from the executor's perspective
  Good: "Review contract and prepare risk summary with recommended changes"
  Bad: "Legal risk assessment needed"
- Epics are NOT allowed in roles format — use story or task only

Return a JSON object with this exact shape:
{
  "format": "roles",
  "title":  string  — short project/iteration title,
  "summary": string  — 1-2 sentences describing the collaboration model,
  "generated_from_iteration": number  — iteration number (use 1 if unknown),
  "groups": [
    {
      "id": "role_cto",
      "title": string  — full name or role title,
      "synthetic_id": string  — exact synthetic id from the team,
      "execution_mode": "human" | "agent",
      "inputs":  [ string ]  — what this role receives from others,
      "outputs": [ string ]  — what this role delivers to others,
      "items": [
        {
          "id": "r1_1",
          "type": "story" | "task",
          "title": string,
          "description": string,
          "source_synthetic": string,
          "story_points": 1|2|3|5|8|13,
          "inputs":   [ string ]  — specific inputs consumed by this task,
          "outputs":  [ string ]  — specific outputs produced by this task,
          "depends_on": ["item_id"]  — optional
        }
      ]
    }
  ]
}`.trim(),
};

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildPlanSystemPrompt(format: PlanFormatId): string {
  return `
You are a plan generation orchestrator for TOFO, an AI decision validation system.
Your job is to transform expert analysis into a structured implementation plan.
CRITICAL RULES:
- Return ONLY valid JSON. No markdown, no explanation, no text outside JSON.
- Never use null. Use empty array [] or empty string "" instead.
- Never add fields not defined in the schema.
- Never invent tasks. Every item must trace to an expert recommendation.
- Every item must have source_synthetic filled with the expert name who recommended it.

INPUT CONTEXT:
You will receive:
- verdict: the Go/No-Go verdict and blocking agent if any
- expert_outputs: array of each synthetic's full analysis
- risks: array of risks with their status (new/accepted/mitigated)
- user_answers: user's answers to follow-up questions (may be empty)
- plan_format: one of "sprints" | "phases" | "backlog" | "roles"
- velocity_assumption: team velocity in story points per sprint (default 20)

CONTENT RULES:
- title: max 80 characters, sentence case, no punctuation at end
- description: max 300 characters, explain what and why
- story_points: use only fibonacci numbers: 1, 2, 3, 5, 8, 13
- source_synthetic: exact name of the expert whose recommendation this implements
- If user_answers provided, incorporate them into relevant task descriptions
- If a risk is mitigated, create a task that implements the mitigation
- If a risk is accepted, do not create a task for it

TASK SIZING GUIDE:
- epic (13 SP):  multi-week work stream; several stories inside it
- story (3–8 SP): meaningful feature or capability; done in days
- task (1–3 SP):  concrete action; done in hours

REQUIRED OUTPUT FORMAT — "${format}":
${FORMAT_SCHEMAS[format]}
`.trim();
}

// ── User message ──────────────────────────────────────────────────────────────

function summariseExpertOutput(output: SyntheticOutputJson): string {
  if ("kind" in output && output.kind === "advisor") {
    const a = output as AdvisorReport;
    return [
      `top_recommendation: ${a.topRecommendation}`,
      a.strategicOptions.length > 0
        ? `strategic_options: ${a.strategicOptions.map(o => o.label).join(" | ")}`
        : null,
    ].filter(Boolean).join("\n");
  }

  const r = output as SyntheticReport;
  const op = r.operational;
  const lines: string[] = [
    `summary: ${r.summary}`,
    r.recommendation ? `recommendation: ${r.recommendation}` : null,
    op?.nextSteps?.length
      ? `next_steps:\n${op.nextSteps.map(s => `  - ${s}`).join("\n")}`
      : null,
    r.keyRisks?.length
      ? `key_risks:\n${r.keyRisks.map(s => `  - ${s}`).join("\n")}`
      : null,
    op?.clarificationRequests?.length
      ? `clarification_requests:\n${op.clarificationRequests.map(c => `  - ${c.question}`).join("\n")}`
      : null,
    op?.recommendedDecisions?.length
      ? `recommended_decisions:\n${op.recommendedDecisions.map(d => `  - ${d.title}: ${d.recommendedOption ?? "open"}`).join("\n")}`
      : null,
  ].filter((l): l is string => l !== null);

  return lines.join("\n");
}

export function buildPlanUserMessage(input: PlanInput): string {
  const velocity = input.velocityAssumption ?? 20;

  const expertBlock = input.expertOutputs.map(e => `
=== ${e.syntheticName} (${e.role}) ===
${summariseExpertOutput(e.output)}`.trim()).join("\n\n");

  const risksBlock = input.risks.length > 0
    ? input.risks.map(r => `[${r.status.toUpperCase()}] (${r.level}) ${r.text} — raised by ${r.syntheticName}${r.mitigationNote ? ` | mitigation: ${r.mitigationNote}` : ""}`).join("\n")
    : "(none identified)";

  const answersBlock = input.userAnswers.length > 0
    ? input.userAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
    : "(none provided)";

  const actionItems = input.summaryReport.actionItems ?? [];

  return `
IDEA PROMPT:
${input.ideaPrompt}

VERDICT: ${input.verdict.overall.toUpperCase()}${input.verdict.blockingAgent ? ` (blocked by ${input.verdict.blockingAgent})` : ""}

PLAN FORMAT: ${input.format}
VELOCITY ASSUMPTION: ${velocity} SP per sprint

ORCHESTRATOR ACTION ITEMS (high priority):
${actionItems.length > 0 ? actionItems.map((a, i) => `${i + 1}. ${a}`).join("\n") : "(none)"}

EXPERT OUTPUTS:
${expertBlock}

RISKS:
${risksBlock}

USER ANSWERS TO FOLLOW-UP QUESTIONS:
${answersBlock}

Now generate the implementation plan as a single JSON object matching the required schema. Return ONLY the JSON object.
`.trim();
}
