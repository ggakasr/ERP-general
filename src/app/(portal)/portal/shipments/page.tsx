"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Ship } from "lucide-react"
import { rpc } from "@/lib/api"
import { StatusBadge, PageHeader } from "@/components/shared/bits"
import { Chips } from "@/components/controls/common"

interface PortalShipment {
  id: string
  number: string
  doc_type: string
  status: string
  partner_name: string
  data: Record<string, any>
  created_at: string
  updated_at: string
}

const STATUS_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Tất cả" },
  { value: "DRAFT", label: "Nháp" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "IN_TRANSIT", label: "Đang vận chuyển" },
  { value: "ARRIVED", label: "Đã đến" },
  { value: "COMPLETED", label: "Hoàn thành" },
]

export default function PortalShipments() {
  const [status, setStatus] = useState<string | null>(null)
  const [rows, setRows] = useState<PortalShipment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    rpc<{ rows: PortalShipment[] }>("api_portal_shipments", {
      p_status: status,
      p_limit: 100,
    })
      .then((r) => { if (r.ok) setRows(r.rows || []) })
      .finally(() => setLoading(false))
  }, [status])

  return (
    <div className="space-y-4">
      <PageHeader title="Lô hàng" subtitle="Danh sách lô hàng liên quan đến bạn" />
      <Chips
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Ship className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">Không có lô hàng nào</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2">Số lô</th>
                <th className="px-4 py-2">Tuyến</th>
                <th className="px-4 py-2">Phương thức</th>
                <th className="px-4 py-2">ETD</th>
                <th className="px-4 py-2">ETA</th>
                <th className="px-4 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/portal/shipments/${s.id}`} className="font-mono text-primary hover:underline">
                      {s.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {s.data?.pol && s.data?.pod ? `${s.data.pol} → ${s.data.pod}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.data?.mode || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.data?.etd || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.data?.eta || "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
