import { BaseLlm, type LlmRequest, type LlmResponse } from "@google/adk"

import type {
  ModelGenerateResult,
  ModelProvider,
  ModelProviderMessage,
} from "./modelProvider"
import { DEFAULT_OLLAMA_MODEL } from "./config"
import { debugDump, profLog } from "./profiling"

function flattenText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => flattenText(item))
      .filter((item) => item.length > 0)
      .join("\n")
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      text?: unknown
      content?: unknown
      value?: unknown
    }

    if (typeof candidate.text === "string") {
      return candidate.text
    }
    if (typeof candidate.value === "string") {
      return candidate.value
    }
    if (candidate.content !== undefined) {
      return flattenText(candidate.content)
    }
  }

  return ""
}

function toProviderMessages(request: LlmRequest): ModelProviderMessage[] {
  const messages: ModelProviderMessage[] = []

  if (typeof request.config?.systemInstruction === "string") {
    messages.push({
      role: "system",
      content: request.config.systemInstruction,
    })
  }

  for (const content of request.contents) {
    const role =
      content.role === "model"
        ? "assistant"
        : content.role === "user"
          ? "user"
          : "user"

    const text = flattenText(content.parts)
    if (!text.trim()) {
      continue
    }

    messages.push({
      role,
      content: text,
    })
  }

  return messages
}

export class OllamaAdkLlm extends BaseLlm {
  constructor(
    readonly modelProvider: ModelProvider,
    model: string = modelProvider.descriptor.model ?? DEFAULT_OLLAMA_MODEL,
    private readonly hooks?: {
      onGenerate?: (result: ModelGenerateResult) => void
      onTextDelta?: (textDelta: string) => void | Promise<void>
      defaultTemperature?: number
      defaultMaxTokens?: number
    },
  ) {
    super({ model })
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    _stream: boolean = false,
  ): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest)
    const messages = toProviderMessages(llmRequest)

    if (process.env.NODE_ENV !== "production") {
      console.log("[thinking-graph][adk-llm] generateContentAsync", {
        model: this.model,
        hasResponseSchema: Boolean(llmRequest.config?.responseSchema),
        contentsCount: llmRequest.contents.length,
        messages: messages.map((message) => ({
          role: message.role,
          contentPreview: message.content.slice(0, 400),
        })),
      })
    }

    const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0)
    const llmStart = Date.now()

    let result
    try {
      const providerInput = {
        messages,
        temperature:
          typeof llmRequest.config?.temperature === "number"
            ? llmRequest.config.temperature
            : this.hooks?.defaultTemperature,
        maxTokens: this.hooks?.defaultMaxTokens,
        responseSchema:
          llmRequest.config?.responseSchema &&
          typeof llmRequest.config.responseSchema === "object"
            ? (llmRequest.config.responseSchema as Record<string, unknown>)
            : undefined,
      }

      result =
        this.hooks?.onTextDelta && this.modelProvider.streamText
          ? await this.modelProvider.streamText({
              ...providerInput,
              onTextDelta: async (textDelta) => {
                await this.hooks?.onTextDelta?.(textDelta)
              },
            })
          : await this.modelProvider.generate(providerInput)
    } catch (error) {
      console.error("[thinking-graph][adk-llm] provider.generate failed", error)
      throw error
    }

    const llmMs = Date.now() - llmStart
    profLog({
      event: "llm_request",
      model: this.model,
      messages_count: messages.length,
      prompt_chars: promptChars,
      llm_ms: llmMs,
      output_chars: result.text.length,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    })
    debugDump({
      messages,
      output: result.text,
      llm_ms: llmMs,
      prompt_chars: promptChars,
      output_chars: result.text.length,
    })

    if (process.env.NODE_ENV !== "production") {
      console.log("[thinking-graph][adk-llm] provider.generate result", {
        provider: result.provider,
        model: result.model,
        textPreview: result.text.slice(0, 200),
        usage: result.usage,
      })
    }
    this.hooks?.onGenerate?.(result)

    yield {
      content: {
        role: "model",
        parts: [{ text: result.text }],
      },
      customMetadata: {
        provider: result.provider,
        model: result.model,
        rawResponse: result.rawResponse,
      },
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<never> {
    throw new Error("Live Ollama connections are not implemented for thinking graph.")
  }
}
