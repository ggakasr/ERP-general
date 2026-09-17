import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Refreshes the Supabase session cookie and guards every page behind sign-in.
export async function middleware(request: NextRequest) {
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

  const path = request.nextUrl.pathname
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
