import { NextResponse, type NextRequest } from "next/server"
import { Client } from "pg"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface OutboxRow {
  id: string
  to_email: string
  subject: string
  body: string
  document_id: string | null
}

async function sendViaResend(row: OutboxRow, apiKey: string, from: string, appUrl: string) {
  const link = row.document_id ? `\n\nXem chi tiết: ${appUrl}/documents/${row.document_id}` : ""
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [row.to_email], subject: row.subject, text: row.body + link }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `Resend HTTP ${res.status}`)
  return data.id as string | undefined
}

/**
 * Flushes queued rows in email_outbox — sends for real via Resend if RESEND_API_KEY is
 * configured, otherwise marks them SIMULATED so the outbox still shows what would have
 * been sent. Connects directly with SUPABASE_DB_URL (server-only, already used by
 * scripts/db.mjs) since this is a trusted background job, not a user session action.
 *
 * Trigger this from: Vercel Cron (see vercel.json — Vercel invokes cron paths with GET),
 * the notification bell's poll tick (best-effort, for local dev), or the admin Email
 * panel's "Gửi ngay" button (both POST). If CRON_SECRET is set, only requests carrying
 * that bearer token are accepted — Vercel sends it automatically for configured cron
 * jobs, which means once it's set, the poll tick and "Gửi ngay" button stop working
 * (by design: only the real cron may flush) unless you also expose it to the client.
 */
async function flush(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) return NextResponse.json({ ok: false, error: "SUPABASE_DB_URL not configured" }, { status: 500 })

  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || "ERP General <onboarding@resend.dev>"
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  let claimed = 0, sent = 0, simulated = 0, failed = 0
  try {
    const { rows } = await client.query<OutboxRow>(
      `SELECT id, to_email, subject, body, document_id FROM email_outbox WHERE status = 'QUEUED' ORDER BY created_at LIMIT 50`
    )
    claimed = rows.length
    for (const row of rows) {
      if (!resendKey) {
        await client.query(`UPDATE email_outbox SET status = 'SIMULATED', sent_at = now() WHERE id = $1`, [row.id])
        simulated++
        continue
      }
      try {
        const providerId = await sendViaResend(row, resendKey, from, appUrl)
        await client.query(`UPDATE email_outbox SET status = 'SENT', provider_id = $2, sent_at = now() WHERE id = $1`, [row.id, providerId || null])
        sent++
      } catch (e: any) {
        await client.query(`UPDATE email_outbox SET status = 'FAILED', error = $2 WHERE id = $1`, [row.id, String(e?.message || e).slice(0, 500)])
        failed++
      }
    }
  } finally {
    await client.end()
  }

  return NextResponse.json({ ok: true, claimed, sent, simulated, failed, provider: resendKey ? "resend" : null })
}

export const GET = flush
export const POST = flush
