import type { ValidationReport } from "./nodeContracts"

export type OperationalEnforcementMode = "allow" | "warn" | "retry" | "require"

export type SyntheticLikeOutput = {
  summary: string
  details: string
  recommendation: string
  handoff: string | null
  keyRisks: string[]
  handoffFacts?: string[]
  appliedInputs: string[]
  ignoredInputs: string[]
  operationalSchemaInvalid?: boolean
  operational?: {
    missingInformation?: string[]
    clarificationRequests?: Array<{
      id: string
      question: string
      whyItMatters: string
      required: boolean
      priority?: 1 | 2 | 3
    }>
    recommendedDecisions?: Array<{
      id: string
      title: string
      options: string[]
      recommendedOption: string | null
      reason: string
      optionReasons?: Record<string, string>
      /** LLM-facing alias for optionReasons — merged in during parsing */
      optionNotes?: Record<string, string>
    }>
    nextSteps?: string[]
    userFacing?: {
      state?: "ready" | "decision_required" | "user_input_required" | "conflict"
      title?: string
      summary?: string
      whatWeKnow?: Array<{
        label: string
        value: string
      }>
      whatIsNeededNow?: string[]
      whoActsNext?: "system" | "user"
      nextStep?: string | null
      options?: Array<{
        id: string
        label: string
        summary: string
        pros: string[]
        cons: string[]
        recommended: boolean
      }>
      questions?: Array<{
        id: string
        label: string
        question: string
        whyItMatters: string
        suggestedAnswer: string | null
        required: boolean
      }>
      actions?: Array<
        | {
            type: "continue" | "accept_defaults" | "answer_questions"
            label: string
          }
        | {
            type: "choose_option" | "resolve_conflict"
            label: string
            optionId: string
          }
      >
    } | null
    readiness?: {
      canContinue: boolean
      blocked: boolean
      blockers: string[]
      status:
        | "ready_for_next_node"
        | "needs_clarification"
        | "blocked"
        | "partial_progress"
    } | null
    artifactsReady?: string[]
    directedHandoffs?: Array<{
      toSyntheticId: string
      facts: string[]
      constraints: string[]
      openDecisions: string[]
      blockedByUser: string[]
      nextFocus: string[]
    }>
  } | null
}

function hasMeaningfulText(value: string): boolean {
  return value.trim().length >= 20
}

function hasForbiddenRoleDrift(text: string): boolean {
  const normalized = text.toLowerCase()
  return (
    normalized.includes("as a different role") ||
    normalized.includes("switching role")
  )
}

function hasOperationalActionPath(output: SyntheticLikeOutput): boolean {
  return Boolean(output.operational?.nextSteps?.some((step) => step.trim().length > 0))
}

function hasOperationalClarificationPath(output: SyntheticLikeOutput): boolean {
  return Boolean(
    output.operational?.clarificationRequests?.some(
      (item) =>
        item.question.trim().length > 0 && item.whyItMatters.trim().length > 0,
    ),
  )
}

function hasOperationalReadiness(output: SyntheticLikeOutput): boolean {
  const readiness = output.operational?.readiness
  if (!readiness) {
    return false
  }

  return (
    typeof readiness.canContinue === "boolean" &&
    typeof readiness.blocked === "boolean" &&
    Array.isArray(readiness.blockers) &&
    ["ready_for_next_node", "needs_clarification", "blocked", "partial_progress"].includes(
      readiness.status,
    )
  )
}

function hasOperationalPayload(output: SyntheticLikeOutput): boolean {
  return Boolean(output.operational)
}

function hasValidDirectedHandoffs(output: SyntheticLikeOutput): boolean {
  const handoffs = output.operational?.directedHandoffs
  if (!handoffs) {
    return true
  }

  return handoffs.every(
    (handoff) =>
      handoff.toSyntheticId.trim().length > 0 &&
      Array.isArray(handoff.facts) &&
      Array.isArray(handoff.constraints) &&
      Array.isArray(handoff.openDecisions) &&
      Array.isArray(handoff.blockedByUser) &&
      Array.isArray(handoff.nextFocus),
  )
}

function hasRequiredDirectedHandoffs(input: {
  output: SyntheticLikeOutput
  hasDownstream: boolean
}): boolean {
  if (!input.hasDownstream || !input.output.operational) {
    return true
  }

  const handoffs = input.output.operational.directedHandoffs
  return Array.isArray(handoffs) && handoffs.length > 0
}

function hasUsefulDirectedHandoffs(output: SyntheticLikeOutput): boolean {
  const handoffs = output.operational?.directedHandoffs
  if (!handoffs || handoffs.length === 0) {
    return true
  }

  return handoffs.every((handoff) => {
    const combined = [
      ...handoff.facts,
      ...handoff.constraints,
      ...handoff.openDecisions,
      ...handoff.blockedByUser,
      ...handoff.nextFocus,
    ]
    const distinct = [...new Set(combined.map((item) => normalizeForQualityCheck(item)).filter(Boolean))]
    return distinct.length > 0 && !distinct.every((item) => item === normalizeForQualityCheck(output.summary))
  })
}

function hasUserFacingPayload(output: SyntheticLikeOutput): boolean {
  return Boolean(output.operational?.userFacing)
}

function isMetaActionLabel(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("ask responsible agent") ||
    normalized.includes("add conflict directive") ||
    normalized.includes("generate decision choices") ||
    normalized.includes("rerun this step")
  )
}

function hasValidUserFacingStructure(output: SyntheticLikeOutput): boolean {
  const block = output.operational?.userFacing
  if (!block) {
    return false
  }

  return (
    ["ready", "decision_required", "user_input_required", "conflict"].includes(
      block.state ?? "",
    ) &&
    typeof block.title === "string" &&
    typeof block.summary === "string" &&
    Array.isArray(block.whatWeKnow) &&
    block.whatWeKnow.every(
      (item) =>
        item.label.trim().length > 0 && item.value.trim().length > 0,
    ) &&
    Array.isArray(block.whatIsNeededNow) &&
    block.whatIsNeededNow.every((item) => item.trim().length > 0) &&
    (block.whoActsNext === "system" || block.whoActsNext === "user") &&
    (block.nextStep === null || typeof block.nextStep === "string") &&
    Array.isArray(block.options) &&
    Array.isArray(block.questions) &&
    Array.isArray(block.actions)
  )
}

function hasValidUserFacingActions(output: SyntheticLikeOutput): boolean {
  const actions = output.operational?.userFacing?.actions
  // Empty actions are allowed — the UI can derive actions from options/questions.
  if (!actions || actions.length === 0) {
    return true
  }

  return actions.every((action) => {
    if (!action.label || isMetaActionLabel(action.label)) {
      return false
    }
    // optionId is a frontend routing concern — do not require it from the LLM.
    return true
  })
}

function hasValidUserFacingStateSemantics(output: SyntheticLikeOutput): boolean {
  const block = output.operational?.userFacing
  if (!block) {
    return false
  }

  if (block.state === "ready") {
    return block.whoActsNext === "system" && (block.nextStep?.trim().length ?? 0) > 0
  }

  if (block.state === "decision_required") {
    // Note: option count > 4 is checked separately as MEDIUM (hasTooManyUserFacingOptions).
    return (
      block.whoActsNext === "user" &&
      (block.options?.length ?? 0) >= 2
    )
  }

  if (block.state === "user_input_required") {
    return (
      block.whoActsNext === "user" &&
      (block.questions?.some(
        (item) =>
          item.required &&
          item.question.trim().length > 0 &&
          item.whyItMatters.trim().length > 0,
      ) ??
        false)
    )
  }

  if (block.state === "conflict") {
    return (
      block.whoActsNext === "user" &&
      (block.options?.length ?? 0) >= 2 &&
      (block.options?.some(
        (item) => item.pros.length > 0 || item.cons.length > 0,
      ) ??
        false)
    )
  }

  return false
}

function normalizeForQualityCheck(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isGenericQuestionText(value: string): boolean {
  const normalized = normalizeForQualityCheck(value)
  // Only flag questions that are purely template-like with no project-specific content.
  // Avoid flagging "what specific X will be used?" or "which X will be used?" — these can be
  // legitimately project-specific depending on context.
  return (
    normalized.startsWith("какой ") ||
    normalized.startsWith("как будет ") ||
    normalized.startsWith("как будут ") ||
    normalized.includes("будет использоваться") ||
    normalized.includes("будет создан") ||
    normalized.includes("будут разрабатываться")
  )
}

const GENERIC_HANDOFF_PATTERNS = [
  /budget constraints (exist|may|apply|should)/i,
  /technical challenges? (exist|may|could|might|apply)/i,
  /various (factors|challenges|considerations|risks)/i,
  /important considerations?/i,
  /may face challenges?/i,
  /some risks? (exist|apply|may)/i,
  /should be considered/i,
  /needs? (further|more) (analysis|review|consideration)/i,
  /requires? attention/i,
  /potential (issues?|problems?|concerns?) exist/i,
  /there (are|may be) (some|various|several) /i,
]

function isGenericHandoffFact(value: string): boolean {
  const v = value.trim()
  if (v.length < 15) return true
  const normalized = normalizeForQualityCheck(v)
  return GENERIC_HANDOFF_PATTERNS.some((p) => p.test(normalized))
}

function hasGenericHandoffFacts(output: SyntheticLikeOutput): boolean {
  return (output.handoffFacts ?? []).some(isGenericHandoffFact)
}

function isWeakSuggestedAnswer(value: string | null | undefined): boolean {
  if (!value) {
    return false
  }

  const normalized = normalizeForQualityCheck(value)
  return (
    normalized.length < 12 ||
    normalized.includes("bright colors") ||
    normalized.includes("яркие цвета") ||
    normalized.includes("geometric shapes") ||
    normalized.includes("геометрические формы") ||
    normalized.includes("realistic textures") ||
    normalized.includes("реалистичные текстуры")
  )
}

function isGenericUserFacingSummary(value: string): boolean {
  const normalized = normalizeForQualityCheck(value)
  return (
    normalized.length < 24 ||
    normalized.includes("important decisions are required") ||
    normalized.includes("важные решения") ||
    normalized.includes("to satisfy players") ||
    normalized.includes("удовлетворить игроков") ||
    normalized.includes("for this platformer") ||
    normalized.includes("для платформера")
  )
}

function hasWeakUserFacingNeeds(output: SyntheticLikeOutput): boolean {
  const neededNow = output.operational?.userFacing?.whatIsNeededNow ?? []
  return neededNow.some((item) => {
    const normalized = normalizeForQualityCheck(item)
    return (
      normalized.length < 10 ||
      normalized === "choose gameplay direction" ||
      normalized === "choose visual style" ||
      normalized === "choose technology stack" ||
      normalized === "определить конкретные механики" ||
      normalized === "определить стиль" ||
      normalized === "определить визуальный стиль"
    )
  })
}

function hasDuplicateUserFacingQuestions(output: SyntheticLikeOutput): boolean {
  const questions = output.operational?.userFacing?.questions ?? []
  const seen = new Set<string>()

  for (const question of questions) {
    const normalized = normalizeForQualityCheck(question.question)
    if (!normalized) {
      continue
    }
    if (seen.has(normalized)) {
      return true
    }
    seen.add(normalized)
  }

  return false
}

function hasDuplicateUserFacingOptions(output: SyntheticLikeOutput): boolean {
  const options = output.operational?.userFacing?.options ?? []
  const seen = new Set<string>()

  for (const option of options) {
    const normalized = normalizeForQualityCheck(option.label)
    if (!normalized) {
      continue
    }
    if (seen.has(normalized)) {
      return true
    }
    seen.add(normalized)
  }

  return false
}

function hasWeakUserFacingQuestions(output: SyntheticLikeOutput): boolean {
  const questions = output.operational?.userFacing?.questions ?? []
  return questions.some(
    (question) =>
      isGenericQuestionText(question.question) ||
      question.whyItMatters.trim().length < 20 ||
      isWeakSuggestedAnswer(question.suggestedAnswer),
  )
}

function isTaskDescriptionOptionLabel(label: string): boolean {
  const normalized = normalizeForQualityCheck(label)
  return (
    normalized.startsWith("choose ") ||
    normalized.startsWith("select ") ||
    normalized.startsWith("выберите ") ||
    normalized.startsWith("выбрать ") ||
    normalized.startsWith("decide ") ||
    normalized.includes(" for the project") ||
    normalized.includes(" for this project") ||
    normalized.includes(" for project")
  )
}

function hasWeakUserFacingOptions(output: SyntheticLikeOutput): boolean {
  const options = output.operational?.userFacing?.options ?? []
  return options.some(
    (option) =>
      // Minimum of 2 chars — short proper names like "PC", "iOS", "Godot", "Mac" are valid.
      normalizeForQualityCheck(option.label).length < 2 ||
      isTaskDescriptionOptionLabel(option.label) ||
      option.summary.trim().length < 2 ||
      // Only require at least one pro/con on the recommended option.
      // Non-recommended options may intentionally have no pros/cons when
      // no per-option reason was provided by the agent.
      (option.recommended && option.pros.length === 0 && option.cons.length === 0),
  )
}

function hasTooManyUserFacingOptions(output: SyntheticLikeOutput): boolean {
  const block = output.operational?.userFacing
  if (!block || block.state !== "decision_required") {
    return false
  }
  return (block.options?.length ?? 0) > 4
}

function hasWeakUserFacingSummary(output: SyntheticLikeOutput): boolean {
  return isGenericUserFacingSummary(output.operational?.userFacing?.summary ?? "")
}

function buildFailReport(input: {
  producerNodeId: string
  attempt: number
  violations: ValidationReport["violations"]
  requiredFixes: string[]
}): ValidationReport {
  return {
    status: "fail",
    checks: {
      schemaCompliance: "pass",
      scopeDiscipline: input.violations.some(
        (v) => v.code === "OUT_OF_SCOPE_ACTION" || v.code === "SCOPE_DISCIPLINE",
      )
        ? "fail"
        : "pass",
      sourceOfTruthSafety: input.violations.some((v) => v.code === "SOURCE_OF_TRUTH_OVERRIDE")
        ? "fail"
        : "pass",
      handoffReadiness: input.violations.some((v) => v.code === "HANDOFF_INCOMPLETE")
        ? "fail"
        : "pass",
      statePatchQuality: input.violations.some((v) => v.code === "STATE_PATCH_WEAK")
        ? "fail"
        : "pass",
    },
    violations: input.violations,
    revisionRequest: {
      requiredFixes: input.requiredFixes,
      forbiddenFixes: [
        "Do not redefine project goals.",
        "Do not invent new constraints not present in inputs.",
      ],
      preserve: [
        "Keep role perspective stable.",
        "Keep previously accepted decisions unless explicitly superseded.",
      ],
    },
    meta: {
      validatorNodeId: "shadow_validator_v1",
      producerNodeId: input.producerNodeId,
      attempt: input.attempt,
    },
  }
}

function buildWarnReport(input: {
  producerNodeId: string
  attempt: number
  violations: ValidationReport["violations"]
  requiredFixes: string[]
}): ValidationReport {
  return {
    status: "warn",
    checks: {
      schemaCompliance: input.violations.some((v) => v.code === "SCHEMA_INVALID")
        ? "fail"
        : "pass",
      scopeDiscipline: input.violations.some(
        (v) => v.code === "OUT_OF_SCOPE_ACTION" || v.code === "SCOPE_DISCIPLINE",
      )
        ? "fail"
        : "pass",
      sourceOfTruthSafety: input.violations.some((v) => v.code === "SOURCE_OF_TRUTH_OVERRIDE")
        ? "fail"
        : "pass",
      handoffReadiness: input.violations.some((v) => v.code === "HANDOFF_INCOMPLETE")
        ? "fail"
        : "pass",
      statePatchQuality: input.violations.some((v) => v.code === "STATE_PATCH_WEAK")
        ? "fail"
        : "pass",
    },
    violations: input.violations,
    revisionRequest: {
      requiredFixes: input.requiredFixes,
      forbiddenFixes: [
        "Do not redefine project goals.",
        "Do not invent new constraints not present in inputs.",
      ],
      preserve: [
        "Keep role perspective stable.",
        "Keep previously accepted decisions unless explicitly superseded.",
      ],
    },
    meta: {
      validatorNodeId: "shadow_validator_v1",
      producerNodeId: input.producerNodeId,
      attempt: input.attempt,
    },
  }
}

/**
 * Returns true if any `keyRisks` item appears to be a copy of a
 * `clarificationRequests[].question` or a `missingInformation` item rather
 * than a genuine design/business risk.
 *
 * Detection uses two signals:
 * 1. **Token overlap** — shared word tokens between the risk text and any
 *    question/missing-info item exceed a 70 % Jaccard threshold.
 * 2. **Question markers** — the risk item itself starts with a question word
 *    or ends with "?" (a strong signal it was copy-pasted verbatim from a
 *    clarification question).
 */
function hasRisksContainingQuestions(output: SyntheticLikeOutput): boolean {
  const risks = output.keyRisks
  if (risks.length === 0) return false

  const clarificationQuestions: string[] = (
    output.operational?.clarificationRequests ?? []
  ).map((q) => q.question)

  const missingInfoItems: string[] = output.operational?.missingInformation ?? []

  const questionTexts = [...clarificationQuestions, ...missingInfoItems]

  // Tokenise to lowercase words, stripping punctuation
  function tokenise(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2), // ignore stop-word noise like "a", "is"
    )
  }

  const QUESTION_STARTERS = /^(should|will|would|can|could|do|does|is|are|what|which|how|when|where|why)\b/i

  for (const risk of risks) {
    const riskNorm = risk.trim()

    // Signal 1: direct question markers
    if (riskNorm.endsWith("?") || QUESTION_STARTERS.test(riskNorm)) {
      return true
    }

    // Signal 2: high token overlap with any clarification question or missing-info item
    if (questionTexts.length > 0) {
      const riskTokens = tokenise(riskNorm)
      if (riskTokens.size === 0) continue

      for (const qText of questionTexts) {
        const qTokens = tokenise(qText)
        if (qTokens.size === 0) continue

        // Jaccard similarity: |intersection| / |union|
        const intersection = new Set([...riskTokens].filter((t) => qTokens.has(t)))
        const union = new Set([...riskTokens, ...qTokens])
        const jaccard = intersection.size / union.size

        if (jaccard >= 0.7) {
          return true
        }
      }
    }
  }

  return false
}


export function validateSyntheticOutput(input: {
  producerNodeId: string
  attempt: number
  output: SyntheticLikeOutput
  upstreamContextCount: number
  hasDownstream: boolean
  operationalEnforcement?: OperationalEnforcementMode
}): ValidationReport {
  const violations: ValidationReport["violations"] = []
  const requiredFixes: string[] = []
  const operationalEnforcement = input.operationalEnforcement ?? "warn"

  if (
    !hasMeaningfulText(input.output.summary) ||
    !hasMeaningfulText(input.output.recommendation)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message:
        "Summary or recommendation is too weak to move pipeline state forward.",
      severity: "high",
    })
    requiredFixes.push(
      "Provide concrete summary and recommendation with actionable specificity.",
    )
  }

  if (input.output.operationalSchemaInvalid) {
    violations.push({
      code: "SCHEMA_INVALID",
      message: "Operational payload was present but could not be parsed into the required contract.",
      severity: "high",
    })
    requiredFixes.push(
      "Return a valid operational payload with summary, readiness, and either nextSteps or clarificationRequests.",
    )
  }

  if (hasOperationalPayload(input.output) && !hasOperationalReadiness(input.output)) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "Operational readiness is missing or malformed.",
      severity: "high",
    })
    requiredFixes.push(
      "Add readiness with canContinue, blocked, blockers, and status.",
    )
  }

  if (
    hasOperationalPayload(input.output) &&
    !hasUserFacingPayload(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "Operational payload is missing user-facing contract data.",
      severity: "high",
    })
    requiredFixes.push(
      "Add operational.userFacing with explicit state, next actor, and actionable UI choices.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    !hasValidUserFacingStructure(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing block is malformed or incomplete.",
      severity: "high",
    })
    requiredFixes.push(
      "Return a complete userFacing block with state, summary, facts, needs, and actions.",
    )
  }

  if (
    hasOperationalPayload(input.output) &&
    operationalEnforcement !== "warn" &&
    !hasRequiredDirectedHandoffs(input)
  ) {
    violations.push({
      code: "HANDOFF_INCOMPLETE",
      message: "Directed handoffs are missing despite downstream recipients.",
      severity: "high",
    })
    requiredFixes.push(
      "Return at least one directedHandoff for each meaningful downstream recipient instead of relying on fallback context.",
    )
  }

  if (
    input.hasDownstream &&
    hasOperationalPayload(input.output) &&
    !hasValidDirectedHandoffs(input.output)
  ) {
    violations.push({
      code: "HANDOFF_INCOMPLETE",
      message: "Directed handoffs are malformed or missing required arrays.",
      severity: "medium",
    })
    requiredFixes.push(
      "Return directedHandoffs with toSyntheticId plus facts, constraints, openDecisions, blockedByUser, and nextFocus arrays.",
    )
  }

  if (
    input.hasDownstream &&
    hasOperationalPayload(input.output) &&
    !hasUsefulDirectedHandoffs(input.output)
  ) {
    violations.push({
      code: "HANDOFF_INCOMPLETE",
      message: "Directed handoffs are too generic to help the downstream recipient.",
      severity: "medium",
    })
    requiredFixes.push(
      "Rewrite directedHandoffs so each recipient gets concrete role-specific facts, constraints, decisions, blockers, or next focus instead of repeating the summary.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    !hasValidUserFacingActions(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing actions are missing, vague, or meta-only.",
      severity: "high",
    })
    requiredFixes.push(
      "Replace meta-actions with direct user actions that change the next visible state.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    !hasValidUserFacingStateSemantics(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing state does not match its required actionable structure.",
      severity: "high",
    })
    requiredFixes.push(
      "Make userFacing consistent: ready needs nextStep, decision_required needs 2-4 options, user_input_required needs required questions, conflict needs real trade-offs.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    hasDuplicateUserFacingQuestions(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing questions contain duplicate meaning.",
      severity: "medium",
    })
    requiredFixes.push(
      "Deduplicate userFacing questions so each required input is asked once.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    hasTooManyUserFacingOptions(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "decision_required has more than 4 options — reduce to 2-4 concrete named choices.",
      severity: "medium",
    })
    requiredFixes.push(
      "Reduce userFacing options to 2-4. If you have multiple decision axes (e.g. mechanic family AND platform), pick the most important one for this node.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    hasDuplicateUserFacingOptions(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing options contain duplicate choices.",
      severity: "medium",
    })
    requiredFixes.push(
      "Deduplicate userFacing options so each choice is meaningfully distinct.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    hasWeakUserFacingQuestions(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing questions are too generic or their defaults are too weak.",
      severity: "medium",
    })
    requiredFixes.push(
      "Rewrite userFacing questions with project-specific wording, concrete whyItMatters, and stronger suggested answers.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    hasWeakUserFacingOptions(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing options are too generic to support a real decision.",
      severity: "medium",
    })
    requiredFixes.push(
      "Rewrite userFacing options so each choice has a concrete label, specific summary, and real trade-offs.",
    )
  }

  if (
    hasUserFacingPayload(input.output) &&
    (hasWeakUserFacingSummary(input.output) ||
      hasWeakUserFacingNeeds(input.output))
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "User-facing summary or required-now items are still generic.",
      severity: "medium",
    })
    requiredFixes.push(
      "Rewrite userFacing.summary and whatIsNeededNow with project-specific unresolved inputs or decisions instead of generic placeholders.",
    )
  }

  if (
    hasOperationalPayload(input.output) &&
    hasOperationalReadiness(input.output) &&
    !hasOperationalActionPath(input.output) &&
    !hasOperationalClarificationPath(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message:
        "Output does not provide either next steps or clarification requests.",
      severity: "high",
    })
    requiredFixes.push(
      "Provide at least one concrete next step or one clarification request.",
    )
  }

  if (
    hasOperationalPayload(input.output) &&
    input.output.operational?.readiness?.blocked &&
    (input.output.operational.readiness.blockers?.length ?? 0) === 0
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "Blocked readiness must include explicit blockers.",
      severity: "high",
    })
    requiredFixes.push("List explicit blockers when readiness.blocked is true.")
  }

  if (
    hasOperationalPayload(input.output) &&
    input.output.operational?.readiness?.status === "needs_clarification" &&
    !hasOperationalClarificationPath(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message:
        "Needs-clarification readiness must include clarification requests.",
      severity: "high",
    })
    requiredFixes.push(
      "Add clarificationRequests when readiness.status is needs_clarification.",
    )
  }

  if (
    hasOperationalPayload(input.output) &&
    input.output.operational?.readiness?.canContinue === true &&
    hasOperationalClarificationPath(input.output)
  ) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message:
        "readiness.canContinue is true but clarificationRequests are present — these are contradictory.",
      severity: "medium",
    })
    requiredFixes.push(
      "Set readiness.canContinue to false when clarificationRequests are present, or remove the clarificationRequests if they are not blocking.",
    )
  }

  if (input.output.keyRisks.length < 2) {
    violations.push({
      code: "STATE_PATCH_WEAK",
      message: "Insufficient risk markers for downstream planning.",
      severity: "medium",
    })
    requiredFixes.push("Include at least 2 key risks.")
  }

  if (
    input.hasDownstream &&
    (input.output.handoffFacts ?? []).length > 0 &&
    hasGenericHandoffFacts(input.output)
  ) {
    violations.push({
      code: "HANDOFF_INCOMPLETE",
      message: "handoffFacts contains generic or vague entries (e.g. 'budget constraints exist'). Downstream agents need specific facts they can act on.",
      severity: "medium",
    })
    requiredFixes.push(
      "Rewrite generic handoffFacts with concrete project-specific details: name the actual constraint, figure, decision, or dependency (e.g. 'MVP dev budget capped at $30k — rules out native iOS', not 'budget constraints exist').",
    )
  }

  if (hasRisksContainingQuestions(input.output)) {
    violations.push({
      code: "SCOPE_DISCIPLINE",
      message:
        "keyRisks contains items that appear to be clarification questions or missing-information items, not risks. " +
        "keyRisks must describe failure modes and design risks ONLY.",
      severity: "medium",
    })
    requiredFixes.push(
      "Remove any questions or missing-information items from keyRisks. " +
        "keyRisks must describe things that could go WRONG (failure modes, design risks). " +
        "Open questions belong in clarificationRequests; unknown information belongs in missingInformation.",
    )
  }

  if (
    input.upstreamContextCount > 0 &&
    input.hasDownstream &&
    !input.output.handoff &&
    // operational.directedHandoffs also satisfies the downstream handoff requirement —
    // do not fire this violation when the model correctly used the structured form.
    !(input.output.operational?.directedHandoffs && input.output.operational.directedHandoffs.length > 0)
  ) {
    violations.push({
      code: "HANDOFF_INCOMPLETE",
      message:
        "Downstream handoff is missing despite upstream dependency context.",
      severity: "high",
    })
    requiredFixes.push(
      "Add explicit downstream handoff with concrete next focus.",
    )
  }

  const mergedText = [
    input.output.summary,
    input.output.details,
    input.output.recommendation,
  ].join("\n")

  if (hasForbiddenRoleDrift(mergedText)) {
    violations.push({
      code: "OUT_OF_SCOPE_ACTION",
      message: "Output suggests role drift or out-of-scope action.",
      severity: "high",
    })
    requiredFixes.push("Stay strictly in the assigned role perspective.")
  }

  if (!hasOperationalPayload(input.output)) {
    const legacyOnlyViolation = {
      code: "STATE_PATCH_WEAK" as const,
      message:
        "Legacy-only output detected. Operational fields are missing, so the node is not reliably process-driving.",
      severity:
        operationalEnforcement === "warn" || operationalEnforcement === "allow"
          ? "medium" as const
          : "high" as const,
    }
    const legacyOnlyFix =
      "Return an operational payload with readiness and either nextSteps or clarificationRequests."

    if (operationalEnforcement === "warn") {
      const hasHighSeverityViolations = violations.some((v) => v.severity === "high")
      if (!hasHighSeverityViolations) {
        // Only downgrade to warn when no HIGH severity violations exist.
        // HIGH severity violations must trigger a retry even in warn mode.
        return buildWarnReport({
          producerNodeId: input.producerNodeId,
          attempt: input.attempt,
          violations: [...violations, legacyOnlyViolation],
          requiredFixes: [...requiredFixes, legacyOnlyFix],
        })
      }
      // Fall through to buildFailReport — HIGH severity violations override warn mode.
      violations.push(legacyOnlyViolation)
      requiredFixes.push(legacyOnlyFix)
    }

    if (operationalEnforcement === "retry" || operationalEnforcement === "require") {
      violations.push(legacyOnlyViolation)
      requiredFixes.push(legacyOnlyFix)
    }
  }

  if (violations.length > 0) {
    return buildFailReport({
      producerNodeId: input.producerNodeId,
      attempt: input.attempt,
      violations,
      requiredFixes,
    })
  }

  return {
    status: "pass",
    checks: {
      schemaCompliance: "pass",
      scopeDiscipline: "pass",
      sourceOfTruthSafety: "pass",
      handoffReadiness: "pass",
      statePatchQuality: "pass",
    },
    violations: [],
    revisionRequest: null,
    meta: {
      validatorNodeId: "shadow_validator_v1",
      producerNodeId: input.producerNodeId,
      attempt: input.attempt,
    },
  }
}
