export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "system"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: unknown
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LLMResponse {
  content: string | null
  toolCalls: ToolCall[]
  usage: { tokensIn: number; tokensOut: number }
}

export interface LLMProvider {
  name: string
  model: string
  chat(messages: ChatMessage[], tools: ToolDef[], systemPrompt: string): Promise<LLMResponse>
}

export interface SessionContext {
  tenantId: string
  sessionId: string
  status: string
  channel: string
  verifiedOrders: string[]
  customerId: string | null
}

export interface BotConfig {
  provider: string
  model: string
  persona: string
  greeting: string
  handoff_confidence: number
  forbidden_promises: string[]
  sensitive_fields: string[]
  bot_enabled: boolean
  widget_key: string
}

export interface AgentResult {
  reply: string
  toolCalls: ToolCall[]
  usage: { tokensIn: number; tokensOut: number; provider: string; model: string }
  handedOff: boolean
}
