import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSTT } from "@/lib/cskh/voice/stt"
import { createTTS } from "@/lib/cskh/voice/tts"
import { runAgent } from "@/lib/cskh/agent"
import type { ChatMessage, BotConfig, SessionContext } from "@/lib/cskh/types"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.session_id || (!body?.utterance && !body?.audio)) {
    return NextResponse.json({ ok: false, error: "missing_session_id_or_input" }, { status: 400 })
  }

  const db = admin()
  if (!db) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })

  const sessionId = body.session_id as string

  const { data: sessionData } = await db
    .from("cskh_sessions")
    .select("tenant_id, status, channel, verified_orders, customer_id")
    .eq("id", sessionId)
    .single()

  if (!sessionData) return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 })

  const tenantId = sessionData.tenant_id as string

  const { data: cfg } = await db
    .from("cskh_bot_config")
    .select("*")
    .eq("tenant_id", tenantId)
    .single()

  if (!cfg || !cfg.bot_enabled) {
    return NextResponse.json({ ok: false, error: "bot_disabled" }, { status: 403 })
  }

  const stt = createSTT(body.stt_provider || "mock")
  let userText: string
  if (body.audio) {
    userText = await stt.transcribe(Buffer.from(body.audio, "base64"))
  } else {
    userText = await stt.transcribe(body.utterance as string)
  }

  if (sessionData.status === "awaiting_human" || sessionData.status === "human_serving") {
    await db.rpc("api_cskh_add_message", {
      p_tenant_id: tenantId, p_session_id: sessionId,
      p_role: "user", p_content: userText,
    })
    return NextResponse.json({
      ok: true, session_id: sessionId,
      utterance: userText, reply: null,
      status: sessionData.status, awaiting_human: true,
    })
  }

  const botConfig: BotConfig = {
    provider: cfg.provider, model: cfg.model, persona: cfg.persona,
    greeting: cfg.greeting, handoff_confidence: cfg.handoff_confidence,
    forbidden_promises: cfg.forbidden_promises || [],
    sensitive_fields: cfg.sensitive_fields || [],
    bot_enabled: cfg.bot_enabled, widget_key: cfg.widget_key,
  }

  const ctx: SessionContext = {
    tenantId, sessionId, status: sessionData.status,
    channel: "voice", verifiedOrders: sessionData.verified_orders || [],
    customerId: sessionData.customer_id,
  }

  const { data: kbData } = await db.rpc("api_cskh_kb_published", { p_tenant_id: tenantId })
  const kbArticles = (kbData?.articles || []) as Array<{ title: string; body: string }>

  const { data: msgData } = await db.rpc("api_cskh_session_load", {
    p_tenant_id: tenantId, p_session_id: sessionId,
  })
  const history: ChatMessage[] = ((msgData?.messages || []) as Array<{
    role: string; content: string | null
  }>).map(m => ({ role: m.role as ChatMessage["role"], content: m.content }))

  await db.rpc("api_cskh_add_message", {
    p_tenant_id: tenantId, p_session_id: sessionId,
    p_role: "user", p_content: userText,
  })

  const result = await runAgent(userText, history, ctx, botConfig, kbArticles)
  const replyText = result.reply || "Xin lỗi, em không nghe rõ."

  if (result.reply) {
    await db.rpc("api_cskh_add_message", {
      p_tenant_id: tenantId, p_session_id: sessionId,
      p_role: "assistant", p_content: result.reply,
      p_tool_calls: result.toolCalls.length > 0 ? JSON.stringify(result.toolCalls) : null,
      p_tokens_in: result.usage.tokensIn, p_tokens_out: result.usage.tokensOut,
    })
  }

  if (result.usage.tokensIn > 0 || result.usage.tokensOut > 0) {
    await db.rpc("api_cskh_record_usage", {
      p_tenant_id: tenantId, p_session_id: sessionId,
      p_provider: result.usage.provider, p_model: result.usage.model,
      p_tokens_in: result.usage.tokensIn, p_tokens_out: result.usage.tokensOut,
    })
  }

  const tts = createTTS(body.tts_provider || "mock")
  const { audio, contentType } = await tts.synthesize(replyText)

  return NextResponse.json({
    ok: true, session_id: sessionId,
    utterance: userText, reply: replyText,
    audio: audio.toString("base64"),
    audio_content_type: contentType,
    status: ctx.status, handed_off: result.handedOff,
  })
}
