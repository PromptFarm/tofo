import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types"

import type {
  AdvisorReport,
  BriefSentence,
  DomainGateResult,
  DomainVerdict,
  RunSummaryConflict,
  RunSummaryConflictEdge,
  RunSummaryDecisionFamily,
  RunSummaryMatrixRow,
  RunSummaryReport,
  SyntheticOutputJson,
  SyntheticReport,
} from "./server/types"
import { isAdvisorReport } from "./server/types"
import { expandDelimitedListText } from "./userFacingPresentation"

type BuildRunSummaryReportInput = {
  ideaPrompt: string
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null | undefined>
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function hasAnyOperationalOutputs(outputs: SyntheticReport[]): boolean {
  return outputs.some((output) => Boolean(output.operational))
}

function getOperationalBriefLines(output: SyntheticReport): string[] {
  if (!output.operational) {
    return []
  }

  if (output.operational.userFacing) {
    return uniqueNonEmpty([
      output.operational.userFacing.summary,
      ...output.operational.userFacing.whatWeKnow.map(
        (item) => `${item.label}: ${item.value}`,
      ),
    ])
  }

  return uniqueNonEmpty([
    output.operational.summary,
    ...output.operational.findings,
    ...output.operational.acceptedAssumptions.map(
      (item) => `Accepted assumption: ${item}`,
    ),
  ])
}

function isGenericClarificationText(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("needs one clarification before it can be finalized") ||
    normalized.includes("requires further clarification before it can be finalized") ||
    normalized.includes("provide the requested clarification and rerun this step")
  )
}

function splitRecommendationIntoActions(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []

  const numbered = trimmed.match(/\d+\.\s[^]+/)
  if (!numbered) {
    return [trimmed]
  }

  const parts = trimmed
    .split(/\s(?=\d+\.\s)/)
    .map((part) => part.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean)

  return parts.length > 0 ? parts : [trimmed]
}

function extractPendingClarifications(output: SyntheticReport): string[] {
  const operationalClarifications = output.operational?.clarificationRequests.map(
    (item) => item.question,
  ) ?? []

  return [
    ...operationalClarifications,
    ...output.ignoredInputs
    .filter((item) => item.startsWith("Pending clarification:"))
    .map((item) => item.replace("Pending clarification:", "").trim())
    .filter(Boolean),
  ]
}

function extractOperationalActionItems(output: SyntheticReport): string[] {
  if (!output.operational) {
    return []
  }

  if (output.operational.userFacing) {
    const block = output.operational.userFacing
    if (block.state === "user_input_required") {
      return uniqueNonEmpty([
        ...block.whatIsNeededNow.flatMap((item) => expandDelimitedListText(item)),
        ...block.questions.map((item) => item.label || item.question),
      ])
    }

    if (block.state === "decision_required" || block.state === "conflict") {
      return uniqueNonEmpty(
        block.options.map((item) =>
          item.recommended
            ? `Choose ${item.label} (recommended)`
            : `Choose ${item.label}`,
        ),
      )
    }

    if (block.state === "ready" && block.nextStep) {
      return [block.nextStep]
    }
  }

  const readinessBlockers = output.operational.readiness.blockers.map(
    (item) => `Resolve blocker: ${item}`,
  )
  const recommendedDecisionActions = output.operational.recommendedDecisions.map(
    (item) =>
      item.recommendedOption
        ? `Decide ${item.title}: prefer ${item.recommendedOption}`
        : `Decide ${item.title}`,
  )

  return uniqueNonEmpty([
    ...output.operational.nextSteps,
    ...recommendedDecisionActions,
    ...readinessBlockers,
  ])
}

function describeOperationalConflict(output: SyntheticReport): string {
  if (!output.operational) {
    return output.details
  }

  if (
    output.operational.userFacing &&
    output.operational.userFacing.state !== "conflict"
  ) {
    return output.operational.userFacing.summary
  }

  const parts = [
    output.operational.findings.length > 0
      ? output.operational.findings.join("; ")
      : null,
    output.operational.missingInformation.length > 0
      ? `Missing information: ${output.operational.missingInformation.join("; ")}`
      : null,
    output.operational.readiness.blocked
      ? `Blockers: ${output.operational.readiness.blockers.join("; ")}`
      : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(" ") || output.details
}

function suggestOperationalResolution(output: SyntheticReport): string {
  if (!output.operational) {
    return output.recommendation
  }

  if (output.operational.userFacing) {
    const block = output.operational.userFacing
    if (block.state === "user_input_required") {
      const firstQuestion = block.questions[0]
      if (firstQuestion) {
        return `Provide input: ${firstQuestion.question}`
      }
    }

    const recommendedOption = block.options.find((item) => item.recommended)
    if (recommendedOption) {
      return `Choose ${recommendedOption.label}`
    }

    if (block.nextStep) {
      return block.nextStep
    }
  }

  const recommendedDecision = output.operational.recommendedDecisions[0]
  if (recommendedDecision) {
    return recommendedDecision.recommendedOption
      ? `${recommendedDecision.title}: prefer ${recommendedDecision.recommendedOption}`
      : recommendedDecision.title
  }

  const nextStep = output.operational.nextSteps[0]
  if (nextStep) {
    return nextStep
  }

  const clarification = output.operational.clarificationRequests[0]
  if (clarification) {
    return `Clarify: ${clarification.question}`
  }

  return output.recommendation
}

function deriveOperationalDetailLength(output: SyntheticReport): number {
  if (!output.operational) {
    return output.details.length
  }

  return [
    ...output.operational.findings,
    ...output.operational.missingInformation.flatMap((item) =>
      expandDelimitedListText(item),
    ),
    ...output.operational.readiness.blockers,
  ].join(" ").length
}

function computeTimePressure(output: SyntheticReport): number {
  const complexityBase =
    output.concernLevels.complexityLabel === "high"
      ? 82
      : output.concernLevels.complexityLabel === "medium"
        ? 58
        : 34

  return clampScore(complexityBase + output.concernLevels.risk * 0.25)
}

function computeUserValue(output: SyntheticReport): number {
  const actionSignal = Math.min(
    (output.operational?.nextSteps.join(" ").length ?? 0) / 2,
    24,
  )
  return clampScore(
    output.concernLevels.feasibility * 0.65 +
      (100 - output.concernLevels.risk) * 0.2 +
      actionSignal,
  )
}

function computeCostPressure(output: SyntheticReport): number {
  const complexityCost =
    output.concernLevels.complexityLabel === "high"
      ? 24
      : output.concernLevels.complexityLabel === "medium"
        ? 12
        : 0
  const riskCost = output.concernLevels.risk * 0.55
  const detailSignal = Math.min(deriveOperationalDetailLength(output) / 8, 18)
  return clampScore(riskCost + complexityCost + detailSignal)
}

function countKeywordHits(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase()
  return keywords.reduce(
    (count, keyword) => count + (normalized.includes(keyword) ? 1 : 0),
    0,
  )
}

function computeDomainOptionSignal(output: SyntheticReport, optionText: string) {
  const domain = output.operational?.domain ?? "general"
  const text = optionText.toLowerCase()

  if (domain === "ux") {
    const readabilityHits = countKeywordHits(text, [
      "readab",
      "clar",
      "hud",
      "onboard",
      "accessib",
      "threat",
      "ally",
      "state",
      "ui",
    ])
    return {
      feasibility: readabilityHits * 5,
      risk: -readabilityHits * 4,
      timePressure: readabilityHits * 2,
      userValue: readabilityHits * 7,
      costPressure: readabilityHits,
    }
  }

  if (domain === "engineering") {
    const implementationHits = countKeywordHits(text, [
      "modular",
      "data-driven",
      "performance",
      "implement",
      "contract",
      "system",
      "scope",
      "boundary",
      "maintain",
    ])
    return {
      feasibility: implementationHits * 6,
      risk: -implementationHits * 2,
      timePressure: implementationHits * 3,
      userValue: implementationHits * 3,
      costPressure: -implementationHits * 2,
    }
  }

  if (domain === "gameplay" || domain === "general") {
    const gameplayHits = countKeywordHits(text, [
      "combat",
      "loop",
      "jump",
      "movement",
      "level",
      "enemy",
      "boss",
      "arena",
      "pace",
      "mechanic",
    ])
    return {
      feasibility: gameplayHits * 4,
      risk: gameplayHits,
      timePressure: gameplayHits * 3,
      userValue: gameplayHits * 6,
      costPressure: gameplayHits * 2,
    }
  }

  return {
    feasibility: 0,
    risk: 0,
    timePressure: 0,
    userValue: 0,
    costPressure: 0,
  }
}

function buildOptionProfileNote(input: {
  output: SyntheticReport
  optionText: string
  prosWeight: number
  consWeight: number
  recommended: boolean
}): string {
  const parts: string[] = []
  const domain = input.output.operational?.domain ?? "general"
  const domainSignal = computeDomainOptionSignal(input.output, input.optionText)

  if (input.recommended) {
    parts.push("recommended by the source agent")
  }

  if (input.prosWeight >= 24) {
    parts.push("strong upside signal")
  }
  if (input.consWeight >= 20) {
    parts.push("higher downside pressure")
  }

  if (domain === "ux" && domainSignal.userValue >= 14) {
    parts.push("readability-heavy UX fit")
  } else if (domain === "engineering" && domainSignal.feasibility >= 12) {
    parts.push("implementation-friendly engineering fit")
  } else if (
    (domain === "gameplay" || domain === "general") &&
    domainSignal.userValue >= 12
  ) {
    parts.push("strong gameplay loop alignment")
  }

  return parts.slice(0, 2).join(" · ") || "balanced option profile"
}

function computeOptionSpecificScores(input: {
  output: SyntheticReport
  summary: string
  prosWeight: number
  consWeight: number
  recommended: boolean
}) {
  const { output, summary, prosWeight, consWeight, recommended } = input
  const recommendedBonus = recommended ? 10 : 0
  const domainSignal = computeDomainOptionSignal(output, summary)

  return {
    feasibility: clampScore(
      output.concernLevels.feasibility +
        prosWeight -
        consWeight * 0.35 +
        recommendedBonus +
        domainSignal.feasibility,
    ),
    risk: clampScore(
      output.concernLevels.risk +
        consWeight -
        prosWeight * 0.25 -
        recommendedBonus +
        domainSignal.risk,
    ),
    timePressure: clampScore(
      computeTimePressure(output) +
        consWeight * 0.45 -
        recommendedBonus +
        domainSignal.timePressure,
    ),
    userValue: clampScore(
      computeUserValue(output) +
        prosWeight +
        scoreOptionSummaryLength(summary) * 0.2 +
        domainSignal.userValue,
    ),
    costPressure: clampScore(
      computeCostPressure(output) +
        consWeight * 0.55 -
        prosWeight * 0.15 +
        domainSignal.costPressure,
    ),
  }
}

function hasComparableDecisionOptions(outputs: SyntheticReport[]): boolean {
  return outputs.some((output) => {
    const block = output.operational?.userFacing
    if (!block) {
      return false
    }

    return (
      (block.state === "decision_required" || block.state === "conflict") &&
      block.options.length >= 2
    )
  })
}

function normalizeDecisionFamilyKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function scoreOptionSummaryLength(summary: string): number {
  const normalizedLength = Math.min(summary.trim().length, 220)
  return clampScore(35 + normalizedLength / 4)
}

function scoreOptionTradeoffBalance(
  pros: string[],
  cons: string[],
): { prosWeight: number; consWeight: number } {
  const prosWeight = Math.min(pros.length * 12, 36)
  const consWeight = Math.min(cons.length * 10, 30)
  return { prosWeight, consWeight }
}

function buildDecisionFamilies(
  outputs: SyntheticReport[],
): RunSummaryDecisionFamily[] {
  if (!hasComparableDecisionOptions(outputs)) {
    return []
  }

  const families = new Map<
    string,
    {
      familyId: string
      familyTitle: string
      contributorSyntheticIds: Set<string>
      contributorSyntheticNames: Set<string>
      recommendedOptionId: string | null
      recommendedOptionLabel: string | null
      urgency: "blocking" | "important" | "optional"
      options: Map<
        string,
        RunSummaryMatrixRow & {
          _count: number
          _notes: Set<string>
        }
      >
    }
  >()

  outputs.forEach((output) => {
    const block = output.operational?.userFacing
    if (
      !block ||
      (block.state !== "decision_required" && block.state !== "conflict") ||
      block.options.length < 2
    ) {
      return
    }

    const familyTitle = block.title || block.summary || "Decision"
    const familyId = normalizeDecisionFamilyKey(familyTitle)
    const familyEntry =
      families.get(familyId) ??
      {
        familyId,
        familyTitle,
        contributorSyntheticIds: new Set<string>(),
        contributorSyntheticNames: new Set<string>(),
        recommendedOptionId: null,
        recommendedOptionLabel: null,
        urgency: "important" as "blocking" | "important" | "optional",
        options: new Map(),
      }

    familyEntry.contributorSyntheticIds.add(output.syntheticId)
    familyEntry.contributorSyntheticNames.add(output.syntheticName)

    // Derive urgency from the matching recommendedDecision on the operational report.
    // "blocking" > "important" > "optional" — take highest across all contributors.
    const URGENCY_RANK: Record<string, number> = { blocking: 2, important: 1, optional: 0 }
    const matchingDecision = output.operational?.recommendedDecisions?.find(
      (d) => normalizeDecisionFamilyKey(d.title) === familyId,
    )
    if (matchingDecision?.urgency) {
      const incoming = matchingDecision.urgency
      if ((URGENCY_RANK[incoming] ?? 1) > (URGENCY_RANK[familyEntry.urgency] ?? 1)) {
        familyEntry.urgency = incoming
      }
    }

    block.options.forEach((option) => {
      const { prosWeight, consWeight } = scoreOptionTradeoffBalance(
        option.pros,
        option.cons,
      )
      const optionSummary = `${option.label}. ${option.summary} ${option.pros.join(" ")} ${option.cons.join(" ")}`
      const optionScores = computeOptionSpecificScores({
        output,
        summary: optionSummary,
        prosWeight,
        consWeight,
        recommended: option.recommended,
      })
      const profileNote = buildOptionProfileNote({
        output,
        optionText: optionSummary,
        prosWeight,
        consWeight,
        recommended: option.recommended,
      })
      const optionKey = normalizeDecisionFamilyKey(option.label)
      const existing = familyEntry.options.get(optionKey)

      if (!existing) {
        familyEntry.options.set(optionKey, {
          familyId,
          familyTitle,
          optionId: option.id,
          optionLabel: option.label,
          contributorSyntheticIds: [output.syntheticId],
          contributorSyntheticNames: [output.syntheticName],
          recommended: option.recommended,
          profileNote,
          feasibility: optionScores.feasibility,
          risk: optionScores.risk,
          timePressure: optionScores.timePressure,
          userValue: optionScores.userValue,
          costPressure: optionScores.costPressure,
          _count: 1,
          _notes: new Set([profileNote]),
        })
      } else {
        existing.contributorSyntheticIds = uniqueNonEmpty([
          ...existing.contributorSyntheticIds,
          output.syntheticId,
        ])
        existing.contributorSyntheticNames = uniqueNonEmpty([
          ...existing.contributorSyntheticNames,
          output.syntheticName,
        ])
        existing.recommended = existing.recommended || option.recommended
        existing.feasibility = clampScore(
          (existing.feasibility * existing._count + optionScores.feasibility) /
            (existing._count + 1),
        )
        existing.risk = clampScore(
          (existing.risk * existing._count + optionScores.risk) / (existing._count + 1),
        )
        existing.timePressure = clampScore(
          (existing.timePressure * existing._count + optionScores.timePressure) /
            (existing._count + 1),
        )
        existing.userValue = clampScore(
          (existing.userValue * existing._count + optionScores.userValue) /
            (existing._count + 1),
        )
        existing.costPressure = clampScore(
          (existing.costPressure * existing._count + optionScores.costPressure) /
            (existing._count + 1),
        )
        existing._count += 1
        existing._notes.add(profileNote)
        existing.profileNote = Array.from(existing._notes).slice(0, 2).join(" · ")
      }

      if (option.recommended) {
        familyEntry.recommendedOptionId = option.id
        familyEntry.recommendedOptionLabel = option.label
      }
    })

    families.set(familyId, familyEntry)
  })

  return Array.from(families.values()).map((family) => ({
    familyId: family.familyId,
    familyTitle: family.familyTitle,
    recommendedOptionId: family.recommendedOptionId,
    recommendedOptionLabel: family.recommendedOptionLabel,
    contributorSyntheticIds: Array.from(family.contributorSyntheticIds),
    contributorSyntheticNames: Array.from(family.contributorSyntheticNames),
    urgency: family.urgency,
    options: Array.from(family.options.values()).map(({ _count, _notes, ...row }) => row),
  }))
}

function buildDecisionMatrix(
  outputs: SyntheticReport[],
): RunSummaryMatrixRow[] {
  return buildDecisionFamilies(outputs).flatMap((family) => family.options)
}

function buildActionItemsFromDecisionFamilies(
  families: RunSummaryDecisionFamily[],
): string[] {
  return families.map((family) =>
    family.recommendedOptionLabel
      ? `Choose ${family.familyTitle}: prefer ${family.recommendedOptionLabel}`
      : `Choose ${family.familyTitle}`,
  )
}

function buildConflictMap(input: {
  edges: SyntheticEdge[]
  outputById: Map<string, SyntheticReport>
  nodeById: Map<string, SyntheticNode>
}): RunSummaryConflictEdge[] {
  const { edges, outputById, nodeById } = input
  return edges
    .filter((edge) => edge.type === "tension")
    .map((edge) => {
      const fromOutput = outputById.get(edge.from)
      const toOutput = outputById.get(edge.to)
      const fromNode = nodeById.get(edge.from)
      const toNode = nodeById.get(edge.to)
      const fromName = fromOutput?.syntheticName ?? fromNode?.name ?? edge.from
      const toName = toOutput?.syntheticName ?? toNode?.name ?? edge.to

      const description = [fromOutput?.details, toOutput?.details]
        .map((value, index) => {
          const source = index === 0 ? fromOutput : toOutput
          return source ? describeOperationalConflict(source) : value
        })
        .filter((value): value is string => Boolean(value))
        .join(" ")

      return {
        fromSyntheticId: edge.from,
        toSyntheticId: edge.to,
        title: `${fromName} vs ${toName}`,
        description:
          description ||
          `${fromName} and ${toName} are pulling the run in competing directions.`,
        suggestion:
          (fromOutput ? suggestOperationalResolution(fromOutput) : null) ??
          (toOutput ? suggestOperationalResolution(toOutput) : null) ??
          `Resolve the trade-off between ${fromName} and ${toName} before committing scope.`,
        severity:
          (fromOutput?.concernLevels.risk ?? 0) >= 65 ||
          (toOutput?.concernLevels.risk ?? 0) >= 65
            ? "high"
            : "medium",
      }
    })
}

function buildBiggestConflict(input: {
  conflictMap: RunSummaryConflictEdge[]
  outputs: SyntheticReport[]
}): RunSummaryConflict | null {
  const actionableUserFacing = input.outputs.find(
    (output) =>
      output.operational?.userFacing?.state === "user_input_required" ||
      output.operational?.userFacing?.state === "decision_required",
  )

  if (actionableUserFacing?.operational?.userFacing) {
    const block = actionableUserFacing.operational.userFacing
    return {
      title:
        block.state === "user_input_required"
          ? "User input required before continuing"
          : "Decision required before continuing",
      description: block.summary,
      raisedBy: actionableUserFacing.syntheticId,
      suggestion:
        block.nextStep ??
        block.questions[0]?.question ??
        block.options.find((item) => item.recommended)?.label ??
        actionableUserFacing.recommendation,
    }
  }

  const explicitConflict = input.conflictMap.find(
    (conflict) => conflict.severity === "high",
  )
  if (explicitConflict) {
    return {
      title: explicitConflict.title,
      description: explicitConflict.description,
      raisedBy: explicitConflict.fromSyntheticId,
      suggestion: explicitConflict.suggestion,
    }
  }

  const highestRiskOutput = [...input.outputs].sort(
    (left, right) => right.concernLevels.risk - left.concernLevels.risk,
  )[0]

  if (!highestRiskOutput) {
    return null
  }

  return {
    title: `${highestRiskOutput.syntheticName} raised the strongest concern`,
    description: describeOperationalConflict(highestRiskOutput),
    raisedBy: highestRiskOutput.syntheticId,
    suggestion: suggestOperationalResolution(highestRiskOutput),
  }
}

// ---------------------------------------------------------------------------
// Context completeness metrics
// ---------------------------------------------------------------------------

export type ContextCompleteness = {
  totalItems: number
  requiredItems: number
  answeredItems: number
  completenessPercent: number
  requiredCompleteness: number
  missingRequired: Array<{ question: string; priority: number }>
}

function calculateContextCompleteness(output: SyntheticReport): ContextCompleteness {
  const op = output.operational
  if (!op) {
    return {
      totalItems: 0,
      requiredItems: 0,
      answeredItems: 0,
      completenessPercent: 0,
      requiredCompleteness: 100,
      missingRequired: [],
    }
  }

  const clarifications = op.clarificationRequests ?? []
  const missingInfo = op.missingInformation ?? []
  const assumptions = op.acceptedAssumptions ?? []
  const findings = op.findings ?? []

  const totalItems = clarifications.length + missingInfo.length + assumptions.length
  const requiredClarifications = clarifications.filter((c) => c.required)
  const requiredItems = requiredClarifications.length

  // Context is "answered" when we have findings that address the question
  // Rough heuristic: if we have findings, assume we're making progress
  const answeredItems = Math.min(findings.length, totalItems)

  const completenessPercent = totalItems === 0 ? 100 : Math.round((answeredItems / totalItems) * 100)
  const requiredCompleteness =
    requiredItems === 0 ? 100 : Math.round(((requiredItems - requiredClarifications.length) / requiredItems) * 100)

  const missingRequired = requiredClarifications.map((c) => ({
    question: c.question,
    priority: c.priority ?? 2,
  }))

  return {
    totalItems,
    requiredItems,
    answeredItems,
    completenessPercent,
    requiredCompleteness,
    missingRequired,
  }
}

export type PathToGo = {
  steps: Array<{
    priority: "high" | "medium" | "low"
    action: string
    why: string
  }>
  summary: string
}

/**
 * Generate concrete, targetable action steps to move toward "go" status.
 *
 * Each recommendation directly addresses a verdict criterion:
 * - Risk thresholds (>70 = no_go, >40 = conditional, <=40 = go)
 * - Context completeness (100% = good, <100% = gap)
 * - Required clarifications (needed to improve verdict confidence)
 */
export function generatePathToGo(
  gate: DomainGateResult | null,
  output: SyntheticReport,
): PathToGo | null {
  if (!gate || gate.verdict === "go" || !output.operational) {
    return null
  }

  const ctx = gate.contextCompleteness
  if (!ctx) return null

  const risk = output.concernLevels?.risk ?? 0
  const steps: PathToGo["steps"] = []

  // ── VERDICT-SPECIFIC TARGETS ──────────────────────────────────────────────

  if (gate.verdict === "no_go") {
    // For no_go → go: need to address BOTH risk AND context if applicable

    // Target 1: Risk mitigation (currently >70, need to drop to ≤40 for "go")
    if (risk > 70) {
      const targetRisk = 40
      const riskReduction = risk - targetRisk
      const topRisk = output.operational?.risks?.[0]
      steps.push({
        priority: "high",
        action: `Reduce risk from ${Math.round(risk)}% to ≤${targetRisk}% (−${Math.round(riskReduction)} points)`,
        why: `Currently blocked due to high risk. ${topRisk ? `Primary concern: ${topRisk}` : ""}`,
      })
    }

    // Target 2: Answer required clarifications if context is incomplete
    if (ctx.requiredCompleteness < 100 && ctx.missingRequired.length > 0) {
      steps.push({
        priority: "high",
        action: `Answer ${ctx.missingRequired.length} required clarification${ctx.missingRequired.length > 1 ? "s" : ""} to reach 100% completeness`,
        why: "These questions must be answered before verdict can improve",
      })
    }
  }

  else if (gate.verdict === "conditional") {
    // For conditional → go: reduce risk and fill context gaps

    // Target 1: Risk reduction if >40
    if (risk > 40) {
      const targetRisk = 40
      const riskReduction = risk - targetRisk
      steps.push({
        priority: "high",
        action: `Reduce risk from ${Math.round(risk)}% to ≤${targetRisk}% (−${Math.round(riskReduction)} points) to reach GO`,
        why: "Currently conditional due to moderate-to-high risk",
      })
    }

    // Target 2: Complete required clarifications
    if (ctx.requiredCompleteness < 100 && ctx.missingRequired.length > 0) {
      steps.push({
        priority: "high",
        action: `Answer ${ctx.missingRequired.length} required clarification${ctx.missingRequired.length > 1 ? "s" : ""} (${ctx.requiredCompleteness}% → 100%)`,
        why: "Will improve context completeness and verdict confidence",
      })
    }

    // Target 3: Overall context completeness
    if (ctx.completenessPercent < 100) {
      const gapPoints = 100 - ctx.completenessPercent
      steps.push({
        priority: "medium",
        action: `Close information gap (${ctx.completenessPercent}% → 100%, +${gapPoints} points)`,
        why: `Gather: ${output.operational?.missingInformation?.slice(0, 1).join(", ") || "remaining research items"}`,
      })
    }
  }

  // Remove duplicates and limit to top 3
  const unique = steps.filter(
    (step, idx, arr) =>
      arr.findIndex((s) => s.action.slice(0, 50) === step.action.slice(0, 50)) === idx,
  )

  const targetVerdict = "GO"
  const summary =
    gate.verdict === "no_go"
      ? `${unique.length} critical targets to reach ${targetVerdict}`
      : `${unique.length} target${unique.length > 1 ? "s" : ""} to reach ${targetVerdict}`

  return {
    steps: unique.slice(0, 3),
    summary,
  }
}

// ---------------------------------------------------------------------------
// Go / No-Go verdict computation (deterministic — no LLM required)
// ---------------------------------------------------------------------------

type GateWithRisk = DomainGateResult

const VERDICT_RANK: Record<DomainVerdict, number> = { no_go: 2, conditional: 1, go: 0 }

/**
 * Derives a Go/No-Go gate signal for a single synthetic agent from its output.
 *
 * Verdict logic considers both risk level and context completeness:
 *   effectiveRisk > 70 && requiredCompleteness < 50%  → no_go (fundamental blocker)
 *   effectiveRisk > 70 && requiredCompleteness >= 50% → conditional (answerable)
 *   effectiveRisk > 40 || !canContinue || completeness < 100% → conditional
 *   otherwise                                          → go
 *
 * Context completeness reflects what percentage of required questions have been answered.
 * If high risk but context is nearly complete, we can proceed conditionally.
 */
export function computeDomainGate(
  synthetic: SyntheticNode,
  output: SyntheticReport,
): GateWithRisk {
  const readiness = output.operational?.readiness
  const effectiveRisk = output.concernLevels?.risk ?? 0
  const canContinue = readiness?.blocked !== true && readiness?.canContinue !== false
  const contextMetrics = calculateContextCompleteness(output)

  const base = {
    syntheticId: synthetic.id,
    syntheticName: synthetic.name,
    syntheticCode: synthetic.code,
    effectiveRisk,
    contextCompleteness: contextMetrics,
  }

  // High risk with fundamental unknowns = definitive no-go
  if (effectiveRisk > 70 && contextMetrics.requiredCompleteness < 50) {
    const condition =
      readiness?.blockers?.[0]
      ?? output.keyRisks?.[0]
      ?? output.operational?.risks?.[0]
      ?? "High risk with insufficient context — cannot proceed safely"
    return { ...base, verdict: "no_go", condition }
  }

  // High risk but answerable questions = conditional
  if (effectiveRisk > 70 || effectiveRisk > 40 || !canContinue || contextMetrics.completenessPercent < 100) {
    const missingReqStr =
      contextMetrics.missingRequired.length > 0
        ? `${contextMetrics.missingRequired.length} required clarifications pending`
        : undefined

    const condition =
      missingReqStr
      ?? readiness?.blockers?.[0]
      ?? output.operational?.missingInformation?.[0]
      ?? output.operational?.clarificationRequests?.find((r) => r.required)?.question
      ?? output.operational?.nextSteps?.[0]
      ?? `${contextMetrics.completenessPercent}% context gathered — review before proceeding`
    return { ...base, verdict: "conditional", condition }
  }

  return { ...base, verdict: "go", condition: null }
}

/**
 * Derives a gate signal for an Advisor/Strategist node.
 * Advisor risk is inferred from the number of inter-agent conflicts it identified.
 * Capped at "conditional" for MVP — Advisor synthesises but does not hard-block.
 */
function computeAdvisorGate(
  synthetic: SyntheticNode,
  output: AdvisorReport,
): GateWithRisk {
  const conflictCount = output.conflictResolution.length
  const effectiveRisk = conflictCount === 0 ? 0 : conflictCount === 1 ? 45 : 60

  const base = {
    syntheticId: synthetic.id,
    syntheticName: synthetic.name,
    syntheticCode: synthetic.code,
    effectiveRisk,
  }

  if (effectiveRisk > 40) {
    return {
      ...base,
      verdict: "conditional",
      condition:
        output.topRecommendation.trim() ||
        `Advisor flagged ${conflictCount} inter-agent tensions — review before proceeding`,
    }
  }

  return { ...base, verdict: "go", condition: null }
}

/**
 * Rolls up per-domain gates to an overall verdict.
 * Gates must be pre-sorted by severity so find() returns the most critical one.
 */
function deriveOverallVerdict(gates: DomainGateResult[]): {
  verdict: DomainVerdict
  condition: string | null
} {
  const noGo = gates.find((g) => g.verdict === "no_go")
  if (noGo) return { verdict: "no_go", condition: noGo.condition }

  const conditional = gates.find((g) => g.verdict === "conditional")
  if (conditional) return { verdict: "conditional", condition: conditional.condition }

  return { verdict: "go", condition: null }
}

export function buildRunSummaryReport(
  input: BuildRunSummaryReportInput,
): RunSummaryReport {
  // Advisor/Strategist nodes produce AdvisorReport (kind: "advisor"), which has a
  // different shape from SyntheticReport. Exclude them from aggregation — their
  // topRecommendation / strategicOptions / conflictResolution are surfaced separately.
  const outputs = input.synthetics
    .map((synthetic) => input.outputsBySyntheticId[synthetic.id])
    .filter((output): output is SyntheticReport => Boolean(output) && !isAdvisorReport(output))
  const operationalFirst = hasAnyOperationalOutputs(outputs)

  const outputById = new Map(outputs.map((output) => [output.syntheticId, output]))
  const nodeById = new Map(input.synthetics.map((synthetic) => [synthetic.id, synthetic]))

  const executiveBrief = uniqueNonEmpty(
    outputs.flatMap((output) =>
      operationalFirst
        ? getOperationalBriefLines(output)
        : [output.summary],
    )
      .filter((summary) => !isGenericClarificationText(summary))
      .slice(0, 3),
  )

  const actionableFromBlockers = operationalFirst
    ? outputs.flatMap((output) => extractPendingClarifications(output))
    : []
  const recommendationActions = outputs.flatMap((output) =>
    operationalFirst
      ? extractOperationalActionItems(output)
      : splitRecommendationIntoActions(output.recommendation),
  )
  const decisionFamilies = buildDecisionFamilies(outputs)

  const actionItems = uniqueNonEmpty([
    ...buildActionItemsFromDecisionFamilies(decisionFamilies),
    ...recommendationActions,
    ...actionableFromBlockers,
  ])
    .filter((item) => !isGenericClarificationText(item))
    .slice(0, 5)
  const conflictMap = buildConflictMap({
    edges: input.edges,
    outputById,
    nodeById,
  })

  // Deterministic path has no per-sentence agent attribution — sourceIds left empty.
  // The aggregator LLM path (in parseAggregatorOutput) populates sourceIds.
  const toBriefSentences = (strings: string[]): BriefSentence[] =>
    strings.map((sentence) => ({ sentence, sourceIds: [] }))

  const fallbackBrief: BriefSentence[] =
    executiveBrief.length > 0
      ? toBriefSentences(executiveBrief)
      : toBriefSentences([
          input.ideaPrompt ||
            "No synthetic report is available yet for this run.",
        ])

  const fallbackActionItems =
    actionItems.length > 0
      ? actionItems
      : [
          "Run the synthetic chain to produce operational next steps.",
        ]

  const agentGates: GateWithRisk[] = input.synthetics
    .filter((synthetic) => {
      const output = input.outputsBySyntheticId[synthetic.id]
      return Boolean(output) && !isAdvisorReport(output!)
    })
    .map((synthetic) =>
      computeDomainGate(synthetic, input.outputsBySyntheticId[synthetic.id] as SyntheticReport),
    )

  const advisorGates: GateWithRisk[] = input.synthetics
    .filter((synthetic) => {
      const output = input.outputsBySyntheticId[synthetic.id]
      return Boolean(output) && isAdvisorReport(output!)
    })
    .map((synthetic) =>
      computeAdvisorGate(synthetic, input.outputsBySyntheticId[synthetic.id] as AdvisorReport),
    )

  // Sort all gates most-critical-first so deriveOverallVerdict picks the highest-severity blocker.
  const domainGates: DomainGateResult[] = [...agentGates, ...advisorGates]
    .sort((a, b) => {
      const verdictDiff = VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict]
      if (verdictDiff !== 0) return verdictDiff
      return b.effectiveRisk - a.effectiveRisk
    })

  const { verdict: overallVerdict, condition: overallCondition } =
    deriveOverallVerdict(domainGates)

  return {
    executiveBrief: fallbackBrief,
    actionItems: fallbackActionItems,
    biggestConflict: buildBiggestConflict({
      conflictMap,
      outputs,
    }),
    decisionFamilies,
    decisionMatrix: decisionFamilies.flatMap((family) => family.options),
    conflictMap,
    domainGates,
    overallVerdict,
    overallCondition,
  }
}
