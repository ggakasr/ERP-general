import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const GATE_COOKIE = "demo_gate"
const GATE_PATHS = ["/gate", "/api/gate"]

// Refreshes the Supabase session cookie and guards every page behind sign-in.
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Optional outer gate for public demo deployments: when DEMO_GATE_CODE is set, every
  // route (including /login, which shows the shared demo password) requires this code first.
  // Disabled by default — set DEMO_GATE_CODE in the environment to turn it on.
  const gateCode = process.env.DEMO_GATE_CODE
  if (gateCode && !GATE_PATHS.includes(path)) {
    if (request.cookies.get(GATE_COOKIE)?.value !== gateCode) {
      const redirect = request.nextUrl.clone()
      redirect.pathname = "/gate"
      redirect.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`
      return NextResponse.redirect(redirect)
    }
  }

  let response = NextResponse.next({ request })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && path !== "/login") {
    const redirect = request.nextUrl.clone()
    redirect.pathname = "/login"
    redirect.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(redirect)
  }
  if (user && (path === "/login" || path === "/")) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = "/dashboard"
    redirect.search = ""
    return NextResponse.redirect(redirect)
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
