import { execFileSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import crossSpawn from "cross-spawn"
import type {
  SyntheticBackendDescriptor,
  SyntheticOutputJson,
  SyntheticReport,
} from "./types"
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "./config"
import { profLog } from "./profiling"

function ollamaFetchInit(signal?: AbortSignal): Record<string, unknown> {
  return signal ? { signal } : {}
}

// GUI apps launched from Finder/Dock (like the Tauri desktop shell that runs
// this server) don't inherit the PATH set up by the user's shell profile
// (.zshrc/.bash_profile) — exactly where npm/nvm installs put the `claude`
// CLI. A bare `spawn("claude", ...)` reliably fails with ENOENT in that
// context even though `claude` works fine from any terminal. Same fix
// already applied on the Rust side for `node` (see lib.rs's
// resolve_node_path) — resolving through a login shell picks up the same
// PATH a terminal would have. Windows doesn't have this problem (processes
// inherit the full PATH regardless of launch method there), and cross-spawn
// already handles that platform's own `.cmd`/`.bat` shim quirk separately.
let cachedClaudeCliPath: string | null | undefined
function resolveClaudeCliPath(): string {
  if (cachedClaudeCliPath !== undefined) return cachedClaudeCliPath ?? "claude"
  if (process.platform === "win32") {
    cachedClaudeCliPath = null
    return "claude"
  }
  try {
    const shell = process.env.SHELL ?? "/bin/zsh"
    const resolved = execFileSync(shell, ["-lc", "command -v claude"], { encoding: "utf8" }).trim()
    cachedClaudeCliPath = resolved || null
  } catch {
    cachedClaudeCliPath = null
  }
  return cachedClaudeCliPath ?? "claude"
}

export type ModelProviderMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type ModelGenerateInput = {
  messages: ModelProviderMessage[]
  temperature?: number
  maxTokens?: number
  responseSchema?: Record<string, unknown>
  signal?: AbortSignal
}

export type ModelGenerateResult = {
  text: string
  provider: string
  model: string
  usage: {
    promptTokens: number | null
    completionTokens: number | null
    totalTokens: number | null
  }
  rawResponse: unknown
}

export type ModelStreamInput = ModelGenerateInput & {
  onTextDelta: (textDelta: string) => void | Promise<void>
}

export interface ModelProvider {
  readonly descriptor: SyntheticBackendDescriptor
  generate(input: ModelGenerateInput): Promise<ModelGenerateResult>
  streamText?(input: ModelStreamInput): Promise<ModelGenerateResult>
}

export type OllamaModelProviderConfig = {
  baseUrl?: string
  model?: string
  providerLabel?: string
}

type OpenAICompatibleChoice = {
  text?: string
  message?: {
    content?:
      | string
      | Array<{ type?: string; text?: string; value?: string }>
      | { text?: string; value?: string }
  }
}

type OpenAICompatibleResponse = {
  model?: string
  response?: string
  output_text?: string
  choices?: OpenAICompatibleChoice[]
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
      value?: string
    }>
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

type OllamaNativeChatResponse = {
  model?: string
  message?: {
    content?: unknown
  }
  response?: unknown
  prompt_eval_count?: number
  eval_count?: number
}

type TokenUsage = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
}

function toOllamaApiBaseUrl(baseUrl: string): string {
  const withoutV1 = baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl
  return normalizeBaseUrl(withoutV1)
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractTextValue(item))
      .filter((item) => item.length > 0)
      .join("\n")
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      text?: unknown
      value?: unknown
      content?: unknown
    }

    if (typeof candidate.text === "string") {
      return candidate.text
    }

    if (typeof candidate.value === "string") {
      return candidate.value
    }

    if (candidate.content !== undefined) {
      return extractTextValue(candidate.content)
    }
  }

  return ""
}

function extractResponseText(response: OpenAICompatibleResponse): string {
  const choice = response.choices?.[0]
  const choiceText = [
    choice?.message?.content,
    choice?.text,
    response.output_text,
    response.response,
    response.output,
  ]
    .map((value) => extractTextValue(value))
    .find((value) => value.trim().length > 0)

  return choiceText ?? ""
}

function extractNativeResponseText(response: OllamaNativeChatResponse): string {
  return extractTextValue(response.message?.content ?? response.response)
}

function createOllamaOptions(input: ModelGenerateInput): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {}

  if (input.temperature !== undefined) {
    options.temperature = input.temperature
  } else if (input.responseSchema) {
    options.temperature = 0
  }

  if (input.maxTokens !== undefined) {
    options.num_predict = input.maxTokens
  }

  return Object.keys(options).length > 0 ? options : undefined
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function extractOpenAiUsage(response: OpenAICompatibleResponse): TokenUsage {
  const promptTokens = toNullableNumber(response.usage?.prompt_tokens)
  const completionTokens = toNullableNumber(response.usage?.completion_tokens)
  const totalFromPayload = toNullableNumber(response.usage?.total_tokens)
  const totalTokens =
    totalFromPayload ??
    (promptTokens !== null && completionTokens !== null
      ? promptTokens + completionTokens
      : null)

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
}

function extractNativeUsage(response: OllamaNativeChatResponse): TokenUsage {
  const promptTokens = toNullableNumber(response.prompt_eval_count)
  const completionTokens = toNullableNumber(response.eval_count)
  const totalTokens =
    promptTokens !== null && completionTokens !== null
      ? promptTokens + completionTokens
      : null

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  }
}

function logOllamaDebug(label: string, payload: unknown): void {
  if (process.env.NODE_ENV === "production") {
    return
  }

  console.log(`[thinking-graph][ollama] ${label}`, payload)
}


export class OllamaModelProvider implements ModelProvider {
  readonly descriptor: SyntheticBackendDescriptor

  constructor(config: OllamaModelProviderConfig = {}) {
    const baseUrl = normalizeBaseUrl(
      config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    )
    const model = config.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL

    this.descriptor = {
      kind: "ollama",
      label: config.providerLabel ?? "Ollama Local",
      model,
      baseUrl,
    }
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    if (input.responseSchema) {
      const apiBaseUrl = toOllamaApiBaseUrl(this.descriptor.baseUrl ?? "")
      const url = `${apiBaseUrl}/api/chat`
      const requestBody = {
        model: this.descriptor.model,
        messages: input.messages,
        stream: false,
        format: input.responseSchema,
        ...(createOllamaOptions(input)
          ? { options: createOllamaOptions(input) }
          : {}),
      }

      const requestBodyStr = JSON.stringify(requestBody)
      logOllamaDebug("structured request", {
        url,
        body: requestBody,
      })

      try {
        const fetchStart = Date.now()
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBodyStr,

          ...ollamaFetchInit(input.signal),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Ollama structured request failed (${response.status} ${response.statusText}): ${errorText}`,
          )
        }

        const rawResponse = (await response.json()) as OllamaNativeChatResponse
        const fetchMs = Date.now() - fetchStart
        logOllamaDebug("structured raw response", rawResponse)
        const text = extractNativeResponseText(rawResponse)
        if (!text.trim()) {
          throw new Error("Ollama structured response did not include generated text.")
        }

        profLog({
          event: "ollama_fetch",
          mode: "structured",
          url,
          request_chars: requestBodyStr.length,
          http_ms: fetchMs,
          response_chars: text.length,
        })

        return {
          text,
          provider: this.descriptor.kind,
          model: rawResponse.model ?? this.descriptor.model ?? DEFAULT_OLLAMA_MODEL,
          usage: extractNativeUsage(rawResponse),
          rawResponse,
        }
      } catch (error) {
        console.error("[thinking-graph][ollama] structured request error", error)
        throw error
      }
    }

    const url = `${this.descriptor.baseUrl}/chat/completions`
    const requestBody = {
      model: this.descriptor.model,
      messages: input.messages,
      ...(input.temperature !== undefined
        ? { temperature: input.temperature }
        : {}),
      ...(input.maxTokens !== undefined
        ? { max_tokens: input.maxTokens }
        : {}),
    }

    const requestBodyStr = JSON.stringify(requestBody)
    logOllamaDebug("openai-compatible request", {
      url,
      body: requestBody,
    })

    try {
      const fetchStart = Date.now()
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBodyStr,
        ...ollamaFetchInit(input.signal),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Ollama request failed (${response.status} ${response.statusText}): ${errorText}`,
        )
      }

      const rawResponse = (await response.json()) as OpenAICompatibleResponse
      const fetchMs = Date.now() - fetchStart
      logOllamaDebug("openai-compatible raw response", rawResponse)
      const text = extractResponseText(rawResponse)
      if (!text.trim()) {
        throw new Error("Ollama response did not include generated text.")
      }

      profLog({
        event: "ollama_fetch",
        mode: "openai_compat",
        url,
        request_chars: requestBodyStr.length,
        http_ms: fetchMs,
        response_chars: text.length,
      })

      return {
        text,
        provider: this.descriptor.kind,
        model: rawResponse.model ?? this.descriptor.model ?? DEFAULT_OLLAMA_MODEL,
        usage: extractOpenAiUsage(rawResponse),
        rawResponse,
      }
    } catch (error) {
      console.error("[thinking-graph][ollama] openai-compatible request error", error)
      throw error
    }
  }

  async streamText(input: ModelStreamInput): Promise<ModelGenerateResult> {
    const apiBaseUrl = toOllamaApiBaseUrl(this.descriptor.baseUrl ?? "")
    const url = `${apiBaseUrl}/api/chat`
    const requestBody = {
      model: this.descriptor.model,
      messages: input.messages,
      stream: true,
      ...(input.responseSchema ? { format: input.responseSchema } : {}),
      ...(createOllamaOptions(input)
        ? { options: createOllamaOptions(input) }
        : {}),
    }

    logOllamaDebug("streaming request", {
      url,
      body: requestBody,
    })

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      ...ollamaFetchInit(input.signal),
    })

    if (!response.ok || !response.body) {
      const errorText = await response.text()
      throw new Error(
        `Ollama streaming request failed (${response.status} ${response.statusText}): ${errorText}`,
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let accumulatedText = ""
    let lastResponse: unknown = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        const chunk = JSON.parse(trimmed) as OllamaNativeChatResponse
        lastResponse = chunk
        const textDelta = extractNativeResponseText(chunk)
        if (textDelta) {
          accumulatedText += textDelta
          await input.onTextDelta(textDelta)
        }
      }
    }

    if (buffer.trim().length > 0) {
      const chunk = JSON.parse(buffer.trim()) as OllamaNativeChatResponse
      lastResponse = chunk
      const textDelta = extractNativeResponseText(chunk)
      if (textDelta) {
        accumulatedText += textDelta
        await input.onTextDelta(textDelta)
      }
    }

    if (!accumulatedText.trim()) {
      throw new Error("Ollama streaming response did not include generated text.")
    }

    return {
      text: accumulatedText,
      provider: this.descriptor.kind,
      model:
        (lastResponse as OllamaNativeChatResponse | null)?.model ??
        this.descriptor.model ??
        DEFAULT_OLLAMA_MODEL,
      usage: extractNativeUsage(
        (lastResponse as OllamaNativeChatResponse | null) ?? {},
      ),
      rawResponse: lastResponse,
    }
  }
}

// ---------------------------------------------------------------------------
// GeminiModelProvider
// ---------------------------------------------------------------------------

export type GeminiModelProviderConfig = {
  apiKey?: string
  model?: string
}

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] }
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
}

export class GeminiModelProvider implements ModelProvider {
  readonly descriptor: SyntheticBackendDescriptor
  private readonly apiKey: string
  private readonly _model: string

  constructor(config: GeminiModelProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? ""
    const model = config.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
    this.apiKey = apiKey
    this._model = model
    this.descriptor = {
      kind: "gemini",
      label: "Google Gemini",
      model,
    }
  }

  private toContents(messages: ModelProviderMessage[]): GeminiContent[] {
    // Gemini uses "user"/"model" roles; system messages merged into first user turn
    const contents: GeminiContent[] = []
    let systemPrefix = ""
    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrefix += (systemPrefix ? "\n\n" : "") + msg.content
      } else {
        const text = systemPrefix ? `${systemPrefix}\n\n${msg.content}` : msg.content
        systemPrefix = ""
        contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text }] })
      }
    }
    if (systemPrefix && contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: systemPrefix }] })
    }
    return contents
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this._model}:generateContent?key=${this.apiKey}`
    const body = {
      contents: this.toContents(input.messages),
      generationConfig: {
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
      },
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errText}`)
    }
    const data = (await response.json()) as GeminiResponse
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    const promptTokens = data.usageMetadata?.promptTokenCount ?? null
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? null
    const totalTokens = data.usageMetadata?.totalTokenCount ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null)
    return {
      text,
      provider: "gemini",
      model: this._model,
      usage: { promptTokens, completionTokens, totalTokens },
      rawResponse: data,
    }
  }

  async streamText(input: ModelStreamInput): Promise<ModelGenerateResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this._model}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const body = {
      contents: this.toContents(input.messages),
      generationConfig: {
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
      },
    }
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    if (!response.ok || !response.body) {
      const errText = await response.text()
      throw new Error(`Gemini streaming error (${response.status}): ${errText}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let accumulatedText = ""
    let lastData: GeminiResponse | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const jsonStr = trimmed.slice(5).trim()
        if (jsonStr === "[DONE]") continue
        try {
          const chunk = JSON.parse(jsonStr) as GeminiResponse
          lastData = chunk
          const delta = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
          if (delta) {
            accumulatedText += delta
            await input.onTextDelta(delta)
          }
        } catch { /* skip malformed */ }
      }
    }

    const promptTokens = lastData?.usageMetadata?.promptTokenCount ?? null
    const completionTokens = lastData?.usageMetadata?.candidatesTokenCount ?? null
    const totalTokens = lastData?.usageMetadata?.totalTokenCount ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null)
    return {
      text: accumulatedText,
      provider: "gemini",
      model: this._model,
      usage: { promptTokens, completionTokens, totalTokens },
      rawResponse: lastData,
    }
  }
}

// ---------------------------------------------------------------------------
// ClaudeModelProvider (Anthropic API)
// ---------------------------------------------------------------------------

export type ClaudeModelProviderConfig = {
  apiKey?: string
  model?: string
}

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6"

type AnthropicMessage = { role: "user" | "assistant"; content: string }
type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
  model?: string
  stop_reason?: string | null
}
type AnthropicStreamEvent = {
  type: string
  delta?: { type?: string; text?: string; stop_reason?: string | null }
  message?: {
    usage?: { input_tokens?: number; output_tokens?: number }
    model?: string
    stop_reason?: string | null
  }
  usage?: { output_tokens?: number }
}

export class ClaudeModelProvider implements ModelProvider {
  readonly descriptor: SyntheticBackendDescriptor
  private readonly apiKey: string
  private readonly _model: string

  constructor(config: ClaudeModelProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ""
    const model = config.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL
    this.apiKey = apiKey
    this._model = model
    this.descriptor = {
      kind: "claude",
      label: "Claude (Anthropic)",
      model,
    }
  }

  private buildMessages(messages: ModelProviderMessage[]): { system?: string; messages: AnthropicMessage[] } {
    let system: string | undefined
    const anthropicMessages: AnthropicMessage[] = []
    for (const msg of messages) {
      if (msg.role === "system") {
        system = (system ? system + "\n\n" : "") + msg.content
      } else {
        anthropicMessages.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content })
      }
    }
    return { system, messages: anthropicMessages }
  }

  private buildOutputConfig(responseSchema?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!responseSchema) {
      return undefined
    }

    return {
      format: {
        type: "json_schema",
        schema: this.sanitizeSchemaForClaude(responseSchema),
      },
    }
  }

  private sanitizeSchemaForClaude(schema: Record<string, unknown>): Record<string, unknown> {
    const sanitizeNode = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        return node.map((item) => sanitizeNode(item))
      }

      if (!node || typeof node !== "object") {
        return node
      }

      const input = node as Record<string, unknown>
      const output: Record<string, unknown> = {}

      for (const [key, value] of Object.entries(input)) {
        if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
          const rawProperties = value as Record<string, unknown>
          const sanitizedProperties = Object.fromEntries(
            Object.entries(rawProperties)
              .flatMap(([propName, propSchema]) => {
                if (this.isUnsupportedOpenEndedObjectSchema(propSchema)) {
                  return []
                }
                return [[propName, sanitizeNode(propSchema)]]
              }),
          )
          output.properties = sanitizedProperties
          continue
        }

        if (key === "required" && Array.isArray(value) && output.properties && typeof output.properties === "object") {
          const allowed = new Set(Object.keys(output.properties as Record<string, unknown>))
          output.required = value.filter(
            (entry): entry is string => typeof entry === "string" && allowed.has(entry),
          )
          continue
        }

        output[key] = sanitizeNode(value)
      }

      if (input.type === "object") {
        output.additionalProperties = false
      }

      return output
    }

    return sanitizeNode(schema) as Record<string, unknown>
  }

  private isUnsupportedOpenEndedObjectSchema(node: unknown): boolean {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false
    }

    const schema = node as Record<string, unknown>
    if (schema.type !== "object") {
      return false
    }

    const hasNamedProperties =
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties) &&
      Object.keys(schema.properties as Record<string, unknown>).length > 0

    return !hasNamedProperties && schema.additionalProperties !== undefined && schema.additionalProperties !== false
  }

  private async createMessage(input: ModelGenerateInput, maxTokens: number): Promise<ModelGenerateResult> {
    const { system, messages } = this.buildMessages(input.messages)
    const outputConfig = this.buildOutputConfig(input.responseSchema)
    const body = {
      model: this._model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(outputConfig ? { output_config: outputConfig } : {}),
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Claude API error (${response.status}): ${errText}`)
    }
    const data = (await response.json()) as AnthropicResponse
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? ""
    const promptTokens = data.usage?.input_tokens ?? null
    const completionTokens = data.usage?.output_tokens ?? null
    const totalTokens = promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null
    return {
      text,
      provider: "claude",
      model: data.model ?? this._model,
      usage: { promptTokens, completionTokens, totalTokens },
      rawResponse: data,
    }
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const requestedMaxTokens = input.maxTokens ?? 8192
    const firstResult = await this.createMessage(input, requestedMaxTokens)
    const firstRaw = firstResult.rawResponse as AnthropicResponse

    if (firstRaw.stop_reason === "max_tokens" && input.responseSchema) {
      const retryMaxTokens = Math.max(requestedMaxTokens * 2, 8192)
      if (retryMaxTokens !== requestedMaxTokens) {
        const retryResult = await this.createMessage(input, retryMaxTokens)
        const retryRaw = retryResult.rawResponse as AnthropicResponse
        if (retryRaw.stop_reason !== "max_tokens") {
          return retryResult
        }
      }

      throw new Error(
        `Claude structured response hit max_tokens before finishing JSON (requested ${requestedMaxTokens}).`,
      )
    }

    return firstResult
  }

  async streamText(input: ModelStreamInput): Promise<ModelGenerateResult> {
    if (input.responseSchema) {
      const result = await this.generate(input)
      if (result.text) {
        await input.onTextDelta(result.text)
      }
      return result
    }

    const { system, messages } = this.buildMessages(input.messages)
    const body = {
      model: this._model,
      max_tokens: input.maxTokens ?? 8192,
      ...(system ? { system } : {}),
      messages,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      stream: true,
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      ...(input.signal ? { signal: input.signal } : {}),
    })
    if (!response.ok || !response.body) {
      const errText = await response.text()
      throw new Error(`Claude streaming error (${response.status}): ${errText}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let accumulatedText = ""
    let inputTokens: number | null = null
    let outputTokens: number | null = null
    let stopReason: string | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const jsonStr = trimmed.slice(5).trim()
        if (jsonStr === "[DONE]") continue
        try {
          const event = JSON.parse(jsonStr) as AnthropicStreamEvent
          if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? null
          }
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            accumulatedText += event.delta.text
            await input.onTextDelta(event.delta.text)
          }
          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? null
            stopReason = event.delta?.stop_reason ?? stopReason
          }
        } catch { /* skip */ }
      }
    }

    if (stopReason === "max_tokens") {
      throw new Error("Claude streaming response hit max_tokens before completion.")
    }

    const totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
    return {
      text: accumulatedText,
      provider: "claude",
      model: this._model,
      usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens },
      rawResponse: null,
    }
  }
}

// ---------------------------------------------------------------------------
// ClaudeCliModelProvider (terminal `claude` CLI, spawned directly from Node)
// ---------------------------------------------------------------------------
//
// Desktop build only: instead of calling api.anthropic.com with an API key,
// this spawns the user's own terminal `claude` CLI as a subprocess, billed
// against their Claude subscription rather than a metered API key. See
// apps/desktop/poc-claude-cli for the standalone proof-of-concept this is
// based on. No Rust/IPC involved — orchestrator.ts runs in this same Node
// process, so it can spawn `claude` itself same as any other subprocess.

export type ClaudeCliModelProviderConfig = {
  model?: string
}

type ClaudeCliEnvelope = {
  result?: string
  structured_output?: unknown
  modelUsage?: Record<string, unknown>
  usage?: { input_tokens?: number; output_tokens?: number }
}

type ClaudeCliStreamEvent = {
  type: string
  event?: { type: string; delta?: { type?: string; text?: string } }
  usage?: { input_tokens?: number; output_tokens?: number }
}

// Written to a scratch dir instead of passed inline via --system-prompt —
// see buildClaudeCliArgs for why.
async function writeTempSystemPromptFile(systemPrompt: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tofo-claude-cli-"))
  const filePath = join(dir, "system-prompt.txt")
  await writeFile(filePath, systemPrompt, "utf8")
  return filePath
}

function buildClaudeCliArgs(input: {
  model: string
  systemPromptFilePath?: string
  responseSchema?: Record<string, unknown>
  outputFormat: "json" | "stream-json"
}): string[] {
  const args = ["-p", "--output-format", input.outputFormat]
  if (input.outputFormat === "stream-json") {
    // `--print` + `--output-format=stream-json` requires `--verbose`, or the CLI refuses to start.
    args.push("--verbose", "--include-partial-messages")
  }
  args.push("--model", input.model)
  if (input.systemPromptFilePath) {
    args.push("--system-prompt-file", input.systemPromptFilePath)
  }
  if (input.responseSchema) {
    args.push("--json-schema", JSON.stringify(input.responseSchema))
  }
  // The prompt itself is written to the child's stdin (see callers) instead
  // of appended here as a positional arg — Windows' CreateProcess caps the
  // whole command line at ~32K chars, and a synthetic's accumulated context
  // routinely blows past that, failing with `spawn ENAMETOOLONG`. stdin has
  // no such limit. --system-prompt-file (a temp file, see
  // writeTempSystemPromptFile) instead of --system-prompt for the same
  // reason: the system prompt grows with accumulated chat/upstream context
  // across re-runs and can independently blow the same limit even with the
  // main prompt already moved off argv.
  args.push("--tools=")
  return args
}

// On failure (e.g. account/org policy errors like "Claude subscription
// access for Claude Code is disabled"), the CLI still emits its structured
// envelope on stdout with `is_error: true` and a human-readable `result` —
// stderr is often empty. Prefer that over a bare exit code.
function describeClaudeCliFailure(stdoutBuf: string, stderrBuf: string, code: number | null): string {
  if (stdoutBuf.trim()) {
    try {
      const envelope = JSON.parse(stdoutBuf.trim()) as { result?: string; is_error?: boolean }
      if (envelope.result) return envelope.result
    } catch {
      // stdout wasn't JSON — fall through to stderr/code
    }
  }
  return stderrBuf || `exited with code ${code}`
}

// ENOENT here means the `claude` binary genuinely couldn't be found (either
// it isn't installed, or resolveClaudeCliPath()'s login-shell lookup itself
// came up empty) — the raw Node error ("spawn claude ENOENT") or the
// synthetic close-code path some environments take instead (an errno-shaped
// exit code with no stdout/stderr) both read as an opaque crash to a user
// who has no reason to know what ENOENT means. Give them something
// actionable instead.
const CLAUDE_CLI_NOT_FOUND_MESSAGE =
  "Claude CLI not found. Install it from https://docs.claude.com/en/docs/claude-code, or switch to a different provider in Settings."

function isClaudeCliNotFoundError(err: NodeJS.ErrnoException | undefined): boolean {
  return err?.code === "ENOENT"
}

function extractClaudeCliModel(envelope: ClaudeCliEnvelope, fallback: string): string {
  const keys = envelope.modelUsage ? Object.keys(envelope.modelUsage) : []
  return keys.length > 0 ? keys[keys.length - 1] : fallback
}

function extractClaudeCliText(envelope: ClaudeCliEnvelope, hasSchema: boolean): string {
  if (hasSchema && envelope.structured_output !== undefined) {
    return JSON.stringify(envelope.structured_output)
  }
  return envelope.result ?? ""
}

export class ClaudeCliModelProvider implements ModelProvider {
  readonly descriptor: SyntheticBackendDescriptor
  private readonly _model: string

  constructor(config: ClaudeCliModelProviderConfig = {}) {
    this._model = config.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL
    this.descriptor = {
      kind: "claude",
      label: "Claude (terminal CLI)",
      model: this._model,
    }
  }

  private buildPrompt(messages: ModelProviderMessage[]): { systemPrompt?: string; prompt: string } {
    let systemPrompt: string | undefined
    const turns: string[] = []
    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = (systemPrompt ? systemPrompt + "\n\n" : "") + msg.content
      } else {
        turns.push(`${msg.role === "assistant" ? "Assistant" : "Human"}: ${msg.content}`)
      }
    }
    return { systemPrompt, prompt: turns.join("\n\n") }
  }

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const { systemPrompt, prompt } = this.buildPrompt(input.messages)
    const systemPromptFilePath = systemPrompt ? await writeTempSystemPromptFile(systemPrompt) : undefined
    try {
      const args = buildClaudeCliArgs({
        model: this._model,
        systemPromptFilePath,
        responseSchema: input.responseSchema,
        outputFormat: "json",
      })

      // `execFile` doesn't support overriding stdio (Node always pipes all
      // three streams for it, and TS's ExecFileOptions doesn't even declare
      // the field). `spawn` does, so use that instead — needed both to write
      // the prompt below and (previously) to avoid the 3s stdin-wait bug.
      // cross-spawn (not node:child_process directly) because a global npm
      // install of the Claude CLI on Windows is a `.cmd` shim — plain
      // `spawn()` throws ENOENT for those unless `shell: true` is set, and
      // shell:true isn't safe here since args carry user-authored idea
      // text. cross-spawn handles the Windows .cmd/.bat resolution
      // correctly without a shell.
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = crossSpawn(resolveClaudeCliPath(), args, {
          stdio: ["pipe", "pipe", "pipe"],
          ...(input.signal ? { signal: input.signal } : {}),
        })
        // The prompt goes over stdin, not argv (see buildClaudeCliArgs) — a
        // synthetic's accumulated context can be large enough to blow past
        // Windows' ~32K command-line limit (`spawn ENAMETOOLONG`). Ending
        // stdin immediately after writing also keeps the CLI from waiting on
        // it (same effect as the old `stdio: "ignore"`, since we now must
        // keep stdin as a pipe to write to it at all).
        child.stdin!.end(prompt)
        let stdoutBuf = ""
        let stderrBuf = ""
        child.stdout!.setEncoding("utf8")
        child.stderr!.setEncoding("utf8")
        child.stdout!.on("data", (chunk: string) => {
          stdoutBuf += chunk
        })
        child.stderr!.on("data", (chunk: string) => {
          stderrBuf += chunk
        })
        child.on("error", (err: NodeJS.ErrnoException) => {
          reject(new Error(isClaudeCliNotFoundError(err) ? CLAUDE_CLI_NOT_FOUND_MESSAGE : `claude CLI failed: ${err.message}`))
        })
        child.on("close", (code) => {
          if (code === 0) {
            resolve(stdoutBuf)
          } else if (!stdoutBuf && !stderrBuf) {
            // Some environments (seen on macOS) surface a spawn failure only
            // through "close" with an errno-shaped code and no output at all,
            // never firing "error" — this is the same "binary not found" case
            // as above, just taking the other path.
            reject(new Error(CLAUDE_CLI_NOT_FOUND_MESSAGE))
          } else {
            reject(new Error(`claude CLI failed: ${describeClaudeCliFailure(stdoutBuf, stderrBuf, code)}`))
          }
        })
      })

      return this.parseGenerateResult(stdout, input.responseSchema)
    } finally {
      if (systemPromptFilePath) await rm(join(systemPromptFilePath, ".."), { recursive: true, force: true })
    }
  }

  private parseGenerateResult(stdout: string, responseSchema: Record<string, unknown> | undefined): ModelGenerateResult {
    let envelope: ClaudeCliEnvelope
    try {
      envelope = JSON.parse(stdout.trim()) as ClaudeCliEnvelope
    } catch {
      throw new Error(`claude CLI output did not parse as JSON: ${stdout.slice(0, 500)}`)
    }

    const text = extractClaudeCliText(envelope, Boolean(responseSchema))
    const model = extractClaudeCliModel(envelope, this._model)
    const promptTokens = envelope.usage?.input_tokens ?? null
    const completionTokens = envelope.usage?.output_tokens ?? null
    const totalTokens = promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null

    return {
      text,
      provider: "claude",
      model,
      usage: { promptTokens, completionTokens, totalTokens },
      rawResponse: envelope,
    }
  }

  async streamText(input: ModelStreamInput): Promise<ModelGenerateResult> {
    if (input.responseSchema) {
      const result = await this.generate(input)
      if (result.text) {
        await input.onTextDelta(result.text)
      }
      return result
    }

    const { systemPrompt, prompt } = this.buildPrompt(input.messages)
    const systemPromptFilePath = systemPrompt ? await writeTempSystemPromptFile(systemPrompt) : undefined
    try {
      return await this.streamClaudeCliProcess(input, prompt, systemPromptFilePath)
    } finally {
      if (systemPromptFilePath) await rm(join(systemPromptFilePath, ".."), { recursive: true, force: true })
    }
  }

  private async streamClaudeCliProcess(
    input: ModelStreamInput,
    prompt: string,
    systemPromptFilePath: string | undefined,
  ): Promise<ModelGenerateResult> {
    const args = buildClaudeCliArgs({
      model: this._model,
      systemPromptFilePath,
      outputFormat: "stream-json",
    })

    // See generate() above for why cross-spawn instead of node:child_process.
    const child = crossSpawn(resolveClaudeCliPath(), args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...(input.signal ? { signal: input.signal } : {}),
    })
    // See generate() above — prompt goes over stdin to dodge Windows'
    // command-line length limit, not as a positional arg.
    child.stdin!.end(prompt)
    child.stdout!.setEncoding("utf8")
    child.stderr!.setEncoding("utf8")

    let stderr = ""
    child.stderr!.on("data", (chunk: string) => {
      stderr += chunk
    })

    // Unlike generate() above, this path had no "error" listener at all —
    // a spawn failure (binary not found) still closes the stream and falls
    // through to the exit-code check below, surfacing as an opaque
    // "exited with code -2" (the errno some environments use as a synthetic
    // close code) instead of a real explanation.
    let spawnError: NodeJS.ErrnoException | undefined
    child.on("error", (err: NodeJS.ErrnoException) => {
      spawnError = err
    })

    let buffer = ""
    let accumulatedText = ""
    let inputTokens: number | null = null
    let outputTokens: number | null = null
    // On failure the CLI's final NDJSON "result" event carries `is_error`
    // and a human-readable `result` string (e.g. account/org policy
    // errors) — same shape as the non-streaming envelope, just delivered
    // as one more stream line instead of the whole stdout body.
    let lastResultError: string | undefined

    for await (const chunk of child.stdout as AsyncIterable<string>) {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event = JSON.parse(trimmed) as ClaudeCliStreamEvent
          if (event.type === "stream_event" && event.event?.type === "content_block_delta" && event.event.delta?.type === "text_delta" && event.event.delta.text) {
            accumulatedText += event.event.delta.text
            await input.onTextDelta(event.event.delta.text)
          }
          if (event.type === "result") {
            if (event.usage) {
              inputTokens = event.usage.input_tokens ?? inputTokens
              outputTokens = event.usage.output_tokens ?? outputTokens
            }
            const resultEvent = event as unknown as { is_error?: boolean; result?: string }
            if (resultEvent.is_error && resultEvent.result) {
              lastResultError = resultEvent.result
            }
          }
        } catch {
          // partial/non-JSON line — wait for more chunks
        }
      }
    }

    const exitCode: number = await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve(child.exitCode)
        return
      }
      child.once("close", (code) => resolve(code ?? 0))
    })

    if (exitCode !== 0) {
      if (isClaudeCliNotFoundError(spawnError) || (!lastResultError && !stderr)) {
        throw new Error(CLAUDE_CLI_NOT_FOUND_MESSAGE)
      }
      throw new Error(`claude CLI exited with code ${exitCode}: ${lastResultError || stderr}`)
    }

    const totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
    return {
      text: accumulatedText,
      provider: "claude",
      model: this._model,
      usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens },
      rawResponse: null,
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createModelProvider(config: import("./config").ThinkingGraphRuntimeConfig): ModelProvider {
  if (config.provider === "gemini") {
    return new GeminiModelProvider({ model: config.geminiModel ?? undefined })
  }
  if (config.provider === "claude-cli") {
    return new ClaudeCliModelProvider({ model: config.claudeModel ?? undefined })
  }
  if (config.provider === "claude") {
    return new ClaudeModelProvider({ model: config.claudeModel ?? undefined, apiKey: config.claudeApiKey ?? undefined })
  }
  return new OllamaModelProvider({ baseUrl: config.ollamaBaseUrl, model: config.ollamaModel })
}

export function createSyntheticJsonOutput(input: {
  syntheticId: string
  syntheticName: string
  summary: string
  details: string
  recommendation: string
  changesFromPrevious: string[]
  appliedInputs: string[]
  ignoredInputs: string[]
  keyRisks: string[]
  concernLevels: {
    feasibility: number
    risk: number
    complexityLabel: "low" | "medium" | "high"
  }
  operational?: SyntheticReport["operational"]
  handoff?: string
  upstreamContext?: string[]
  directedHandoffs?: SyntheticReport["directedHandoffs"]
  provider: string
  model: string
  raw?: unknown
  tokenUsage?: import("./types").TokenUsage | null
  outputQuality?: import("./types").SyntheticReport["outputQuality"]
}): SyntheticOutputJson {
  return {
    syntheticId: input.syntheticId,
    syntheticName: input.syntheticName,
    summary: input.summary,
    details: input.details,
    recommendation: input.recommendation,
    changesFromPrevious: input.changesFromPrevious,
    appliedInputs: input.appliedInputs,
    ignoredInputs: input.ignoredInputs,
    keyRisks: input.keyRisks,
    concernLevels: input.concernLevels,
    handoff: input.handoff ?? null,
    upstreamContext: input.upstreamContext ?? [],
    directedHandoffs: input.directedHandoffs ?? [],
    operational: input.operational ?? null,
    model: {
      provider: input.provider,
      model: input.model,
    },
    tokenUsage: input.tokenUsage ?? null,
    raw: input.raw ?? null,
    ...(input.outputQuality ? { outputQuality: input.outputQuality } : {}),
  }
}
