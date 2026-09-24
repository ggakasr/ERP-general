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
  if (!db) {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })
  }

  const { data: sess } = await db
    .from("cskh_sessions")
    .select("id, tenant_id, status")
    .eq("id", body.session_id)
    .single()

  if (!sess) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 })
  }

  const { data: msgs } = await db
    .from("cskh_messages")
    .select("role, content, created_at")
    .eq("session_id", body.session_id)
    .order("created_at", { ascending: true })

  return NextResponse.json({
    ok: true,
    status: sess.status,
    messages: (msgs || []).map(m => ({
      role: m.role,
      content: m.content,
    })),
  })
}
