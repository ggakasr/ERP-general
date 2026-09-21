import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ ok: false, error: "Invalid subscription object" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("api_save_push_subscription", {
    p_endpoint: body.endpoint,
    p_p256dh: body.keys.p256dh,
    p_auth: body.keys.auth,
    p_user_agent: req.headers.get("user-agent") ?? undefined,
  })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 503 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.endpoint) return NextResponse.json({ ok: false, error: "endpoint required" }, { status: 400 })

  const { data, error } = await supabase.rpc("api_delete_push_subscription", { p_endpoint: body.endpoint })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { ok: true })
}
