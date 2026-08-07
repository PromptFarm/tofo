import type { SyntheticBackendDescriptor } from "./types"
import { getModelProviderSettings } from "../../sqlite/appSettings"

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b-instruct"

export type ThinkingGraphModelProviderKind = "ollama" | "gemini" | "claude" | "claude-cli"
export type ThinkingGraphOperationalEnforcementMode =
  | "allow"
  | "warn"
  | "retry"
  | "require"

export type ThinkingGraphRuntimeConfig = {
  provider: ThinkingGraphModelProviderKind
  ollamaBaseUrl: string
  ollamaModel: string
  geminiModel: string | null
  claudeModel: string | null
  claudeApiKey: string | null
  operationalEnforcement: ThinkingGraphOperationalEnforcementMode
  agentStaggerMs: number
}

// The Settings page (src/app/settings) writes to the AppSetting table via
// saveModelProviderSettings() — that's the primary source once a user has
// configured anything. THINKING_GRAPH_MODEL_PROVIDER (env var) only matters
// before first-run configuration, or for headless/dev use without the UI.
function readProviderKind(): ThinkingGraphModelProviderKind {
  const stored = getModelProviderSettings()
  if (stored) {
    return stored.provider
  }

  const value = process.env.THINKING_GRAPH_MODEL_PROVIDER

  if (!value) {
    return "ollama"
  }

  if (value === "ollama" || value === "gemini" || value === "claude" || value === "claude-cli") {
    return value
  }

  throw new Error(
    `Unsupported THINKING_GRAPH_MODEL_PROVIDER "${value}". Expected "ollama", "gemini", "claude", or "claude-cli".`,
  )
}

function readOperationalEnforcementMode(): ThinkingGraphOperationalEnforcementMode {
  const value = process.env.THINKING_GRAPH_OPERATIONAL_ENFORCEMENT

  if (!value) {
    return "retry"
  }

  if (
    value === "allow" ||
    value === "warn" ||
    value === "retry" ||
    value === "require"
  ) {
    return value
  }

  throw new Error(
    `Unsupported THINKING_GRAPH_OPERATIONAL_ENFORCEMENT "${value}". Expected "allow", "warn", "retry", or "require".`,
  )
}

function readAgentStaggerMs(provider: ThinkingGraphModelProviderKind): number {
  const raw = process.env.THINKING_GRAPH_AGENT_STAGGER_MS
  if (raw !== undefined) {
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed >= 0) return parsed
  }
  // Дефолты по провайдеру: Ollama локальный — без задержки, облачные — 20с
  return provider === "ollama" ? 0 : 20_000
}

export function getThinkingGraphRuntimeConfig(): ThinkingGraphRuntimeConfig {
  const stored = getModelProviderSettings()
  const provider = readProviderKind()
  return {
    provider,
    ollamaBaseUrl: stored?.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    ollamaModel: stored?.ollamaModel ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
    geminiModel: process.env.GEMINI_MODEL ?? null,
    claudeModel: stored?.claudeModel || process.env.CLAUDE_MODEL || null,
    claudeApiKey: stored?.claudeApiKey || process.env.ANTHROPIC_API_KEY || null,
    operationalEnforcement: readOperationalEnforcementMode(),
    agentStaggerMs: readAgentStaggerMs(provider),
  }
}

export function getThinkingGraphProviderDescriptor(): SyntheticBackendDescriptor {
  const config = getThinkingGraphRuntimeConfig()

  if (config.provider === "ollama") {
    return {
      kind: "ollama",
      label: "Ollama Local",
      model: config.ollamaModel,
      baseUrl: config.ollamaBaseUrl,
    }
  }

  if (config.provider === "claude-cli") {
    return {
      kind: "claude",
      label: "Claude (terminal CLI)",
      model: config.claudeModel ?? undefined,
    }
  }

  if (config.provider === "claude") {
    return {
      kind: "claude",
      label: "Claude (Anthropic)",
      model: config.claudeModel ?? undefined,
    }
  }

  return {
    kind: "gemini",
    label: "Google Gemini",
    model: config.geminiModel ?? undefined,
  }
}
