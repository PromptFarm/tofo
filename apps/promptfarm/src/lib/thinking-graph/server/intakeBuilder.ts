import type { ModelProvider } from "./modelProvider"
import type {
  SyntheticIntakeAnswer,
  SyntheticIntakeQuestion,
  SyntheticOutputJson,
  SyntheticPreparedDecision,
  SyntheticSession,
} from "./types"

const MAX_INTAKE_QUESTIONS = 5

// ---------------------------------------------------------------------------
// buildIntakeQuestions
// Single LLM call to generate intake questions from ideaPrompt.
// ---------------------------------------------------------------------------

export async function buildIntakeQuestions(input: {
  ideaPrompt: string
  modelProvider: ModelProvider
  resolvedDecisions?: SyntheticPreparedDecision[]
}): Promise<SyntheticIntakeQuestion[]> {
  const resolvedBlock =
    input.resolvedDecisions && input.resolvedDecisions.length > 0
      ? `\nThe following decisions have already been made by the user — do NOT ask about them:\n${input.resolvedDecisions.map((d) => `- ${d.decisionTitle}: "${d.optionLabel}"`).join("\n")}\n`
      : ""

  const systemPrompt = `You are a project intake specialist.
Given a project idea, generate 3 to 5 clarifying questions that will help the development team understand the scope, constraints, and goals before they start working.
${resolvedBlock}
Focus on questions that:
- Reveal hard constraints (platform, budget, team size, timeline)
- Clarify the core experience (target audience, genre conventions, unique differentiators)
- Unblock the first iteration (what must be decided now vs later)

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "whyItMatters": "...",
      "required": true,
      "suggestedAnswer": "..." or null
    }
  ]
}`

  const result = await input.modelProvider.generate({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Project idea: ${input.ideaPrompt}` },
    ],
  })

  const parsed = parseIntakeLlmOutput(result.text)
  return filterResolvedDecisionQuestions(parsed, input.resolvedDecisions).slice(0, MAX_INTAKE_QUESTIONS)
}

function parseIntakeLlmOutput(text: string): SyntheticIntakeQuestion[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const data = JSON.parse(jsonMatch[0]) as { questions?: unknown[] }
    if (!Array.isArray(data.questions)) return []

    return data.questions.flatMap((item): SyntheticIntakeQuestion[] => {
      if (!item || typeof item !== "object") return []
      const q = item as Record<string, unknown>
      if (
        typeof q.id !== "string" ||
        typeof q.question !== "string" ||
        typeof q.whyItMatters !== "string" ||
        typeof q.required !== "boolean"
      ) {
        return []
      }
      return [
        {
          id: q.id,
          question: q.question,
          whyItMatters: q.whyItMatters,
          required: q.required,
          suggestedAnswer: typeof q.suggestedAnswer === "string" ? q.suggestedAnswer : null,
          source: "intake",
          syntheticId: null,
        },
      ]
    })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// filterResolvedDecisionQuestions
// Removes intake questions that are already covered by resolved decisions.
// Uses keyword overlap as a heuristic safety net (prompt injection is primary).
// ---------------------------------------------------------------------------

export function filterResolvedDecisionQuestions(
  questions: SyntheticIntakeQuestion[],
  resolvedDecisions: SyntheticPreparedDecision[] | undefined,
): SyntheticIntakeQuestion[] {
  if (!resolvedDecisions || resolvedDecisions.length === 0) return questions
  return questions.filter((q) => !isQuestionCoveredByDecision(q.question, resolvedDecisions))
}

function isQuestionCoveredByDecision(
  question: string,
  decisions: SyntheticPreparedDecision[],
): boolean {
  const qLower = question.toLowerCase()
  return decisions.some((d) => {
    const keywords = [
      ...d.decisionTitle.toLowerCase().split(/\W+/),
      ...d.optionLabel.toLowerCase().split(/\W+/),
    ].filter((w) => w.length > 3)
    return keywords.some((w) => qLower.includes(w))
  })
}

// ---------------------------------------------------------------------------
// collectIntakeQuestionsFromRun
// After a run completes, harvest clarificationRequests from agent outputs
// and merge them into the session's intakeQuestions (deduplicating by id).
// ---------------------------------------------------------------------------

export function collectIntakeQuestionsFromRun(input: {
  session: SyntheticSession
  outputsBySyntheticId: Record<string, SyntheticOutputJson>
}): SyntheticSession {
  const existingIds = new Set(input.session.intakeQuestions.map((q) => q.id))
  const resolvedDecisions = input.session.resolvedDecisions ?? []
  const newQuestions: SyntheticIntakeQuestion[] = []

  for (const [syntheticId, output] of Object.entries(input.outputsBySyntheticId)) {
    const clarifications =
      "details" in output ? output.operational?.clarificationRequests ?? [] : []
    for (const cr of clarifications) {
      if (existingIds.has(cr.id)) continue
      if (isQuestionCoveredByDecision(cr.question, resolvedDecisions)) continue
      existingIds.add(cr.id)
      newQuestions.push({
        id: cr.id,
        question: cr.question,
        whyItMatters: cr.whyItMatters,
        required: cr.required,
        suggestedAnswer: null,
        source: "agent",
        syntheticId,
      })
    }
  }

  if (newQuestions.length === 0) return input.session

  return {
    ...input.session,
    intakeQuestions: [...input.session.intakeQuestions, ...newQuestions],
    updatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// getPendingIntakeQuestions
// Returns questions that have no answer yet.
// ---------------------------------------------------------------------------

export function getPendingIntakeQuestions(
  session: Pick<SyntheticSession, "intakeQuestions" | "intakeAnswers">,
): SyntheticIntakeQuestion[] {
  const answeredIds = new Set(session.intakeAnswers.map((a) => a.questionId))
  return session.intakeQuestions.filter((q) => !answeredIds.has(q.id))
}

// ---------------------------------------------------------------------------
// buildIntakeContextBlock
// Renders the INTAKE CONTEXT block for injection into agent prompts.
// ---------------------------------------------------------------------------

export function buildIntakeContextBlock(
  session: Pick<SyntheticSession, "intakeQuestions" | "intakeAnswers">,
): string | null {
  if (session.intakeQuestions.length === 0) return null

  const answerByQuestionId = new Map<string, SyntheticIntakeAnswer>(
    session.intakeAnswers.map((a) => [a.questionId, a]),
  )

  const lines: string[] = [
    "INTAKE CONTEXT — clarifying questions answered by the user before this run:",
  ]

  for (const q of session.intakeQuestions) {
    const answer = answerByQuestionId.get(q.id)
    if (answer) {
      lines.push(`- Q: "${q.question}" → A: "${answer.answer}"`)
    } else {
      lines.push(`- Q: "${q.question}" → A: (skipped by user)`)
    }
  }

  lines.push(
    "Treat answered questions as resolved project facts. Do NOT re-raise them as clarification requests.",
  )

  return lines.join("\n")
}
