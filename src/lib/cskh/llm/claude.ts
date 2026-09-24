import Anthropic from "@anthropic-ai/sdk"
import type { ChatMessage, LLMProvider, LLMResponse, ToolCall, ToolDef } from "../types"

export class ClaudeProvider implements LLMProvider {
  name = "claude"
  model: string
  private client: Anthropic

  constructor(apiKey: string, model?: string) {
    this.model = model || "claude-sonnet-4-20250514"
    this.client = new Anthropic({ apiKey })
  }

  async chat(messages: ChatMessage[], tools: ToolDef[], systemPrompt: string): Promise<LLMResponse> {
    const anthropicMessages = messages
      .filter(m => m.role !== "system")
      .map(m => this.toAnthropicMessage(m))

    const anthropicTools = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }))

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
    })

    let content: string | null = null
    const toolCalls: ToolCall[] = []

    for (const block of response.content) {
      if (block.type === "text") {
        content = (content || "") + block.text
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input as Record<string, unknown>,
        })
      }
    }

    return {
      content,
      toolCalls,
      usage: {
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      },
    }
  }

  private toAnthropicMessage(m: ChatMessage): Anthropic.MessageParam {
    if (m.role === "tool") {
      return {
        role: "user",
        content: [{
          type: "tool_result" as const,
          tool_use_id: m.tool_call_id || "unknown",
          content: m.content || "",
        }],
      }
    }

    if (m.role === "assistant" && m.tool_calls?.length) {
      const blocks: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = []
      if (m.content) blocks.push({ type: "text" as const, text: m.content })
      for (const tc of m.tool_calls) {
        blocks.push({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.args })
      }
      return { role: "assistant", content: blocks }
    }

    return {
      role: m.role === "user" ? "user" : "assistant",
      content: m.content || "",
    }
  }
}
