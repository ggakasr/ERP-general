import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.session_id) {
    return NextResponse.json({ ok: false, error: "missing_session_id" }, { status: 400 })
  }

  const db = admin()
  if (!db) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })

  const sessionId = body.session_id as string

  const { data: sess } = await db
    .from("cskh_sessions")
    .select("tenant_id, status")
    .eq("id", sessionId)
    .single()

  if (!sess) return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 })

  const { data: msgData } = await db.rpc("api_cskh_session_load", {
    p_tenant_id: sess.tenant_id,
    p_session_id: sessionId,
  })

  const messages = (msgData?.messages || []) as Array<{
    role: string; content: string | null; created_at: string
  }>

  const transcript = messages
    .filter(m => m.content)
    .map(m => ({ role: m.role, content: m.content, time: m.created_at }))

  if (sess.status !== "closed") {
    await db
      .from("cskh_sessions")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", sessionId)
  }

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    transcript,
    turn_count: transcript.length,
    status: "closed",
  })
}
