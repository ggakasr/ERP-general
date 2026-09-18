"use client"

import { useCallback, useEffect, useState } from "react"
import { Info, RefreshCw, Send } from "lucide-react"
import { rpc } from "@/lib/api"
import { cn, formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { DocLink, ErrorBox, Loading } from "@/components/shared/bits"
import { EmptyRow, HeadRow, TableShell, Td, Th } from "@/components/reports/common"

interface OutboxRow {
  id: string; to_email: string; subject: string; body: string; status: string; error: string | null
  document_id: string | null; document_number: string | null; created_at: string; sent_at: string | null
}

const STATUS_CLASS: Record<string, string> = {
  QUEUED: "bg-amber-50 text-amber-800 ring-amber-200",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SIMULATED: "bg-slate-100 text-slate-700 ring-slate-300",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
}
const STATUS_LABEL: Record<string, string> = { QUEUED: "Đang chờ gửi", SENT: "Đã gửi", SIMULATED: "Mô phỏng (chưa cấu hình nhà cung cấp)", FAILED: "Gửi lỗi" }

export function EmailOutboxPanel() {
  const toast = useToast()
  const [rows, setRows] = useState<OutboxRow[] | null>(null)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [flushing, setFlushing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await rpc<{ rows: OutboxRow[]; summary: Record<string, number> }>("api_email_outbox", {})
    setLoading(false)
    if (!res.ok) { setError((res as any).error || "Không tải được hộp thư"); return }
    setError(null)
    setRows(res.rows)
    setSummary(res.summary || {})
  }, [])

  useEffect(() => { load() }, [load])

  const flushNow = async () => {
    setFlushing(true)
    try {
      const res = await fetch("/api/notifications/flush", { method: "POST" }).then((r) => r.json())
      if (!res.ok) throw new Error(res.error || "Không gửi được")
      toast("success", "Đã xử lý hàng đợi email",
        `${res.claimed} thư · ${res.sent} đã gửi · ${res.simulated} mô phỏng · ${res.failed} lỗi${res.provider ? ` (qua ${res.provider})` : " (chưa cấu hình nhà cung cấp — RESEND_API_KEY)"}`)
    } catch (e: any) {
      toast("error", "Không gửi được hàng đợi", e?.message)
    }
    setFlushing(false)
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>
            Mọi thông báo trong ứng dụng cũng được đưa vào hàng đợi email này. Nếu đã cấu hình nhà cung cấp
            (biến môi trường <code className="rounded bg-white px-1">RESEND_API_KEY</code>), thư sẽ được gửi thật; nếu chưa, thư được đánh dấu
            <b> Mô phỏng</b> để vẫn thấy được nội dung sẽ gửi.
          </p>
          <p>Hàng đợi được xử lý tự động 1 lần/ngày lúc 3h sáng (Vercel Cron — giới hạn của gói miễn phí), hoặc bấm &quot;Gửi ngay&quot; bên dưới / mở chuông thông báo để xử lý ngay.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(summary).map(([k, v]) => (
          <span key={k} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_CLASS[k])}>
            {STATUS_LABEL[k] || k}: {v}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={flushNow} disabled={flushing}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> {flushing ? "Đang gửi…" : "Gửi ngay"}
          </Button>
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Người nhận</Th><Th>Tiêu đề</Th><Th>Chứng từ</Th><Th>Trạng thái</Th><Th>Tạo lúc</Th><Th>Gửi lúc</Th>
            </HeadRow>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>Chưa có email nào trong hàng đợi</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30" title={r.error || r.body}>
                <Td className="whitespace-nowrap">{r.to_email}</Td>
                <Td className="max-w-xs truncate">{r.subject}</Td>
                <Td>{r.document_id && r.document_number ? <DocLink id={r.document_id} number={r.document_number} /> : "—"}</Td>
                <Td>
                  <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_CLASS[r.status])}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.created_at)}</Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{r.sent_at ? formatDateTime(r.sent_at) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
