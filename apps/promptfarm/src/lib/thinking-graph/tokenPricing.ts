// Shared between client (live run stats) and server (persisted usage
// aggregation) — keep pricing in exactly one place so the two never drift.

export type TokenUsage = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

// Pricing per 1M tokens (USD) — update when model or tier changes
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-6":         { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-opus-4-7":           { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80,  outputPer1M: 4.00  },
}

export function calculateCostUsd(
  model: string | null | undefined,
  usage: TokenUsage,
): number | null {
  if (!model) return null
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"]
  const input = usage.promptTokens ?? 0
  const output = usage.completionTokens ?? 0
  return (input * pricing.inputPer1M + output * pricing.outputPer1M) / 1_000_000
}
