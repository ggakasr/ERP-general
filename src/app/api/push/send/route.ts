// Internal API route: sends a Web Push notification to a specific user's devices.
// Called server-side only (e.g., from a Next.js server action or cron job).
// Requires VAPID env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { NextRequest, NextResponse } from "next/server"
import webpush from "web-push"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? ""
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ""
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@erp.demo"

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

export async function POST(req: NextRequest) {
  // Only callable from server-side (internal secret header)
  const secret = req.headers.get("x-push-secret")
  if (!secret || secret !== process.env.PUSH_INTERNAL_SECRET) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ ok: false, error: "VAPID keys not configured" }, { status: 503 })
  }

  const { user_id, title, body, url } = await req.json().catch(() => ({}))
  if (!user_id || !title) return NextResponse.json({ ok: false, error: "user_id and title required" }, { status: 400 })

  const supabase = createServerSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 503 })
  const { data: subs } = await supabase.rpc("api_list_push_subscriptions", { p_user_id: user_id })
  if (!subs?.ok || !subs.rows?.length) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title, body, url: url ?? "/notifications" })
  let sent = 0
  const errors: string[] = []
  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      sent++
    } catch (err) {
      errors.push(String(err))
      // If subscription is expired (410/404), clean it up
      if ((err as { statusCode?: number }).statusCode === 410 || (err as { statusCode?: number }).statusCode === 404) {
        await supabase.rpc("api_delete_push_subscription", { p_endpoint: sub.endpoint })
      }
    }
  }
  return NextResponse.json({ ok: true, sent, errors })
}
