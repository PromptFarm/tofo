import "server-only"

import type {
  DirectorOutput,
  PersonaSuggestion,
  SyntheticIntakeQuestion,
  SyntheticPersona,
  SyntheticPreparedDecision,
} from "./types"
import type { ModelProvider } from "./modelProvider"

/** Normalize a persona ID for fuzzy matching:
 *  lowercase, replace spaces/hyphens with underscores, strip surrounding whitespace. */
function normalizePersonaId(value: string): string {
  return value.trim().toLowerCase().replace(/[-\s]+/g, "_")
}

function parseDirectorOutput(
  text: string,
  availablePersonas: SyntheticPersona[],
): DirectorOutput {
  // Build both an exact map and a normalized map for fuzzy lookup
  const personaById = new Map(availablePersonas.map((p) => [p.id, p]))
  const personaByNormalizedId = new Map(
    availablePersonas.map((p) => [normalizePersonaId(p.id), p]),
  )
  // Also build a map by normalized title for models that return titles instead of IDs
  const personaByNormalizedTitle = new Map(
    availablePersonas.map((p) => [normalizePersonaId(p.title), p]),
  )

  /** Find persona by exact ID, normalized ID, or normalized title (fuzzy fallback). */
  function findPersona(rawText: string): SyntheticPersona | undefined {
    const exactMatch = personaById.get(rawText)
    if (exactMatch) return exactMatch

    const normalizedText = normalizePersonaId(rawText)
    const normalizedIdMatch = personaByNormalizedId.get(normalizedText)
    if (normalizedIdMatch) return normalizedIdMatch

    // Try matching against normalized title (e.g., "Game Designer" → "game_designer")
    const normalizedTitleMatch = personaByNormalizedTitle.get(normalizedText)
    if (normalizedTitleMatch) return normalizedTitleMatch

    // Partial title-based match: model returned part of the title or vice versa
    if (normalizedText.length >= 4) {
      for (const persona of availablePersonas) {
        const titleNorm = normalizePersonaId(persona.title)
        if (titleNorm.includes(normalizedText) || normalizedText.includes(titleNorm)) {
          return persona
        }
      }
    }

    return undefined
  }

  // Full persona catalog for the "add more roles" UI — not ranked by the Director
  const personaRoster: PersonaSuggestion[] = availablePersonas.map((p) => ({
    personaId: p.id,
    name: p.title,
    domain: p.domain,
    reason: p.description.split(".")[0]?.trim() ?? p.description.trim(),
    confidence: 0,
  }))

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON block found")
    const data = JSON.parse(jsonMatch[0]) as {
      identifiedDomain?: unknown
      domainSummary?: unknown
      personaSuggestions?: unknown[]
      groundedQuestions?: unknown[]
    }

    const rawSuggestions: PersonaSuggestion[] = (
      Array.isArray(data.personaSuggestions) ? data.personaSuggestions : []
    )
      .flatMap((item): PersonaSuggestion[] => {
        if (!item || typeof item !== "object") return []
        const s = item as Record<string, unknown>
        // Try personaId first; also accept name/title fields as fallback
        const candidateText =
          typeof s.personaId === "string" ? s.personaId :
          typeof s.name === "string" ? s.name :
          typeof s.title === "string" ? s.title :
          null
        if (!candidateText) return []
        const persona = findPersona(candidateText)
        if (!persona) return []
        return [
          {
            personaId: persona.id, // always use the canonical ID, not the model's version
            name: typeof s.name === "string" ? s.name : persona.title,
            domain: typeof s.domain === "string" ? s.domain : persona.domain,
            reason: typeof s.reason === "string" ? s.reason : "",
            confidence:
              typeof s.confidence === "number"
                ? Math.min(1, Math.max(0, s.confidence))
                : 0.7,
          },
        ]
      })
      .slice(0, 7)

    // Deduplicate by personaId (title-fuzzy-matching may map multiple LLM entries
    // to the same canonical persona)
    const seenIds = new Set<string>()
    const personaSuggestions: PersonaSuggestion[] = rawSuggestions.filter((s) => {
      if (seenIds.has(s.personaId)) return false
      seenIds.add(s.personaId)
      return true
    })

    // Domain-based fallback: if the LLM didn't produce any valid suggestions,
    // surface the top personas from the identified domain automatically so the
    // canvas is never empty after analysis.
    const finalSuggestions: PersonaSuggestion[] = (() => {
      if (personaSuggestions.length > 0) return personaSuggestions

      const identifiedDomain = typeof data.identifiedDomain === "string"
        ? normalizePersonaId(data.identifiedDomain)
        : ""

      // Pick personas whose domain matches (partial, case-insensitive)
      const domainMatches = availablePersonas.filter((p) => {
        if (!identifiedDomain) return true
        const pd = normalizePersonaId(p.domain)
        return pd === identifiedDomain ||
          pd.startsWith(identifiedDomain.split("_")[0] ?? "") ||
          identifiedDomain.startsWith(pd.split("_")[0] ?? "")
      })

      const pool = domainMatches.length >= 3 ? domainMatches : availablePersonas

      return pool.slice(0, 5).map((p) => ({
        personaId: p.id,
        name: p.title,
        domain: p.domain,
        reason: p.description.split(".")[0]?.trim() ?? p.description.trim(),
        confidence: 0.5,
      }))
    })()

    const groundedQuestions: SyntheticIntakeQuestion[] = (
      Array.isArray(data.groundedQuestions) ? data.groundedQuestions : []
    )
      .flatMap((item, idx): SyntheticIntakeQuestion[] => {
        if (!item || typeof item !== "object") return []
        const q = item as Record<string, unknown>
        const question = typeof q.question === "string" ? q.question.trim() : ""
        if (!question) return []
        return [
          {
            id: typeof q.id === "string" ? q.id : `dq${idx + 1}`,
            question,
            whyItMatters: typeof q.whyItMatters === "string" ? q.whyItMatters : "",
            required: q.required === true,
            suggestedAnswer:
              typeof q.suggestedAnswer === "string" ? q.suggestedAnswer : null,
            source: "intake",
            syntheticId: null,
          },
        ]
      })
      .filter((q) => q.question.length > 0)
      .slice(0, 5)

    return {
      identifiedDomain:
        typeof data.identifiedDomain === "string"
          ? data.identifiedDomain
          : "general",
      domainSummary:
        typeof data.domainSummary === "string" ? data.domainSummary : "",
      personaSuggestions: finalSuggestions,
      personaRoster,
      groundedQuestions,
      raw: data,
    }
  } catch {
    // On parse failure, fall back to the first 5 available personas
    const fallback: PersonaSuggestion[] = availablePersonas.slice(0, 5).map((p) => ({
      personaId: p.id,
      name: p.title,
      domain: p.domain,
      reason: p.description.split(".")[0]?.trim() ?? p.description.trim(),
      confidence: 0.5,
    }))
    return {
      identifiedDomain: "general",
      domainSummary: "",
      personaSuggestions: fallback,
      personaRoster,
      groundedQuestions: [],
      raw: text,
    }
  }
}

export async function buildDirectorOutput(input: {
  ideaPrompt: string
  availablePersonas: SyntheticPersona[]
  resolvedDecisions?: SyntheticPreparedDecision[]
  modelProvider: ModelProvider
  onTextDelta?: (delta: string) => void | Promise<void>
}): Promise<DirectorOutput> {
  const personaList = input.availablePersonas
    .map((p) => `- id: "${p.id}" | title: "${p.title}" | domain: "${p.domain}"`)
    .join("\n")

  const resolvedDecisionsBlock =
    input.resolvedDecisions && input.resolvedDecisions.length > 0
      ? `\nPreviously resolved decisions (the user has already locked these in — treat them as fixed constraints, do NOT suggest personas that would contradict them, and do NOT re-raise them as questions):\n${input.resolvedDecisions.map((d) => `- ${d.decisionTitle}: "${d.optionLabel}"`).join("\n")}\n`
      : ""

  const systemPrompt = `You are an analysis routing agent. Analyze the idea and select the right expert team from a predefined roster.

Available personas (use the exact string shown after id: as the personaId value):
${personaList}
${resolvedDecisionsBlock}
Given a project idea, return ONLY valid JSON with no extra text before or after:
{
  "identifiedDomain": "e.g. gamedev / saas-b2b / mobile / creative / hardware",
  "domainSummary": "One sentence explaining why this domain framing fits the idea",
  "personaSuggestions": [
    {
      "personaId": "exact_id_from_list",
      "name": "Persona Title",
      "domain": "identified-domain",
      "reason": "Why this persona is essential for THIS specific idea",
      "confidence": 0.9
    }
  ],
  "groundedQuestions": [
    {
      "id": "dq1",
      "question": "A specific question one of the selected personas would need answered",
      "whyItMatters": "How the answer changes the team's approach",
      "required": true,
      "suggestedAnswer": null
    }
  ]
}

CRITICAL RULES:
- The "personaId" field MUST be copied EXACTLY from the id: field in the Available personas list above (e.g. "game_designer", not "Game Designer" or "GameDesigner")
- Select 3 to 7 personas most relevant to the idea
- EXCLUDE a persona if: it covers a domain the idea has no touchpoint with (e.g. do NOT add a Legal persona for a simple internal tool with no user data; do NOT add a Hardware persona for a pure SaaS product; do NOT add a Game Designer for a B2B analytics dashboard)
- EXCLUDE a persona if: its role duplicates another already selected persona's scope (e.g. do not include both a General Engineer and a CTO if the team is small — pick the one that fits better)
- EXCLUDE a persona if: the idea is too early-stage for that domain to have any actionable input (e.g. do not add a VP of Sales for a solo weekend project with no defined sales motion)
- Generate 3 to 5 grounded questions tied to the selected personas' specific concerns
- Questions must be idea-specific and actionable, not generic
- Do NOT generate questions about topics already covered by previously resolved decisions
- Order personas by relevance (most important first)
- Order questions by importance (must-know first)
- Return ONLY the JSON object, nothing else`

  let accumulatedText = ""

  if (input.modelProvider.streamText) {
    const result = await input.modelProvider.streamText({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this idea and select the right expert team:\n\n${input.ideaPrompt}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 800,
      onTextDelta: async (delta) => {
        accumulatedText += delta
        await input.onTextDelta?.(delta)
      },
    })
    accumulatedText = result.text
  } else {
    const result = await input.modelProvider.generate({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this idea and select the right expert team:\n\n${input.ideaPrompt}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 800,
    })
    accumulatedText = result.text
  }

  return parseDirectorOutput(accumulatedText, input.availablePersonas)
}

