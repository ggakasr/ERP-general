import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET() {
  const db = await createServerSupabaseClient()
  if (!db) {
    return NextResponse.json({ ok: false, error: "no_auth" }, { status: 401 })
  }

  const { data: cfg } = await db.rpc("api_cskh_config_get")
  if (!cfg?.ok || !cfg.config) {
    return NextResponse.json({ ok: false, error: "no_config" })
  }

  return NextResponse.json({ ok: true, widget_key: cfg.config.widget_key })
}
