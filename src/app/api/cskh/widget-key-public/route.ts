import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false })
  }

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: configs } = await db
    .from("cskh_bot_config")
    .select("widget_key, bot_enabled")
    .eq("bot_enabled", true)
    .limit(1)

  if (!configs?.length) {
    return NextResponse.json({ ok: false })
  }

  return NextResponse.json({ ok: true, widget_key: configs[0].widget_key })
}
