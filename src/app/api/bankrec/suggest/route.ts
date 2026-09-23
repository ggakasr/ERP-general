// /api/bankrec/suggest — WP-H2
// GET: gọi api_bankrec_suggest trả về gợi ý matching cho BANKREC
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase chưa cấu hình" }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 })

  const documentId = req.nextUrl.searchParams.get("document_id")
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Thiếu document_id" }, { status: 400 })
  }

  const { data } = await supabase.rpc("api_bankrec_suggest", {
    p_document_id: documentId,
  })

  if (!data?.ok) {
    return NextResponse.json({ ok: false, error: "Lỗi gợi ý", detail: data }, { status: 400 })
  }

  return NextResponse.json(data)
}
