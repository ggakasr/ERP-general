// /api/einvoice — WP-H1
// POST: Phát hành hoá đơn điện tử qua nhà cung cấp, ghi log, transition INV→ISSUED.
// HTTP call ở tầng Next.js — Postgres không gọi HTTP.
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getProvider, listProviders, type EInvoiceRequest } from "./providers"

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase chưa cấu hình" }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 })

  let body: { document_id: string; provider: string; invoice_series?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON không hợp lệ" }, { status: 400 })
  }

  const { document_id, provider: providerCode, invoice_series } = body
  if (!document_id || !providerCode) {
    return NextResponse.json({ ok: false, error: "Thiếu document_id hoặc provider" }, { status: 400 })
  }

  const adapter = getProvider(providerCode)
  if (!adapter) {
    return NextResponse.json({ ok: false, error: `Nhà cung cấp '${providerCode}' không được hỗ trợ`, providers: listProviders() }, { status: 400 })
  }

  // Fetch invoice data via RPC
  const { data: docResult } = await supabase.rpc("api_get_document", { p_id: document_id })
  if (!docResult?.ok) {
    return NextResponse.json({ ok: false, error: "Không tìm thấy chứng từ", detail: docResult }, { status: 404 })
  }
  const doc = docResult.doc
  if (doc.doc_type !== "INV") {
    return NextResponse.json({ ok: false, error: "Chỉ hỗ trợ phát hành HĐĐT cho hoá đơn bán hàng (INV)" }, { status: 400 })
  }
  if (doc.status !== "POSTED") {
    return NextResponse.json({ ok: false, error: `Hoá đơn phải ở trạng thái POSTED (hiện tại: ${doc.status})` }, { status: 400 })
  }

  // Build e-invoice request from document data
  const lines: EInvoiceRequest["items"] = (doc.lines ?? []).map((l: Record<string, unknown>) => {
    const qty = Number(l.quantity ?? 0)
    const price = Number(l.unit_price ?? 0)
    const amount = qty * price
    const vatRate = Number(doc.data?.vat_rate ?? 10)
    const vatAmount = Math.round(amount * vatRate / 100)
    return {
      name: (l.product_name as string) ?? (l.description as string) ?? "",
      unit: (l.unit as string) ?? "Cái",
      quantity: qty,
      unitPrice: price,
      amount,
      vatRate,
      vatAmount,
    }
  })
  const totalBeforeVat = lines.reduce((s, l) => s + l.amount, 0)
  const totalVat = lines.reduce((s, l) => s + l.vatAmount, 0)

  const einvReq: EInvoiceRequest = {
    invoiceSeries: invoice_series ?? doc.data?.invoice_series ?? "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    buyerName: (doc.partner_name as string) ?? "",
    buyerTaxCode: doc.data?.buyer_tax_code ?? "",
    buyerAddress: doc.data?.buyer_address ?? "",
    paymentMethod: doc.data?.payment_method ?? "CK",
    items: lines,
    totalBeforeVat,
    totalVat,
    totalAmount: totalBeforeVat + totalVat,
    note: doc.data?.title ?? doc.number,
  }

  // Log PENDING
  const { data: logPending } = await supabase.rpc("api_log_einvoice", {
    p_document_id: document_id,
    p_provider: adapter.code,
    p_direction: "ISSUE",
    p_status: "PENDING",
    p_invoice_series: einvReq.invoiceSeries,
    p_request: einvReq as unknown as Record<string, unknown>,
  })

  // Call provider
  const result = await adapter.createInvoice(einvReq)

  // Update log with result
  if (logPending?.ok) {
    await supabase.rpc("api_log_einvoice", {
      p_document_id: document_id,
      p_provider: adapter.code,
      p_direction: "ISSUE",
      p_status: result.ok ? "ISSUED" : "ERROR",
      p_invoice_series: einvReq.invoiceSeries,
      p_invoice_number: result.invoiceNumber ?? null,
      p_invoice_code: result.invoiceCode ?? null,
      p_lookup_code: result.lookupCode ?? null,
      p_issued_date: result.issuedDate ?? null,
      p_response: (result.rawResponse ?? null) as unknown as Record<string, unknown>,
      p_error: result.error ?? null,
    })
  }

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: `Lỗi từ nhà cung cấp ${adapter.name}: ${result.error}`,
      log_id: logPending?.id,
    }, { status: 502 })
  }

  // Transition INV POSTED → ISSUED
  const { data: transition } = await supabase.rpc("api_transition", {
    p_doc_id: document_id,
    p_action: "issue",
    p_expected_version: doc.version,
    p_payload: {
      einvoice_code: result.invoiceCode,
      einvoice_lookup: result.lookupCode,
      einvoice_number: result.invoiceNumber,
      einvoice_provider: adapter.code,
      einvoice_issued_date: result.issuedDate,
    },
  })

  return NextResponse.json({
    ok: true,
    einvoice: {
      invoiceCode: result.invoiceCode,
      lookupCode: result.lookupCode,
      invoiceNumber: result.invoiceNumber,
      issuedDate: result.issuedDate,
      provider: adapter.code,
    },
    transition: transition?.ok ?? false,
    log_id: logPending?.id,
  })
}

// GET: Danh sách nhà cung cấp HĐĐT
export async function GET() {
  return NextResponse.json({ ok: true, providers: listProviders() })
}
