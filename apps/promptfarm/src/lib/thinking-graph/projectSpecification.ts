import type { SyntheticEdge, SyntheticNode } from "@/lib/planning/types"

import { assessProjectReadiness } from "./projectReadiness"
import {
  expandDelimitedListText,
  formatPreparedClarificationHeader,
  formatPreparedDecisionSpecLine,
} from "./userFacingPresentation"
import type {
  ClosedDecision,
  ProjectSpec,
  RunSummaryReport,
  SpecSection,
  SyntheticOutputJson,
  SyntheticReport,
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
} from "./server/types"

type SyntheticReportWithOperational = SyntheticReport & {
  operational: NonNullable<SyntheticReport["operational"]>
}

export type WorkingContextSection = {
  title: string
  items: string[]
}

function hasOperational(
  output: SyntheticOutputJson | null | undefined,
): output is SyntheticReportWithOperational {
  return Boolean(output && "details" in output && output.operational)
}

function getUserFacingBlock(
  output: SyntheticOutputJson | null | undefined,
) {
  return hasOperational(output) ? output.operational.userFacing ?? null : null
}

function getOutputSummary(
  output: SyntheticOutputJson,
): string {
  return "kind" in output ? output.topRecommendation : output.summary
}

function getOutputRecommendation(
  output: SyntheticOutputJson,
): string {
  if ("kind" in output) {
    return output.strategicOptions[0]?.rationale ?? output.topRecommendation
  }

  return output.recommendation
}

function pushAppliedContext(lines: string[], input: {
  appliedDecisions: SyntheticPreparedDecision[]
  appliedStructuredClarifications: SyntheticPreparedClarification[]
}) {
  if (
    input.appliedDecisions.length === 0 &&
    input.appliedStructuredClarifications.length === 0
  ) {
    return
  }

  lines.push("")
  lines.push("### Applied Context")
  input.appliedDecisions.forEach((item) => lines.push(formatPreparedDecisionSpecLine(item)))
  input.appliedStructuredClarifications.forEach((item) => {
    lines.push(`- ${formatPreparedClarificationHeader(item)}`)
    item.answers.forEach((answer) =>
      lines.push(`  - ${answer.questionLabel}: ${answer.answer}`),
    )
  })
}

function findPrimaryUserFacingBlock(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
) {
  const outputs = Object.values(outputsBySyntheticId).filter(
    (output): output is SyntheticReportWithOperational =>
      Boolean(getUserFacingBlock(output)),
  )

  return (
    outputs.find(
      (output) =>
        getUserFacingBlock(output)?.state === "user_input_required" ||
        getUserFacingBlock(output)?.state === "decision_required",
    ) ??
    outputs.find((output) => getUserFacingBlock(output)?.state === "conflict") ??
    outputs[0] ??
    null
  )
}

export function buildProjectSpecificationText(input: {
  ideaPrompt: string
  appliedChatDigest: string[]
  appliedDecisions?: SyntheticPreparedDecision[]
  appliedStructuredClarifications?: SyntheticPreparedClarification[]
  summaryReport: RunSummaryReport
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
}): string {
  const readiness = assessProjectReadiness(input.outputsBySyntheticId)
  const primaryUserFacing = findPrimaryUserFacingBlock(input.outputsBySyntheticId)
  const lines: string[] = []
  const appliedDecisions = input.appliedDecisions ?? []
  const appliedStructuredClarifications =
    input.appliedStructuredClarifications ?? []

  const recommendedDirections = uniqueRecommendedDirections(input.outputsBySyntheticId)
  const openQuestions = uniqueOpenQuestions(input.outputsBySyntheticId)
  const currentMoves = uniqueWhatCanProceedNow(input.outputsBySyntheticId, input.summaryReport)
  const familyMoves = input.summaryReport.decisionFamilies.map((family) =>
    family.recommendedOptionLabel
      ? `${family.familyTitle}: prefer ${family.recommendedOptionLabel}`
      : family.familyTitle,
  )

  lines.push("# Working Context")
  lines.push("")
  lines.push("## Context Status")
  if (getUserFacingBlock(primaryUserFacing)?.state === "user_input_required") {
    const block = getUserFacingBlock(primaryUserFacing)!
    lines.push("needs user input before the next run can continue cleanly")
    lines.push("")
    lines.push("### Summary")
    lines.push(block.summary)
    if (block.whatWeKnow.length > 0) {
      lines.push("")
      lines.push("### What We Know")
      block.whatWeKnow.forEach((item) => lines.push(`- ${item.label}: ${item.value}`))
    }
    if (block.whatIsNeededNow.length > 0) {
      lines.push("")
      lines.push("### What Is Needed Now")
      block.whatIsNeededNow.forEach((item) =>
        expandDelimitedListText(item).forEach((entry) => lines.push(`- ${entry}`)),
      )
    }
    if (block.questions.length > 0) {
      lines.push("")
      lines.push("### Open Questions")
      block.questions.forEach((item) => {
        lines.push(`- ${item.question}`)
        lines.push(`  Why it matters: ${item.whyItMatters}`)
        if (item.suggestedAnswer) {
          lines.push(`  Suggested default: ${item.suggestedAnswer}`)
        }
      })
    }
    if (recommendedDirections.length > 0) {
      lines.push("")
      lines.push("### Recommended Directions")
      recommendedDirections.forEach((item) => lines.push(`- ${item}`))
    }
    if (currentMoves.length > 0) {
      lines.push("")
      lines.push("### What Can Be Done Now")
      currentMoves.forEach((item) => lines.push(`- ${item}`))
    }
    if (familyMoves.length > 0) {
      lines.push("")
      lines.push("### Decision Families")
      familyMoves.forEach((item) => lines.push(`- ${item}`))
    }
    pushAppliedContext(lines, {
      appliedDecisions,
      appliedStructuredClarifications,
    })
    return lines.join("\n")
  }

  if (getUserFacingBlock(primaryUserFacing)?.state === "decision_required") {
    const block = getUserFacingBlock(primaryUserFacing)!
    lines.push("needs one user decision before the next run can continue cleanly")
    lines.push("")
    lines.push("### Summary")
    lines.push(block.summary)
    if (block.options.length > 0) {
      lines.push("")
      lines.push("### Decision Options")
      block.options.forEach((item) => {
        lines.push(
          `- ${item.label}${item.recommended ? " (recommended)" : ""}: ${item.summary}`,
        )
      })
    }
    if (recommendedDirections.length > 0) {
      lines.push("")
      lines.push("### Recommended Directions")
      recommendedDirections.forEach((item) => lines.push(`- ${item}`))
    }
    if (currentMoves.length > 0) {
      lines.push("")
      lines.push("### What Can Be Done Now")
      currentMoves.forEach((item) => lines.push(`- ${item}`))
    }
    if (familyMoves.length > 0) {
      lines.push("")
      lines.push("### Decision Families")
      familyMoves.forEach((item) => lines.push(`- ${item}`))
    }
    pushAppliedContext(lines, {
      appliedDecisions,
      appliedStructuredClarifications,
    })
    return lines.join("\n")
  }

  if (readiness.status === "blocked") {
    lines.push("blocked by missing inputs")
    if (readiness.blockers.length > 0) {
      lines.push("")
      lines.push("### Blockers")
      readiness.blockers.forEach((item) => lines.push(`- ${item}`))
    }
    if (openQuestions.length > 0) {
      lines.push("")
      lines.push("### Open Questions")
      openQuestions.forEach((item) => lines.push(`- ${item}`))
    }
    if (recommendedDirections.length > 0) {
      lines.push("")
      lines.push("### Recommended Directions")
      recommendedDirections.forEach((item) => lines.push(`- ${item}`))
    }
    pushAppliedContext(lines, {
      appliedDecisions,
      appliedStructuredClarifications,
    })
    return lines.join("\n")
  }
  if (readiness.status === "needs_clarification") {
    lines.push("needs clarification before the next run can continue cleanly")
    lines.push("")
    lines.push("### Open Questions")
    if (openQuestions.length === 0) {
      lines.push("- Clarification is still required.")
    } else {
      openQuestions.forEach((item) => lines.push(`- ${item}`))
    }
    if (recommendedDirections.length > 0) {
      lines.push("")
      lines.push("### Recommended Directions")
      recommendedDirections.forEach((item) => lines.push(`- ${item}`))
    }
    if (readiness.artifactsReady.length > 0) {
      lines.push("")
      lines.push("### Partial Artifacts Ready")
      readiness.artifactsReady.forEach((item) => lines.push(`- ${item}`))
    }
    pushAppliedContext(lines, {
      appliedDecisions,
      appliedStructuredClarifications,
    })
    return lines.join("\n")
  }

  lines.push(
    readiness.status === "partial"
      ? "provisional"
      : "ready",
  )
  lines.push("")
  lines.push("## What We Are Building")
  lines.push(input.ideaPrompt || "No prompt available.")
  if (recommendedDirections.length > 0) {
    lines.push("")
    lines.push("## Recommended Directions")
    recommendedDirections.forEach((item) => lines.push(`- ${item}`))
  }
  if (openQuestions.length > 0) {
    lines.push("")
    lines.push("## Open Questions")
    openQuestions.forEach((item) => lines.push(`- ${item}`))
  }
  if (currentMoves.length > 0) {
    lines.push("")
    lines.push("## What Can Be Done Now")
    currentMoves.forEach((item) => lines.push(`- ${item}`))
  }
  if (familyMoves.length > 0) {
    lines.push("")
    lines.push("## Decision Families")
    familyMoves.forEach((item) => lines.push(`- ${item}`))
  }
  lines.push("")
  lines.push("## Applied Structured Decisions")
  if (appliedDecisions.length === 0) {
    lines.push("- None pinned.")
  } else {
    appliedDecisions.forEach((item) =>
      lines.push(`- ${formatPreparedDecisionSpecLine(item).replace(/^- Decision: /, "")}`),
    )
  }
  lines.push("")
  lines.push("## Applied Structured Clarifications")
  if (appliedStructuredClarifications.length === 0) {
    lines.push("- None pinned.")
  } else {
    appliedStructuredClarifications.forEach((item) => {
      lines.push(`- ${formatPreparedClarificationHeader(item)}`)
      item.answers.forEach((answer) =>
        lines.push(`  - ${answer.questionLabel}: ${answer.answer}`),
      )
    })
  }
  lines.push("")
  lines.push("## Applied Chat Clarifications")
  if (input.appliedChatDigest.length === 0) {
    lines.push("- None pinned.")
  } else {
    input.appliedChatDigest.forEach((line) => lines.push(`- ${line}`))
  }
  lines.push("")
  lines.push("## Executive Brief")
  if (input.summaryReport.executiveBrief.length === 0) {
    lines.push("- None.")
  } else {
    input.summaryReport.executiveBrief.forEach(({ sentence }) => lines.push(`- ${sentence}`))
  }
  lines.push("")
  lines.push("## Action Items")
  if (input.summaryReport.actionItems.length === 0) {
    lines.push("- None.")
  } else {
    input.summaryReport.actionItems.forEach((line) => lines.push(`- ${line}`))
  }
  lines.push("")
  lines.push("## Primary Conflict")
  if (input.summaryReport.biggestConflict) {
    lines.push(`- Title: ${input.summaryReport.biggestConflict.title}`)
    lines.push(`- Raised by: ${input.summaryReport.biggestConflict.raisedBy ?? "system"}`)
    lines.push(`- Description: ${input.summaryReport.biggestConflict.description}`)
    lines.push(`- Suggested path: ${input.summaryReport.biggestConflict.suggestion}`)
  } else {
    lines.push("- No primary conflict detected.")
  }
  lines.push("")
  lines.push("## Agents")
  input.synthetics.forEach((synthetic) => {
    lines.push(`- ${synthetic.id} (${synthetic.code}) ${synthetic.name}`)
    lines.push(`  Role: ${synthetic.role}`)
  })
  lines.push("")
  lines.push("## Dependency Graph")
  if (input.edges.length === 0) {
    lines.push("- No edges configured.")
  } else {
    input.edges.forEach((edge) => {
      lines.push(`- ${edge.from} -> ${edge.to} [${edge.type}]`)
    })
  }
  lines.push("")
  lines.push("## Agent Outputs")
  input.synthetics.forEach((synthetic) => {
    const output = input.outputsBySyntheticId[synthetic.id]
    lines.push(`### ${synthetic.name} (${synthetic.id})`)
    if (!output) {
      lines.push("- No output available.")
      lines.push("")
      return
    }
    lines.push(`- Summary: ${getOutputSummary(output)}`)
    lines.push(`- Recommendation: ${getOutputRecommendation(output)}`)
    if (!("kind" in output)) {
      lines.push(
        `- Concern: feasibility ${output.concernLevels.feasibility}% | risk ${output.concernLevels.risk}% | complexity ${output.concernLevels.complexityLabel}`,
      )
    }
    if (!("kind" in output) && output.keyRisks.length > 0) {
      lines.push("- Key risks:")
      output.keyRisks.forEach((risk) => lines.push(`  - ${risk}`))
    }
    lines.push("")
  })

  return lines.join("\n")
}

export function buildWorkingContextSections(input: {
  ideaPrompt: string
  appliedChatDigest: string[]
  appliedDecisions?: SyntheticPreparedDecision[]
  appliedStructuredClarifications?: SyntheticPreparedClarification[]
  summaryReport: RunSummaryReport
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
}): WorkingContextSection[] {
  const readiness = assessProjectReadiness(input.outputsBySyntheticId)
  const primaryUserFacing = findPrimaryUserFacingBlock(input.outputsBySyntheticId)
  const appliedDecisions = input.appliedDecisions ?? []
  const appliedStructuredClarifications =
    input.appliedStructuredClarifications ?? []
  const recommendedDirections = uniqueRecommendedDirections(input.outputsBySyntheticId)
  const openQuestions = uniqueOpenQuestions(input.outputsBySyntheticId)
  const currentMoves = uniqueWhatCanProceedNow(input.outputsBySyntheticId, input.summaryReport)
  const familyMoves = input.summaryReport.decisionFamilies.map((family) =>
    family.recommendedOptionLabel
      ? `${family.familyTitle}: prefer ${family.recommendedOptionLabel}`
      : family.familyTitle,
  )

  const sections: WorkingContextSection[] = [
    {
      title: "What We Are Building",
      items: [input.ideaPrompt || "No prompt available."],
    },
  ]

  const primaryUserFacingBlock = getUserFacingBlock(primaryUserFacing)

  if (primaryUserFacingBlock) {
    const block = primaryUserFacingBlock
    sections.push({
      title: "Current Status",
      items: [block.summary],
    })
    if (block.whatWeKnow.length > 0) {
      sections.push({
        title: "What We Know",
        items: block.whatWeKnow.map((item) => `${item.label}: ${item.value}`),
      })
    }
    if (block.whatIsNeededNow.length > 0) {
      sections.push({
        title: "What Is Needed Now",
        items: block.whatIsNeededNow.flatMap((item) => expandDelimitedListText(item)),
      })
    }
    if (block.questions.length > 0) {
      sections.push({
        title: "Open Questions",
        items: block.questions.map((item) =>
          item.suggestedAnswer
            ? `${item.question} Why it matters: ${item.whyItMatters} Suggested default: ${item.suggestedAnswer}`
            : `${item.question} Why it matters: ${item.whyItMatters}`,
        ),
      })
    }
    if (block.options.length > 0) {
      sections.push({
        title: "Decision Options",
        items: block.options.map((item) =>
          `${item.label}${item.recommended ? " (recommended)" : ""}: ${item.summary}`,
        ),
      })
    }
  } else if (readiness.blockers.length > 0) {
    sections.push({
      title: "Blockers",
      items: readiness.blockers,
    })
  }

  if (recommendedDirections.length > 0) {
    sections.push({
      title: "Recommended Directions",
      items: recommendedDirections,
    })
  }
  if (currentMoves.length > 0) {
    sections.push({
      title: "What Can Be Done Now",
      items: currentMoves,
    })
  }
  if (familyMoves.length > 0) {
    sections.push({
      title: "Decision Families",
      items: familyMoves,
    })
  }
  if (
    appliedDecisions.length > 0 ||
    appliedStructuredClarifications.length > 0 ||
    input.appliedChatDigest.length > 0
  ) {
    sections.push({
      title: "Applied Context",
      items: [
        ...appliedDecisions.map((item) => formatPreparedDecisionSpecLine(item).replace(/^- /, "")),
        ...appliedStructuredClarifications.flatMap((item) => [
          formatPreparedClarificationHeader(item),
          ...item.answers.map((answer) => `${answer.questionLabel}: ${answer.answer}`),
        ]),
        ...input.appliedChatDigest,
      ],
    })
  }
  if (!primaryUserFacingBlock && openQuestions.length > 0) {
    sections.push({
      title: "Open Questions",
      items: openQuestions,
    })
  }

  return sections.filter((section) => section.items.length > 0)
}

// ---------------------------------------------------------------------------
// ProjectSpec builder — derives structured spec from existing agent outputs.
// No LLM calls here — pure derivation from what agents already produced.
// Session D will add gap-filling via LLM.
// ---------------------------------------------------------------------------

export function buildProjectSpec(input: {
  ideaPrompt: string
  synthetics: { id: string; name: string }[]
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>
  appliedDecisions?: SyntheticPreparedDecision[]
  appliedStructuredClarifications?: SyntheticPreparedClarification[]
}): ProjectSpec {
  const appliedDecisions = input.appliedDecisions ?? []
  const appliedClarifications = input.appliedStructuredClarifications ?? []

  const sections: SpecSection[] = input.synthetics.map((synthetic) => {
    const output = input.outputsBySyntheticId[synthetic.id]
    const operational = hasOperational(output) ? output.operational : null

    // Decisions: user-selected ones for this agent
    const decisions: ClosedDecision[] = appliedDecisions
      .filter((d) => d.syntheticId === synthetic.id)
      .map((d) => ({
        decisionId: d.optionId,
        title: d.decisionTitle,
        chosenOption: d.optionLabel,
        chosenBy: "user",
      }))

    // Also close any recommended decisions that the agent flagged with a recommendation
    // and the user didn't explicitly override — these will be marked ai_default
    const userClosedIds = new Set(decisions.map((d) => d.decisionId))
    const aiDecisions: ClosedDecision[] = (operational?.recommendedDecisions ?? [])
      .filter((rd) => rd.recommendedOption && !userClosedIds.has(rd.id))
      .map((rd) => ({
        decisionId: rd.id,
        title: rd.title,
        chosenOption: rd.recommendedOption!,
        chosenBy: "ai_default",
      }))

    // Open questions: clarificationRequests not yet answered
    const answeredIds = new Set(
      appliedClarifications
        .filter((c) => c.syntheticId === synthetic.id)
        .flatMap((c) => c.answers.map((a) => a.questionId)),
    )
    const openQuestions = (operational?.clarificationRequests ?? [])
      .filter((cr) => !answeredIds.has(cr.id))
      .map((cr) => cr.question)

    // Fields filled by AI: missingInformation items (no user input yet)
    const filledByAI = operational?.missingInformation ?? []

    // Content: agent summary + recommendation prose
    const content = output
      ? [getOutputSummary(output), getOutputRecommendation(output)]
      : []
    const contentText = content.filter(Boolean).join("\n\n")

    const readyForPlan =
      openQuestions.length === 0 && Boolean(output)

    return {
      agentId: synthetic.id,
      agentName: synthetic.name,
      decisions: [...decisions, ...aiDecisions],
      openQuestions,
      filledByAI,
      content: contentText,
      readyForPlan,
    }
  })

  const allClosed = sections.every((s) => s.openQuestions.length === 0)

  return {
    ideaPrompt: input.ideaPrompt,
    sections,
    generatedAt: new Date().toISOString(),
    allClosed,
  }
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function uniqueRecommendedDirections(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): string[] {
  const directions = Object.values(outputsBySyntheticId).flatMap((output) => {
    if (!hasOperational(output)) {
      return []
    }

    const userFacingOptions =
      output.operational.userFacing?.options.map((item) =>
        item.recommended ? `${item.label} (recommended): ${item.summary}` : "",
      ) ?? []

    const operationalDecisions = output.operational.recommendedDecisions.map((item) =>
      item.recommendedOption
        ? `${item.title}: prefer ${item.recommendedOption}`
        : item.title,
    )

    return [...userFacingOptions, ...operationalDecisions].filter(Boolean)
  })

  return uniqueNonEmpty(directions)
}

function uniqueOpenQuestions(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
): string[] {
  const questions = Object.values(outputsBySyntheticId).flatMap((output) => {
    if (!hasOperational(output)) {
      return []
    }

    const userFacingQuestions =
      output.operational.userFacing?.questions.map((item) => item.question) ?? []

    return [
      ...userFacingQuestions,
      ...output.operational.clarificationRequests.map((item) => item.question),
    ]
  })

  return uniqueNonEmpty(questions)
}

function uniqueWhatCanProceedNow(
  outputsBySyntheticId: Record<string, SyntheticOutputJson | null>,
  summaryReport: RunSummaryReport,
): string[] {
  const nextSteps = Object.values(outputsBySyntheticId).flatMap((output) => {
    if (!hasOperational(output)) {
      return []
    }
    const fromUserFacing = output.operational.userFacing?.nextStep
      ? [output.operational.userFacing.nextStep]
      : []
    return [...fromUserFacing, ...output.operational.nextSteps]
  })

  return uniqueNonEmpty([...nextSteps, ...summaryReport.actionItems]).slice(0, 8)
}
