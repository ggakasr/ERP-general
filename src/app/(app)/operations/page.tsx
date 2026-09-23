"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Search, Ship } from "lucide-react"
import { rpc } from "@/lib/api"
import type { ShipmentCard, ShipmentListResponse } from "@/lib/types"
import { cn } from "@/lib/utils"
import { statusClass, statusLabel } from "@/lib/labels"
import { SkeletonCard } from "@/components/ui/skeleton"
import { ErrorBox } from "@/components/shared/bits"
import { useSession } from "@/lib/session"

const MODE_ICON: Record<string, string> = { FCL: "📦", LCL: "📦", AIR: "✈️", TRUCK: "🚛" }
const TYPE_LABEL: Record<string, string> = { EXPORT: "EXP", IMPORT: "IMP", TRANSIT: "TRA" }

const STATUS_TABS = [
  { key: null,          label: "Tất cả" },
  { key: "DRAFT",       label: "Nháp" },
  { key: "BOOKED",      label: "Đã đặt chỗ" },
  { key: "CONFIRMED",   label: "Xác nhận" },
  { key: "IN_TRANSIT",  label: "Đang vận chuyển" },
  { key: "ARRIVED",     label: "Tàu đến" },
  { key: "CUSTOMS",     label: "Hải quan" },
  { key: "DELIVERED",   label: "Đã giao" },
  { key: "CLOSED",      label: "Đã đóng" },
]

function ContainerChips({ containers }: { containers: { type: string; count: number }[] }) {
  if (!containers?.length) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {containers.map((c) => (
        <span
          key={c.type}
          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-inset ring-border"
        >
          {c.type}×{c.count}
        </span>
      ))}
    </div>
  )
}

function ShipmentCardItem({ card }: { card: ShipmentCard }) {
  const margin = card.ar_total - card.ap_total
  const pct = card.ar_total > 0 ? Math.round(margin / card.ar_total * 100) : 0

  return (
    <Link
      href={`/operations/${card.id}`}
      className="group block rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Row 1: job number + badges */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-sm font-semibold text-foreground truncate">{card.job_no}</span>
          {card.mode && (
            <span className="text-base leading-none" title={card.mode}>{MODE_ICON[card.mode] ?? "🚢"}</span>
          )}
          {card.shipment_type && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {TYPE_LABEL[card.shipment_type] ?? card.shipment_type}
            </span>
          )}
          {card.incoterm && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{card.incoterm}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {card.rate_expiring && (
            <span className="inline-flex items-center rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-medium text-warning ring-1 ring-inset ring-warning/30">
              Lãi hết hạn
            </span>
          )}
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusClass(card.status))}>
            {statusLabel(card.status)}
          </span>
        </div>
      </div>

      {/* Row 2: route */}
      <div className="mt-2 flex items-center gap-1.5 text-sm">
        <span className="font-semibold text-foreground">{card.pol ?? "—"}</span>
        <svg className="h-3.5 w-10 shrink-0 text-muted-foreground" viewBox="0 0 40 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 7h33M28 2l8 5-8 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-semibold text-foreground">{card.pod ?? "—"}</span>
        {card.carrier && <span className="text-muted-foreground text-xs">· {card.carrier}</span>}
        {card.vessel && <span className="hidden sm:inline text-muted-foreground text-xs">· {card.vessel}</span>}
      </div>

      {/* Row 3: ETD + containers */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {card.etd && (
          <span>ETD <span className="font-medium text-foreground">{card.etd}</span></span>
        )}
        {card.eta && (
          <span>ETA <span className="font-medium text-foreground">{card.eta}</span></span>
        )}
        <ContainerChips containers={card.containers ?? []} />
      </div>

      {/* Row 4: shipper/consignee */}
      {(card.shipper || card.consignee) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {card.shipper && <span className="truncate max-w-[14rem]">Người gửi: <span className="text-foreground">{card.shipper}</span></span>}
          {card.consignee && <span className="truncate max-w-[14rem]">Người nhận: <span className="text-foreground">{card.consignee}</span></span>}
        </div>
      )}

      {/* Row 5: financials */}
      {card.ar_total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5 text-xs">
          <span className="text-muted-foreground">
            Thu: <span className="font-medium text-foreground tabular-nums">{(card.ar_total / 1e6).toFixed(1)}M ₫</span>
          </span>
          <span className="text-muted-foreground">
            Chi: <span className="font-medium text-foreground tabular-nums">{(card.ap_total / 1e6).toFixed(1)}M ₫</span>
          </span>
          <span className={cn("font-medium tabular-nums", margin >= 0 ? "text-success" : "text-destructive")}>
            Lãi: {(margin / 1e6).toFixed(1)}M ₫ ({pct}%)
          </span>
        </div>
      )}
    </Link>
  )
}

export default function OperationsPage() {
  const { can } = useSession()
  const [data, setData]   = useState<ShipmentListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [query, setQuery]   = useState("")

  const load = useCallback(async () => {
    setData(null); setError(null)
    const res = await rpc<ShipmentListResponse>("api_list_shipments", {
      p_status: status ?? undefined,
      p_search: query || undefined,
      p_limit: 50,
      p_offset: 0,
    })
    if (!res.ok) { setError((res as any).error); return }
    setData(res)
  }, [status, query])

  useEffect(() => { load() }, [load])

  const counts = data?.status_counts ?? {}
  const total  = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ship className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-xl font-semibold text-foreground">Vận hành Logistics</h1>
          {data && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {total}
            </span>
          )}
        </div>
        {can("SHIPMENT", "CREATE") && (
          <Link
            href="/documents/new?type=SHIPMENT"
            className="inline-flex items-center gap-1.5 h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Lô hàng mới
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Tìm số lô, POL/POD, tên KH…"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") setQuery(search) }}
        />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => {
          const cnt = t.key ? (counts[t.key] ?? 0) : total
          const active = status === t.key
          return (
            <button
              key={String(t.key)}
              onClick={() => setStatus(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {t.label}
              {cnt > 0 && (
                <span className={cn(
                  "tabular-nums text-[11px] font-medium",
                  active ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {cnt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {error && <ErrorBox message={error} onRetry={load} />}

      {!data && !error && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {data && data.rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Ship className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {status || query ? "Không tìm thấy lô hàng phù hợp." : "Chưa có lô hàng nào."}
          </p>
          {can("SHIPMENT", "CREATE") && (
            <Link
              href="/documents/new?type=SHIPMENT"
              className="inline-flex items-center gap-1.5 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Plus className="h-4 w-4" /> Tạo lô hàng đầu tiên
            </Link>
          )}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((card) => <ShipmentCardItem key={card.id} card={card} />)}
        </div>
      )}
    </div>
  )
}
