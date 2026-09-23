"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Clock, Loader2, MapPin } from "lucide-react"
import { rpc } from "@/lib/api"
import { StatusBadge, PageHeader } from "@/components/shared/bits"

interface TrackingEvent {
  id: string
  event_code: string
  event_name: string
  event_time: string | null
  location: string | null
  notes: string | null
}

interface ShipmentInfo {
  id: string
  number: string
  status: string
  data: Record<string, any>
}

interface TrackingResponse {
  ok: boolean
  shipment: ShipmentInfo
  events: TrackingEvent[]
  code?: string
  error?: string
}

export default function PortalShipmentDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<TrackingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rpc<TrackingResponse>("api_portal_tracking", { p_shipment_id: id })
      .then((r) => {
        if (r.ok) setData(r)
        else setError(r.error || "Không thể tải thông tin lô hàng")
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/portal/shipments" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error || "Không tìm thấy lô hàng"}
        </div>
      </div>
    )
  }

  const ship = data.shipment

  return (
    <div className="space-y-6">
      <Link href="/portal/shipments" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>
      <PageHeader
        title={ship.number}
        badge={<StatusBadge status={ship.status} />}
        subtitle={
          ship.data?.pol && ship.data?.pod
            ? `${ship.data.pol} → ${ship.data.pod}`
            : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Phương thức", value: ship.data?.mode },
          { label: "Tàu / Chuyến", value: [ship.data?.vessel, ship.data?.voyage].filter(Boolean).join(" / ") },
          { label: "ETD", value: ship.data?.etd },
          { label: "ETA", value: ship.data?.eta },
        ].map((f) => (
          <div key={f.label} className="rounded-lg border bg-background p-4">
            <div className="text-xs text-muted-foreground">{f.label}</div>
            <div className="mt-1 text-sm font-medium">{f.value || "—"}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Lộ trình vận chuyển</h2>
        </div>
        {data.events.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Chưa có sự kiện theo dõi nào</div>
        ) : (
          <div className="relative px-4 py-4">
            <div className="absolute bottom-0 left-[29px] top-0 w-px bg-border" />
            <div className="space-y-4">
              {data.events.map((ev, i) => (
                <div key={ev.id} className="relative flex gap-3 pl-2">
                  <div className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background">
                    {i === 0 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{ev.event_name || ev.event_code}</div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {ev.event_time ? new Date(ev.event_time).toLocaleString("vi-VN") : "—"}
                      </div>
                    </div>
                    {ev.location && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {ev.location}
                      </div>
                    )}
                    {ev.notes && <div className="mt-0.5 text-xs text-muted-foreground">{ev.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-right">
        <Link
          href={`/portal/documents?shipment=${id}`}
          className="text-sm text-primary hover:underline"
        >
          Xem chứng từ liên quan →
        </Link>
      </div>
    </div>
  )
}
