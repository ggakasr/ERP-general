import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runAgent } from "@/lib/cskh/agent"
import type { ChatMessage, BotConfig, SessionContext } from "@/lib/cskh/types"

const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 30

const ipCounts = new Map<string, { count: number; reset: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipCounts.get(ip)
  if (!entry || now > entry.reset) {
    ipCounts.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_REQUESTS_PER_WINDOW
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.message || typeof body.message !== "string") {
    return NextResponse.json({ ok: false, error: "missing_message" }, { status: 400 })
  }

  const db = admin()
  if (!db) {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })
  }

  let tenantId: string
  let sessionId: string | null = body.session_id || null

  // Resolve tenant from widget_key or session
  if (body.widget_key) {
    const { data: cfg } = await db
      .from("cskh_bot_config")
      .select("tenant_id, provider, model, persona, greeting, handoff_confidence, forbidden_promises, sensitive_fields, bot_enabled, widget_key")
      .eq("widget_key", body.widget_key)
      .single()

    if (!cfg) {
      return NextResponse.json({ ok: false, error: "invalid_widget_key" }, { status: 404 })
    }
    if (!cfg.bot_enabled) {
      return NextResponse.json({ ok: false, error: "bot_disabled" }, { status: 403 })
    }
    tenantId = cfg.tenant_id
  } else if (sessionId) {
    const { data: sess } = await db
      .from("cskh_sessions")
      .select("tenant_id")
      .eq("id", sessionId)
      .single()

    if (!sess) {
      return NextResponse.json({ ok: false, error: "invalid_session" }, { status: 404 })
    }
    tenantId = sess.tenant_id
  } else {
    return NextResponse.json({ ok: false, error: "missing_widget_key_or_session_id" }, { status: 400 })
  }

  // Load bot config
  const { data: config } = await db
    .from("cskh_bot_config")
    .select("*")
    .eq("tenant_id", tenantId)
    .single()

  if (!config || !config.bot_enabled) {
    return NextResponse.json({ ok: false, error: "bot_disabled" }, { status: 403 })
  }

  const botConfig: BotConfig = {
    provider: config.provider,
    model: config.model,
    persona: config.persona,
    greeting: config.greeting,
    handoff_confidence: config.handoff_confidence,
    forbidden_promises: config.forbidden_promises || [],
    sensitive_fields: config.sensitive_fields || [],
    bot_enabled: config.bot_enabled,
    widget_key: config.widget_key,
  }

  // Create or load session
  if (!sessionId) {
    const { data: newSession } = await db.rpc("api_cskh_start_session", {
      p_tenant_id: tenantId,
      p_channel: body.channel || "chat",
      p_source: body.source || "public",
      p_widget_key: body.widget_key,
    })
    if (!newSession?.ok) {
      return NextResponse.json({ ok: false, error: newSession?.error || "session_create_failed" }, { status: 500 })
    }
    sessionId = newSession.session_id as string
  }

  // Load session data
  const { data: sessionData } = await db.rpc("api_cskh_session_load", {
    p_tenant_id: tenantId,
    p_session_id: sessionId,
  })

  if (!sessionData?.ok) {
    return NextResponse.json({ ok: false, error: "session_load_failed" }, { status: 500 })
  }

  const sess = sessionData.session as { id: string; status: string; channel: string; verified_orders: string[]; customer_id: string | null }

  // If session is awaiting_human or human_serving, just store the message, don't run bot
  if (sess.status === "awaiting_human" || sess.status === "human_serving") {
    await db.rpc("api_cskh_add_message", {
      p_tenant_id: tenantId,
      p_session_id: sessionId,
      p_role: "user",
      p_content: body.message,
    })
    return NextResponse.json({
      ok: true,
      session_id: sessionId,
      reply: null,
      status: sess.status,
      awaiting_human: true,
    })
  }

  const ctx: SessionContext = {
    tenantId,
    sessionId: sessionId!,
    status: sess.status,
    channel: sess.channel,
    verifiedOrders: sess.verified_orders || [],
    customerId: sess.customer_id,
  }

  // Load KB articles for system prompt
  const { data: kbData } = await db.rpc("api_cskh_kb_published", { p_tenant_id: tenantId })
  const kbArticles: Array<{ title: string; body: string }> = (kbData?.articles || []) as Array<{ title: string; body: string }>

  // Build history from stored messages
  const history: ChatMessage[] = ((sessionData.messages || []) as Array<{
    role: string; content: string | null; tool_calls: unknown
  }>).map(m => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }))

  // Store user message
  await db.rpc("api_cskh_add_message", {
    p_tenant_id: tenantId,
    p_session_id: sessionId,
    p_role: "user",
    p_content: body.message,
  })

  // Run agent
  try {
    const result = await runAgent(body.message, history, ctx, botConfig, kbArticles)

    // Store assistant reply
    if (result.reply) {
      await db.rpc("api_cskh_add_message", {
        p_tenant_id: tenantId,
        p_session_id: sessionId,
        p_role: "assistant",
        p_content: result.reply,
        p_tool_calls: result.toolCalls.length > 0 ? JSON.stringify(result.toolCalls) : null,
        p_tokens_in: result.usage.tokensIn,
        p_tokens_out: result.usage.tokensOut,
      })
    }

    // Record usage
    if (result.usage.tokensIn > 0 || result.usage.tokensOut > 0) {
      await db.rpc("api_cskh_record_usage", {
        p_tenant_id: tenantId,
        p_session_id: sessionId,
        p_provider: result.usage.provider,
        p_model: result.usage.model,
        p_tokens_in: result.usage.tokensIn,
        p_tokens_out: result.usage.tokensOut,
      })
    }

    return NextResponse.json({
      ok: true,
      session_id: sessionId,
      reply: result.reply,
      status: ctx.status,
      handed_off: result.handedOff,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json({
      ok: true,
      session_id: sessionId,
      reply: "Em xin lỗi, hệ thống đang gặp sự cố. Anh/chị vui lòng thử lại sau hoặc liên hệ nhân viên ạ.",
      status: "serving",
      error_detail: msg,
    })
  }
}
