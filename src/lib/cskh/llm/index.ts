import type { LLMProvider, BotConfig } from "../types"
import { MockProvider } from "./mock"
import { ClaudeProvider } from "./claude"
import { OpenAICompatProvider } from "./openai-compat"

export function createProvider(config: BotConfig): LLMProvider {
  const provider = resolveProvider(config.provider)
  const model = resolveModel(config.model)

  switch (provider) {
    case "claude": {
      const key = process.env.ANTHROPIC_API_KEY
      if (!key) return new MockProvider()
      return new ClaudeProvider(key, model || "claude-sonnet-4-20250514")
    }
    case "openai-compat": {
      const key = openAIKey()
      const baseUrl = process.env.CSKH_OPENAI_BASE_URL || "https://api.openai.com/v1"
      if (!key) return new MockProvider()
      return new OpenAICompatProvider(key, baseUrl, model || "gpt-4o-mini")
    }
    default:
      return new MockProvider()
  }
}

// "openai" is accepted as an alias: the config UI and docs used it before the
// adapter was named "openai-compat", and existing config rows may still hold it.
function normalizeProvider(p: string | undefined): string {
  const v = (p || "").trim().toLowerCase()
  return v === "openai" ? "openai-compat" : v
}

function openAIKey(): string | undefined {
  return process.env.CSKH_OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY
}

function resolveProvider(configProvider: string): string {
  const fromConfig = normalizeProvider(configProvider)
  if (fromConfig && fromConfig !== "mock") {
    const key = fromConfig === "claude" ? process.env.ANTHROPIC_API_KEY : openAIKey()
    if (key) return fromConfig
  }
  const fromEnv = normalizeProvider(process.env.CSKH_LLM_PROVIDER)
  return fromEnv || "mock"
}

// Model precedence: bot config (tab Cấu hình) → CSKH_LLM_MODEL env → adapter default.
// "mock" is the DB default and means "not set".
function resolveModel(configModel: string | undefined): string | undefined {
  for (const m of [configModel, process.env.CSKH_LLM_MODEL]) {
    const v = (m || "").trim()
    if (v && v !== "mock") return v
  }
  return undefined
}
