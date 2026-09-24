import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

const RATE_LIMIT = { maxPerIp: 5, maxPerEmail: 2, windowMinutes: 60 }

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.email || !body?.company || !body?.name) {
    return NextResponse.json({ ok: false, error: "Thiếu thông tin bắt buộc" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Chưa cấu hình server" }, { status: 500 })
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const emailInput = String(body.email).toLowerCase().trim()
  const cutoff = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000).toISOString()

  const { count: ipCount } = await admin
    .from("demo_signups")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", cutoff)
  if ((ipCount ?? 0) >= RATE_LIMIT.maxPerIp) {
    return NextResponse.json({ ok: false, error: "Quá nhiều yêu cầu, vui lòng thử lại sau" }, { status: 429 })
  }

  const { count: emailCount } = await admin
    .from("demo_signups")
    .select("id", { count: "exact", head: true })
    .eq("email", emailInput)
    .gte("created_at", cutoff)
  if ((emailCount ?? 0) >= RATE_LIMIT.maxPerEmail) {
    return NextResponse.json({ ok: false, error: "Email này đã đăng ký gần đây" }, { status: 429 })
  }

  const email = String(body.email).toLowerCase().trim()
  const company = String(body.company).trim()
  const name = String(body.name).trim()
  const password = "Demo@123"

  const code = company
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8) || "DEMO"
  const tenantCode = `${code}${Date.now().toString(36).slice(-4).toUpperCase()}`

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (authErr) {
    if (authErr.message?.includes("already been registered")) {
      return NextResponse.json({ ok: false, error: "Email đã được đăng ký" }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: authErr.message }, { status: 500 })
  }

  const userId = authUser.user.id

  const { data: tenant } = await admin
    .from("tenants")
    .insert({ code: tenantCode, name: company, plan: "STARTER", settings: {} })
    .select("id")
    .single()

  if (!tenant) {
    return NextResponse.json({ ok: false, error: "Không thể tạo tenant" }, { status: 500 })
  }

  const { data: branch } = await admin
    .from("branches")
    .insert({ code: `${tenantCode}-HQ`, name: `${company} HQ`, tenant_id: tenant.id })
    .select("id")
    .single()

  const { data: dept } = await admin
    .from("departments")
    .insert({ code: "GEN", name: "Chung", branch_id: branch?.id, tenant_id: tenant.id })
    .select("id")
    .single()

  await admin.from("app_users").insert({
    id: userId,
    email,
    full_name: name,
    tenant_id: tenant.id,
    branch_id: branch?.id,
    department_id: dept?.id,
    status: "ACTIVE",
  })

  await admin.from("user_roles").insert([
    { user_id: userId, role_code: "SYS_ADMIN", tenant_id: tenant.id },
    { user_id: userId, role_code: "CFO", tenant_id: tenant.id },
  ])

  await admin.from("subscriptions").insert({
    tenant_id: tenant.id,
    plan: "STARTER",
    seats: 5,
    valid_from: new Date().toISOString().slice(0, 10),
    status: "TRIAL",
    trial_ends: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
  })

  await admin.from("demo_signups").insert({ email, ip_address: ip })

  return NextResponse.json({
    ok: true,
    email,
    password,
    tenant: tenantCode,
    message: "Tài khoản demo đã tạo thành công",
  })
}
