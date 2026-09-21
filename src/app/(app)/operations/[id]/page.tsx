"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, FileText, Ship, TrendingDown, TrendingUp } from "lucide-react"
import { rpc } from "@/lib/api"
import type { ShipmentDetail } from "@/lib/types"
import { cn } from "@/lib/utils"
import { statusClass, statusLabel } from "@/lib/labels"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SkeletonDocDetail } from "@/components/ui/skeleton"
import { Tabs } from "@/components/ui/tabs"
import { ErrorBox, StatusBadge } from "@/components/shared/bits"

// ── helpers ──────────────────────────────────────────────────────────────────

function formatVnd(n: number) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " tỷ ₫"
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M ₫"
  return n.toLocaleString("vi-VN") + " ₫"
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-sm text-right", mono && "font-mono")}>{value}</span>
    </div>
  )
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ detail }: { detail: ShipmentDetail }) {
  const doc = detail.document
  const d = doc.data ?? {}
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Route */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Tuyến vận chuyển</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
            <span>{d.pol ?? "—"}</span>
            <svg className="h-4 w-12 shrink-0 text-muted-foreground" viewBox="0 0 48 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 7h40M36 2l8 5-8 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{d.pod ?? "—"}</span>
          </div>
          <InfoRow label="Mode" value={d.mode} />
          <InfoRow label="Loại" value={d.shipment_type} />
          <InfoRow label="ETD" value={d.etd} />
          <InfoRow label="ETA" value={d.eta} />
          <InfoRow label="Incoterm" value={d.incoterm} />
        </CardContent>
      </Card>

      {/* Carrier */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Hãng vận chuyển</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="Carrier" value={d.carrier} />
          <InfoRow label="Tàu/Chuyến" value={d.vessel} />
          <InfoRow label="Voyage/Flight" value={d.voyage} />
        </CardContent>
      </Card>

      {/* Parties */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Các bên liên quan</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <InfoRow label="Shipper" value={detail.shipper?.name} />
          <InfoRow label="Consignee" value={detail.consignee?.name} />
          <InfoRow label="Số chứng từ" value={doc.number} mono />
          <InfoRow label="Trạng thái" value={statusLabel(doc.status)} />
        </CardContent>
      </Card>

      {/* Profit summary */}
      {detail.profit && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tổng quan tài chính lô hàng</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Doanh thu (AR)</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{formatVnd(detail.profit.ar_total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Chi phí (AP)</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{formatVnd(detail.profit.ap_total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lãi gộp</p>
                <p className={cn("text-lg font-semibold tabular-nums flex items-center gap-1", detail.profit.margin >= 0 ? "text-success" : "text-destructive")}>
                  {detail.profit.margin >= 0
                    ? <TrendingUp className="h-4 w-4 shrink-0" />
                    : <TrendingDown className="h-4 w-4 shrink-0" />}
                  {formatVnd(detail.profit.margin)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tỷ suất lãi</p>
                <p className={cn("text-lg font-semibold tabular-nums", detail.profit.margin_pct >= 0 ? "text-success" : "text-destructive")}>
                  {detail.profit.margin_pct}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Charges tab ───────────────────────────────────────────────────────────────

function ChargesTab({ charges }: { charges: ShipmentDetail["charges"] }) {
  const ar = charges.filter((c) => c.charge_type === "AR")
  const ap = charges.filter((c) => c.charge_type === "AP")
  const arTotal = ar.reduce((s, c) => s + c.amount_vnd, 0)
  const apTotal = ap.reduce((s, c) => s + c.amount_vnd, 0)

  function ChargeGroup({ rows, title, tone }: { rows: typeof charges; title: string; tone: "success" | "destructive" }) {
    if (!rows.length) return null
    return (
      <div>
        <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", tone === "success" ? "text-success" : "text-destructive")}>{title}</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Khoản phí</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rate</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">CCY</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Thành tiền (VND)</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hết hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => {
                const expiring = c.rate_expires && new Date(c.rate_expires) < new Date(Date.now() + 7 * 86400000)
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.charge_code}</p>
                      {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                      {c.partner_name && <p className="text-xs text-muted-foreground">{c.partner_name}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.rate.toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2 text-right">{c.currency}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatVnd(c.amount_vnd)}</td>
                    <td className="px-3 py-2">
                      {c.rate_expires ? (
                        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                          expiring ? "bg-warning-subtle text-warning ring-warning/30" : "bg-muted text-muted-foreground ring-border"
                        )}>
                          {expiring ? "⚠️ " : ""}{c.rate_expires}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t bg-muted/40">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Tổng</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatVnd(rows.reduce((s, c) => s + c.amount_vnd, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ChargeGroup rows={ar} title="Thu (AR)" tone="success" />
      <ChargeGroup rows={ap} title="Chi (AP)" tone="destructive" />
      {charges.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Chưa có khoản phí nào.</p>
      )}
      {charges.length > 0 && (
        <div className="flex flex-wrap gap-6 text-sm border-t pt-3">
          <span className="text-muted-foreground">AR tổng: <span className="font-semibold text-success tabular-nums">{formatVnd(arTotal)}</span></span>
          <span className="text-muted-foreground">AP tổng: <span className="font-semibold text-destructive tabular-nums">{formatVnd(apTotal)}</span></span>
          <span className="text-muted-foreground">Lãi: <span className={cn("font-semibold tabular-nums", arTotal - apTotal >= 0 ? "text-success" : "text-destructive")}>{formatVnd(arTotal - apTotal)}</span></span>
        </div>
      )}
    </div>
  )
}

// ── Containers tab ───────────────────────────────────────────────────────────

function ContainersTab({ containers }: { containers: ShipmentDetail["containers"] }) {
  if (!containers.length) return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có container.</p>
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Loại</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Số container</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Số seal</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">GW (kg)</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">CBM</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {containers.map((c) => (
            <tr key={c.id} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-border">
                  {c.container_type}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{c.container_no ?? "—"}</td>
              <td className="px-3 py-2 text-xs">{c.seal_no ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.gross_weight?.toLocaleString("vi-VN") ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.cbm?.toFixed(2) ?? "—"}</td>
              <td className="px-3 py-2">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusClass(c.status))}>
                  {statusLabel(c.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/40">
          <tr>
            <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">Tổng {containers.length} container</td>
            <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold">
              {containers.reduce((s, c) => s + (c.gross_weight ?? 0), 0).toLocaleString("vi-VN")}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold">
              {containers.reduce((s, c) => s + (c.cbm ?? 0), 0).toFixed(2)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Tracking tab ──────────────────────────────────────────────────────────────

const TRACKING_ICON: Record<string, string> = {
  PICKUP: "🏭", LOADED: "📦", DEPARTED: "⛵", ARRIVED: "🏁",
  CUSTOMS_CLEARED: "✅", DELIVERED: "🏠", DEFAULT: "📍",
}

function TrackingTab({ events }: { events: ShipmentDetail["tracking"] }) {
  if (!events.length) return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có sự kiện tracking.</p>
  return (
    <ol className="relative border-l border-border ml-4 space-y-0">
      {events.map((e, i) => {
        const past = e.actual && e.event_time && new Date(e.event_time) <= new Date()
        return (
          <li key={e.id} className="ml-6 pb-6 last:pb-0">
            <span className={cn(
              "absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-background text-sm",
              past ? "bg-success/20" : "bg-muted",
              i === 0 && "ring-primary"
            )}>
              {TRACKING_ICON[e.event_code] ?? TRACKING_ICON.DEFAULT}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className={cn("text-sm font-medium", past ? "text-foreground" : "text-muted-foreground")}>
                {e.event_name}
              </p>
              {e.location && (
                <span className="text-xs text-muted-foreground">{e.location}</span>
              )}
              {!e.actual && (
                <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">Dự kiến</span>
              )}
            </div>
            {e.event_time && (
              <p className="mt-0.5 text-xs text-muted-foreground">{new Date(e.event_time).toLocaleString("vi-VN")}</p>
            )}
            {e.notes && <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p>}
          </li>
        )
      })}
    </ol>
  )
}

// ── Documents tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ docs }: { docs: ShipmentDetail["child_docs"] }) {
  if (!docs.length) return <p className="py-8 text-center text-sm text-muted-foreground">Chưa có chứng từ liên quan.</p>
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <Link
          key={d.id}
          href={`/documents/${d.id}`}
          className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{d.doc_type_name}</p>
              <p className="font-mono text-xs text-muted-foreground">{d.number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {d.title && <span className="hidden sm:block max-w-[16rem] truncate">{d.title}</span>}
            <StatusBadge status={d.status} />
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [detail, setDetail] = useState<ShipmentDetail | null>(null)
  const [error,  setError]  = useState<string | null>(null)
  const [tab,    setTab]    = useState("overview")

  const load = useCallback(async () => {
    const res = await rpc<ShipmentDetail>("api_get_shipment", { p_id: id })
    if (!res.ok) { setError((res as any).error); return }
    setError(null); setDetail(res)
  }, [id])

  useEffect(() => { load() }, [load])

  if (error) return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" /> Quay lại</Button>
      <ErrorBox message={error} onRetry={load} />
    </div>
  )
  if (!detail) return <SkeletonDocDetail />

  const doc = detail.document
  const d   = doc.data ?? {}
  const rateExpiring = detail.charges.some((c) => c.rate_expires && new Date(c.rate_expires) < new Date(Date.now() + 7 * 86400000))

  const tabs = [
    { key: "overview",    label: "Tổng quan" },
    { key: "charges",     label: "Cước phí",  count: detail.charges.length },
    { key: "containers",  label: "Container", count: detail.containers.length },
    { key: "tracking",    label: "Tracking",  count: detail.tracking.length },
    { key: "documents",   label: "Chứng từ",  count: detail.child_docs.length },
  ] as import("@/components/ui/tabs").TabItem[]

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Quay lại
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Ship className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{d.pol ?? "—"} → {d.pod ?? "—"}</h1>
            <StatusBadge status={doc.status} />
            {rateExpiring && (
              <span className="inline-flex items-center rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning/30">
                ⚠️ Lãi hết hạn
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{doc.number}</p>
          {(d.carrier || d.vessel) && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[d.carrier, d.vessel, d.voyage].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs items={tabs} value={tab} onChange={setTab} />

      {/* Tab content */}
      <div className="min-h-[200px]">
        {tab === "overview"   && <OverviewTab    detail={detail} />}
        {tab === "charges"    && <ChargesTab     charges={detail.charges} />}
        {tab === "containers" && <ContainersTab  containers={detail.containers} />}
        {tab === "tracking"   && <TrackingTab    events={detail.tracking} />}
        {tab === "documents"  && <DocumentsTab   docs={detail.child_docs} />}
      </div>
    </div>
  )
}
