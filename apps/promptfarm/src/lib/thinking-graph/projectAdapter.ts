import type { IterationNode, Project } from "@/lib/planning/types"
import type { SyntheticGraphPayload } from "@/lib/thinking-graph/server/types"

function buildRevisionFromPayload(payload: SyntheticGraphPayload): IterationNode {
  const roadmap = payload.synthetics.map((synthetic) => synthetic.role)
  const transcriptSummary = payload.transcript
    .slice(-3)
    .map((entry) => entry.text)
    .join(" ")

  return {
    id: `iteration-${payload.sessionId}`,
    version: "V1",
    summary: "API-backed thinking graph session",
    input: payload.ideaPrompt,
    output: {
      problem:
        payload.ideaPrompt || "Thinking graph session is initialized but no idea prompt has been submitted yet.",
      solution:
        transcriptSummary || "Run the synthetic chain to generate game development output.",
      steps: payload.synthetics.map((synthetic) => ({
        id: `step-${synthetic.id}`,
        text: synthetic.role,
        normalized: synthetic.code.toLowerCase(),
        status: payload.outputsBySyntheticId[synthetic.id] ? "done" : "todo",
      })),
      risks: [],
    },
    graph: {
      coreProblem:
        payload.ideaPrompt || "No idea prompt has been submitted for this session yet.",
      solution:
        transcriptSummary || "Use the synthetic chain to produce design, UX, and implementation output.",
      roadmap,
      risks: [],
      synthetics: {
        active: payload.synthetics.map((synthetic) => ({
          id: synthetic.id,
          name: synthetic.name,
          description: synthetic.role,
          enabled: true,
          settings: {
            temperature: synthetic.config.temperature,
            strictness: synthetic.config.strictness,
            engagementPercent: synthetic.config.engagementPercent,
          },
        })),
        available: [],
      },
    },
    graphRevision: {
      id: `graph-${payload.sessionId}`,
      version: "V1",
      summary: "API-backed thinking graph session",
      ideaText: payload.ideaPrompt,
      mode: "auto",
      run: {
        id: `run-${payload.sessionId}`,
        stage: "review",
        proposedSynthetics: [],
        activeSynthetics: payload.synthetics.map((synthetic) => ({
          ...synthetic,
          layout: { ...synthetic.layout },
          config: { ...synthetic.config },
        })),
        edges: payload.edges.map((edge) => ({ ...edge })),
        transcript: payload.transcript.map((entry) => ({ ...entry })),
        incorporationBlock: {
          baseText: payload.ideaPrompt,
          addedContext: [],
          currentText: payload.ideaPrompt,
        },
      },
    },
    createdAt: new Date().toISOString(),
  }
}

export function buildProjectFromThinkingGraphPayload(
  payload: SyntheticGraphPayload,
): Project {
  return {
    id: `project-${payload.sessionId}`,
    title: "Thinking Graph Session",
    idea: {
      id: `idea-${payload.sessionId}`,
      text: payload.ideaPrompt || "Describe the idea to initialize the graph.",
    },
    iterations: [buildRevisionFromPayload(payload)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
