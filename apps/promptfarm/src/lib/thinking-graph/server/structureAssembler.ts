/**
 * structureAssembler.ts
 *
 * Deterministic assembly of structural output fields from LLM-generated content.
 *
 * The LLM is responsible for CONTENT (findings, risks, clarificationRequests,
 * recommendedDecisions, handoffFacts, etc.).
 *
 * This module is responsible for STRUCTURE (userFacing state/options/questions/actions,
 * readiness, directedHandoffs, handoff, details, recommendation).
 *
 * This eliminates the entire class of STATE_PATCH_WEAK and HANDOFF_INCOMPLETE
 * validator violations because these fields are no longer LLM-generated.
 */

import type {
  AssemblerContext,
  SyntheticClarificationRequest,
  SyntheticDirectedHandoff,
  SyntheticLlmContent,
  SyntheticOperationalReport,
  SyntheticPendingDecision,
  SyntheticReadiness,
  SyntheticRecommendedDecision,
  SyntheticUserFacingAction,
  SyntheticUserFacingBlock,
  SyntheticUserFacingOption,
  SyntheticUserFacingQuestion,
} from "./types"

// ---------------------------------------------------------------------------
// Public output type
// ---------------------------------------------------------------------------

export type AssembledSyntheticOutput = {
  syntheticId: string
  syntheticName: string
  summary: string
  details: string
  recommendation: string
  changesFromPrevious: string[]
  appliedInputs: string[]
  ignoredInputs: string[]
  keyRisks: string[]
  concernLevels: SyntheticLlmContent["concernLevels"]
  handoff: string | null
  upstreamContext: string[]
  directedHandoffs: SyntheticDirectedHandoff[]
  operational: SyntheticOperationalReport
}

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

type DerivedState = "ready" | "decision_required" | "user_input_required" | "conflict"

function deriveState(content: SyntheticLlmContent): DerivedState {
  // decision_required: LLM proposed ≥2 named options
  const primaryDecision = content.recommendedDecisions[0]
  if (primaryDecision && primaryDecision.options.length >= 2) {
    return "decision_required"
  }

  // user_input_required: any required clarification OR missing information
  const hasRequiredClarification = content.clarificationRequests.some(
    (q) => q.required,
  )
  if (hasRequiredClarification || content.missingInformation.length > 0) {
    return "user_input_required"
  }

  return "ready"
}

// ---------------------------------------------------------------------------
// userFacing block builders
// ---------------------------------------------------------------------------

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
}

function toPendingDecision(d: SyntheticRecommendedDecision): SyntheticPendingDecision {
  return {
    id: d.id,
    title: d.title,
    options: d.options,
    recommendedOption: d.recommendedOption,
    reason: d.reason,
    ...(d.optionReasons ? { optionReasons: d.optionReasons } : {}),
    ...(d.urgency ? { urgency: d.urgency } : {}),
  }
}

function buildDecisionRequiredUserFacing(
  content: SyntheticLlmContent,
  decision: SyntheticRecommendedDecision,
  relatedEdges?: AssemblerContext["relatedEdges"],
): SyntheticUserFacingBlock {
  const options: SyntheticUserFacingOption[] = decision.options.map((label) => {
    const isRecommended = label === decision.recommendedOption;
    // Per-option reason takes priority. For the recommended option fall back to
    // the global reason. For non-recommended options with no per-option note,
    // use no extra copy — do NOT paste the recommended reason onto other options.
    const optionReason =
      decision.optionReasons?.[label] ??
      (isRecommended ? decision.reason : null);
    return {
      id: slugify(label) || label.slice(0, 20),
      label,
      summary: optionReason ? `${label} — ${optionReason}` : label,
      pros: isRecommended && decision.reason ? [decision.reason] : [],
      cons: [],
      recommended: isRecommended,
    };
  })

  const optionActions: SyntheticUserFacingAction[] = options.map((opt) => ({
    type: "choose_option" as const,
    label: opt.label,
    optionId: opt.id,
  }))

  // Surface required clarifications alongside the decision so they are never
  // silently dropped when deriveState resolves to "decision_required".
  // Sort by priority (1 = highest; omitted defaults to 2) so the most urgent
  // question appears first in the combined view.
  const questions: SyntheticUserFacingQuestion[] = [...content.clarificationRequests]
    .filter((q) => q.required)
    .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2))
    .map((q: SyntheticClarificationRequest) => ({
      id: q.id,
      label: q.question.slice(0, 60),
      question: q.question,
      whyItMatters: q.whyItMatters,
      suggestedAnswer: null,
      required: q.required,
    }))

  const actions: SyntheticUserFacingAction[] = [
    ...optionActions,
    ...(questions.length > 0
      ? [{ type: "answer_questions" as const, label: "Answer open questions" }]
      : []),
  ]

  const whatWeKnow = content.acceptedAssumptions.slice(0, 2).map((assumption) => ({
    label: "Known",
    value: assumption,
  }))

  // Separate "things to choose" from "things to know" so consumers can render
  // them under distinct headings. whatIsNeededNow stays as the flat union for
  // backward compat.
  const decisionsNeeded = [
    decision.title,
    ...content.recommendedDecisions.slice(1).map((d) => d.title),
  ]
  const questionsNeeded = content.missingInformation.slice()
  const whatIsNeededNow = [...decisionsNeeded, ...questionsNeeded]

  // Queue secondary decisions for sequential resolution after the primary one.
  const pendingDecisions: SyntheticPendingDecision[] =
    content.recommendedDecisions.slice(1).map(toPendingDecision)

  return {
    state: "decision_required",
    title: decision.title,
    summary: decision.reason,
    whatWeKnow,
    whatIsNeededNow,
    decisionsNeeded,
    ...(questionsNeeded.length > 0 ? { questionsNeeded } : {}),
    whoActsNext: "user",
    nextStep: `Choose: ${decision.title}`,
    options,
    questions,
    actions,
    ...(pendingDecisions.length > 0 ? { pendingDecisions } : {}),
    // Attach the first related edge so the UI can show which graph relationship
    // triggered this decision (e.g. a tension between Designer and Engineer).
    ...(relatedEdges?.[0]
      ? {
          relatedEdgeId: relatedEdges[0].edgeId,
          relatedNodeId: relatedEdges[0].counterpartId,
          relatedNodeName: relatedEdges[0].counterpartName,
        }
      : {}),
  }
}

function buildUserInputRequiredUserFacing(
  content: SyntheticLlmContent,
): SyntheticUserFacingBlock {
  // Sort all clarifications by priority (1 = highest; omitted defaults to 2)
  // before partitioning into required vs. optional.
  const sorted = [...content.clarificationRequests].sort(
    (a, b) => (a.priority ?? 2) - (b.priority ?? 2),
  )
  const requiredClarifications = sorted.filter((q) => q.required)
  const clarificationsToShow =
    requiredClarifications.length > 0
      ? requiredClarifications
      : sorted.slice(0, 3)

  const questions: SyntheticUserFacingQuestion[] = clarificationsToShow.map(
    (q: SyntheticClarificationRequest) => ({
      id: q.id,
      label: q.question.slice(0, 60),
      question: q.question,
      whyItMatters: q.whyItMatters,
      suggestedAnswer: null,
      required: q.required,
    }),
  )

  const title =
    content.missingInformation[0] ??
    clarificationsToShow[0]?.question ??
    "Additional input needed"

  const summary =
    content.missingInformation.length > 0
      ? `Missing: ${content.missingInformation.slice(0, 2).join("; ")}`
      : clarificationsToShow[0]?.whyItMatters ?? "Please provide more details."

  const whatWeKnow = content.acceptedAssumptions.slice(0, 2).map((assumption) => ({
    label: "Known",
    value: assumption,
  }))

  const whatIsNeededNow = [
    ...content.missingInformation.slice(0, 2),
    ...clarificationsToShow.slice(0, 1).map((q) => q.question),
  ].filter(Boolean).slice(0, 3)

  return {
    state: "user_input_required",
    title,
    summary,
    whatWeKnow,
    whatIsNeededNow,
    whoActsNext: "user",
    nextStep: clarificationsToShow[0]?.question ?? content.missingInformation[0] ?? "Provide missing details",
    options: [],
    questions,
    actions: [{ type: "answer_questions", label: "Provide details" }],
    // Surface any pending decisions so they are not silently dropped when
    // clarifications take state priority over decision_required.
    ...(content.recommendedDecisions.length > 0
      ? { pendingDecisions: content.recommendedDecisions.map(toPendingDecision) }
      : {}),
  }
}

function buildReadyUserFacing(content: SyntheticLlmContent): SyntheticUserFacingBlock {
  const nextStep = content.nextSteps[0] ?? null

  const whatWeKnow = content.acceptedAssumptions.slice(0, 3).map((assumption) => ({
    label: "Confirmed",
    value: assumption,
  }))

  return {
    state: "ready",
    title: "Ready to proceed",
    summary: content.summary,
    whatWeKnow,
    whatIsNeededNow: [],
    whoActsNext: "system",
    nextStep,
    options: [],
    questions: [],
    actions: nextStep
      ? [{ type: "continue", label: "Continue" }]
      : [{ type: "accept_defaults", label: "Accept and continue" }],
  }
}

function buildUserFacing(
  content: SyntheticLlmContent,
  state: DerivedState,
  relatedEdges?: AssemblerContext["relatedEdges"],
): SyntheticUserFacingBlock {
  if (state === "decision_required") {
    const decision = content.recommendedDecisions[0]
    if (decision) {
      return buildDecisionRequiredUserFacing(content, decision, relatedEdges)
    }
  }

  if (state === "user_input_required") {
    return buildUserInputRequiredUserFacing(content)
  }

  // "ready" or "conflict" fallback
  return buildReadyUserFacing(content)
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

// Jaccard token overlap — returns 0..1. Used to detect when a missingInformation
// item and a clarificationRequest describe the same concept with different wording.
function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  if (tokA.size === 0 && tokB.size === 0) return 1
  let intersect = 0
  for (const t of tokA) if (tokB.has(t)) intersect++
  return intersect / (tokA.size + tokB.size - intersect)
}

function buildReadiness(content: SyntheticLlmContent): SyntheticReadiness {
  const requiredClarifications = content.clarificationRequests.filter((q) => q.required)

  // Required clarification questions come first — they are the most specific form.
  const requiredBlockers = requiredClarifications.map((q) => q.question)

  // Only include a missing-info item if no required clarification already covers
  // the same concept (>60% Jaccard token overlap). Prefer the clarification form.
  const dedupedMissing = content.missingInformation.filter(
    (item) => !requiredClarifications.some((q) => tokenOverlap(item, q.question) > 0.6),
  )

  const allBlockers = [...requiredBlockers, ...dedupedMissing].slice(0, 4)
  const isBlocked = allBlockers.length > 0

  return {
    canContinue: !isBlocked,
    blocked: isBlocked,
    blockers: allBlockers,
    status: isBlocked ? "needs_clarification" : "ready_for_next_node",
  }
}

// ---------------------------------------------------------------------------
// Directed handoffs
// ---------------------------------------------------------------------------

function buildDirectedHandoffs(
  content: SyntheticLlmContent,
  context: AssemblerContext,
): SyntheticDirectedHandoff[] {
  if (context.downstreamRecipients.length === 0) {
    return []
  }

  const requiredQuestions = content.clarificationRequests
    .filter((q) => q.required)
    .map((q) => q.question)

  const openDecisions = content.recommendedDecisions.map((d) => d.title)

  const facts = [
    ...content.handoffFacts,
    ...content.findings.slice(0, 2),
  ].filter(Boolean).slice(0, 4)

  const constraints = content.risks.slice(0, 2)

  const nextFocus =
    content.nextSteps.length > 0
      ? [content.nextSteps[0]]
      : content.missingInformation.length > 0
        ? [`Resolve: ${content.missingInformation[0]}`]
        : []

  return context.downstreamRecipients.map((recipient) => ({
    toSyntheticId: recipient.id,
    facts,
    constraints,
    openDecisions,
    blockedByUser: requiredQuestions,
    nextFocus,
  }))
}

// ---------------------------------------------------------------------------
// details + recommendation
// ---------------------------------------------------------------------------

function buildDetails(content: SyntheticLlmContent): string {
  if (content.findings.length > 0) {
    return content.findings.slice(0, 2).join(" ")
  }
  return content.summary
}

function buildRecommendation(content: SyntheticLlmContent): string {
  const primaryDecision = content.recommendedDecisions[0]
  if (primaryDecision) {
    const recommended = primaryDecision.recommendedOption
    if (recommended) {
      return `${primaryDecision.title}: ${recommended} — ${primaryDecision.reason}`
    }
    return `${primaryDecision.title}: ${primaryDecision.reason}`
  }

  if (content.nextSteps.length > 0) {
    return content.nextSteps[0]
  }

  return content.summary
}

function buildHandoff(
  content: SyntheticLlmContent,
  context: AssemblerContext,
): string | null {
  if (context.downstreamRecipients.length === 0) {
    return null
  }

  if (content.handoffFacts.length > 0) {
    return content.handoffFacts[0]
  }

  if (content.findings.length > 0) {
    return content.findings[0]
  }

  return null
}

// ---------------------------------------------------------------------------
// Main assembler
// ---------------------------------------------------------------------------

export function assembleOutput(
  content: SyntheticLlmContent,
  context: AssemblerContext,
): AssembledSyntheticOutput {
  const state = deriveState(content)
  const userFacing = buildUserFacing(content, state, context.relatedEdges)
  const readiness = buildReadiness(content)
  const directedHandoffs = buildDirectedHandoffs(content, context)
  const handoff = buildHandoff(content, context)
  const details = buildDetails(content)
  const recommendation = buildRecommendation(content)

  const operational: SyntheticOperationalReport = {
    syntheticId: content.syntheticId,
    syntheticName: content.syntheticName,
    domain: content.domain,
    summary: content.summary,
    acceptedAssumptions: content.acceptedAssumptions,
    findings: content.findings,
    risks: content.risks,
    missingInformation: content.missingInformation,
    clarificationRequests: content.clarificationRequests,
    recommendedDecisions: content.recommendedDecisions,
    nextSteps: content.nextSteps,
    readiness,
    artifactsReady: content.artifactsReady,
    handoff,
    directedHandoffs,
    userFacing,
  }

  return {
    syntheticId: content.syntheticId,
    syntheticName: content.syntheticName,
    summary: content.summary,
    details,
    recommendation,
    changesFromPrevious: content.changesFromPrevious,
    appliedInputs: content.appliedInputs,
    ignoredInputs: content.ignoredInputs,
    keyRisks: content.keyRisks,
    concernLevels: content.concernLevels,
    handoff,
    upstreamContext: context.upstreamContext,
    directedHandoffs,
    operational,
  }
}
