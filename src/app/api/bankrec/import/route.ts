// /api/bankrec/import — WP-H2
// POST: parse CSV hoặc OFX → gọi api_bankrec_import
import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

interface BankLine {
  date: string
  description: string
  amount: number
  reference?: string
}

function parseCsv(text: string): BankLine[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase()
  const sep = header.includes("\t") ? "\t" : ","

  const cols = header.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""))

  const iDate = cols.findIndex((c) => /date|ngay|ngày/.test(c))
  const iDesc = cols.findIndex((c) => /desc|nội dung|noi dung|diễn giải|dien giai|memo|narration/.test(c))
  const iDebit = cols.findIndex((c) => /debit|nợ|no|chi|withdraw/.test(c))
  const iCredit = cols.findIndex((c) => /credit|có|co|thu|deposit/.test(c))
  const iAmount = cols.findIndex((c) => /^amount$|^số tiền$|^so tien$/.test(c))
  const iRef = cols.findIndex((c) => /ref|mã giao dịch|ma giao dich|transaction/.test(c))

  if (iDate === -1 && iDesc === -1 && iAmount === -1 && iDebit === -1) return []

  const result: BankLine[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map((v) => v.trim().replace(/^"|"$/g, ""))
    if (vals.every((v) => !v)) continue

    const parseNum = (s: string | undefined) => {
      if (!s) return 0
      const cleaned = s.replace(/[,.\s]/g, (m, offset, str) => {
        if (m === "," || m === ".") {
          const afterDot = str.substring(offset + 1)
          if (/^\d{1,2}$/.test(afterDot) || /^\d{1,2}[,.]/.test(afterDot)) return "."
          return ""
        }
        return ""
      })
      return parseFloat(cleaned) || 0
    }

    let amount: number
    if (iAmount >= 0) {
      amount = parseNum(vals[iAmount])
    } else if (iDebit >= 0 || iCredit >= 0) {
      const debit = iDebit >= 0 ? parseNum(vals[iDebit]) : 0
      const credit = iCredit >= 0 ? parseNum(vals[iCredit]) : 0
      amount = credit > 0 ? credit : debit > 0 ? -debit : 0
    } else {
      continue
    }
    if (amount === 0) continue

    result.push({
      date: iDate >= 0 ? (vals[iDate] ?? "") : "",
      description: iDesc >= 0 ? (vals[iDesc] ?? "") : "",
      amount,
      reference: iRef >= 0 ? (vals[iRef] ?? "") : undefined,
    })
  }
  return result
}

function parseOfx(text: string): BankLine[] {
  const result: BankLine[] = []
  const txnBlocks = text.split(/<STMTTRN>/i).slice(1)
  for (const block of txnBlocks) {
    const tag = (name: string): string => {
      const m = block.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"))
      return m?.[1]?.trim() ?? ""
    }
    const amt = parseFloat(tag("TRNAMT")) || 0
    if (amt === 0) continue

    const rawDate = tag("DTPOSTED")
    const date = rawDate.length >= 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate

    result.push({
      date,
      description: tag("MEMO") || tag("NAME"),
      amount: amt,
      reference: tag("FITID") || undefined,
    })
  }
  return result
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase chưa cấu hình" }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: "Chưa đăng nhập" }, { status: 401 })

  const contentType = req.headers.get("content-type") ?? ""

  let documentId: string
  let lines: BankLine[]

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    documentId = (form.get("document_id") as string) ?? ""
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ ok: false, error: "Thiếu file" }, { status: 400 })

    const text = await file.text()
    const name = file.name.toLowerCase()
    if (name.endsWith(".ofx") || name.endsWith(".qfx")) {
      lines = parseOfx(text)
    } else {
      lines = parseCsv(text)
    }
  } else {
    let body: { document_id: string; lines?: BankLine[]; csv?: string; ofx?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: "Body JSON không hợp lệ" }, { status: 400 })
    }
    documentId = body.document_id ?? ""
    if (body.lines) {
      lines = body.lines
    } else if (body.ofx) {
      lines = parseOfx(body.ofx)
    } else if (body.csv) {
      lines = parseCsv(body.csv)
    } else {
      return NextResponse.json({ ok: false, error: "Thiếu lines, csv, hoặc ofx" }, { status: 400 })
    }
  }

  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Thiếu document_id" }, { status: 400 })
  }
  if (!lines.length) {
    return NextResponse.json({ ok: false, error: "Không parse được dòng giao dịch nào" }, { status: 400 })
  }

  const { data } = await supabase.rpc("api_bankrec_import", {
    p_document_id: documentId,
    p_lines: lines as unknown as Record<string, unknown>[],
  })

  if (!data?.ok) {
    return NextResponse.json({ ok: false, error: "Lỗi import", detail: data }, { status: 400 })
  }

  return NextResponse.json({ ok: true, parsed: lines.length, ...data })
}
