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
  if (!body?.session_id || typeof body.csat !== "number" || body.csat < 1 || body.csat > 5) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 })
  }

  const db = admin()
  if (!db) {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 })
  }

  const { data: sess } = await db
    .from("cskh_sessions")
    .select("tenant_id")
    .eq("id", body.session_id)
    .single()

  if (!sess) {
    return NextResponse.json({ ok: false, error: "session_not_found" }, { status: 404 })
  }

  await db.rpc("api_cskh_update_session", {
    p_tenant_id: sess.tenant_id,
    p_session_id: body.session_id,
    p_status: "closed",
    p_csat: body.csat,
  })

  return NextResponse.json({ ok: true })
}
