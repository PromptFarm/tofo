export type Project = {
  id: string
  title: string
  idea: IdeaNode
  iterations: IterationNode[]
  perspectives?: PerspectivesBlock
  plan?: PlanBlock
  timeline?: TimelineBlock
  createdAt: string
  updatedAt: string
}

export type IdeaNode = {
  id: string
  text: string
}

export type IterationNode = {
  id: string
  version: string
  summary: string
  parentId?: string
  perspectives?: PerspectivesBlock
  input: string
  output: {
    problem: string
    solution: string
    steps: Step[]
    risks: string[]
  }
  plan?: PlanBlock
  timeline?: TimelineBlock
  graph: GraphBlock
  graphRevision: GraphRevision
  hasPlan?: boolean
  createdAt: string
}

export type Step = {
  id: string
  text: string
  normalized?: string
  status?: "todo" | "done"
}

export type PerspectivesBlock = {
  builder: Perspective
  critic: Perspective
  user: Perspective
  investor?: Perspective
}

export type Perspective = {
  insight: string
  concern: string
  suggestion: string
}

export type PlanBlock = {
  orderedSteps: string[]
  dependencies: {
    from: string
    to: string
  }[]
}

export type TimelineBlock = {
  phases: Phase[]
  totalDuration: string
}

export type Phase = {
  id: string
  name: string
  goal: string
  steps: string[]
  duration: string
  status?: "locked" | "active" | "completed"
}

export type GraphNode = {
  id: string
  type: "idea" | "iteration"
  refId: string
}

export type GraphEdge = {
  from: string
  to: string
}

export type GraphBlock = {
  coreProblem: string
  solution: string
  roadmap: string[]
  risks: string[]
  synthetics: {
    active: SyntheticMock[]
    available: SyntheticMock[]
  }
}

export type SyntheticMock = {
  id: string
  name: string
  description: string
  enabled: boolean
  settings: SyntheticSettings
}

export type SyntheticSettings = {
  temperature: number
  strictness: number
  engagementPercent: number
}

export type GraphRevision = {
  id: string
  version: string
  summary: string
  ideaText: string
  mode: "auto" | "manual"
  run: ThinkingRun
}

export type ThinkingRun = {
  id: string
  stage: "proposal" | "editing" | "running" | "review" | "decision"
  proposedSynthetics: SyntheticNode[]
  activeSynthetics: SyntheticNode[]
  edges: SyntheticEdge[]
  transcript: TranscriptEntry[]
  incorporationBlock: {
    baseText: string
    addedContext: string[]
    currentText: string
  }
  decision?: {
    selectedAction?: "plan" | "next_pass"
  }
}

export type SyntheticNode = {
  id: string
  code: string
  name: string
  role: string
  /**
   * "advisor" marks a Strategist node that runs last, reads all agent outputs,
   * and produces topRecommendation / strategicOptions / conflictResolution.
   * Omitted or "agent" for all regular domain agents.
   */
  nodeRole?: "agent" | "advisor"
  status: "proposed" | "active" | "thinking" | "done" | "conflict" | "blocked"
  layout: {
    x: number
    y: number
  }
  opinion?: {
    summary: string
    details: string
    recommendation: string
  }
  followUps?: {
    id: string
    question: string
    userReply?: string
    adjustment?: string
  }[]
  config: {
    enabled: boolean
    temperature: number
    strictness: number
    engagementPercent: number
  }
}

/**
 * Semantic edge types (drawn by the user — only when a relationship is non-default):
 *   tension      — bidirectional adversarial roles; both agents receive the other's
 *                  output framed as "opposing position — push back".
 *   oversight    — unidirectional formal review; the source agent (reviewer) receives the
 *                  target agent's output framed as "work under your review".
 *   amplification — unidirectional signal elevation; the target agent receives the source
 *                  agent's output framed as "amplified signal — weight this heavily".
 *
 * Structural edges (canvas connectors from Idea→node and node→Outcome):
 *   structural   — visual scaffolding only; not interpreted by the runtime.
 *
 * No edge = collegial peer (context flows by default in full mesh).
 */
export type SyntheticEdge = {
  id: string
  from: string
  to: string
  type: "tension" | "oversight" | "amplification" | "structural"
  sourceHandle?: string
  targetHandle?: string
  waypoints?: { x: number; y: number }[]
}

export type TranscriptEntry = {
  id: string
  syntheticId: string
  type: "opinion" | "followup" | "adjustment" | "included"
  text: string
}
