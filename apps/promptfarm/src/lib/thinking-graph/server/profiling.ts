import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const LOG_DIR = join(process.cwd(), "logs")
const LOG_FILE = join(LOG_DIR, "thinking-graph-profiling.jsonl")

let dirEnsured = false
let debugCallCount = 0

function ensureDir(): void {
  if (dirEnsured) return
  mkdirSync(LOG_DIR, { recursive: true })
  dirEnsured = true
}

export function profLog(payload: Record<string, unknown>): void {
  if (process.env.THINKING_GRAPH_PROFILING !== "1") return
  try {
    ensureDir()
    appendFileSync(LOG_FILE, JSON.stringify({ ts: Date.now(), ...payload }) + "\n", "utf8")
  } catch {
    // Never crash the run over a profiling write failure.
  }
}

export function debugDump(payload: {
  messages: Array<{ role: string; content: string }>
  output: string
  llm_ms: number
  prompt_chars: number
  output_chars: number
}): void {
  if (process.env.THINKING_GRAPH_DEBUG !== "1") return
  try {
    ensureDir()
    debugCallCount++
    const seq = String(debugCallCount).padStart(3, "0")
    const file = join(LOG_DIR, `debug-${seq}-${Date.now()}.json`)

    const breakdown = payload.messages.map((m) => ({
      role: m.role,
      chars: m.content.length,
      // Find known heavy sections within the system message
      sections: m.role === "system" ? extractSectionSizes(m.content) : undefined,
      content: m.content,
    }))

    writeFileSync(
      file,
      JSON.stringify(
        {
          seq: debugCallCount,
          ts: Date.now(),
          prompt_chars: payload.prompt_chars,
          output_chars: payload.output_chars,
          llm_ms: payload.llm_ms,
          breakdown,
          output: payload.output,
        },
        null,
        2,
      ),
      "utf8",
    )
  } catch {
    // Never crash the run over a debug write failure.
  }
}

const ITERATION_LOG_FILE = join(LOG_DIR, "iteration-debug.jsonl")

export function iterationLog(tag: string, payload: Record<string, unknown>): void {
  try {
    ensureDir()
    appendFileSync(
      ITERATION_LOG_FILE,
      JSON.stringify({ ts: Date.now(), tag, ...payload }) + "\n",
      "utf8",
    )
  } catch {
    // Never crash over a log write failure.
  }
}

function extractSectionSizes(systemMessage: string): Record<string, number> {
  const markers: Array<[string, RegExp]> = [
    ["example_shape", /Example shape \(content is illustrative/],
    ["previous_output", /Previous synthetic output:/],
    ["upstream_context", /Filtered inherited context:/],
    ["direct_handoffs", /Direct handoffs for your role:/],
    ["field_definitions", /Return a concise JSON object with fields:/],
    ["mandatory_invariants", /Mandatory invariant:/],
  ]

  const sizes: Record<string, number> = {}
  for (const [name, pattern] of markers) {
    const match = pattern.exec(systemMessage)
    if (match) {
      sizes[`${name}_offset`] = match.index
      sizes[`${name}_chars_from_here`] = systemMessage.length - match.index
    }
  }
  return sizes
}
