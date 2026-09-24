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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
