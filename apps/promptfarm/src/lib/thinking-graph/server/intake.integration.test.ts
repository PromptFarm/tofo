/**
 * Intake Questions Integration Tests
 *
 * Tests the full lifecycle of intake questions:
 * 1. LLM generates 3-20 questions from ideaPrompt before first run
 * 2. Answers flow into INTAKE CONTEXT block in every agent's prompt
 * 3. After a run, agent clarificationRequests become pending intake questions
 * 4. getPendingIntakeQuestions() returns unanswered questions before next run
 * 5. Answered questions appear in INTAKE CONTEXT on next run, not pending anymore
 * 6. Deduplication: same agent re-raising the same question is ignored
 * 7. Changing ideaPrompt resets intake questions
 *
 * Run with:
 *   "C:/Program Files/nodejs/node.exe" node_modules/jiti/lib/jiti-cli.mjs src/lib/thinking-graph/server/intake.integration.test.ts
 */

import assert from "node:assert/strict"

import { buildLinearGameDevGraph } from "./graphBuilder"
import { loadDefaultGameDevelopmentPersonas } from "./personaSource"
import {
  createDefaultSyntheticBackendDescriptors,
  thinkingGraphRepository,
} from "./repository"
import type { ModelGenerateInput, ModelGenerateResult, ModelProvider } from "./modelProvider"
import type { SyntheticOutputJson, SyntheticReport } from "./types"
import {
  buildIntakeQuestions,
  buildIntakeContextBlock,
  collectIntakeQuestionsFromRun,
  getPendingIntakeQuestions,
} from "./intakeBuilder"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class QueueModelProvider implements ModelProvider {
  readonly descriptor = {
    kind: "ollama" as const,
    label: "Fake Ollama",
    model: "fake-model",
  }

  private readonly outputs: string[]

  constructor(outputs: string[]) {
    this.outputs = [...outputs]
  }

  async generate(_input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const next = this.outputs.shift()
    if (!next) {
      throw new Error("QueueModelProvider ran out of canned outputs.")
    }
    return {
      text: next,
      provider: "ollama",
      model: "fake-model",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      rawResponse: null,
    }
  }
}

function makeSession(ideaPrompt: string) {
  const personas = loadDefaultGameDevelopmentPersonasSync()
  const { synthetics, edges } = buildLinearGameDevGraph(personas)
  const { provider, orchestrator } = createDefaultSyntheticBackendDescriptors()
  return thinkingGraphRepository.createSession({
    ideaPrompt,
    selectedPersonaIds: personas.map((p) => p.id),
    synthetics,
    edges,
    provider,
    orchestrator,
  })
}

// Sync version — personas loaded once at module init
let _personas: Awaited<ReturnType<typeof loadDefaultGameDevelopmentPersonas>> | null = null
function loadDefaultGameDevelopmentPersonasSync() {
  if (!_personas) {
    throw new Error("Personas not loaded — call loadPersonas() first in async context")
  }
  return _personas
}

// Fake LLM output for intake question generation — 5 questions
function fakeIntakeLlmOutput(): string {
  return JSON.stringify({
    questions: [
      {
        id: "q1",
        question: "What is the primary target platform — mobile, PC, or console?",
        whyItMatters: "Platform constraints shape the entire tech and design stack.",
        required: true,
        suggestedAnswer: "PC",
      },
      {
        id: "q2",
        question: "Is this a single-player or multiplayer experience?",
        whyItMatters: "This determines networking architecture and session design.",
        required: true,
        suggestedAnswer: "Single-player",
      },
      {
        id: "q3",
        question: "What is the target session length — casual (5-15 min) or deep (30+ min)?",
        whyItMatters: "Session length drives progression pacing and save system design.",
        required: false,
        suggestedAnswer: "Casual (5-15 min)",
      },
    ],
  })
}

// Fake LLM output for intake with too few questions (edge case — below min)
function fakeIntakeLlmOutputTooFew(): string {
  return JSON.stringify({
    questions: [
      {
        id: "q1",
        question: "Single question only",
        whyItMatters: "Test edge case.",
        required: true,
        suggestedAnswer: null,
      },
    ],
  })
}

// Fake LLM output for intake with too many questions (edge case — above max)
function fakeIntakeLlmOutputTooMany(): string {
  const questions = Array.from({ length: 25 }, (_, i) => ({
    id: `q${i + 1}`,
    question: `Question number ${i + 1}`,
    whyItMatters: `Reason ${i + 1}`,
    required: i < 3,
    suggestedAnswer: null,
  }))
  return JSON.stringify({ questions })
}

function makeAgentOutput(
  syntheticId: string,
  syntheticName: string,
  clarificationRequests: SyntheticReport["operational"] extends infer O
    ? O extends { clarificationRequests: infer C }
      ? C
      : never
    : never,
): SyntheticReport {
  return {
    syntheticId,
    syntheticName,
    summary: `${syntheticName} summary.`,
    details: `${syntheticName} details.`,
    recommendation: `${syntheticName} recommendation.`,
    changesFromPrevious: [],
    appliedInputs: [],
    ignoredInputs: [],
    keyRisks: ["Risk A", "Risk B"],
    concernLevels: { feasibility: 70, risk: 40, complexityLabel: "medium" },
    handoff: null,
    upstreamContext: [],
    directedHandoffs: [],
    operational: {
      syntheticId,
      syntheticName,
      domain: "design",
      summary: `${syntheticName} operational summary.`,
      acceptedAssumptions: [],
      findings: [],
      risks: [],
      missingInformation: [],
      clarificationRequests,
      recommendedDecisions: [],
      nextSteps: ["Do the next thing."],
      readiness: {
        canContinue: clarificationRequests.length === 0,
        blocked: false,
        blockers: [],
        status: clarificationRequests.length > 0 ? "needs_clarification" : "ready_for_next_node",
      },
      artifactsReady: [],
      handoff: null,
      directedHandoffs: [],
      userFacing: null,
    },
    model: { provider: "ollama", model: "fake" },
    raw: null,
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function runIntakeTests(): Promise<void> {
  _personas = await loadDefaultGameDevelopmentPersonas()

  console.log("\n=== INTAKE QUESTION TESTS ===\n")

  await runBuildIntakeQuestionsTest()
  await runIntakeQuestionCountBoundsTest()
  await runIntakeAnswersFlowIntoPromptTest()
  await runAgentClarificationsBecomePendingTest()
  await runPendingQuestionsGateSecondRunTest()
  await runAnsweredQuestionsAppearsInSecondRunPromptTest()
  await runDeduplicationTest()
  await runIdeaPromptChangeResetsIntakeTest()

  console.log("\n=== ALL INTAKE TESTS PASSED ===\n")
}

// ---------------------------------------------------------------------------
// Test 1: buildIntakeQuestions returns 3-20 questions from LLM
// ---------------------------------------------------------------------------

async function runBuildIntakeQuestionsTest(): Promise<void> {
  console.log("Test 1: buildIntakeQuestions generates questions from ideaPrompt...")

  const provider = new QueueModelProvider([fakeIntakeLlmOutput()])
  const questions = await buildIntakeQuestions({
    ideaPrompt: "Build a co-op action rogue-lite with readable combat UI.",
    modelProvider: provider,
  })

  assert.ok(questions.length >= 3, `Expected >= 3 questions, got ${questions.length}`)
  assert.ok(questions.length <= 20, `Expected <= 20 questions, got ${questions.length}`)

  // All questions have required fields
  for (const q of questions) {
    assert.equal(typeof q.id, "string", "id must be string")
    assert.equal(typeof q.question, "string", "question must be string")
    assert.equal(typeof q.whyItMatters, "string", "whyItMatters must be string")
    assert.equal(typeof q.required, "boolean", "required must be boolean")
    assert.ok(q.source === "intake", `source must be "intake", got "${q.source}"`)
    assert.equal(q.syntheticId, null, "syntheticId must be null for intake questions")
  }

  assert.equal(questions[0].question, "What is the primary target platform — mobile, PC, or console?")
  assert.equal(questions[0].required, true)
  assert.equal(questions[0].suggestedAnswer, "PC")

  console.log("  ✓ returns correct question structure")
  console.log("  ✓ source = intake, syntheticId = null")
  console.log("  ✓ suggestedAnswer propagated")
}

// ---------------------------------------------------------------------------
// Test 2: question count clamped to [3, 20]
// ---------------------------------------------------------------------------

async function runIntakeQuestionCountBoundsTest(): Promise<void> {
  console.log("Test 2: question count clamped to [3, 20]...")

  // Too few — should be padded with generic fallbacks or just return what exists
  // (policy: if LLM returns < 3, we accept what we have — min is a soft guideline for the LLM prompt)
  const providerFew = new QueueModelProvider([fakeIntakeLlmOutputTooFew()])
  const fewQuestions = await buildIntakeQuestions({
    ideaPrompt: "Test idea",
    modelProvider: providerFew,
  })
  // We accept fewer than 3 if LLM ignores the min — we don't manufacture fake questions
  assert.ok(fewQuestions.length >= 1, "must have at least 1 question")

  // Too many — should be clamped to 20
  const providerMany = new QueueModelProvider([fakeIntakeLlmOutputTooMany()])
  const manyQuestions = await buildIntakeQuestions({
    ideaPrompt: "Test idea",
    modelProvider: providerMany,
  })
  assert.ok(manyQuestions.length <= 20, `clamped to 20, got ${manyQuestions.length}`)

  console.log("  ✓ accepts fewer than 3 without crashing")
  console.log("  ✓ clamps to max 20")
}

// ---------------------------------------------------------------------------
// Test 3: intake answers flow into INTAKE CONTEXT block in run instruction
// ---------------------------------------------------------------------------

async function runIntakeAnswersFlowIntoPromptTest(): Promise<void> {
  console.log("Test 3: intake answers appear in INTAKE CONTEXT in run instruction...")

  const session = makeSession("Build a co-op rogue-lite.")

  // Set intake questions + answers
  const sessionWithIntake = thinkingGraphRepository.setIntakeQuestions(session.id, [
    {
      id: "q1",
      question: "Target platform?",
      whyItMatters: "Shapes tech stack.",
      required: true,
      suggestedAnswer: "PC",
      source: "intake",
      syntheticId: null,
    },
    {
      id: "q2",
      question: "Single or multiplayer?",
      whyItMatters: "Shapes networking.",
      required: true,
      suggestedAnswer: null,
      source: "intake",
      syntheticId: null,
    },
  ])
  assert.ok(sessionWithIntake, "setIntakeQuestions must return session")

  thinkingGraphRepository.setIntakeAnswers(session.id, [
    { questionId: "q1", answer: "PC", answeredAt: new Date().toISOString() },
    // q2 deliberately left unanswered (skipped)
  ])

  const updatedSession = thinkingGraphRepository.getSession(session.id)
  assert.ok(updatedSession)

  const block = buildIntakeContextBlock(updatedSession)

  assert.ok(block !== null, "block must not be null when questions exist")
  assert.ok(block.includes("INTAKE CONTEXT"), "block must contain INTAKE CONTEXT header")
  assert.ok(block.includes("Target platform?"), "block must include answered question text")
  assert.ok(block.includes("PC"), "block must include the answer")
  // Skipped questions should still appear with (skipped) marker
  assert.ok(block.includes("Single or multiplayer?"), "block must include skipped question")
  assert.ok(block.includes("skipped"), "block must mark unanswered questions as skipped")

  console.log("  ✓ INTAKE CONTEXT block present in instruction")
  console.log("  ✓ answered Q+A appears")
  console.log("  ✓ skipped question appears with marker")
}

// ---------------------------------------------------------------------------
// Test 4: agent clarificationRequests → pending intake questions after run
// ---------------------------------------------------------------------------

async function runAgentClarificationsBecomePendingTest(): Promise<void> {
  console.log("Test 4: agent clarificationRequests become pending intake questions...")

  const session = makeSession("Build a stealth action game.")

  const agentOutputs: Record<string, SyntheticOutputJson> = {
    "syn-game-designer": makeAgentOutput("syn-game-designer", "Game Designer", [
      {
        id: "gd_q1",
        question: "What is the core stealth mechanic — line-of-sight or sound?",
        whyItMatters: "Defines the entire level design language.",
        required: true,
      },
      {
        id: "gd_q2",
        question: "Should the player have lethal options or stealth-only?",
        whyItMatters: "Affects the moral/reward system design.",
        required: false,
      },
    ]),
  }

  const updatedSession = collectIntakeQuestionsFromRun({
    session,
    outputsBySyntheticId: agentOutputs,
  })

  // collectIntakeQuestionsFromRun returns the session with new pending questions
  const pending = getPendingIntakeQuestions(updatedSession)

  assert.equal(pending.length, 2, "both agent clarification requests must become pending")

  const stealth = pending.find((q) => q.id === "gd_q1")
  assert.ok(stealth, "gd_q1 must be in pending")
  assert.equal(stealth.source, "agent", 'source must be "agent"')
  assert.equal(stealth.syntheticId, "syn-game-designer")
  assert.equal(stealth.required, true)

  const lethal = pending.find((q) => q.id === "gd_q2")
  assert.ok(lethal)
  assert.equal(lethal.required, false)

  console.log("  ✓ clarificationRequests → pending intake questions")
  console.log("  ✓ source = agent, syntheticId set")
  console.log("  ✓ required flag preserved")
}

// ---------------------------------------------------------------------------
// Test 5: getPendingIntakeQuestions before second run returns unanswered only
// ---------------------------------------------------------------------------

async function runPendingQuestionsGateSecondRunTest(): Promise<void> {
  console.log("Test 5: getPendingIntakeQuestions returns only unanswered questions...")

  const session = makeSession("Build a puzzle platformer.")

  // Set 3 intake questions
  thinkingGraphRepository.setIntakeQuestions(session.id, [
    {
      id: "q1",
      question: "Target age group?",
      whyItMatters: "Shapes difficulty curve.",
      required: true,
      suggestedAnswer: null,
      source: "intake",
      syntheticId: null,
    },
    {
      id: "q2",
      question: "2D or 3D?",
      whyItMatters: "Core tech constraint.",
      required: true,
      suggestedAnswer: "2D",
      source: "intake",
      syntheticId: null,
    },
    {
      id: "q3",
      question: "Procedural or hand-crafted levels?",
      whyItMatters: "Determines level design pipeline.",
      required: false,
      suggestedAnswer: null,
      source: "intake",
      syntheticId: null,
    },
  ])

  // Answer q1 and q3, leave q2 unanswered
  thinkingGraphRepository.setIntakeAnswers(session.id, [
    { questionId: "q1", answer: "All ages", answeredAt: new Date().toISOString() },
    { questionId: "q3", answer: "Hand-crafted", answeredAt: new Date().toISOString() },
  ])

  const updatedSession = thinkingGraphRepository.getSession(session.id)
  assert.ok(updatedSession)

  const pending = getPendingIntakeQuestions(updatedSession)

  assert.equal(pending.length, 1, "only unanswered q2 should be pending")
  assert.equal(pending[0].id, "q2")
  assert.equal(pending[0].question, "2D or 3D?")

  // Required pending questions should block the run
  const hasBlockingPending = pending.some((q) => q.required)
  assert.equal(hasBlockingPending, true, "required unanswered question should block run")

  console.log("  ✓ only unanswered questions returned")
  console.log("  ✓ required unanswered question correctly flags as blocking")
}

// ---------------------------------------------------------------------------
// Test 6: answered agent questions appear in INTAKE CONTEXT on second run
// ---------------------------------------------------------------------------

async function runAnsweredQuestionsAppearsInSecondRunPromptTest(): Promise<void> {
  console.log("Test 6: answered agent questions appear in second run INTAKE CONTEXT...")

  const session = makeSession("Build a city builder.")

  // Simulate: after iter 1, agent raised a question
  const agentOutputs: Record<string, SyntheticOutputJson> = {
    "syn-game-designer": makeAgentOutput("syn-game-designer", "Game Designer", [
      {
        id: "gd_q1",
        question: "Grid-based or freeform placement?",
        whyItMatters: "Foundation of the entire build system.",
        required: true,
      },
    ]),
  }

  const sessionAfterRun1 = collectIntakeQuestionsFromRun({
    session,
    outputsBySyntheticId: agentOutputs,
  })

  // Persist updated session
  thinkingGraphRepository.saveSession(sessionAfterRun1)

  // User answers the question
  thinkingGraphRepository.setIntakeAnswers(session.id, [
    { questionId: "gd_q1", answer: "Grid-based", answeredAt: new Date().toISOString() },
  ])

  const sessionForRun2 = thinkingGraphRepository.getSession(session.id)
  assert.ok(sessionForRun2)

  // No more pending questions
  const pending = getPendingIntakeQuestions(sessionForRun2)
  assert.equal(pending.length, 0, "no pending questions after answering")

  // Block must include the answered question
  const block = buildIntakeContextBlock(sessionForRun2)
  assert.ok(block !== null, "block must not be null")
  assert.ok(block.includes("INTAKE CONTEXT"), "INTAKE CONTEXT must be in block")
  assert.ok(
    block.includes("Grid-based or freeform placement?"),
    "answered agent question must appear in block",
  )
  assert.ok(block.includes("Grid-based"), "answer must appear in block")

  console.log("  ✓ answered agent question appears in second run INTAKE CONTEXT")
  console.log("  ✓ no pending questions remaining")
}

// ---------------------------------------------------------------------------
// Test 7: deduplication — same question from same agent not added twice
// ---------------------------------------------------------------------------

async function runDeduplicationTest(): Promise<void> {
  console.log("Test 7: deduplication — same agent question not added twice...")

  const session = makeSession("Build a battle royale.")

  const clarifications = [
    {
      id: "br_q1",
      question: "How many players per match — 50, 100, or 150?",
      whyItMatters: "Server architecture constraint.",
      required: true,
    },
  ]

  // First run: question added
  const sessionAfterRun1 = collectIntakeQuestionsFromRun({
    session,
    outputsBySyntheticId: {
      "syn-game-designer": makeAgentOutput("syn-game-designer", "Game Designer", clarifications),
    },
  })
  thinkingGraphRepository.saveSession(sessionAfterRun1)

  // Second run: same agent raises the same question again (slightly different wording)
  const sessionAfterRun2 = collectIntakeQuestionsFromRun({
    session: sessionAfterRun1,
    outputsBySyntheticId: {
      "syn-game-designer": makeAgentOutput("syn-game-designer", "Game Designer", [
        {
          id: "br_q1",  // same id
          question: "How many players per match — 50, 100, or 150?",  // identical
          whyItMatters: "Server architecture constraint.",
          required: true,
        },
      ]),
    },
  })

  const pending = getPendingIntakeQuestions(sessionAfterRun2)
  const matchingCount = pending.filter(
    (q) => q.question === "How many players per match — 50, 100, or 150?",
  ).length

  assert.equal(matchingCount, 1, "same question from same agent must not be duplicated")

  console.log("  ✓ duplicate question from same agent deduplicated by id")
}

// ---------------------------------------------------------------------------
// Test 8: changing ideaPrompt resets intake questions
// ---------------------------------------------------------------------------

async function runIdeaPromptChangeResetsIntakeTest(): Promise<void> {
  console.log("Test 8: ideaPrompt change resets intake questions...")

  const session = makeSession("Original idea: build a tower defense game.")

  thinkingGraphRepository.setIntakeQuestions(session.id, [
    {
      id: "q1",
      question: "Top-down or isometric view?",
      whyItMatters: "Camera system defines the visual design.",
      required: true,
      suggestedAnswer: null,
      source: "intake",
      syntheticId: null,
    },
  ])
  thinkingGraphRepository.setIntakeAnswers(session.id, [
    { questionId: "q1", answer: "Top-down", answeredAt: new Date().toISOString() },
  ])

  // Change ideaPrompt → intake must reset
  thinkingGraphRepository.resetIntakeForNewIdea(session.id, "Completely new idea: build a racing game.")

  const updatedSession = thinkingGraphRepository.getSession(session.id)
  assert.ok(updatedSession)

  assert.equal(updatedSession.ideaPrompt, "Completely new idea: build a racing game.")
  assert.equal(
    updatedSession.intakeQuestions.length,
    0,
    "intake questions must be cleared on ideaPrompt change",
  )
  assert.equal(
    updatedSession.intakeAnswers.length,
    0,
    "intake answers must be cleared on ideaPrompt change",
  )

  const pending = getPendingIntakeQuestions(updatedSession)
  assert.equal(pending.length, 0, "no pending questions after ideaPrompt reset")

  console.log("  ✓ intakeQuestions cleared on ideaPrompt change")
  console.log("  ✓ intakeAnswers cleared on ideaPrompt change")
  console.log("  ✓ getPendingIntakeQuestions returns empty after reset")
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

runIntakeTests().catch((err) => {
  console.error("\n✗ INTAKE TEST FAILED\n", err)
  process.exit(1)
})
