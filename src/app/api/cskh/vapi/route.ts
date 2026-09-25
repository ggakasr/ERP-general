import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runAgent } from "@/lib/cskh/agent"
import type { ChatMessage, BotConfig, SessionContext } from "@/lib/cskh/types"

const VAPI_SECRET = process.env.VAPI_SECRET || ""

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  if (VAPI_SECRET && req.headers.get("x-vapi-secret") !== VAPI_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 })
  }

  const payload = await req.json().catch(() => null)
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  const db = admin()
  if (!db) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })

  const callId = (payload.call?.id || "unknown").replace(/-/g, "").slice(0, 24)
  const vapiSessionId = `vapi-${callId}`

  const widgetKey = payload.widget_key || payload.metadata?.widget_key
  if (!widgetKey) {
    return NextResponse.json({ output: "Xin lỗi, em không tìm được cấu hình. Anh/chị vui lòng gọi lại sau.", end_call: true })
  }

  const { data: cfg } = await db
    .from("cskh_bot_config")
    .select("*")
    .eq("widget_key", widgetKey)
    .single()

  if (!cfg || !cfg.bot_enabled || !cfg.voice_enabled) {
    return NextResponse.json({ output: "Dịch vụ tạm ngưng. Vui lòng gọi lại sau.", end_call: true }, { status: 403 })
  }

  const tenantId = cfg.tenant_id as string

  let sessionId: string
  const { data: existingSess } = await db
    .from("cskh_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("widget_key", widgetKey)
    .eq("channel", "voice")
    .in("status", ["serving", "awaiting_human"])
    .limit(1)
    .single()

  if (existingSess) {
    sessionId = existingSess.id
  } else {
    const { data: newSession } = await db.rpc("api_cskh_start_session", {
      p_tenant_id: tenantId, p_channel: "voice",
      p_source: "phone", p_widget_key: widgetKey,
    })
    if (!newSession?.ok) {
      return NextResponse.json({ output: "Hệ thống đang bận. Vui lòng gọi lại sau.", end_call: true })
    }
    sessionId = newSession.session_id as string
  }

  const messages: Array<{ role: string; content: string }> = payload.messages || []
  let lastUser = ""
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].content?.trim()) {
      lastUser = messages[i].content.trim()
      break
    }
  }

  if (!lastUser) {
    return NextResponse.json({
      output: "Dạ xin lỗi, em chưa nghe rõ. Anh/chị nói lại giúp em ạ.",
      end_call: false,
    })
  }

  const botConfig: BotConfig = {
    provider: cfg.provider, model: cfg.model, persona: cfg.persona,
    greeting: cfg.greeting, handoff_confidence: cfg.handoff_confidence,
    forbidden_promises: cfg.forbidden_promises || [],
    sensitive_fields: cfg.sensitive_fields || [],
    bot_enabled: cfg.bot_enabled, widget_key: cfg.widget_key,
  }

  const { data: sessData } = await db.rpc("api_cskh_session_load", {
    p_tenant_id: tenantId, p_session_id: sessionId,
  })

  const ctx: SessionContext = {
    tenantId, sessionId, status: sessData?.session?.status || "serving",
    channel: "voice", verifiedOrders: sessData?.session?.verified_orders || [],
    customerId: sessData?.session?.customer_id || null,
  }

  const { data: kbData } = await db.rpc("api_cskh_kb_published", { p_tenant_id: tenantId })
  const kbArticles = (kbData?.articles || []) as Array<{ title: string; body: string }>

  const history: ChatMessage[] = ((sessData?.messages || []) as Array<{
    role: string; content: string | null
  }>).map(m => ({ role: m.role as ChatMessage["role"], content: m.content }))

  await db.rpc("api_cskh_add_message", {
    p_tenant_id: tenantId, p_session_id: sessionId,
    p_role: "user", p_content: lastUser,
  })

  try {
    const result = await runAgent(lastUser, history, ctx, botConfig, kbArticles)
    const replyText = result.reply || "Dạ, em chưa hiểu ạ."

    if (result.reply) {
      await db.rpc("api_cskh_add_message", {
        p_tenant_id: tenantId, p_session_id: sessionId,
        p_role: "assistant", p_content: result.reply,
        p_tool_calls: result.toolCalls.length > 0 ? JSON.stringify(result.toolCalls) : null,
        p_tokens_in: result.usage.tokensIn, p_tokens_out: result.usage.tokensOut,
      })
    }

    const endCall = result.handedOff
    return NextResponse.json({
      output: replyText,
      end_call: endCall,
      metadata: { session_id: sessionId, status: ctx.status, handoff_reason: endCall ? "awaiting_human" : null },
    })
  } catch {
    return NextResponse.json({
      output: "Em xin lỗi, hệ thống đang gặp sự cố. Anh/chị vui lòng gọi lại sau ạ.",
      end_call: true,
    })
  }
}
