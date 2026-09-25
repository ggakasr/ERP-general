import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSTT } from "@/lib/cskh/voice/stt"
import { createTTS } from "@/lib/cskh/voice/tts"
import { createTelephony } from "@/lib/cskh/voice/telephony"
import { runAgent } from "@/lib/cskh/agent"
import type { BotConfig, SessionContext } from "@/lib/cskh/types"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.widget_key) {
    return NextResponse.json({ ok: false, error: "missing_widget_key" }, { status: 400 })
  }

  const db = admin()
  if (!db) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })

  const { data: cfg } = await db
    .from("cskh_bot_config")
    .select("*")
    .eq("widget_key", body.widget_key)
    .single()

  if (!cfg) return NextResponse.json({ ok: false, error: "invalid_widget_key" }, { status: 404 })
  if (!cfg.bot_enabled || !cfg.voice_enabled) {
    return NextResponse.json({ ok: false, error: "voice_disabled" }, { status: 403 })
  }

  const telephony = createTelephony("mock")
  const { callId } = await telephony.startCall(body.caller_id || "unknown")

  const { data: newSession } = await db.rpc("api_cskh_start_session", {
    p_tenant_id: cfg.tenant_id,
    p_channel: "voice",
    p_source: body.source || "phone",
    p_widget_key: body.widget_key,
  })

  if (!newSession?.ok) {
    return NextResponse.json({ ok: false, error: "session_create_failed" }, { status: 500 })
  }

  const sessionId = newSession.session_id as string
  const botConfig: BotConfig = {
    provider: cfg.provider, model: cfg.model, persona: cfg.persona,
    greeting: cfg.greeting, handoff_confidence: cfg.handoff_confidence,
    forbidden_promises: cfg.forbidden_promises || [],
    sensitive_fields: cfg.sensitive_fields || [],
    bot_enabled: cfg.bot_enabled, widget_key: cfg.widget_key,
  }

  const ctx: SessionContext = {
    tenantId: cfg.tenant_id, sessionId, status: "serving",
    channel: "voice", verifiedOrders: [], customerId: null,
  }

  const { data: kbData } = await db.rpc("api_cskh_kb_published", { p_tenant_id: cfg.tenant_id })
  const kbArticles = (kbData?.articles || []) as Array<{ title: string; body: string }>

  const greetingResult = await runAgent("xin chào", [], ctx, botConfig, kbArticles)
  const greetingText = greetingResult.reply || cfg.greeting || "Xin chào!"

  await db.rpc("api_cskh_add_message", {
    p_tenant_id: cfg.tenant_id, p_session_id: sessionId,
    p_role: "assistant", p_content: greetingText,
  })

  const tts = createTTS(body.tts_provider || "mock")
  const { audio, contentType } = await tts.synthesize(greetingText)

  return NextResponse.json({
    ok: true,
    call_id: callId,
    session_id: sessionId,
    greeting: greetingText,
    audio: audio.toString("base64"),
    audio_content_type: contentType,
    status: "serving",
  })
}
