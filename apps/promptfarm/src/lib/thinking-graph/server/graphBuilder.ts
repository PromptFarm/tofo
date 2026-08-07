import type { SyntheticEdge, SyntheticNode } from "../../planning/types"

import {
  type DefaultGameDevPersonaId,
  type SyntheticPersona,
} from "./types"

type GameDevChainDefinition = {
  personaId: DefaultGameDevPersonaId
  nodeId: string
  code: string
  x: number
  y: number
  temperature: number
  strictness: number
  engagementPercent: number
}

const DEFAULT_GAMEDEV_CHAIN: GameDevChainDefinition[] = [
  {
    personaId: "game_designer",
    nodeId: "syn-game-designer",
    code: "GD",
    x: 260,
    y: 220,
    temperature: 0.45,
    strictness: 80,
    engagementPercent: 78,
  },
  {
    personaId: "ux_designer",
    nodeId: "syn-ux-designer",
    code: "UX",
    x: 540,
    y: 220,
    temperature: 0.35,
    strictness: 76,
    engagementPercent: 82,
  },
  {
    personaId: "game_programmer",
    nodeId: "syn-game-programmer",
    code: "GP",
    x: 820,
    y: 220,
    temperature: 0.22,
    strictness: 86,
    engagementPercent: 74,
  },
]

function toDisplayName(title: string): string {
  return title.split("/")[0]?.trim() || title.trim()
}

function toSyntheticNode(
  persona: SyntheticPersona,
  config: GameDevChainDefinition,
): SyntheticNode {
  return {
    id: config.nodeId,
    code: config.code,
    name: toDisplayName(persona.title),
    // Preserve the full description with its formatting — frameworks, heuristics,
    // and evaluation criteria embedded in the description significantly improve
    // LLM output quality compared to whitespace-collapsed text.
    role: persona.description.trim(),
    status: "active",
    layout: {
      x: config.x,
      y: config.y,
    },
    config: {
      enabled: true,
      temperature: config.temperature,
      strictness: config.strictness,
      engagementPercent: config.engagementPercent,
    },
  }
}

// Linear dependency chain removed — context flows by default in full mesh.
// Edges are only drawn for non-default relationships (tension, oversight, amplification).

function deriveCode(persona: SyntheticPersona): string {
  const words = persona.title.split(/[\s/]+/).filter(Boolean)
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase()
  }
  return persona.title.slice(0, 2).toUpperCase()
}

const COL_STEP = 280
const ROW_STEP = 240
const X_START = 260
const Y_START = 220

/**
 * Number of columns for a snake layout.
 * ≤4 nodes → single row; 5–8 → ⌈n/2⌉ cols (max 4); 9+ → 4 cols.
 */
function computeCols(n: number): number {
  if (n <= 4) return n
  return Math.min(4, Math.ceil(n / 2))
}

/**
 * Zigzag (snake) position: even rows go left→right, odd rows go right→left.
 * This ensures that row-wrap dependency edges go straight down rather than
 * diagonally across the canvas.
 */
function snakePosition(n: number, idx: number): { x: number; y: number } {
  const cols = computeCols(n)
  const row = Math.floor(idx / cols)
  const posInRow = idx % cols
  const isRTL = row % 2 === 1
  const col = isRTL ? cols - 1 - posInRow : posInRow
  return {
    x: X_START + col * COL_STEP,
    y: Y_START + row * ROW_STEP,
  }
}

/**
 * Emit idea → every_node and every_node → outcome structural edges.
 * Every synthetic is wired both from Idea and to Outcome so the graph
 * is always fully rooted, new nodes are never orphaned, and the
 * hub-and-spoke fallback in useThinkingGraphGraphData is suppressed.
 * Type "structural" — visual scaffolding only, not interpreted by the runtime.
 */
function toStructuralEdges(nodes: SyntheticNode[]): SyntheticEdge[] {
  if (nodes.length === 0) return []
  return [
    ...nodes.map((node) => ({
      id: `edge-idea-${node.id}`,
      from: "idea",
      to: node.id,
      type: "structural" as SyntheticEdge["type"],
    })),
    ...nodes.map((node) => ({
      id: `edge-${node.id}-outcome`,
      from: node.id,
      to: "outcome",
      type: "structural" as SyntheticEdge["type"],
    })),
  ]
}

/**
 * Build a graph from any ordered list of personas.
 * Context flows by default in full mesh — no linear dependency chain is added.
 * Draw tension/oversight/amplification edges manually when needed.
 * Node IDs follow the `syn-${personaId.replace(/_/g,"-")}` convention
 * so they stay stable across Director confirms.
 */
export function buildLinearPersonaGraph(personas: SyntheticPersona[]): {
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
} {
  const n = personas.length
  const synthetics: SyntheticNode[] = personas.map((persona, idx) => ({
    id: `syn-${persona.id.replace(/_/g, "-")}`,
    code: deriveCode(persona),
    name: toDisplayName(persona.title),
    // Preserve full description with frameworks and evaluation criteria intact
    role: persona.description.trim(),
    status: "active",
    layout: snakePosition(n, idx),
    config: {
      enabled: true,
      temperature: 0.35,
      strictness: 80,
      engagementPercent: 75,
    },
  }))

  return {
    synthetics,
    // Structural edges only — no inter-agent dependency chain (full mesh context)
    edges: toStructuralEdges(synthetics),
  }
}

export function buildLinearGameDevGraph(personas: SyntheticPersona[]): {
  synthetics: SyntheticNode[]
  edges: SyntheticEdge[]
} {
  const personaById = new Map(personas.map((persona) => [persona.id, persona]))

  const synthetics = DEFAULT_GAMEDEV_CHAIN.map((chainEntry) => {
    const persona = personaById.get(chainEntry.personaId)
    if (!persona) {
      throw new Error(
        `Cannot build game-dev graph because persona "${chainEntry.personaId}" is missing.`,
      )
    }

    return toSyntheticNode(persona, chainEntry)
  })

  // GD ↔ GP tension edge: Game Designer wants rich mechanics; Game Programmer
  // is constrained by implementation feasibility. Both sides receive the other's
  // output framed as "opposing position — push back." Bidirectional by nature —
  // stored as a single edge, both agents see each other's output with tension framing.
  //
  // The edge exits GD from the top handle and enters GP from the top handle,
  // arcing above the node row so it never overlaps the structural edges.
  const gdNode = synthetics.find((n) => n.id === "syn-game-designer")
  const gpNode = synthetics.find((n) => n.id === "syn-game-programmer")
  const uxNode = synthetics.find((n) => n.id === "syn-ux-designer")

  const tensionEdges: SyntheticEdge[] =
    gdNode && gpNode
      ? [
          {
            id: `edge-tension-${gdNode.id}-${gpNode.id}`,
            from: gdNode.id,
            to: gpNode.id,
            type: "tension",
            // Top-to-top: both ends exit/enter from the top of the node
            sourceHandle: "top-source",
            targetHandle: "top-target",
            // Arc the curve 110px above the node row so it clears the structural edges
            waypoints: [
              {
                x: (gdNode.layout.x + gpNode.layout.x) / 2,
                y: gdNode.layout.y - 110,
              },
            ],
          },
        ]
      : []

  // UX → GP oversight edge: UX Designer has formal authority to check whether
  // the Game Programmer's implementation plan satisfies usability requirements.
  // Unidirectional — UX receives GP's output framed as "work under your review."
  const oversightEdges: SyntheticEdge[] =
    uxNode && gpNode
      ? [
          {
            id: `edge-oversight-${uxNode.id}-${gpNode.id}`,
            from: uxNode.id,
            to: gpNode.id,
            type: "oversight",
          },
        ]
      : []

  return {
    synthetics,
    edges: [...toStructuralEdges(synthetics), ...tensionEdges, ...oversightEdges],
  }
}
