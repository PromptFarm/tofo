import type {
  SyntheticPreparedClarification,
  SyntheticPreparedDecision,
} from "./server/types"

export type BuildPlanExportTask = {
  title: string
  ownerCode: string
  storyPoints: number
  priority: "critical" | "high" | "medium" | "low"
  description: string
  acceptanceCriteria: string[]
  subTasks: string[]
}

export type BuildPlanExportPhase = {
  name: string
  goal: string
  tasks: BuildPlanExportTask[]
}

export function buildBuildPlanExportPayload(input: {
  ideaPrompt: string
  phases: BuildPlanExportPhase[]
  appliedDecisions?: SyntheticPreparedDecision[]
  appliedStructuredClarifications?: SyntheticPreparedClarification[]
}) {
  return {
    projects: [
      {
        name: input.ideaPrompt.slice(0, 80) || "PromptFarm Plan",
        key: "PF",
        type: "software",
        promptfarmContext: {
          appliedDecisions: (input.appliedDecisions ?? []).map((decision) => ({
            syntheticId: decision.syntheticId,
            decisionTitle: decision.decisionTitle,
            optionId: decision.optionId,
            optionLabel: decision.optionLabel,
            optionDescription: decision.optionDescription,
            appliedAt: decision.appliedAt,
            source: decision.source ?? "manual_edit",
          })),
          appliedStructuredClarifications: (
            input.appliedStructuredClarifications ?? []
          ).map((clarification) => ({
            syntheticId: clarification.syntheticId,
            syntheticName: clarification.syntheticName,
            appliedAt: clarification.appliedAt,
            source: clarification.source ?? "manual_edit",
            answers: clarification.answers.map((answer) => ({
              questionId: answer.questionId,
              questionLabel: answer.questionLabel,
              answer: answer.answer,
            })),
          })),
          exportedFromIdeaPrompt: input.ideaPrompt,
        },
        issues: input.phases.map((phase, phaseIdx) => ({
          issueType: "Epic",
          summary: `Phase ${phaseIdx + 1}: ${phase.name}`,
          description: phase.goal,
          epicName: phase.name,
          labels: ["promptfarm"],
          issues: phase.tasks.map((task) => ({
            issueType: "Story",
            summary: task.title,
            description: task.description,
            priority: task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
            labels: [task.ownerCode, "promptfarm"],
            customFieldValues: [
              {
                fieldName: "Story Points",
                fieldType: "com.atlassian.jira.plugin.system.customfieldtypes:float",
                value: String(task.storyPoints),
              },
            ],
            acceptanceCriteria: task.acceptanceCriteria,
            subTasks: task.subTasks.map((s) => ({
              issueType: "Sub-task",
              summary: s,
            })),
          })),
        })),
      },
    ],
  }
}
