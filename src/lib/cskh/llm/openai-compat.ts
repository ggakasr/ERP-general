import type { ChatMessage, LLMProvider, LLMResponse, ToolCall, ToolDef } from "../types"

interface OpenAIMessage {
  role: string
  content?: string | null
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

interface OpenAIChoice {
  message: {
    content?: string | null
    tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>
  }
}

// Transient provider errors (rate limit, overload — e.g. Gemini free tier 503 "high demand").
// Retry delays (1s, 2s, Retry-After capped at 4s) keep a turn inside agent.ts TIMEOUT_MS (15s).
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const RETRY_DELAYS_MS = [1_000, 2_000]
const MAX_RETRY_AFTER_MS = 4_000

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  delays: number[] = RETRY_DELAYS_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, init)
    if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt >= delays.length) return res
    const retryAfterSec = Number(res.headers.get("retry-after"))
    const wait = retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS) : delays[attempt]
    await res.body?.cancel().catch(() => {})
    await new Promise(r => setTimeout(r, wait))
  }
}

export class OpenAICompatProvider implements LLMProvider {
  name = "openai-compat"
  model: string
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl: string, model?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, "")
    this.model = model || "gpt-4o-mini"
  }

  async chat(messages: ChatMessage[], tools: ToolDef[], systemPrompt: string): Promise<LLMResponse> {
    const oaiMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map(m => this.toOAIMessage(m)),
    ]

    const oaiTools = tools.map(t => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))

    const res = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: oaiMessages,
        tools: oaiTools.length > 0 ? oaiTools : undefined,
        max_tokens: 1024,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenAI-compat ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const choice: OpenAIChoice = data.choices?.[0]
    if (!choice) throw new Error("No choices in OpenAI-compat response")

    const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments),
    }))

    return {
      content: choice.message.content || null,
      toolCalls,
      usage: {
        tokensIn: data.usage?.prompt_tokens || 0,
        tokensOut: data.usage?.completion_tokens || 0,
      },
    }
  }

  private toOAIMessage(m: ChatMessage): OpenAIMessage {
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_call_id: m.tool_call_id || "unknown" }
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      }
    }
    return { role: m.role, content: m.content }
  }
}
