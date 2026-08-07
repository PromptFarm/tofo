import type {
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
  SyntheticPreparedInputSource,
} from "./server/types"

export type DecisionRequiredOptionLike = {
  id: string
  label?: string
  description?: string
}

export type DecisionRequiredPayloadLike = {
  options: DecisionRequiredOptionLike[]
  recommendedOptionId?: string | null
}

export type SuggestedDefaultQuestion = {
  suggestedAnswer?: string | null
}

export type PreparedSourceItem = {
  source?: SyntheticPreparedInputSource
}

export type ParsedDelimitedListText = {
  label: string | null
  items: string[]
}

export type DecisionRequiredPresentation<TOption extends DecisionRequiredOptionLike> = {
  recommendedDecisionOption: TOption | null
  alternateDecisionOptions: TOption[]
  alternateOptionsTitle: string
  showAcceptRecommended: boolean
}

export function hasSuggestedDefaultsForQuestions(
  questions: SuggestedDefaultQuestion[],
): boolean {
  return questions.some((question) => (question.suggestedAnswer?.trim().length ?? 0) > 0)
}

export function summarizePreparedInputSourcesForUi(
  items: PreparedSourceItem[],
): "defaults" | "manual" | "mixed" {
  const hasDefaults = items.some((item) => item.source === "defaults")
  const hasManual = items.some(
    (item) => item.source === undefined || item.source === "manual_edit",
  )

  if (hasDefaults && hasManual) {
    return "mixed"
  }

  return hasDefaults ? "defaults" : "manual"
}

export function formatPreparedInputSourceLabel(
  source: SyntheticPreparedInputSource | undefined,
): string {
  return source === "defaults" ? "from defaults" : "manual edit"
}

export function formatPreparedDecisionInline(
  item: SyntheticPreparedDecision,
): string {
  return `${item.decisionTitle}: ${item.optionLabel} [${formatPreparedInputSourceLabel(
    item.source,
  )}]`
}

export function formatPreparedDecisionSpecLine(
  item: SyntheticPreparedDecision,
): string {
  return `- Decision: ${item.decisionTitle} -> ${item.optionLabel} [${formatPreparedInputSourceLabel(
    item.source,
  )}]`
}

export function formatPreparedClarificationHeader(
  item: SyntheticPreparedClarification,
): string {
  return `Clarification set: ${item.syntheticName} [${formatPreparedInputSourceLabel(
    item.source,
  )}]`
}

export function formatPreparedClarificationTooltip(
  item: SyntheticPreparedClarification,
): string {
  return `${item.syntheticName}: ${item.answers.length} answer${
    item.answers.length === 1 ? "" : "s"
  } [${formatPreparedInputSourceLabel(item.source)}]`
}

export function resolveDecisionRequiredPresentation<TOption extends DecisionRequiredOptionLike>(
  decisionRequired: DecisionRequiredPayloadLike | null | undefined,
  isRoutingOption: (optionId: string | null | undefined) => boolean,
): DecisionRequiredPresentation<TOption> {
  const recommendedDecisionOption = decisionRequired
    ? ((decisionRequired.options.find(
        (option) => option.id === (decisionRequired.recommendedOptionId ?? ""),
      ) ?? decisionRequired.options[0] ?? null) as TOption | null)
    : null
  const recommendedIsRouting = isRoutingOption(recommendedDecisionOption?.id)
  const alternateDecisionOptions = decisionRequired
    ? (recommendedIsRouting
        ? decisionRequired.options
        : decisionRequired.options.filter(
            (option) => option.id !== recommendedDecisionOption?.id,
          )) as TOption[]
    : []

  return {
    recommendedDecisionOption,
    alternateDecisionOptions,
    alternateOptionsTitle: recommendedIsRouting ? "Route Decision" : "Pick Another",
    showAcceptRecommended: Boolean(recommendedDecisionOption && !recommendedIsRouting),
  }
}

export function parseDelimitedListText(text: string): ParsedDelimitedListText {
  const trimmed = text.trim()
  if (!trimmed) {
    return { label: null, items: [] }
  }

  const labeledMatch = trimmed.match(/^([^:]+):\s*(.+)$/)
  const label = labeledMatch ? labeledMatch[1].trim() : null
  const body = labeledMatch ? labeledMatch[2].trim() : trimmed
  const items = body
    .split(/\s*;\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return {
    label,
    items,
  }
}

export function expandDelimitedListText(text: string): string[] {
  const parsed = parseDelimitedListText(text)
  if (parsed.items.length < 2) {
    return [text]
  }

  return parsed.items.map((item) =>
    parsed.label ? `${parsed.label}: ${item}` : item,
  )
}
