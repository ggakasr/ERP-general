// POST /api/ingest — AI Ingestion Pipeline (WP-E2)
// Nhận attachment_id + doc_type, gọi Claude vision API để trích xuất dữ liệu,
// rồi gọi api_apply_ingest để tạo DRAFT với ai_extracted=true.
// AI chỉ tạo DRAFT — không bao giờ SUBMIT / APPROVE / POST.
import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createServerSupabaseClient } from "@/lib/supabase/server"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ""

const EXTRACTION_PROMPT = `Bạn là AI trích xuất dữ liệu chứng từ kế toán/mua hàng.
Hãy đọc hình ảnh/file và trả về JSON với cấu trúc sau (chỉ JSON, không giải thích thêm):
{
  "title": "tiêu đề chứng từ (tùy chọn)",
  "partner_code": "mã đối tác/nhà cung cấp nếu có",
  "amount": 0,
  "doc_date": "YYYY-MM-DD hoặc null",
  "lines": [
    { "product_code": "mã sản phẩm", "quantity": 1, "unit_price": 0, "description": "mô tả" }
  ]
}
Nếu không tìm thấy thông tin, để null hoặc mảng rỗng. Chỉ trả về JSON hợp lệ.`

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server configuration error" }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.doc_type) {
    return NextResponse.json({ ok: false, error: "doc_type is required" }, { status: 400 })
  }

  // Step 1: create ingest job
  const { data: jobData, error: jobErr } = await supabase.rpc("api_create_ingest_job", {
    p_doc_type:      body.doc_type,
    p_source_type:   body.attachment_id ? "ATTACHMENT" : "UPLOAD",
    p_attachment_id: body.attachment_id ?? null,
  })
  if (jobErr || !jobData?.ok) {
    return NextResponse.json(
      { ok: false, error: jobErr?.message ?? jobData?.message ?? "Failed to create ingest job" },
      { status: 400 },
    )
  }
  const jobId: string = jobData.id

  // Step 2: get file bytes from Supabase Storage (if attachment provided)
  let extracted: Record<string, unknown> = {}
  let confidence = 0

  if (body.attachment_id && ANTHROPIC_API_KEY) {
    try {
      // Get attachment metadata
      const { data: attData } = await supabase.rpc("api_get_attachments", {
        p_document_id: body.document_id ?? null,
      })
      const attachment = attData?.attachments?.find(
        (a: { id: string; storage_path: string; mime: string }) => a.id === body.attachment_id,
      )

      if (attachment?.storage_path) {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("documents")
          .download(attachment.storage_path)

        if (!dlErr && fileData) {
          const buffer = await fileData.arrayBuffer()
          const base64 = Buffer.from(buffer).toString("base64")
          const rawMime = attachment.mime ?? "image/jpeg"
          const mediaType = (
            ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawMime)
              ? rawMime
              : "image/jpeg"
          ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

          const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
          const response = await anthropic.messages.create({
            model:      "claude-sonnet-5",
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
                { type: "text", text: EXTRACTION_PROMPT },
              ],
            }],
          })

          const text = response.content.find((c): c is Anthropic.TextBlock => c.type === "text")?.text ?? "{}"
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            extracted  = JSON.parse(jsonMatch[0])
            confidence = 0.85
          }
        }
      }
    } catch {
      // AI extraction failed — still create a minimal DRAFT with ai_extracted=true
      confidence = 0
    }
  }

  // Step 3: apply extraction → create DRAFT document
  const { data: applyData, error: applyErr } = await supabase.rpc("api_apply_ingest", {
    p_job_id:     jobId,
    p_extracted:  extracted,
    p_confidence: confidence,
  })

  if (applyErr || !applyData?.ok) {
    return NextResponse.json(
      { ok: false, job_id: jobId, error: applyErr?.message ?? applyData?.message ?? "Failed to apply ingest" },
      { status: 422 },
    )
  }

  return NextResponse.json({
    ok:          true,
    job_id:      jobId,
    document_id: applyData.id,
    number:      applyData.number,
    status:      applyData.status,
    ai_extracted: true,
    confidence,
    exceptions:  applyData.exceptions ?? 0,
  })
}
