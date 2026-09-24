import type { LLMProvider, BotConfig } from "../types"
import { MockProvider } from "./mock"
import { ClaudeProvider } from "./claude"
import { OpenAICompatProvider } from "./openai-compat"

export function createProvider(config: BotConfig): LLMProvider {
  const provider = resolveProvider(config.provider)
  const model = config.model || "mock"

  switch (provider) {
    case "claude": {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) return new MockProvider()
      return new ClaudeProvider(key, model !== "mock" ? model : "claude-sonnet-4-20250514")
    }
    case "openai-compat": {
      const key = process.env.CSKH_OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY
      const baseUrl = process.env.CSKH_OPENAI_BASE_URL || "https://api.openai.com/v1"
      if (!key) return new MockProvider()
      return new OpenAICompatProvider(key, baseUrl, model !== "mock" ? model : "gpt-4o-mini")
    }
    default:
      return new MockProvider()
  }
}

function resolveProvider(configProvider: string): string {
  const env = process.env.CSKH_LLM_PROVIDER
  if (configProvider !== "mock") {
    const key = configProvider === "claude"
      ? process.env.ANTHROPIC_API_KEY
      : (process.env.CSKH_OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY)
    if (key) return configProvider
  }
  if (env) return env
  return "mock"
}
