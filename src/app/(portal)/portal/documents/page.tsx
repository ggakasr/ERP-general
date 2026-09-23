"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Check, FileText, Loader2, X } from "lucide-react"
import { rpc } from "@/lib/api"
import { StatusBadge, PageHeader } from "@/components/shared/bits"
import { useToast as useToastFn } from "@/components/ui/toast"

interface Attachment {
  id: string
  file_name: string
  mime: string
  size_bytes: number
}

interface PortalDoc {
  id: string
  number: string
  doc_type: string
  status: string
  data: Record<string, any>
  created_at: string
  attachments: Attachment[]
}

const DOC_TYPE_LABELS: Record<string, string> = {
  INV: "Hóa đơn",
  SINV: "Hóa đơn NCC",
  QUOT: "Báo giá",
  HBL: "Vận đơn",
  DO: "Lệnh giao hàng",
  DNOTE: "Phiếu ghi nợ",
  CNOTE: "Phiếu ghi có",
}

export default function PortalDocuments() {
  const searchParams = useSearchParams()
  const shipmentId = searchParams.get("shipment")
  const [rows, setRows] = useState<PortalDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<string | null>(null)
  const toast = useToastFn()

  const load = () => {
    setLoading(true)
    rpc<{ rows: PortalDoc[] }>("api_portal_documents", {
      p_shipment_id: shipmentId || undefined,
      p_limit: 100,
    })
      .then((r) => { if (r.ok) setRows(r.rows || []) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [shipmentId])

  const confirmQuote = async (quoteId: string, action: "ACCEPT" | "REJECT") => {
    setConfirming(quoteId)
    const r = await rpc("api_portal_confirm_quote", { p_quote_id: quoteId, p_action: action })
    setConfirming(null)
    if (r.ok) {
      toast("success", action === "ACCEPT" ? "Đã chấp nhận báo giá" : "Đã từ chối báo giá")
      load()
    } else {
      toast("error", r.error || "Lỗi")
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chứng từ"
        subtitle={shipmentId ? "Chứng từ liên quan đến lô hàng đã chọn" : "Tất cả chứng từ của bạn"}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">Không có chứng từ nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((doc) => {
            const isQuotePending = doc.doc_type === "QUOT" && ["SUBMITTED", "SENT"].includes(doc.status)
            return (
              <div key={doc.id} className="rounded-lg border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      </span>
                      <span className="font-mono text-sm font-medium">{doc.number}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                    {(doc.data?.total_amount != null) && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        Tổng: {Number(doc.data.total_amount).toLocaleString("vi-VN")} {doc.data.currency || "VND"}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString("vi-VN")}
                    </div>
                  </div>

                  {isQuotePending && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => confirmQuote(doc.id, "ACCEPT")}
                        disabled={confirming === doc.id}
                        className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Chấp nhận
                      </button>
                      <button
                        onClick={() => confirmQuote(doc.id, "REJECT")}
                        disabled={confirming === doc.id}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Từ chối
                      </button>
                    </div>
                  )}
                </div>

                {doc.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {doc.attachments.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded border bg-muted/50 px-2 py-1 text-xs"
                        title={`${(a.size_bytes / 1024).toFixed(0)} KB`}
                      >
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        {a.file_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
