import { NextResponse, type NextRequest } from "next/server"

const GATE_COOKIE = "demo_gate"

// Validates the shared demo access code (DEMO_GATE_CODE) and, on success, sets the
// cookie that src/middleware.ts checks before letting anyone reach /login or the app.
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const code = String(form.get("code") || "")
  const next = String(form.get("next") || "/login")
  const expected = process.env.DEMO_GATE_CODE

  if (!expected || code !== expected) {
    const url = new URL("/gate", request.url)
    url.searchParams.set("error", "1")
    url.searchParams.set("next", next)
    return NextResponse.redirect(url, { status: 303 })
  }

  const target = next.startsWith("/") ? next : "/login"
  const res = NextResponse.redirect(new URL(target, request.url), { status: 303 })
  res.cookies.set(GATE_COOKIE, expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
