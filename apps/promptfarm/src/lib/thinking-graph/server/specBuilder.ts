import "server-only"

import type { ModelProvider } from "./modelProvider"
import { createModelProvider } from "./modelProvider"
import { getThinkingGraphRuntimeConfig } from "./config"
import type {
  SyntheticOutputJson,
  SyntheticSession,
} from "./types"
import {
  buildProjectSpec,
} from "../projectSpecification"
import type { ProjectSpec, SpecSection } from "./types"

// ---------------------------------------------------------------------------
// Gap-filling LLM call — one call per section that has openQuestions
// ---------------------------------------------------------------------------

type GapFillInput = {
  ideaPrompt: string
  agentName: string
  domain: string | undefined
  openQuestions: string[]
  filledByAI: string[]
  existingContent: string
}

type GapFillResult = {
  filledByAI: string[]
  content: string
}

function buildGapFillPrompt(input: GapFillInput): string {
  const { ideaPrompt, agentName, domain, openQuestions, existingContent } = input

  const domainLine = domain ? ` (domain: ${domain})` : ""
  const questionsBlock = openQuestions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n")

  return `You are ${agentName}${domainLine}, a senior expert analysing a game development project.

PROJECT IDEA:
${ideaPrompt}

EXISTING ANALYSIS:
${existingContent || "(no prior analysis)"}

OPEN QUESTIONS that still need answers:
${questionsBlock}

TASK:
For each open question, provide a concise, specific, realistic default answer suitable for a project of this type.
Do NOT be generic — tailor each answer to the actual idea.

Return ONLY a JSON object with this exact shape:
{
  "filledAnswers": [
    { "question": "<exact question text>", "answer": "<your specific default answer>" }
  ]
}
No extra text, no markdown fences.`
}

type FilledAnswersRaw = {
  filledAnswers?: Array<{ question?: string; answer?: string }>
}

function parseGapFillResponse(text: string): Array<{ question: string; answer: string }> {
  const trimmed = text.trim()
  const candidates: string[] = [trimmed]

  // Strip markdown fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  if (fenced) candidates.push(fenced)

  // Extract first top-level JSON object
  const brace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (brace !== -1 && lastBrace !== -1) {
    candidates.push(trimmed.slice(brace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as FilledAnswersRaw
      if (Array.isArray(parsed.filledAnswers)) {
        return parsed.filledAnswers
          .filter((item) => typeof item.question === "string" && typeof item.answer === "string")
          .map((item) => ({ question: item.question as string, answer: item.answer as string }))
      }
    } catch {
      // try next candidate
    }
  }

  return []
}

async function fillSectionGaps(
  provider: ModelProvider,
  input: GapFillInput,
): Promise<GapFillResult> {
  if (input.openQuestions.length === 0) {
    return { filledByAI: input.filledByAI, content: input.existingContent }
  }

  const prompt = buildGapFillPrompt(input)

  let resultText = ""
  try {
    const result = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxTokens: 1200,
    })
    resultText = result.text
  } catch (err) {
    console.error("[specBuilder] gap-fill LLM call failed:", err)
    // Return original content with questions marked as unanswerable
    return {
      filledByAI: [
        ...input.filledByAI,
        ...input.openQuestions.map((q) => `${q} (LLM unavailable — left open)`),
      ],
      content: input.existingContent,
    }
  }

  const filled = parseGapFillResponse(resultText)

  const newFilledByAI = filled.map(({ question, answer }) => `${question} → ${answer}`)

  // Append AI answers to existing content
  const aiSection = filled.length > 0
    ? "\n\nAI-filled gaps:\n" + filled.map(({ question, answer }) => `- ${question}: ${answer}`).join("\n")
    : ""

  return {
    filledByAI: [...input.filledByAI, ...newFilledByAI],
    content: input.existingContent + aiSection,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type BuildSpecInput = {
  session: SyntheticSession
}

export type BuildSpecResult = {
  projectSpec: ProjectSpec
}

export async function buildSpec(input: BuildSpecInput): Promise<BuildSpecResult> {
  const { session } = input

  const config = getThinkingGraphRuntimeConfig()
  const provider = createModelProvider(config)

  // Step 1: derive the current spec from accumulated context (no LLM yet)
  const outputsBySyntheticId: Record<string, SyntheticOutputJson | null> =
    Object.fromEntries(
      Object.entries(session.memoryBySyntheticId).map(([id, m]) => [
        id,
        m.latestOutput ?? null,
      ]),
    )

  const baseSpec = buildProjectSpec({
    ideaPrompt: session.ideaPrompt,
    synthetics: session.synthetics,
    outputsBySyntheticId,
    appliedDecisions: session.preparedInputs.decisions,
    appliedStructuredClarifications: session.preparedInputs.clarifications,
  })

  // Step 2: for every section with openQuestions, call LLM to fill gaps
  const filledSections: SpecSection[] = await Promise.all(
    baseSpec.sections.map(async (section) => {
      const synthetic = session.synthetics.find((s) => s.id === section.agentId)
      const domain = (synthetic as { domain?: string } | undefined)?.domain

      const gapResult = await fillSectionGaps(provider, {
        ideaPrompt: session.ideaPrompt,
        agentName: section.agentName,
        domain,
        openQuestions: section.openQuestions,
        filledByAI: section.filledByAI,
        existingContent: section.content,
      })

      return {
        ...section,
        openQuestions: [],          // all gaps now closed (either answered or AI-defaulted)
        filledByAI: gapResult.filledByAI,
        content: gapResult.content,
        readyForPlan: true,
      }
    }),
  )

  const finalSpec: ProjectSpec = {
    ...baseSpec,
    sections: filledSections,
    generatedAt: new Date().toISOString(),
    allClosed: true,
  }

  return { projectSpec: finalSpec }
}
