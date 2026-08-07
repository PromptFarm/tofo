import assert from "node:assert/strict"

import { buildBuildPlanExportPayload } from "../buildPlanExport"
import { deriveBuildPlanUiState } from "../buildPlanUiState"
import { buildRunSummaryReport } from "../reportSummary"
import { assessProjectReadiness } from "../projectReadiness"
import { buildProjectSpecificationText } from "../projectSpecification"
import {
  hasSuggestedDefaultsForQuestions,
  resolveDecisionRequiredPresentation,
  summarizePreparedInputSourcesForUi,
} from "../userFacingPresentation"
import { useThinkingGraphVersionStore } from "../../../components/thinking-graph/state/useThinkingGraphVersionStore"
import { buildLinearGameDevGraph } from "./graphBuilder"
import { AdkSyntheticOrchestrator } from "./orchestrator"
import { loadDefaultGameDevelopmentPersonas } from "./personaSource"
import {
  createDefaultSyntheticBackendDescriptors,
  thinkingGraphRepository,
} from "./repository"
import { ClaudeModelProvider, OllamaModelProvider } from "./modelProvider"
import type { ModelGenerateInput, ModelGenerateResult, ModelProvider } from "./modelProvider"
import {
  DEFAULT_OLLAMA_MODEL,
  getThinkingGraphRuntimeConfig,
} from "./config"
import { validateSyntheticOutput } from "./llm-core/shadowValidator"
import type { SyntheticOutputJson, SyntheticPreparedDecision } from "./types"

function createTestSyntheticReport(input: {
  syntheticId: string
  syntheticName: string
  summary: string
  details: string
  recommendation: string
  changesFromPrevious?: string[]
  appliedInputs?: string[]
  ignoredInputs?: string[]
  keyRisks?: string[]
  feasibility?: number
  risk?: number
  complexity?: "low" | "medium" | "high"  // kept as "complexity" for test helper convenience — mapped to complexityLabel below
  handoff?: string | null
  upstreamContext?: string[]
  directedHandoffs?: SyntheticOutputJson["directedHandoffs"]
  operational?: SyntheticOutputJson["operational"]
}) {
  return {
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    summary: input.summary,
    details: input.details,
    recommendation: input.recommendation,
    changesFromPrevious: input.changesFromPrevious ?? [
      "Refined the report using the latest iteration context.",
    ],
    appliedInputs: input.appliedInputs ?? [
      "Used the latest idea prompt and upstream recommendations.",
    ],
    ignoredInputs: input.ignoredInputs ?? [],
    keyRisks: input.keyRisks ?? [
      "Primary implementation risk remains under review.",
      "Downstream alignment still needs validation.",
    ],
    concernLevels: {
      feasibility: input.feasibility ?? 70,
      risk: input.risk ?? 45,
      complexityLabel: input.complexity ?? "medium",
    },
    handoff: input.handoff ?? null,
    upstreamContext: input.upstreamContext ?? [],
    directedHandoffs:
      input.directedHandoffs ?? input.operational?.directedHandoffs ?? [],
    operational: input.operational ?? null,
    model: {
      provider: "ollama",
      model: "mistral",
    },
    raw: null,
  }
}

async function withOperationalEnforcementMode<T>(
  mode: "allow" | "warn" | "retry" | "require",
  fn: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
  process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = mode

  try {
    return await fn()
  } finally {
    if (previousMode === undefined) {
      delete process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
    } else {
      process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = previousMode
    }
  }
}

function runShadowValidatorContractTests(): void {
  const passing = validateSyntheticOutput({
    producerNodeId: "syn-game-designer",
    attempt: 1,
    output: {
      summary: "The core loop is narrow enough to proceed into downstream execution framing.",
      details: "The node fixed the target play pattern and identified the next implementation boundary.",
      recommendation: "Draft a movement-and-readability implementation brief for the first playable slice.",
      handoff: "Pass the narrowed brief to UX for readability framing.",
      keyRisks: [
        "Enemy readability may still collapse under visual noise.",
        "Movement feel may drift without explicit tuning bounds.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: {
        nextSteps: [
          "Draft a movement-and-readability implementation brief for the first playable slice.",
        ],
        clarificationRequests: [],
        userFacing: {
          state: "ready",
          title: "Ready",
          summary:
            "The first playable slice is specific enough to continue into an implementation brief.",
          whatWeKnow: [
            {
              label: "Prototype scope",
              value: "Movement and readability first playable slice",
            },
          ],
          whatIsNeededNow: [],
          whoActsNext: "system",
          nextStep:
            "Draft a movement-and-readability implementation brief for the first playable slice.",
          options: [],
          questions: [],
          actions: [{ type: "continue", label: "Continue" }],
        },
        directedHandoffs: [
          {
            toSyntheticId: "syn-ux-designer",
            facts: ["The first playable slice is narrowed to movement and readability."],
            constraints: ["Keep the first brief scoped to the initial playable slice."],
            openDecisions: [],
            blockedByUser: [],
            nextFocus: [
              "Frame the movement-and-readability brief so UX can carry it downstream.",
            ],
          },
        ],
        readiness: {
          canContinue: true,
          blocked: false,
          blockers: [],
          status: "ready_for_next_node",
        },
      },
    },
    upstreamContextCount: 1,
    hasDownstream: true,
  })

  assert.equal(passing.status, "pass")

  const missingActionPath = validateSyntheticOutput({
    producerNodeId: "syn-game-designer",
    attempt: 1,
    output: {
      summary: "The idea was reviewed and several observations were made for later consideration.",
      details: "This output contains prose but does not tell the system what to do next.",
      recommendation: "Consider the role feedback and continue when ready.",
      handoff: "Continue downstream.",
      keyRisks: [
        "Scope may drift.",
        "Requirements may remain ambiguous.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: {
        nextSteps: [],
        clarificationRequests: [],
        readiness: {
          canContinue: true,
          blocked: false,
          blockers: [],
          status: "ready_for_next_node",
        },
      },
    },
    upstreamContextCount: 1,
    hasDownstream: true,
  })

  assert.equal(missingActionPath.status, "fail")
  assert(
    (missingActionPath.revisionRequest?.requiredFixes ?? []).includes(
      "Provide at least one concrete next step or one clarification request.",
    ),
  )

  const blockedWithoutBlockers = validateSyntheticOutput({
    producerNodeId: "syn-ux-designer",
    attempt: 1,
    output: {
      summary: "The node cannot proceed until missing UX constraints are resolved.",
      details: "The output claims to be blocked but does not explain what the blocker is.",
      recommendation: "Clarify the missing UX boundary before continuing.",
      handoff: null,
      keyRisks: [
        "The HUD may be designed without a stable target state model.",
        "Onboarding could become inconsistent across screens.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: {
        nextSteps: [],
        clarificationRequests: [
          {
            id: "clarify_primary_hud_state",
            question: "Which HUD state must be readable first in combat?",
            whyItMatters: "Without a primary state target the HUD hierarchy will drift.",
            required: true,
          },
        ],
        readiness: {
          canContinue: false,
          blocked: true,
          blockers: [],
          status: "blocked",
        },
      },
    },
    upstreamContextCount: 0,
    hasDownstream: true,
  })

  assert.equal(blockedWithoutBlockers.status, "fail")
  assert(
    (blockedWithoutBlockers.revisionRequest?.requiredFixes ?? []).includes(
      "List explicit blockers when readiness.blocked is true.",
    ),
  )

  const legacyOnlyWarn = validateSyntheticOutput({
    producerNodeId: "syn-game-programmer",
    attempt: 1,
    output: {
      summary: "The implementation path is plausible, but this output still uses the old prose-only shape.",
      details: "It does not include readiness or explicit next-step structure yet.",
      recommendation: "Turn the response into an operational implementation handoff.",
      handoff: "Pass a structured implementation handoff downstream.",
      keyRisks: [
        "The node may look complete while still lacking machine-usable readiness.",
        "Downstream planning may overfit to prose instead of explicit actions.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: null,
    },
    upstreamContextCount: 1,
    hasDownstream: true,
    operationalEnforcement: "warn",
  })

  assert.equal(legacyOnlyWarn.status, "warn")
  assert(
    (legacyOnlyWarn.revisionRequest?.requiredFixes ?? []).includes(
      "Return an operational payload with readiness and either nextSteps or clarificationRequests.",
    ),
  )

  const genericUserFacingWarn = validateSyntheticOutput({
    producerNodeId: "syn-game-designer",
    attempt: 1,
    output: {
      summary: "The platformer concept needs more work before we can proceed safely.",
      details: "This output still frames the unresolved work in generic product-language instead of naming the actual missing input.",
      recommendation: "Ask the user to resolve the exact missing project input before proceeding.",
      handoff: null,
      keyRisks: [
        "The system may look useful while still asking vague placeholder questions.",
        "The user may need to open multiple blocks just to understand what is missing.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: {
        nextSteps: [],
        clarificationRequests: [
          {
            id: "clarify_core_mechanic_family",
            question: "Which traversal and hacking mechanic family should anchor the first playable slice?",
            whyItMatters: "This choice changes level design, control tuning, and the prototype scope.",
            required: true,
          },
        ],
        readiness: {
          canContinue: false,
          blocked: false,
          blockers: [],
          status: "needs_clarification",
        },
        userFacing: {
          state: "user_input_required",
          title: "User Input Required",
          summary:
            "Important decisions are required for this platformer before the next iteration can continue.",
          whatWeKnow: [
            { label: "Genre", value: "2D platformer" },
            { label: "Theme", value: "Cyberpunk" },
          ],
          whatIsNeededNow: ["Choose visual style"],
          whoActsNext: "user",
          nextStep: null,
          options: [],
          questions: [
            {
              id: "clarify_core_mechanic_family",
              label: "Core Mechanic",
              question:
                "Which traversal and hacking mechanic family should anchor the first playable slice?",
              whyItMatters:
                "This choice changes level design, control tuning, and the prototype scope.",
              suggestedAnswer: "Short-range air-dash plus one-node hack interactions",
              required: true,
            },
          ],
          actions: [{ type: "answer_questions", label: "Answer Required Questions" }],
        },
      },
    },
    upstreamContextCount: 1,
    hasDownstream: true,
    operationalEnforcement: "require",
  })

  assert.equal(genericUserFacingWarn.status, "fail")
  assert(
    (genericUserFacingWarn.revisionRequest?.requiredFixes ?? []).includes(
      "Rewrite userFacing.summary and whatIsNeededNow with project-specific unresolved inputs or decisions instead of generic placeholders.",
    ),
  )

  const genericDirectedHandoffWarn = validateSyntheticOutput({
    producerNodeId: "syn-ux-designer",
    attempt: 1,
    output: {
      summary: "The HUD direction is defined enough to hand off downstream.",
      details: "The output contains a directed handoff, but it just repeats the summary instead of giving recipient-specific constraints.",
      recommendation: "Pass only the HUD constraints that matter to implementation.",
      handoff: "Pass the HUD direction to engineering.",
      keyRisks: [
        "Engineering may inherit generic prose instead of implementation-ready constraints.",
        "Downstream agents may repeat the same vague blocker language.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: {
        nextSteps: ["Write the HUD implementation brief."],
        clarificationRequests: [],
        recommendedDecisions: [],
        readiness: {
          canContinue: true,
          blocked: false,
          blockers: [],
          status: "ready_for_next_node",
        },
        userFacing: {
          state: "ready",
          title: "Ready",
          summary: "The HUD direction is specific enough to continue.",
          whatWeKnow: [{ label: "HUD priority", value: "Threat readability first" }],
          whatIsNeededNow: [],
          whoActsNext: "system",
          nextStep: "Write the HUD implementation brief.",
          options: [],
          questions: [],
          actions: [{ type: "continue", label: "Continue" }],
        },
        directedHandoffs: [
          {
            toSyntheticId: "syn-game-programmer",
            facts: ["The HUD direction is defined enough to hand off downstream."],
            constraints: [],
            openDecisions: [],
            blockedByUser: [],
            nextFocus: [],
          },
        ],
      },
    },
    upstreamContextCount: 1,
    hasDownstream: true,
    operationalEnforcement: "warn",
  })

  assert.equal(genericDirectedHandoffWarn.status, "fail")
  assert(
    (genericDirectedHandoffWarn.revisionRequest?.requiredFixes ?? []).includes(
      "Rewrite directedHandoffs so each recipient gets concrete role-specific facts, constraints, decisions, blockers, or next focus instead of repeating the summary.",
    ),
  )

  const missingDirectedHandoffsFail = validateSyntheticOutput({
    producerNodeId: "syn-game-designer",
    attempt: 1,
    output: {
      summary: "The combat slice is defined enough to pass to UX.",
      details: "The node has downstream recipients, but it returned no directed handoff packet.",
      recommendation: "Pass the combat-slice brief downstream with recipient-specific constraints.",
      handoff: "Pass the combat-slice brief to UX.",
      keyRisks: [
        "Fallback context may leak generic summary text downstream.",
        "Downstream roles may inherit blockers that are not framed for their role.",
      ],
      appliedInputs: [],
      ignoredInputs: [],
      operational: {
        nextSteps: ["Draft the combat-slice brief for the next role."],
        clarificationRequests: [],
        recommendedDecisions: [],
        readiness: {
          canContinue: true,
          blocked: false,
          blockers: [],
          status: "ready_for_next_node",
        },
        userFacing: {
          state: "ready",
          title: "Ready",
          summary: "The combat slice is specific enough to continue.",
          whatWeKnow: [{ label: "Slice", value: "One combat encounter" }],
          whatIsNeededNow: [],
          whoActsNext: "system",
          nextStep: "Draft the combat-slice brief for the next role.",
          options: [],
          questions: [],
          actions: [{ type: "continue", label: "Continue" }],
        },
        directedHandoffs: [],
      },
    },
    upstreamContextCount: 1,
    hasDownstream: true,
    operationalEnforcement: "require",
  })

  assert.equal(missingDirectedHandoffsFail.status, "fail")
  assert(
    (missingDirectedHandoffsFail.revisionRequest?.requiredFixes ?? []).includes(
      "Return at least one directedHandoff for each meaningful downstream recipient instead of relying on fallback context.",
    ),
  )
}

function runOperationalSummaryAggregationTests(): void {
  const summaryReport = buildRunSummaryReport({
    ideaPrompt: "Build a co-op action game.",
    synthetics: [
      {
        id: "syn-game-designer",
        code: "GD",
        name: "Game Designer",
        role: "Gameplay loop and scope definition",
        status: "active",
        layout: { x: 0, y: 0 },
        config: {
          enabled: true,
          temperature: 0.35,
          strictness: 0.5,
          engagementPercent: 100,
        },
      },
    ],
    edges: [],
    outputsBySyntheticId: {
      "syn-game-designer": {
        ...createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Legacy summary should not be the primary source.",
          details: "Legacy details should not be the primary conflict description.",
          recommendation: "Legacy recommendation should not be the primary action item.",
        }),
        operational: {
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          domain: "gameplay",
          summary: "The idea is narrowed to one readable co-op combat loop.",
          acceptedAssumptions: [
            "The first slice is a short co-op combat run.",
          ],
          findings: [
            "Scope is narrow enough to produce a first implementation brief.",
          ],
          risks: [
            "Combat readability may collapse under effect-heavy encounters.",
          ],
          missingInformation: [
            "The first HUD state priority is not fixed yet.",
          ],
          clarificationRequests: [
            {
              id: "clarify_primary_hud_state",
              question: "Which HUD state must remain readable first during combat?",
              whyItMatters: "This sets the information hierarchy for the first UI pass.",
              required: true,
            },
          ],
          recommendedDecisions: [
            {
              id: "decision_first_slice",
              title: "Choose the first playable slice",
              options: ["combat_arena", "tutorial_slice"],
              recommendedOption: "combat_arena",
              reason: "It validates the core loop faster.",
            },
          ],
          nextSteps: [
            "Draft the first playable combat loop brief.",
          ],
          directedHandoffs: [
            {
              toSyntheticId: "syn-ux-designer",
              facts: [
                "The first playable slice is one short co-op combat loop.",
              ],
              constraints: [
                "Keep the first downstream pass focused on combat readability instead of progression systems.",
              ],
              openDecisions: [
                "Choose the first playable slice: prefer combat_arena",
              ],
              blockedByUser: [
                "Which HUD state must remain readable first during combat?",
              ],
              nextFocus: [
                "Draft the first-pass combat readability checklist for the combat loop brief.",
              ],
            },
          ],
          readiness: {
            canContinue: true,
            blocked: false,
            blockers: [],
            status: "ready_for_next_node",
          },
          artifactsReady: ["combat-loop-brief"],
          handoff: "Pass the narrowed loop brief to UX.",
        },
      },
    },
  })

  assert.equal(
    summaryReport.executiveBrief[0]?.sentence,
    "The idea is narrowed to one readable co-op combat loop.",
  )
  assert.equal(
    summaryReport.actionItems[0],
    "Draft the first playable combat loop brief.",
  )
  assert.equal(
    summaryReport.biggestConflict?.suggestion,
    "Choose the first playable slice: prefer combat_arena",
  )
}

function runProjectReadinessAssessmentTests(): void {
  const blocked = assessProjectReadiness({
    "syn-game-designer": createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Blocked sample.",
      details: "Blocked sample.",
      recommendation: "Blocked sample.",
      operational: {
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        domain: "gameplay",
        summary: "The loop cannot proceed without a fixed target platform.",
        acceptedAssumptions: [],
        findings: [],
        risks: [],
        missingInformation: ["Target platform is still undefined."],
        clarificationRequests: [
          {
            id: "clarify_platform",
            question: "Which platform is the first release target?",
            whyItMatters: "Movement and UI constraints depend on this choice.",
            required: true,
          },
        ],
        recommendedDecisions: [],
        nextSteps: [],
        readiness: {
          canContinue: false,
          blocked: true,
          blockers: ["Target platform is still undefined."],
          status: "blocked",
        },
        artifactsReady: [],
        handoff: null,
      },
    }),
  })

  assert.equal(blocked.status, "blocked")
  assert.equal(blocked.blockers[0], "Target platform is still undefined.")

  const clarification = assessProjectReadiness({
    "syn-ux-designer": createTestSyntheticReport({
      syntheticId: "syn-ux-designer",
      syntheticName: "UX Designer",
      summary: "Clarification sample.",
      details: "Clarification sample.",
      recommendation: "Clarification sample.",
      operational: {
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        domain: "ux",
        summary: "The HUD pass needs one explicit priority decision.",
        acceptedAssumptions: [],
        findings: [],
        risks: [],
        missingInformation: ["The first HUD state priority is unresolved."],
        clarificationRequests: [
          {
            id: "clarify_hud_priority",
            question: "Which HUD state must remain readable first during combat?",
            whyItMatters: "This sets the information hierarchy.",
            required: true,
          },
        ],
        recommendedDecisions: [],
        nextSteps: [],
        readiness: {
          canContinue: false,
          blocked: false,
          blockers: [],
          status: "needs_clarification",
        },
        artifactsReady: ["partial-hud-checklist"],
        handoff: null,
      },
    }),
  })

  assert.equal(clarification.status, "needs_clarification")
  assert.equal(
    clarification.clarificationQuestions[0],
    "Which HUD state must remain readable first during combat?",
  )
}

async function runThinkingGraphUiCoverageTests(): Promise<void> {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)

  const blockedOutputsBySyntheticId = {
    "syn-game-designer": createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Blocked build-plan sample.",
      details: "Blocked build-plan sample.",
      recommendation: "Blocked build-plan sample.",
      operational: {
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        domain: "gameplay",
        summary: "The first slice cannot proceed until the target platform is fixed.",
        acceptedAssumptions: [],
        findings: [],
        risks: [],
        missingInformation: ["Target platform is unresolved."],
        clarificationRequests: [
          {
            id: "clarify_platform",
            question: "Which platform is the first release target?",
            whyItMatters: "Movement and HUD constraints depend on this choice.",
            required: true,
          },
        ],
        recommendedDecisions: [],
        nextSteps: [],
        readiness: {
          canContinue: false,
          blocked: true,
          blockers: ["Target platform is unresolved."],
          status: "blocked",
        },
        artifactsReady: [],
        handoff: null,
      },
    }),
  } satisfies Record<string, SyntheticOutputJson | null>

  const blockedSummary = buildRunSummaryReport({
    ideaPrompt: "Build a co-op combat game.",
    synthetics,
    edges,
    outputsBySyntheticId: blockedOutputsBySyntheticId,
  })

  const blockedBuildPlanUi = deriveBuildPlanUiState(blockedOutputsBySyntheticId)
  assert.equal(blockedBuildPlanUi.specBlocked, true)
  assert.equal(blockedBuildPlanUi.exportDisabled, true)
  assert.equal(
    blockedBuildPlanUi.bannerText,
    "working context is blocked by missing inputs",
  )
  assert.equal(blockedBuildPlanUi.bannerItems[0], "Target platform is unresolved.")

  const blockedSpecText = buildProjectSpecificationText({
    ideaPrompt: "Build a co-op combat game.",
    appliedChatDigest: [],
    summaryReport: blockedSummary,
    synthetics,
    edges,
    outputsBySyntheticId: blockedOutputsBySyntheticId,
  })

  assert.match(blockedSpecText, /blocked by missing inputs/)
  assert.match(blockedSpecText, /Which platform is the first release target\?/)

  const clarificationOutputsBySyntheticId = {
    "syn-ux-designer": createTestSyntheticReport({
      syntheticId: "syn-ux-designer",
      syntheticName: "UX Designer",
      summary: "Clarification build-plan sample.",
      details: "Clarification build-plan sample.",
      recommendation: "Clarification build-plan sample.",
      operational: {
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        domain: "ux",
        summary: "The HUD pass needs one explicit priority decision.",
        acceptedAssumptions: [],
        findings: [],
        risks: [],
        missingInformation: ["The first HUD state priority is unresolved."],
        clarificationRequests: [
          {
            id: "clarify_hud_priority",
            question: "Which HUD state must remain readable first during combat?",
            whyItMatters: "This sets the first-pass information hierarchy.",
            required: true,
          },
        ],
        recommendedDecisions: [],
        nextSteps: [],
        readiness: {
          canContinue: false,
          blocked: false,
          blockers: [],
          status: "needs_clarification",
        },
        artifactsReady: ["partial-hud-checklist"],
        handoff: null,
      },
    }),
  } satisfies Record<string, SyntheticOutputJson | null>

  const clarificationSummary = buildRunSummaryReport({
    ideaPrompt: "Build a co-op combat game.",
    synthetics,
    edges,
    outputsBySyntheticId: clarificationOutputsBySyntheticId,
  })

  const clarificationBuildPlanUi = deriveBuildPlanUiState(
    clarificationOutputsBySyntheticId,
  )
  assert.equal(clarificationBuildPlanUi.specNeedsClarification, true)
  assert.equal(clarificationBuildPlanUi.exportDisabled, false)
  assert.equal(
    clarificationBuildPlanUi.bannerText,
    "working context needs user input before planning can continue cleanly",
  )
  assert.equal(
    clarificationBuildPlanUi.bannerItems[0],
    "Which HUD state must remain readable first during combat?",
  )

  const clarificationSpecText = buildProjectSpecificationText({
    ideaPrompt: "Build a co-op combat game.",
    appliedChatDigest: [],
    summaryReport: clarificationSummary,
    synthetics,
    edges,
    outputsBySyntheticId: clarificationOutputsBySyntheticId,
  })

  assert.match(
    clarificationSpecText,
    /needs clarification before the next run can continue cleanly/,
  )
  assert.match(clarificationSpecText, /Partial Artifacts Ready/)
  assert.match(clarificationSpecText, /partial-hud-checklist/)

  const specWithAppliedContext = buildProjectSpecificationText({
    ideaPrompt: "Build a co-op combat game.",
    appliedChatDigest: ["UX Designer: keep ally health readable during boss encounters."],
    appliedDecisions: [
      {
        syntheticId: "syn-game-designer",
        decisionTitle: "Core combat camera",
        optionId: "tight_arena_camera",
        optionLabel: "Tight arena camera",
        optionDescription: "Keep combat readable in constrained arenas.",
        appliedAt: "2026-04-05T10:00:00.000Z",
        source: "defaults",
      },
    ],
    appliedStructuredClarifications: [
      {
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        appliedAt: "2026-04-05T10:02:00.000Z",
        source: "manual_edit",
        answers: [
          {
            questionId: "clarify_hud_priority",
            questionLabel: "HUD priority",
            answer: "Ally status must stay readable even during boss telegraphs.",
          },
        ],
      },
    ],
    summaryReport: clarificationSummary,
    synthetics,
    edges,
    outputsBySyntheticId: clarificationOutputsBySyntheticId,
  })

  assert.match(specWithAppliedContext, /Applied Context/)
  assert.match(
    specWithAppliedContext,
    /Core combat camera -> Tight arena camera \[from defaults\]/,
  )
  assert.match(
    specWithAppliedContext,
    /HUD priority: Ally status must stay readable even during boss telegraphs\./,
  )
  assert.match(specWithAppliedContext, /Clarification set: UX Designer \[manual edit\]/)

  const planExportPayload = buildBuildPlanExportPayload({
    ideaPrompt: "Build a co-op combat game.",
    phases: [
      {
        name: "Design",
        goal: "Lock the first combat slice.",
        tasks: [
          {
            title: "Define combat readability brief",
            ownerCode: "UX",
            storyPoints: 3,
            priority: "high",
            description: "Define the first-pass combat readability targets.",
            acceptanceCriteria: ["Brief includes threat, ally, and objective priorities."],
            subTasks: ["Write readability checklist"],
          },
        ],
      },
    ],
    appliedDecisions: [
      {
        syntheticId: "syn-game-designer",
        decisionTitle: "Core combat camera",
        optionId: "tight_arena_camera",
        optionLabel: "Tight arena camera",
        optionDescription: "Keep combat readable in constrained arenas.",
        appliedAt: "2026-04-05T10:00:00.000Z",
        source: "defaults",
      },
    ],
    appliedStructuredClarifications: [
      {
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        appliedAt: "2026-04-05T10:02:00.000Z",
        source: "manual_edit",
        answers: [
          {
            questionId: "clarify_hud_priority",
            questionLabel: "HUD priority",
            answer: "Ally status must stay readable even during boss telegraphs.",
          },
        ],
      },
    ],
  })

  assert.equal(
    planExportPayload.projects[0]?.promptfarmContext?.appliedDecisions[0]?.optionLabel,
    "Tight arena camera",
  )
  assert.equal(
    planExportPayload.projects[0]?.promptfarmContext?.appliedDecisions[0]?.source,
    "defaults",
  )
  assert.equal(
    planExportPayload.projects[0]?.promptfarmContext?.appliedStructuredClarifications[0]?.answers[0]?.answer,
    "Ally status must stay readable even during boss telegraphs.",
  )
  assert.equal(
    planExportPayload.projects[0]?.promptfarmContext?.appliedStructuredClarifications[0]?.source,
    "manual_edit",
  )

  const backwardCompatibleExportPayload = buildBuildPlanExportPayload({
    ideaPrompt: "Build a co-op combat game.",
    phases: [],
    appliedDecisions: [
      {
        syntheticId: "syn-game-designer",
        decisionTitle: "Legacy decision",
        optionId: "legacy_choice",
        optionLabel: "Legacy choice",
        optionDescription: "Export without explicit source.",
        appliedAt: "2026-04-05T11:00:00.000Z",
      },
    ],
    appliedStructuredClarifications: [
      {
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        appliedAt: "2026-04-05T11:02:00.000Z",
        answers: [
          {
            questionId: "legacy_clarification",
            questionLabel: "Legacy clarification",
            answer: "Still accepted without explicit source.",
          },
        ],
      },
    ],
  })

  assert.equal(
    backwardCompatibleExportPayload.projects[0]?.promptfarmContext?.appliedDecisions[0]
      ?.source,
    "manual_edit",
  )
  assert.equal(
    backwardCompatibleExportPayload.projects[0]?.promptfarmContext
      ?.appliedStructuredClarifications[0]?.source,
    "manual_edit",
  )
}

async function runThinkingGraphOperationalCanonicalFlowTest(): Promise<void> {
  await withOperationalEnforcementMode("warn", async () => {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  const session = thinkingGraphRepository.createSession({
    ideaPrompt: "Build a co-op action game with readable UI and a tight first playable slice.",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  const fakeOutputs = [
    JSON.stringify(
      createTestSyntheticReport({
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        summary: "Legacy summary fallback for game design.",
        details: "Legacy details fallback for game design.",
        recommendation: "Legacy recommendation fallback for game design.",
        handoff: "Pass the combat loop brief to UX.",
        operational: {
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          domain: "gameplay",
          summary: "The first playable slice should be one short co-op combat loop.",
          acceptedAssumptions: [
            "The first slice excludes progression and meta systems.",
          ],
          findings: [
            "A single combat loop is specific enough to hand off downstream.",
          ],
          risks: [
            "Combat readability may collapse if too many enemy cues ship at once.",
          ],
          missingInformation: [
            "The highest-priority HUD state is not fixed yet.",
          ],
          clarificationRequests: [
            {
              id: "clarify_hud_priority",
              question: "Which HUD state must remain readable first during combat?",
              whyItMatters: "This determines the information hierarchy for the first UI pass.",
              required: true,
            },
          ],
          recommendedDecisions: [
            {
              id: "choose_first_slice",
              title: "Choose the first playable slice",
              options: ["combat_arena", "tutorial_slice"],
              recommendedOption: "combat_arena",
              reason: "This validates the core loop faster.",
            },
          ],
          nextSteps: [
            "Draft the first playable combat loop brief.",
          ],
          directedHandoffs: [
            {
              toSyntheticId: "syn-ux-designer",
              facts: [
                "The first playable slice is one short co-op combat loop.",
              ],
              constraints: [
                "Keep the first downstream pass focused on combat readability instead of progression systems.",
              ],
              openDecisions: [
                "Choose the first playable slice: prefer combat_arena",
              ],
              blockedByUser: [
                "Which HUD state must remain readable first during combat?",
              ],
              nextFocus: [
                "Draft the first-pass combat readability checklist for the combat loop brief.",
              ],
            },
          ],
          readiness: {
            canContinue: false,
            blocked: false,
            blockers: [],
            status: "needs_clarification",
          },
          artifactsReady: ["combat-loop-brief"],
          handoff: "Pass the combat loop brief to UX.",
          userFacing: {
            state: "user_input_required" as const,
            title: "HUD priority needed before proceeding",
            summary: "The first playable slice should be one short co-op combat loop.",
            whatWeKnow: [{ label: "Slice scope", value: "One short co-op combat loop" }],
            whatIsNeededNow: ["The highest-priority HUD state is not fixed yet.", "Which HUD state must remain readable first during combat?"],
            whoActsNext: "user" as const,
            nextStep: null,
            options: [],
            questions: [
              {
                id: "hud_priority",
                label: "HUD priority",
                question: "Which HUD state must remain readable first during combat?",
                whyItMatters: "This determines the information hierarchy for the first UI pass.",
                suggestedAnswer: "Threat indicator",
                required: true,
              },
            ],
            actions: [{ type: "answer_questions" as const, label: "Answer" }],
          },
        },
      }),
    ),
    JSON.stringify(
      createTestSyntheticReport({
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        summary: "Legacy summary fallback for UX.",
        details: "Legacy details fallback for UX.",
        recommendation: "Legacy recommendation fallback for UX.",
        risk: 72,
        handoff: "Pass a HUD readability checklist to engineering.",
        upstreamContext: [
          '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
        ],
        operational: {
          syntheticId: "syn-ux-designer",
          syntheticName: "UX Designer",
          domain: "ux",
          summary: "The first UX pass should prioritize combat readability and onboarding cues.",
          acceptedAssumptions: [
            "Combat readability is the primary UX success condition for the first slice.",
          ],
          findings: [
            "HUD state priority must be explicit before implementation starts.",
          ],
          risks: [
            "Status hierarchy may collapse on smaller displays.",
          ],
          missingInformation: [],
          clarificationRequests: [],
          recommendedDecisions: [
            {
              id: "choose_primary_hud_layer",
              title: "Choose the primary HUD layer",
              options: ["threats_first", "ally_state_first"],
              recommendedOption: "threats_first",
              reason: "Immediate threat readability reduces first-session confusion.",
            },
          ],
          nextSteps: [
            "Define the first-pass combat HUD readability checklist.",
          ],
          directedHandoffs: [
            {
              toSyntheticId: "syn-game-programmer",
              facts: [
                "Combat readability is the primary UX success condition for the first slice.",
              ],
              constraints: [
                "Keep HUD state priority explicit before implementation starts.",
              ],
              openDecisions: [
                "Choose the primary HUD layer: prefer threats_first",
              ],
              blockedByUser: [],
              nextFocus: [
                "Implement the HUD readability checklist with modular gameplay and HUD boundaries.",
              ],
            },
          ],
          readiness: {
            canContinue: true,
            blocked: false,
            blockers: [],
            status: "ready_for_next_node",
          },
          artifactsReady: ["hud-readability-checklist"],
          handoff: "Pass a HUD readability checklist to engineering.",
          userFacing: {
            state: "ready" as const,
            title: "HUD readability checklist ready",
            summary: "Combat readability is defined. HUD checklist ready for engineering.",
            whatWeKnow: [{ label: "Primary UX goal", value: "Combat readability first" }],
            whatIsNeededNow: [],
            whoActsNext: "system" as const,
            nextStep: "Define the first-pass combat HUD readability checklist.",
            options: [],
            questions: [],
            actions: [{ type: "continue" as const, label: "Continue" }],
          },
        },
      }),
    ),
    JSON.stringify(
      createTestSyntheticReport({
        syntheticId: "syn-game-programmer",
        syntheticName: "Game Programmer",
        summary: "Legacy summary fallback for engineering.",
        details: "Legacy details fallback for engineering.",
        recommendation: "Legacy recommendation fallback for engineering.",
        handoff: null,
        upstreamContext: [
          '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
          '{"syntheticId":"syn-ux-designer","syntheticName":"UX Designer"}',
        ],
        operational: {
          syntheticId: "syn-game-programmer",
          syntheticName: "Game Programmer",
          domain: "engineering",
          summary: "Implementation can begin from one combat loop brief and one HUD checklist.",
          acceptedAssumptions: [
            "The first slice can ship behind modular gameplay and HUD boundaries.",
          ],
          findings: [
            "The current inputs are sufficient to start an implementation brief.",
          ],
          risks: [
            "Engineering may overbuild if the first-pass boundaries are not kept narrow.",
          ],
          missingInformation: [],
          clarificationRequests: [],
          recommendedDecisions: [
            {
              id: "impl_boundary",
              title: "Implementation boundary strategy",
              options: ["Monolith start", "Modular from day one"],
              recommendedOption: "Modular from day one",
              reason: "Modular boundaries prevent costly refactors as design evolves.",
            },
          ],
          nextSteps: [
            "Write the implementation brief for gameplay and HUD boundaries.",
          ],
          readiness: {
            canContinue: true,
            blocked: false,
            blockers: [],
            status: "ready_for_next_node",
          },
          artifactsReady: ["implementation-brief"],
          handoff: null,
          userFacing: {
            state: "ready" as const,
            title: "Implementation brief ready",
            summary: "Engineering can begin from one combat loop brief and one HUD checklist.",
            whatWeKnow: [{ label: "Engineering approach", value: "Modular from day one" }],
            whatIsNeededNow: [],
            whoActsNext: "system" as const,
            nextStep: "Write the implementation brief for gameplay and HUD boundaries.",
            options: [],
            questions: [],
            actions: [{ type: "continue" as const, label: "Continue" }],
          },
        },
      }),
    ),
  ]

  // Provide 3 copies of each output to absorb up to 2 retries per node without
  // exhausting the queue and causing a downstream starvation error.
  const fakeOutputsWithRetries = [...fakeOutputs, ...fakeOutputs, ...fakeOutputs]

  const orchestratorUnderTest = new AdkSyntheticOrchestrator(
    new QueueModelProvider(fakeOutputsWithRetries),
  )
  const result = await orchestratorUnderTest.runChain({ session })

  assert.equal(
    result.outputsBySyntheticId["syn-game-designer"]?.operational?.nextSteps[0],
    "Draft the first playable combat loop brief.",
  )
  assert.equal(
    result.outputsBySyntheticId["syn-ux-designer"]?.operational?.artifactsReady[0],
    "hud-readability-checklist",
  )
  assert.equal(
    result.outputsBySyntheticId["syn-game-programmer"]?.recommendation,
    "Write the implementation brief for gameplay and HUD boundaries.",
  )

  const summaryReport = buildRunSummaryReport({
    ideaPrompt: session.ideaPrompt,
    synthetics,
    edges,
    outputsBySyntheticId: result.outputsBySyntheticId,
  })

  assert.equal(
    summaryReport.executiveBrief[0]?.sentence,
    "The first playable slice should be one short co-op combat loop.",
  )
  assert(summaryReport.actionItems.includes("The highest-priority HUD state is not fixed yet."))
  assert(summaryReport.actionItems.includes("Which HUD state must remain readable first during combat?"))
  assert(
    summaryReport.actionItems.includes(
      "Define the first-pass combat HUD readability checklist.",
    ),
  )
  assert.equal(
    summaryReport.biggestConflict?.suggestion,
    "Which HUD state must remain readable first during combat?",
  )
  }) // end withOperationalEnforcementMode
}

function runThinkingGraphHistorySourceRetentionTests(): void {
  const store = useThinkingGraphVersionStore.getState()
  store.resetVersionState()
  store.setRootPrompt("Build a co-op combat game.")

  const synthetics = [
    {
      id: "syn-game-designer",
      code: "GD",
      name: "Game Designer",
      role: "Design",
      status: "active" as const,
      layout: { x: 0, y: 0 },
      config: {
        enabled: true,
        temperature: 0.4,
        strictness: 70,
        engagementPercent: 75,
      },
    },
  ]
  const summaryReport = {
    executiveBrief: [{ sentence: "Lock the first combat slice.", sourceIds: [] }],
    actionItems: ["Confirm HUD priority."],
    biggestConflict: null,
    decisionFamilies: [],
    decisionMatrix: [],
    conflictMap: [],
    domainGates: [],
    overallVerdict: "go" as const,
    overallCondition: null,
  }
  const outputsBySyntheticId = {
    "syn-game-designer": createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Lock the first combat slice.",
      details: "The first combat slice is narrow enough to continue.",
      recommendation: "Keep HUD scope narrow.",
    }),
  } satisfies Record<string, SyntheticOutputJson | null>

  const createdRun = useThinkingGraphVersionStore.getState().recordSimpleRun({
    prompt: "Build a co-op combat game with a readable HUD.",
    synthetics,
    edges: [],
    outputsBySyntheticId,
    summaryReport,
    appliedDecisions: [
      {
        syntheticId: "syn-game-designer",
        decisionTitle: "HUD layout",
        optionId: "compact_hud",
        optionLabel: "Compact HUD",
        optionDescription: "Keep combat UI in one strip.",
        appliedAt: "2026-04-05T10:00:00.000Z",
        source: "defaults",
      },
    ],
    appliedStructuredClarifications: [
      {
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        appliedAt: "2026-04-05T10:02:00.000Z",
        source: "manual_edit",
        answers: [
          {
            questionId: "hud_priority",
            questionLabel: "HUD priority",
            answer: "Ally health first, objectives second.",
          },
        ],
      },
    ],
  })

  assert(createdRun)
  assert.equal(createdRun?.appliedDecisions[0]?.source, "defaults")
  assert.equal(
    createdRun?.appliedStructuredClarifications[0]?.source,
    "manual_edit",
  )
  assert.equal(
    useThinkingGraphVersionStore.getState().simulationHistory[0]?.appliedDecisions[0]
      ?.source,
    "defaults",
  )
  assert.equal(
    useThinkingGraphVersionStore.getState().simulationHistory[0]
      ?.appliedStructuredClarifications[0]?.source,
    "manual_edit",
  )

  store.resetVersionState()
}

function runThinkingGraphEdgeCaseCoverageTests(): void {
  const fallbackPresentation = resolveDecisionRequiredPresentation(
    {
      options: [
        {
          id: "tight_camera",
          label: "Tight camera",
          description: "Keep the action readable in a compact arena.",
      },
      {
        id: "wide_camera",
        label: "Wide camera",
          description: "Show more of the encounter space.",
        },
      ],
    },
    (optionId) => optionId === "define_handoff_owner",
  )

  assert.equal(fallbackPresentation.recommendedDecisionOption?.id, "tight_camera")
  assert.equal(fallbackPresentation.showAcceptRecommended, true)
  assert.equal(fallbackPresentation.alternateOptionsTitle, "Pick Another")
  assert.deepEqual(
    fallbackPresentation.alternateDecisionOptions.map((option) => option.id),
    ["wide_camera"],
  )

  const routingOnlyPresentation = resolveDecisionRequiredPresentation(
    {
      options: [
        {
          id: "define_handoff_owner",
          label: "Assign owner",
          description: "Route the decision to one responsible agent.",
        },
      ],
      recommendedOptionId: "define_handoff_owner",
    },
    (optionId) => optionId === "define_handoff_owner",
  )

  assert.equal(routingOnlyPresentation.showAcceptRecommended, false)
  assert.equal(routingOnlyPresentation.alternateOptionsTitle, "Route Decision")
  assert.deepEqual(
    routingOnlyPresentation.alternateDecisionOptions.map((option) => option.id),
    ["define_handoff_owner"],
  )

  assert.equal(
    hasSuggestedDefaultsForQuestions([
      { suggestedAnswer: null },
      { suggestedAnswer: "   " },
    ]),
    false,
  )
  assert.equal(
    hasSuggestedDefaultsForQuestions([
      { suggestedAnswer: null },
      { suggestedAnswer: "Lock ally health first" },
    ]),
    true,
  )

  assert.equal(
    summarizePreparedInputSourcesForUi([
      { source: "defaults" },
      { source: "manual_edit" },
    ]),
    "mixed",
  )
}

async function runThinkingGraphServerIntegrationTest(): Promise<void> {
  runShadowValidatorContractTests()
  runOperationalSummaryAggregationTests()
  runProjectReadinessAssessmentTests()
  runThinkingGraphHistorySourceRetentionTests()
  runThinkingGraphEdgeCaseCoverageTests()
  await runThinkingGraphUiCoverageTests()

  const personas = await loadDefaultGameDevelopmentPersonas()

  assert.equal(personas.length, 3)
  assert.deepEqual(
    personas.map((persona) => persona.id),
    ["game_designer", "ux_designer", "game_programmer"],
  )

  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()

  assert.equal(synthetics.length, 3)
  assert.deepEqual(
    synthetics.map((synthetic) => synthetic.code),
    ["GD", "UX", "GP"],
  )
  assert.deepEqual(
    edges
      .filter((edge) => edge.type !== "structural")
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        type: edge.type,
      })),
    [
      {
        from: "syn-game-designer",
        to: "syn-game-programmer",
        type: "tension",
      },
      {
        from: "syn-ux-designer",
        to: "syn-game-programmer",
        type: "oversight",
      },
    ],
  )

  const session = thinkingGraphRepository.createSession({
    ideaPrompt: "Build a cooperative indie roguelite with readable UI and scalable combat code.",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: "syn-game-designer",
    role: "user",
    text: "Focus the concept around short cooperative runs and strong player readability.",
  })
  thinkingGraphRepository.updateUpstreamContext(
    session.id,
    "syn-ux-designer",
    ["Game designer recommends short cooperative runs with readable combat feedback."],
  )
  thinkingGraphRepository.replaceSyntheticOutput(
    session.id,
    "syn-game-designer",
    createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Design should center on short co-op runs.",
      details:
        "Short session loops improve repeatability and make balance iteration cheaper.",
      recommendation:
        "Pass readability requirements into UX before engineering commits to combat HUD structure.",
      keyRisks: [
        "Session loops may become repetitive if combat variance is shallow.",
        "Readability goals could be diluted by late feature additions.",
      ],
      feasibility: 83,
      risk: 42,
      complexity: "medium",
      handoff: "Pass readability requirements into UX before engineering commits to combat HUD structure.",
    }),
  )
  thinkingGraphRepository.replaceSyntheticOutput(
    session.id,
    "syn-ux-designer",
    createTestSyntheticReport({
      syntheticId: "syn-ux-designer",
      syntheticName: "UX Designer",
      summary: "UI should communicate threat, cooldowns, and ally state at a glance.",
      details:
        "Co-op readability fails first when status effects and player roles are visually ambiguous.",
      recommendation: "Developer should keep HUD data-driven and modular.",
      keyRisks: [
        "Combat state may become noisy under co-op pressure.",
        "Status hierarchy could collapse on smaller displays.",
      ],
      feasibility: 74,
      risk: 58,
      complexity: "medium",
      handoff: "Developer should keep HUD data-driven and modular.",
    }),
  )
  thinkingGraphRepository.appendTranscriptEntries(session.id, [
    {
      id: "tr-gd-opinion",
      syntheticId: "syn-game-designer",
      type: "opinion",
      text: "Game designer recommends short co-op runs and readable combat loops.",
    },
    {
      id: "tr-ux-opinion",
      syntheticId: "syn-ux-designer",
      type: "opinion",
      text: "UX designer emphasizes compact HUD hierarchy and strong combat affordances.",
    },
  ])

  const payload = thinkingGraphRepository.toPayload(session.id)

  assert.ok(payload)
  assert.equal(payload.sessionId, session.id)
  assert.equal(payload.ideaPrompt, session.ideaPrompt)
  assert.equal(payload.provider.kind, "ollama")
  assert.equal(payload.provider.model, DEFAULT_OLLAMA_MODEL)
  assert.equal(payload.orchestrator.kind, "google_adk")
  assert.equal(payload.synthetics.length, 3)
  assert.equal(payload.edges.length, 8) // 6 structural (idea→nodes, nodes→outcome) + 2 semantic (tension + oversight)
  assert.equal(payload.transcript.length, 2)
  assert.equal(
    payload.conversationsBySyntheticId["syn-game-designer"]?.length,
    1,
  )
  assert.equal(
    payload.conversationsBySyntheticId["syn-ux-designer"]?.length ?? 0,
    0,
  )
  assert.deepEqual(payload.outputsBySyntheticId["syn-game-programmer"], null)
  assert.equal(
    payload.outputsBySyntheticId["syn-game-designer"]?.summary,
    "Design should center on short co-op runs.",
  )
  assert.equal(
    payload.outputsBySyntheticId["syn-game-designer"]?.recommendation,
    "Pass readability requirements into UX before engineering commits to combat HUD structure.",
  )
  assert.equal(
    payload.outputsBySyntheticId["syn-ux-designer"]?.details,
    "Co-op readability fails first when status effects and player roles are visually ambiguous.",
  )
  assert.equal(
    payload.outputsBySyntheticId["syn-ux-designer"]?.concernLevels.complexityLabel,
    "medium",
  )
}

class QueueModelProvider implements ModelProvider {
  readonly descriptor = {
    kind: "ollama",
    label: "Fake Ollama",
    model: "mistral",
    baseUrl: "http://localhost:11434/v1",
  }

  constructor(private readonly outputs: string[]) {}

  async generate(_input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const next = this.outputs.shift()
    if (!next) {
      throw new Error("QueueModelProvider ran out of canned outputs.")
    }

    return {
      text: next,
      provider: "ollama",
      model: "mistral",
      usage: {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      },
      rawResponse: { text: next },
    }
  }
}

class RecordingQueueModelProvider extends QueueModelProvider {
  readonly recordedInputs: ModelGenerateInput[] = []

  override async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    this.recordedInputs.push(input)
    return super.generate(input)
  }
}

async function runThinkingGraphAdkIntegrationTest(): Promise<void> {
  await withOperationalEnforcementMode("warn", async () => {
    const personas = await loadDefaultGameDevelopmentPersonas()
    const { synthetics, edges } = buildLinearGameDevGraph(personas)
    const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
    const session = thinkingGraphRepository.createSession({
      ideaPrompt: "Build a co-op action game with readable UI and extensible systems.",
      selectedPersonaIds: personas.map((persona) => persona.id),
      synthetics,
      edges,
      provider,
      orchestrator,
    })

    const fakeOutputs = [
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Focus the loop around short co-op combat runs.",
          details: "Short runs improve replayability and balancing speed.",
          recommendation: "UX should make enemy state and ally readability immediate.",
          handoff: "UX should make enemy state and ally readability immediate.",
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-ux-designer",
          syntheticName: "UX Designer",
          summary: "Expose cooldowns, ally state, and incoming threats clearly.",
          details:
            "Co-op coordination degrades when players cannot parse combat state quickly.",
          recommendation: "Programmer should keep HUD widgets modular and data-driven.",
          handoff: "Programmer should keep HUD widgets modular and data-driven.",
          upstreamContext: [
            '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
          ],
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-programmer",
          syntheticName: "Game Programmer",
          summary: "Implement combat HUD and state flow as isolated, testable modules.",
          details:
            "A modular gameplay/UI boundary reduces iteration cost as combat rules change.",
          recommendation: "Initial implementation can now move into engine-facing tasks.",
          handoff: "Initial implementation can now move into engine-facing tasks.",
          upstreamContext: [
            '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
            '{"syntheticId":"syn-ux-designer","syntheticName":"UX Designer"}',
          ],
        }),
      ),
    ]

    const orchestratorUnderTest = new AdkSyntheticOrchestrator(
      new QueueModelProvider(fakeOutputs),
    )
    const result = await orchestratorUnderTest.runChain({ session })

    assert.equal(result.transcript.length, 3)
    assert.equal(
      result.outputsBySyntheticId["syn-game-designer"]?.summary,
      "Focus the loop around short co-op combat runs.",
    )
    assert.equal(
      result.outputsBySyntheticId["syn-ux-designer"]?.recommendation,
      "Programmer should keep HUD widgets modular and data-driven.",
    )
    assert.equal(
      result.outputsBySyntheticId["syn-game-programmer"]?.details,
      "A modular gameplay/UI boundary reduces iteration cost as combat rules change.",
    )
  })
}

async function runThinkingGraphAdkFallbackParsingTest(): Promise<void> {
  await withOperationalEnforcementMode("warn", async () => {
    const personas = await loadDefaultGameDevelopmentPersonas()
    const { synthetics, edges } = buildLinearGameDevGraph(personas)
    const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
    const session = thinkingGraphRepository.createSession({
      ideaPrompt: "I want to make a video game",
      selectedPersonaIds: personas.map((persona) => persona.id),
      synthetics,
      edges,
      provider,
      orchestrator,
    })

    const fakeOutputs = [
    [
      "Here is the structured response:",
      "```json",
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Define a compact core loop before scaling scope.",
          details:
            "A small, repeatable loop gives UX and engineering a stable target.",
          recommendation: "UX should test readability around that loop.",
          handoff: "UX should test readability around that loop.",
        }),
      ),
      "```",
    ].join("\n"),
    [
      "```json",
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-ux-designer",
          syntheticName: "UX Designer",
          summary: "Make objective, threat, and feedback readable from moment one.",
          details: "Players drop quickly when the first minutes are visually noisy.",
          recommendation: "Programmer should keep HUD wiring modular.",
          handoff: "Programmer should keep HUD wiring modular.",
          upstreamContext: [
            '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
          ],
        }),
      ),
      "```",
    ].join("\n"),
    [
      "Final answer below.",
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-programmer",
          syntheticName: "Game Programmer",
          summary: "Build gameplay systems behind clear interfaces and data-driven UI state.",
          details:
            "That keeps iteration speed high while design and UX are still moving.",
          recommendation: "Document gameplay and UI boundaries before implementation.",
          handoff: null,
          upstreamContext: [
            '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
            '{"syntheticId":"syn-ux-designer","syntheticName":"UX Designer"}',
          ],
        }),
      ),
    ].join("\n"),
    ]

    const orchestratorUnderTest = new AdkSyntheticOrchestrator(
      new QueueModelProvider(fakeOutputs),
    )
    const result = await orchestratorUnderTest.runChain({ session })

    assert.equal(
      result.outputsBySyntheticId["syn-game-designer"]?.summary,
      "Define a compact core loop before scaling scope.",
    )
    assert.equal(
      result.outputsBySyntheticId["syn-ux-designer"]?.recommendation,
      "Programmer should keep HUD wiring modular.",
    )
    assert.equal(
      result.outputsBySyntheticId["syn-game-programmer"]?.summary,
      "Build gameplay systems behind clear interfaces and data-driven UI state.",
    )
    assert.equal(
      result.outputsBySyntheticId["syn-game-programmer"]?.handoff,
      null,
    )
  })
}

async function runThinkingGraphOperationalRetryTest(): Promise<void> {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  const session = thinkingGraphRepository.createSession({
    ideaPrompt: "Build a co-op combat prototype with a readable first slice.",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  const malformedOperationalOutput = JSON.stringify({
    ...createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Legacy fallback summary for retry test.",
      details: "Legacy fallback details for retry test.",
      recommendation: "Legacy fallback recommendation for retry test.",
      handoff: "Pass the combat loop draft downstream.",
    }),
    operational: {
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      domain: "gameplay",
      summary: "The first slice should be a narrow combat encounter.",
      acceptedAssumptions: [],
      findings: ["The combat slice is specific enough to proceed."],
      risks: ["Enemy readability could collapse under visual noise."],
      missingInformation: [],
      clarificationRequests: [],
      recommendedDecisions: [],
      nextSteps: [],
      artifactsReady: [],
      handoff: "Pass the combat loop draft downstream.",
    },
  })

  const validOperationalOutput = JSON.stringify(
    createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Refined retry summary for the first combat encounter.",
      details: "The revised output now narrows the first slice to one concrete combat encounter brief.",
      recommendation: "Draft the first combat encounter brief and hand it downstream.",
      handoff: "Pass the combat loop draft downstream.",
      operational: {
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        domain: "gameplay",
        summary: "The first slice should be a narrow combat encounter.",
        acceptedAssumptions: [
          "The first slice excludes progression systems.",
        ],
        findings: ["The combat slice is specific enough to proceed."],
        risks: ["Enemy readability could collapse under visual noise."],
        missingInformation: [],
        clarificationRequests: [],
        recommendedDecisions: [],
        nextSteps: ["Draft the first combat encounter brief."],
        readiness: {
          canContinue: true,
          blocked: false,
          blockers: [],
          status: "ready_for_next_node",
        },
        artifactsReady: ["combat-encounter-brief"],
        handoff: "Pass the combat loop draft downstream.",
        directedHandoffs: [
          {
            toSyntheticId: "syn-ux-designer",
            facts: ["The first slice is one narrow combat encounter."],
            constraints: ["Keep the first pass scoped to one combat-encounter brief."],
            openDecisions: [],
            blockedByUser: [],
            nextFocus: ["Use this brief to frame combat readability and HUD needs."],
          },
        ],
      },
    }),
  )

  const previousMode = process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
  process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = "require"

  try {
    const providerUnderTest = new RecordingQueueModelProvider([
      malformedOperationalOutput,
      validOperationalOutput,
      // 3rd call: aggregator (always runs after agents, even for single-agent subsets)
      JSON.stringify({ executiveBrief: ["Focus on a narrow first combat slice."], actionItems: ["Designer should draft the encounter brief."], biggestConflict: null, conflictMap: [] }),
    ])

    const orchestratorUnderTest = new AdkSyntheticOrchestrator(providerUnderTest)
    const result = await orchestratorUnderTest.runChain({
      session,
      syntheticIds: ["syn-game-designer"],
    })

    assert.equal(providerUnderTest.recordedInputs.length, 3) // 2 agent calls (fail + retry) + 1 aggregator call
    assert.equal(
      result.outputsBySyntheticId["syn-game-designer"]?.operational?.nextSteps[0],
      "Draft the first combat encounter brief.",
    )
    assert.equal(
      result.outputsBySyntheticId["syn-game-designer"]?.recommendation,
      "Draft the first combat encounter brief.",
    )
    assert.equal(
      (
        result.outputsBySyntheticId["syn-game-designer"]?.raw as {
          quality?: { hasOperational?: boolean }
        } | null
      )?.quality?.hasOperational,
      true,
    )

    const retryPrompt =
      providerUnderTest.recordedInputs[1]?.messages[0]?.content ?? ""
    assert.match(retryPrompt, /RETRY ATTEMPT 2/)
    assert.match(retryPrompt, /Your previous draft lacked an operational payload entirely/)
    assert.match(retryPrompt, /operational/)
  } finally {
    if (previousMode === undefined) {
      delete process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
    } else {
      process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = previousMode
    }
  }
}

async function runThinkingGraphLegacyOperationalRetryModeTest(): Promise<void> {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  const session = thinkingGraphRepository.createSession({
    ideaPrompt: "Build a co-op combat prototype with a readable first slice.",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  const previousMode = process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
  process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = "retry"

  try {
    const providerUnderTest = new RecordingQueueModelProvider([
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Legacy-only output should trigger retry mode.",
          details: "This attempt still lacks the operational layer.",
          recommendation: "Pass the brief downstream after structuring it properly.",
          handoff: "Pass the brief downstream after structuring it properly.",
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Operational retry output for the combat slice.",
          details: "The second attempt now provides the explicit process-driving fields.",
          recommendation: "Draft the combat slice brief and hand it downstream.",
          handoff: "Pass the combat slice brief downstream.",
          operational: {
            syntheticId: "syn-game-designer",
            syntheticName: "Game Designer",
            domain: "gameplay",
            summary: "The first slice should stay focused on one combat encounter.",
            acceptedAssumptions: ["The first slice excludes progression systems."],
            findings: ["One encounter is enough to validate the core loop."],
            risks: ["Enemy cue overload could harm readability."],
            missingInformation: [],
            clarificationRequests: [],
            recommendedDecisions: [],
            nextSteps: ["Draft the combat slice brief."],
            readiness: {
              canContinue: true,
              blocked: false,
              blockers: [],
              status: "ready_for_next_node",
            },
            artifactsReady: ["combat-slice-brief"],
            handoff: "Pass the combat slice brief downstream.",
            directedHandoffs: [
              {
                toSyntheticId: "syn-ux-designer",
                facts: ["The first slice stays focused on one combat encounter."],
                constraints: ["Keep the combat slice brief narrow for the first downstream pass."],
                openDecisions: [],
                blockedByUser: [],
                nextFocus: ["Use the combat-slice brief to define readability and HUD needs."],
              },
            ],
          },
        }),
      ),
      // 3rd call: aggregator (always runs after agents, even for single-agent subsets)
      JSON.stringify({ executiveBrief: ["Focus on a narrow first combat slice."], actionItems: ["Designer should draft the encounter brief."], biggestConflict: null, conflictMap: [] }),
    ])

    const orchestratorUnderTest = new AdkSyntheticOrchestrator(providerUnderTest)
    const result = await orchestratorUnderTest.runChain({
      session,
      syntheticIds: ["syn-game-designer"],
    })

    assert.equal(providerUnderTest.recordedInputs.length, 3) // 2 agent calls (fail + retry) + 1 aggregator call
    assert.equal(
      result.outputsBySyntheticId["syn-game-designer"]?.operational?.nextSteps[0],
      "Draft the combat slice brief.",
    )
    assert.equal(
      (
        result.outputsBySyntheticId["syn-game-designer"]?.raw as {
          quality?: {
            hasOperational?: boolean
            usedLegacyCompatibilityFallback?: boolean
          }
        } | null
      )?.quality?.usedLegacyCompatibilityFallback,
      false,
    )
    const retryPrompt =
      providerUnderTest.recordedInputs[1]?.messages[0]?.content ?? ""
    assert.match(retryPrompt, /RETRY ATTEMPT 2/)
    assert.match(retryPrompt, /Your previous draft lacked an operational payload entirely/)
  } finally {
    if (previousMode === undefined) {
      delete process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
    } else {
      process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = previousMode
    }
  }
}

function runThinkingGraphRuntimeConfigDefaultTest(): void {
  const previousMode = process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
  delete process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT

  try {
    assert.equal(
      getThinkingGraphRuntimeConfig().operationalEnforcement,
      "retry",
    )
  } finally {
    if (previousMode === undefined) {
      delete process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT
    } else {
      process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT = previousMode
    }
  }
}

async function runThinkingGraphSequentialContextTest(): Promise<void> {
  await withOperationalEnforcementMode("warn", async () => {
    const personas = await loadDefaultGameDevelopmentPersonas()
    const { synthetics, edges } = buildLinearGameDevGraph(personas)
    const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
    const session = thinkingGraphRepository.createSession({
      ideaPrompt: "Make a co-op game.",
      selectedPersonaIds: personas.map((persona) => persona.id),
      synthetics,
      edges,
      provider,
      orchestrator,
    })

    // Pre-populate prior-run memory so agents see each other's outputs on this run.
    // Full-mesh: each agent receives ALL peers' prior-run outputs as context.
    thinkingGraphRepository.replaceSyntheticOutput(
      session.id,
      "syn-game-designer",
      createTestSyntheticReport({
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        summary: "Core loop is a short co-op combat run.",
        details: "Short loops keep scope and iteration under control.",
        recommendation: "UX should make threats and cooldowns readable.",
        handoff: "UX should make threats and cooldowns readable.",
      }),
    )
    thinkingGraphRepository.replaceSyntheticOutput(
      session.id,
      "syn-ux-designer",
      createTestSyntheticReport({
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        summary: "Surface ally state, threats, and cooldowns clearly.",
        details: "Players need readable combat state to coordinate.",
        recommendation: "Programmer should keep HUD data-driven.",
        handoff: "Programmer should keep HUD data-driven.",
      }),
    )

    // Re-fetch the session to get the updated memory (replaceSyntheticOutput mutates the store)
    const sessionWithMemory = thinkingGraphRepository.getSession(session.id)!

    const providerUnderTest = new RecordingQueueModelProvider([
    JSON.stringify(
      createTestSyntheticReport({
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        summary: "Refined: co-op loop must stay narrow with clear feedback signals.",
        details: "Second iteration narrows scope to one combat encounter.",
        recommendation: "UX should tighten feedback hierarchy for combat state.",
        handoff: "UX should tighten feedback hierarchy for combat state.",
      }),
    ),
    JSON.stringify(
      createTestSyntheticReport({
        syntheticId: "syn-ux-designer",
        syntheticName: "UX Designer",
        summary: "Updated: prioritise threat readability and cooldown visibility.",
        details: "Second pass tightens HUD information hierarchy.",
        recommendation: "Programmer should keep HUD components data-driven.",
        handoff: "Programmer should keep HUD components data-driven.",
      }),
    ),
    JSON.stringify(
      createTestSyntheticReport({
        syntheticId: "syn-game-programmer",
        syntheticName: "Game Programmer",
        summary: "Implement systems behind modular gameplay and HUD boundaries.",
        details: "This keeps iteration cost low while upstream ideas change.",
        recommendation: "Keep gameplay and HUD boundaries modular through implementation.",
        handoff: null,
      }),
    ),
    // 4th call: aggregator
    JSON.stringify({ executiveBrief: ["Focus on a short co-op combat run."], actionItems: ["Keep HUD modular."], biggestConflict: null, conflictMap: [] }),
    ])

    const orchestratorUnderTest = new AdkSyntheticOrchestrator(providerUnderTest)
    const progressEvents: string[] = []
    await orchestratorUnderTest.runChain({
      session: sessionWithMemory,
      onProgress: async (event) => {
        if (event.type === "agent_chunk" || event.type === "aggregator_started" || event.type === "aggregator_chunk" || event.type === "aggregator_completed") {
          return
        }
        if (event.type === "agent_started" || event.type === "agent_completed") {
          progressEvents.push(`${event.type}:${event.syntheticId}:${event.completedAgents}`)
        }
      },
    })

    assert.equal(providerUnderTest.recordedInputs.length, 4) // 3 agent calls + 1 aggregator call

    // Full-mesh parallel execution: all agents start simultaneously (completedAgents=0),
    // then complete in order as each LLM call returns.
    assert.deepEqual(progressEvents, [
      "agent_started:syn-game-designer:0",
      "agent_started:syn-ux-designer:0",
      "agent_started:syn-game-programmer:0",
      "agent_completed:syn-game-designer:1",
      "agent_completed:syn-ux-designer:2",
      "agent_completed:syn-game-programmer:3",
    ])

    const designerPrompt =
      providerUnderTest.recordedInputs[0]?.messages[0]?.content ?? ""
    const uxPrompt =
      providerUnderTest.recordedInputs[1]?.messages[0]?.content ?? ""
    const programmerPrompt =
      providerUnderTest.recordedInputs[2]?.messages[0]?.content ?? ""

    // GD receives UX's prior handoff (full-mesh: all peers get all prior handoffs).
    assert.match(designerPrompt, /Direct handoffs for your role:/)
    // GD's downstream recipient is GP via tension edge (bidirectional).
    assert.match(designerPrompt, /Your downstream recipients:/)
    assert.match(designerPrompt, /Game Programmer/)
    // GD's prompt includes UX's prior-run summary (full-mesh context from session memory).
    assert.match(designerPrompt, /Surface ally state, threats, and cooldowns clearly\./)

    // UX receives GD's handoff (GD's prior output.handoff is included as a handoff to UX).
    assert.match(uxPrompt, /Direct handoffs for your role:/)
    // UX's downstream recipient is GP via oversight edge.
    assert.match(uxPrompt, /Your downstream recipients:/)
    assert.match(uxPrompt, /Game Programmer/)
    // UX's prompt includes GD's prior-run summary (full-mesh context from session memory).
    assert.match(uxPrompt, /Core loop is a short co-op combat run\./)

    // GP receives both GD's and UX's handoffs (both have .handoff fields in prior outputs).
    assert.match(programmerPrompt, /Direct handoffs for your role:/)
    // GP's downstream recipient is GD via tension edge (bidirectional).
    assert.match(programmerPrompt, /Your downstream recipients:/)
    assert.match(programmerPrompt, /Game Designer/)
    // GP's prompt includes UX's prior-run summary (full-mesh context from session memory).
    assert.match(programmerPrompt, /Surface ally state, threats, and cooldowns clearly\./)
  })
}

async function runThinkingGraphRerunUsesChatClarificationTest(): Promise<void> {
  await withOperationalEnforcementMode("warn", async () => {
    const personas = await loadDefaultGameDevelopmentPersonas()
    const { synthetics, edges } = buildLinearGameDevGraph(personas)
    const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
    const session = thinkingGraphRepository.createSession({
      ideaPrompt: "Make a platformer game.",
      selectedPersonaIds: personas.map((persona) => persona.id),
      synthetics,
      edges,
      provider,
      orchestrator,
    })

    thinkingGraphRepository.replaceSyntheticOutput(
      session.id,
      "syn-game-designer",
      createTestSyntheticReport({
        syntheticId: "syn-game-designer",
        syntheticName: "Game Designer",
        summary: "Define a baseline platforming loop first.",
        details: "The first pass should stay compact before adding advanced systems.",
        recommendation: "Clarify how traversal difficulty should scale over time.",
        handoff: "Clarify how traversal difficulty should scale over time.",
      }),
    )
    thinkingGraphRepository.appendConversationMessage(session.id, {
      syntheticId: "syn-game-designer",
      role: "user",
      text: "Be specific: I want slippery ice physics, short levels, and Mario-style movement feel.",
    })
    const sessionAfterClarification = thinkingGraphRepository.getSession(session.id)
    const clarificationMessageId =
      sessionAfterClarification?.memoryBySyntheticId["syn-game-designer"]?.conversation[0]?.id
    assert.ok(clarificationMessageId)
    thinkingGraphRepository.setConversationMessageIterationUsage(
      session.id,
      "syn-game-designer",
      clarificationMessageId!,
      true,
    )

    const sessionForRun = thinkingGraphRepository.getSession(session.id)
    assert.ok(sessionForRun)

    const providerUnderTest = new RecordingQueueModelProvider([
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Center the loop on short slippery platforming stages.",
          details: "Short levels keep retries fast while ice physics stays learnable.",
          recommendation: "UX should explain momentum and stopping distance early.",
          handoff: "UX should explain momentum and stopping distance early.",
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-ux-designer",
          syntheticName: "UX Designer",
          summary: "Teach momentum and traction visually in onboarding.",
          details: "Players need obvious feedback before slippery movement feels fair.",
          recommendation: "Programmer should tune tutorial cues and landing feedback.",
          handoff: "Programmer should tune tutorial cues and landing feedback.",
          upstreamContext: [
            '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
          ],
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-programmer",
          syntheticName: "Game Programmer",
          summary: "Implement movement feel as tunable physics parameters.",
          details: "Tunable acceleration and friction values reduce iteration cost.",
          recommendation: "Expose physics parameters for fast balancing passes.",
          handoff: null,
          upstreamContext: [
            '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
            '{"syntheticId":"syn-ux-designer","syntheticName":"UX Designer"}',
          ],
        }),
      ),
    ])

    const orchestratorUnderTest = new AdkSyntheticOrchestrator(providerUnderTest)
    await orchestratorUnderTest.runChain({ session: sessionForRun! })

    const designerPrompt =
      providerUnderTest.recordedInputs[0]?.messages[0]?.content ?? ""

    assert.match(designerPrompt, /Previous iteration context/)
    assert.match(designerPrompt, /Define a baseline platforming loop first\./)
    assert.match(designerPrompt, /Applied clarification history for this iteration:/)
    assert.match(
      designerPrompt,
      /Revise your previous synthetic output instead of generating a fresh generic role description\./,
    )
    assert.match(
      designerPrompt,
      /changesFromPrevious.*what changed vs previous output/i,
    )
    assert.match(
      designerPrompt,
      /appliedInputs/i,
    )
    assert.match(
      designerPrompt,
      /slippery ice physics, short levels, and Mario-style movement feel\./,
    )
  })
}

async function runThinkingGraphConsumeAppliedChatSelectionTest(): Promise<void> {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  const session = thinkingGraphRepository.createSession({
    ideaPrompt: "Make an arcade game.",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  thinkingGraphRepository.appendConversationMessage(session.id, {
    syntheticId: "syn-game-designer",
    role: "user",
    text: "Use short arcade rounds and immediate retries.",
  })
  const messageId =
    thinkingGraphRepository
      .getSession(session.id)
      ?.memoryBySyntheticId["syn-game-designer"]?.conversation[0]?.id ?? null

  assert.ok(messageId)

  thinkingGraphRepository.setConversationMessageIterationUsage(
    session.id,
    "syn-game-designer",
    messageId,
    true,
  )

  const beforeConsume = thinkingGraphRepository.toPayload(session.id)
  assert.equal(
    beforeConsume?.conversationsBySyntheticId["syn-game-designer"]?.[0]
      ?.includeInNextIteration,
    true,
  )

  thinkingGraphRepository.clearConversationIterationUsage(session.id)

  const afterConsume = thinkingGraphRepository.toPayload(session.id)
  assert.equal(
    afterConsume?.conversationsBySyntheticId["syn-game-designer"]?.[0]
      ?.includeInNextIteration,
    false,
  )
}

async function runThinkingGraphChatReplyTest(): Promise<void> {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  const session = thinkingGraphRepository.createSession({
    ideaPrompt: "Make a stealth action game.",
    selectedPersonaIds: personas.map((persona) => persona.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })

  thinkingGraphRepository.replaceSyntheticOutput(
    session.id,
    "syn-game-designer",
    createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Build tension around readable stealth loops.",
      details: "Stealth works when threat states and failure causes stay legible.",
      recommendation: "Clarify how enemy suspicion escalates across encounters.",
      handoff: "Clarify how enemy suspicion escalates across encounters.",
    }),
  )

  const providerUnderTest = new QueueModelProvider([
    "I meant that enemy suspicion needs 3 clearly readable states so the player can predict when stealth is breaking.",
  ])
  const orchestratorUnderTest = new AdkSyntheticOrchestrator(providerUnderTest)
  const result = await orchestratorUnderTest.chat({
    session: thinkingGraphRepository.getSession(session.id)!,
    syntheticId: "syn-game-designer",
    userMessage: "Explain what you meant for my stealth game.",
  })

  assert.match(result.replyText, /enemy suspicion needs 3 clearly readable states/i)
  assert.equal(result.conversation.length, 2)
  assert.equal(result.conversation[0]?.includeInNextIteration, false)
  assert.equal(result.conversation[1]?.includeInNextIteration, false)
}

async function runOllamaStructuredTransportTest(): Promise<void> {
  const originalFetch = globalThis.fetch
  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = []

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    fetchCalls.push({ url, body })

    return new Response(
      JSON.stringify({
        model: "mistral",
        message: {
          content: JSON.stringify({
            ...createTestSyntheticReport({
              syntheticId: "syn-game-programmer",
              syntheticName: "Game Programmer",
              summary: "Structured output path reached native Ollama chat.",
              details: "The provider used /api/chat with a JSON schema format.",
              recommendation: "Structured transport is working as expected.",
              handoff: null,
            }),
          }),
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }) as typeof fetch

  try {
    const provider = new OllamaModelProvider()
    const result = await provider.generate({
      messages: [{ role: "user", content: "Return structured JSON." }],
      responseSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      maxTokens: 128,
    })

    assert.equal(fetchCalls.length, 1)
    assert.equal(fetchCalls[0]?.url, "http://localhost:11434/api/chat")
    assert.deepEqual(fetchCalls[0]?.body.format, {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    })
    assert.equal(fetchCalls[0]?.body.stream, false)
    assert.deepEqual(fetchCalls[0]?.body.options, {
      temperature: 0,
      num_predict: 128,
    })
    assert.match(result.text, /Structured output path reached native Ollama chat/)
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function runClaudeStructuredTransportTest(): Promise<void> {
  const originalFetch = globalThis.fetch
  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = []

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    fetchCalls.push({ url, body })

    return new Response(
      JSON.stringify({
        model: "claude-haiku-test",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: "Claude returned schema-aligned JSON.",
            }),
          },
        ],
        usage: {
          input_tokens: 111,
          output_tokens: 22,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }) as typeof fetch

  try {
    const provider = new ClaudeModelProvider({
      apiKey: "test-key",
      model: "claude-haiku-test",
    })
    const result = await provider.generate({
      messages: [{ role: "user", content: "Return structured JSON." }],
      responseSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
        additionalProperties: false,
      },
      maxTokens: 256,
    })

    assert.equal(fetchCalls.length, 1)
    assert.equal(fetchCalls[0]?.url, "https://api.anthropic.com/v1/messages")
    assert.deepEqual(fetchCalls[0]?.body.output_config, {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
          required: ["summary"],
          additionalProperties: false,
        },
      },
    })
    assert.equal(fetchCalls[0]?.body.max_tokens, 256)
    assert.match(result.text, /schema-aligned JSON/)
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function runClaudeSchemaSanitizationTest(): Promise<void> {
  const originalFetch = globalThis.fetch
  const fetchCalls: Array<{ body: Record<string, unknown> }> = []

  globalThis.fetch = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    fetchCalls.push({ body })

    return new Response(
      JSON.stringify({
        model: "claude-haiku-test",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: "Sanitized schema accepted by Claude.",
            }),
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 10,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }) as typeof fetch

  try {
    const provider = new ClaudeModelProvider({
      apiKey: "test-key",
      model: "claude-haiku-test",
    })
    await provider.generate({
      messages: [{ role: "user", content: "Return structured JSON." }],
      responseSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          optionReasons: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          nested: {
            type: "object",
            properties: {
              label: { type: "string" },
            },
            required: ["label"],
          },
        },
        required: ["summary"],
      },
      maxTokens: 256,
    })

    const schema = (fetchCalls[0]?.body.output_config as { format?: { schema?: Record<string, unknown> } })?.format?.schema
    assert.ok(schema)
    assert.deepEqual(schema, {
      type: "object",
      properties: {
        summary: { type: "string" },
        nested: {
          type: "object",
          properties: {
            label: { type: "string" },
          },
          required: ["label"],
          additionalProperties: false,
        },
      },
      required: ["summary"],
      additionalProperties: false,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function runClaudeStructuredMaxTokensRetryTest(): Promise<void> {
  const originalFetch = globalThis.fetch
  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = []

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    fetchCalls.push({ url, body })

    if (fetchCalls.length === 1) {
      return new Response(
        JSON.stringify({
          model: "claude-haiku-test",
          stop_reason: "max_tokens",
          content: [
            {
              type: "text",
              text: "{\"summary\":\"truncated",
            },
          ],
          usage: {
            input_tokens: 120,
            output_tokens: 128,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      )
    }

    return new Response(
      JSON.stringify({
        model: "claude-haiku-test",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: "Claude retried with a larger token budget.",
            }),
          },
        ],
        usage: {
          input_tokens: 140,
          output_tokens: 42,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }) as typeof fetch

  try {
    const provider = new ClaudeModelProvider({
      apiKey: "test-key",
      model: "claude-haiku-test",
    })
    const result = await provider.generate({
      messages: [{ role: "user", content: "Return structured JSON." }],
      responseSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      maxTokens: 512,
    })

    assert.equal(fetchCalls.length, 2)
    assert.equal(fetchCalls[0]?.body.max_tokens, 512)
    assert.equal(fetchCalls[1]?.body.max_tokens, 8192)
    assert.match(result.text, /larger token budget/)
  } finally {
    globalThis.fetch = originalFetch
  }
}

async function runThinkingGraphSummaryReportTest(): Promise<void> {
  const personas = await loadDefaultGameDevelopmentPersonas()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const outputsBySyntheticId = {
    "syn-game-designer": createTestSyntheticReport({
      syntheticId: "syn-game-designer",
      syntheticName: "Game Designer",
      summary: "Define a small replayable co-op combat loop first.",
      details: "A compact loop keeps scope disciplined and gives downstream roles a stable target.",
      recommendation: "UX should make ally state and enemy threat readability immediate.",
      feasibility: 74,
      risk: 72,
      handoff: "UX should make ally state and enemy threat readability immediate.",
    }),
    "syn-ux-designer": createTestSyntheticReport({
      syntheticId: "syn-ux-designer",
      syntheticName: "UX Designer",
      summary: "Combat HUD should expose cooldowns, threats, and ally state clearly.",
      details: "Players lose coordination fast when combat information is visually noisy.",
      recommendation: "Programmer should keep HUD widgets modular and data-driven.",
      feasibility: 68,
      risk: 49,
      handoff: "Programmer should keep HUD widgets modular and data-driven.",
      upstreamContext: [
        '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
      ],
    }),
    "syn-game-programmer": createTestSyntheticReport({
      syntheticId: "syn-game-programmer",
      syntheticName: "Game Programmer",
      summary: "Implementation should isolate gameplay state from HUD rendering.",
      details: "A modular gameplay-to-UI boundary reduces refactor cost while design is still moving.",
      recommendation: "Start implementation with engine-facing combat and HUD contracts.",
      feasibility: 65,
      risk: 57,
      handoff: null,
      upstreamContext: [
        '{"syntheticId":"syn-game-designer","syntheticName":"Game Designer"}',
        '{"syntheticId":"syn-ux-designer","syntheticName":"UX Designer"}',
      ],
    }),
  }

  const summaryReport = buildRunSummaryReport({
    ideaPrompt: "Make a co-op action game with readable UI.",
    synthetics,
    edges,  // already includes GD↔GP tension edge from buildLinearGameDevGraph
    outputsBySyntheticId,
  })

  assert.deepEqual(
    summaryReport.executiveBrief.map((b) => b.sentence),
    [
      "Define a small replayable co-op combat loop first.",
      "Combat HUD should expose cooldowns, threats, and ally state clearly.",
      "Implementation should isolate gameplay state from HUD rendering.",
    ],
  )
  assert.deepEqual(summaryReport.actionItems, [
    "UX should make ally state and enemy threat readability immediate.",
    "Programmer should keep HUD widgets modular and data-driven.",
    "Start implementation with engine-facing combat and HUD contracts.",
  ])
  assert.equal(summaryReport.biggestConflict?.raisedBy, "syn-game-designer")
  assert.equal(summaryReport.conflictMap.length, 1)
  assert.equal(summaryReport.conflictMap[0]?.severity, "high")
  assert.equal(summaryReport.decisionMatrix.length, 0)
}

// ---------------------------------------------------------------------------
// Decision persistence across iterations
// ---------------------------------------------------------------------------
// Verifies that a user decision made in iteration 1:
// 1. Is accumulated into session.resolvedDecisions after the run
// 2. Appears as a PERMANENTLY RESOLVED DECISIONS block in every agent's
//    system prompt on iteration 2 (not just the targeted synthetic)
// 3. Is stripped from clarificationRequests / recommendedDecisions in the
//    output even if the model repeats it
// ---------------------------------------------------------------------------
async function runDecisionPersistenceAcrossIterationsTest(): Promise<void> {
  await withOperationalEnforcementMode("warn", async () => {
    const personas = await loadDefaultGameDevelopmentPersonas()
    const { synthetics, edges } = buildLinearGameDevGraph(personas)
    const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
    const session = thinkingGraphRepository.createSession({
      ideaPrompt: "Build a 2D platformer.",
      selectedPersonaIds: personas.map((p) => p.id),
      synthetics,
      edges,
      provider,
      orchestrator,
    })

    // ── Iteration 1: set a decision (Godot engine) and run all agents ───────
    const godotDecision: SyntheticPreparedDecision = {
      syntheticId: "syn-game-programmer",
      decisionTitle: "Engine choice",
      optionId: "godot",
      optionLabel: "Godot",
      optionDescription: "Open-source, lightweight, ideal for 2D indie projects.",
      appliedAt: new Date().toISOString(),
    }
    thinkingGraphRepository.setPreparedInputs(session.id, {
      decisions: [godotDecision],
      clarifications: [],
    })

    const iter1Outputs = [
      // GD output — still asks "which engine?" in clarificationRequests
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Define a compact platforming loop.",
          details: "Short levels with clear movement mechanics.",
          recommendation: "Pick an engine to start iterating.",
          handoff: "Pick an engine to start iterating.",
          operational: {
            syntheticId: "syn-game-designer",
            syntheticName: "Game Designer",
            domain: "gameplay",
            summary: "Define a compact platforming loop.",
            acceptedAssumptions: [],
            findings: ["Short levels improve replayability."],
            risks: ["Engine choice blocks iteration."],
            missingInformation: [],
            clarificationRequests: [
              {
                id: "engine_choice",
                question: "Which engine — Unity or Godot?",
                whyItMatters: "Affects the whole tech stack.",
                required: true,
              },
            ],
            recommendedDecisions: [
              {
                id: "engine_choice",
                title: "Engine choice",
                options: ["Unity", "Godot"],
                recommendedOption: "Godot",
                reason: "Godot is lighter for 2D.",
              },
            ],
            nextSteps: ["Select engine."],
            readiness: { canContinue: false, blocked: true, blockers: ["Engine not chosen."], status: "needs_clarification" },
            artifactsReady: [],
            handoff: null,
          },
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-ux-designer",
          syntheticName: "UX Designer",
          summary: "Surface player state and hazards clearly.",
          details: "Readability is key in fast-paced platformers.",
          recommendation: "Programmer implements HUD after engine is chosen.",
          handoff: "Programmer implements HUD after engine is chosen.",
          operational: {
            syntheticId: "syn-ux-designer",
            syntheticName: "UX Designer",
            domain: "ux",
            summary: "Surface player state and hazards clearly.",
            acceptedAssumptions: [],
            findings: ["Readable hazards reduce frustration."],
            risks: [],
            missingInformation: [],
            clarificationRequests: [],
            recommendedDecisions: [],
            nextSteps: ["Wait for engine selection."],
            readiness: { canContinue: true, blocked: false, blockers: [], status: "ready_for_next_node" },
            artifactsReady: [],
            handoff: null,
          },
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-programmer",
          syntheticName: "Game Programmer",
          summary: "Implement physics in Godot after engine is locked.",
          details: "Godot 2D physics is well-suited for this scope.",
          recommendation: "Start with CharacterBody2D.",
          handoff: null,
          operational: {
            syntheticId: "syn-game-programmer",
            syntheticName: "Game Programmer",
            domain: "engineering",
            summary: "Use Godot CharacterBody2D.",
            acceptedAssumptions: ["Godot is selected."],
            findings: ["CharacterBody2D handles 2D platformer physics."],
            risks: [],
            missingInformation: [],
            clarificationRequests: [],
            recommendedDecisions: [],
            nextSteps: ["Implement CharacterBody2D movement."],
            readiness: { canContinue: true, blocked: false, blockers: [], status: "ready_for_next_node" },
            artifactsReady: [],
            handoff: null,
          },
        }),
      ),
    ]

    const iter1Provider = new RecordingQueueModelProvider(iter1Outputs)
    const orchestratorIter1 = new AdkSyntheticOrchestrator(iter1Provider)
    const iter1Result = await orchestratorIter1.runChain({
      session: thinkingGraphRepository.getSession(session.id)!,
    })

    // Store outputs and accumulate resolved decisions (simulates service.ts post-run)
    for (const synthetic of synthetics) {
      const out = iter1Result.outputsBySyntheticId[synthetic.id]
      if (out) {
        thinkingGraphRepository.replaceSyntheticOutput(session.id, synthetic.id, out)
      }
    }
    const sessionAfterIter1 = thinkingGraphRepository.getSession(session.id)!
    thinkingGraphRepository.accumulateResolvedDecisions(
      session.id,
      sessionAfterIter1.preparedInputs.decisions,
    )
    thinkingGraphRepository.setPreparedInputs(session.id, { decisions: [], clarifications: [] })

    // ── Assert: resolvedDecisions is now populated ───────────────────────────
    const sessionWithResolved = thinkingGraphRepository.getSession(session.id)!
    assert.equal(sessionWithResolved.resolvedDecisions.length, 1)
    assert.equal(sessionWithResolved.resolvedDecisions[0]?.decisionTitle, "Engine choice")
    assert.equal(sessionWithResolved.resolvedDecisions[0]?.optionLabel, "Godot")

    // ── Iteration 2: model stubbornly re-raises the engine decision ──────────
    // Both GD and UX emit engine_choice in clarificationRequests/recommendedDecisions.
    // The system must strip these before they reach the caller, and the prompt
    // must contain the PERMANENTLY RESOLVED DECISIONS block.
    const iter2Outputs = [
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-designer",
          syntheticName: "Game Designer",
          summary: "Refine the platforming loop for Godot.",
          details: "Godot scene structure enables rapid prototyping.",
          recommendation: "Define level progression next.",
          handoff: "Define level progression next.",
          operational: {
            syntheticId: "syn-game-designer",
            syntheticName: "Game Designer",
            domain: "gameplay",
            summary: "Refine the platforming loop for Godot.",
            acceptedAssumptions: ["Godot is selected."],
            findings: ["Godot scenes suit modular level design."],
            risks: [],
            missingInformation: [],
            // Model still emits the resolved decision — should be stripped
            clarificationRequests: [
              {
                id: "engine_choice",
                question: "Which engine — Unity or Godot?",
                whyItMatters: "Affects the whole tech stack.",
                required: false,
              },
            ],
            recommendedDecisions: [
              {
                id: "engine_choice",
                title: "Engine choice",
                options: ["Unity", "Godot"],
                recommendedOption: "Godot",
                reason: "Still relevant.",
              },
            ],
            nextSteps: ["Define level progression."],
            readiness: { canContinue: true, blocked: false, blockers: [], status: "ready_for_next_node" },
            artifactsReady: [],
            handoff: null,
          },
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-ux-designer",
          syntheticName: "UX Designer",
          summary: "Design HUD for Godot 2D readability.",
          details: "Godot UI nodes simplify HUD layering.",
          recommendation: "Use CanvasLayer for HUD.",
          handoff: "Use CanvasLayer for HUD.",
          operational: {
            syntheticId: "syn-ux-designer",
            syntheticName: "UX Designer",
            domain: "ux",
            summary: "Design HUD for Godot 2D readability.",
            acceptedAssumptions: ["Godot selected."],
            findings: ["CanvasLayer isolates HUD from game world."],
            risks: [],
            missingInformation: [],
            // UX also re-raises engine decision — should be stripped
            clarificationRequests: [
              {
                id: "engine_choice",
                question: "Godot engine choice confirmed?",
                whyItMatters: "Changes toolchain.",
                required: false,
              },
            ],
            recommendedDecisions: [],
            nextSteps: ["Prototype CanvasLayer HUD."],
            readiness: { canContinue: true, blocked: false, blockers: [], status: "ready_for_next_node" },
            artifactsReady: [],
            handoff: null,
          },
        }),
      ),
      JSON.stringify(
        createTestSyntheticReport({
          syntheticId: "syn-game-programmer",
          syntheticName: "Game Programmer",
          summary: "Start CharacterBody2D implementation.",
          details: "Physics integration is straightforward in Godot.",
          recommendation: "Wire movement first.",
          handoff: null,
          operational: {
            syntheticId: "syn-game-programmer",
            syntheticName: "Game Programmer",
            domain: "engineering",
            summary: "CharacterBody2D movement implementation.",
            acceptedAssumptions: ["Godot confirmed."],
            findings: ["move_and_slide covers basic platformer needs."],
            risks: [],
            missingInformation: [],
            clarificationRequests: [],
            recommendedDecisions: [],
            nextSteps: ["Implement move_and_slide."],
            readiness: { canContinue: true, blocked: false, blockers: [], status: "ready_for_next_node" },
            artifactsReady: [],
            handoff: null,
          },
        }),
      ),
    ]

    const iter2Provider = new RecordingQueueModelProvider(iter2Outputs)
    const orchestratorIter2 = new AdkSyntheticOrchestrator(iter2Provider)
    const iter2Result = await orchestratorIter2.runChain({
      session: thinkingGraphRepository.getSession(session.id)!,
    })

    // ── Assert: prompts contain PERMANENTLY RESOLVED DECISIONS block ─────────
    const gdPrompt2 = iter2Provider.recordedInputs[0]?.messages[0]?.content ?? ""
    const uxPrompt2 = iter2Provider.recordedInputs[1]?.messages[0]?.content ?? ""
    const gpPrompt2 = iter2Provider.recordedInputs[2]?.messages[0]?.content ?? ""

    assert.match(gdPrompt2, /PERMANENTLY RESOLVED DECISIONS/)
    assert.match(gdPrompt2, /Engine choice/)
    assert.match(gdPrompt2, /Godot/)
    assert.match(uxPrompt2, /PERMANENTLY RESOLVED DECISIONS/)
    assert.match(uxPrompt2, /Engine choice/)
    assert.match(gpPrompt2, /PERMANENTLY RESOLVED DECISIONS/)

    // ── Assert: engine_choice stripped from GD output ────────────────────────
    const gdOut2 = iter2Result.outputsBySyntheticId["syn-game-designer"]
    assert.ok(gdOut2, "GD output must exist")
    const gdClarifications = gdOut2?.operational?.clarificationRequests ?? []
    assert.equal(
      gdClarifications.some((cr) => cr.id === "engine_choice"),
      false,
      "engine_choice must be stripped from GD clarificationRequests on iteration 2",
    )
    const gdDecisions = gdOut2?.operational?.recommendedDecisions ?? []
    assert.equal(
      gdDecisions.some((rd) => rd.id === "engine_choice"),
      false,
      "engine_choice must be stripped from GD recommendedDecisions on iteration 2",
    )

    // ── Assert: engine_choice stripped from UX output ────────────────────────
    const uxOut2 = iter2Result.outputsBySyntheticId["syn-ux-designer"]
    assert.ok(uxOut2, "UX output must exist")
    const uxClarifications = uxOut2?.operational?.clarificationRequests ?? []
    assert.equal(
      uxClarifications.some((cr) => cr.id === "engine_choice"),
      false,
      "engine_choice must be stripped from UX clarificationRequests on iteration 2",
    )

    // ── Assert: GP (the original target) has no engine decision leftovers ───
    const gpOut2 = iter2Result.outputsBySyntheticId["syn-game-programmer"]
    assert.ok(gpOut2, "GP output must exist")
    assert.equal(
      (gpOut2?.operational?.clarificationRequests ?? []).some((cr) => cr.id === "engine_choice"),
      false,
    )
  })
}

await runThinkingGraphServerIntegrationTest()
runThinkingGraphRuntimeConfigDefaultTest()
await runThinkingGraphAdkIntegrationTest()
await runThinkingGraphAdkFallbackParsingTest()
await runThinkingGraphOperationalRetryTest()
await runThinkingGraphLegacyOperationalRetryModeTest()
await runThinkingGraphSequentialContextTest()
await runThinkingGraphRerunUsesChatClarificationTest()
await runThinkingGraphConsumeAppliedChatSelectionTest()
await runThinkingGraphChatReplyTest()
await runOllamaStructuredTransportTest()
await runClaudeStructuredTransportTest()
await runClaudeSchemaSanitizationTest()
await runClaudeStructuredMaxTokensRetryTest()
await runThinkingGraphSummaryReportTest()
await runThinkingGraphOperationalCanonicalFlowTest()
await runDecisionPersistenceAcrossIterationsTest()
console.log("thinkingGraphServer.integration.test.ts: ok")
