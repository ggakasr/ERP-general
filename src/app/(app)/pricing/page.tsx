"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, UploadCloud, Search } from "lucide-react"
import { rpc } from "@/lib/api"
import { cn } from "@/lib/utils"
import { SkeletonTable } from "@/components/ui/skeleton"
import { ErrorBox, EmptyState } from "@/components/shared/bits"
import { useToast } from "@/components/ui/toast"

// ---- Types ----------------------------------------------------------------

interface RateRow {
  id: string
  pol: string
  pod: string
  mode: string
  rate_type: string
  valid_from: string
  valid_to: string
  currency: string
  rate_20ft?: number
  rate_40ft?: number
  rate_40hc?: number
  rate_per_cbm?: number
  rate_per_kg?: number
  notes?: string
  status: string
  carrier_name?: string
  expiring_soon: boolean
  days_left: number
}

interface RateSearchResult {
  ok: boolean
  as_of: string
  rows: RateRow[]
  total_active: number
  expiring_soon_count: number
}

interface ChargeCode {
  id: string
  code: string
  name: string
  category: string
  charge_type: string
  currency: string
  is_mandatory: boolean
}

interface ChargeCodesResult {
  ok: boolean
  rows: ChargeCode[]
}

// ---- Helpers ---------------------------------------------------------------

const MODE_LABELS: Record<string, string> = {
  FCL: "FCL", LCL: "LCL", AIR: "Air", RAIL: "Rail", TRUCK: "Truck",
}

const CATEGORY_LABEL: Record<string, string> = {
  FREIGHT: "Cước vận chuyển", LOCAL: "Chi phí địa phương",
  DOCUMENTATION: "Chứng từ", SURCHARGE: "Phụ phí", OTHER: "Khác",
}

const TYPE_LABEL: Record<string, string> = {
  AR: "Thu", AP: "Chi", BOTH: "Thu & Chi",
}

function fmt(v?: number | null, cur = "USD") {
  if (v == null) return "—"
  return v.toLocaleString("vi-VN") + " " + cur
}

function ExpiryBadge({ days, show }: { days: number; show: boolean }) {
  if (!show) return null
  const color = days <= 2
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-warning/10 text-warning border-warning/30"
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium", color)}>
      <AlertTriangle className="h-3 w-3" />
      {days <= 0 ? "Hết hôm nay" : `Còn ${days} ngày`}
    </span>
  )
}

// ---- Main Component --------------------------------------------------------

export default function PricingPage() {
  const toast = useToast()
  const [tab, setTab] = useState<"rates" | "charges">("rates")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rates, setRates] = useState<RateRow[]>([])
  const [summary, setSummary] = useState<{ total: number; expiring: number }>({ total: 0, expiring: 0 })
  const [chargeCodes, setChargeCodes] = useState<ChargeCode[]>([])
  const [filterPol, setFilterPol] = useState("")
  const [filterPod, setFilterPod] = useState("")
  const [filterMode, setFilterMode] = useState("")
  const [alertLoading, setAlertLoading] = useState(false)
  const [importText, setImportText] = useState("")
  const [importResult, setImportResult] = useState<null | { imported: number; error_count: number; errors: { row: number; error: string }[] }>(null)
  const [showImport, setShowImport] = useState(false)

  const loadRates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const args: Record<string, unknown> = {}
      if (filterPol.trim()) args.p_pol = filterPol.trim().toUpperCase()
      if (filterPod.trim()) args.p_pod = filterPod.trim().toUpperCase()
      if (filterMode) args.p_mode = filterMode
      const r = await rpc<RateSearchResult>("api_rate_search", args)
      if (!r.ok) { setError(r.error || r.message || "Lỗi tải bảng giá"); return }
      setRates(r.rows ?? [])
      setSummary({ total: r.total_active ?? 0, expiring: r.expiring_soon_count ?? 0 })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [filterPol, filterPod, filterMode])

  const loadChargeCodes = useCallback(async () => {
    const r = await rpc<ChargeCodesResult>("api_charge_codes")
    if (r.ok) setChargeCodes(r.rows ?? [])
  }, [])

  useEffect(() => { loadRates() }, [loadRates])
  useEffect(() => { loadChargeCodes() }, [loadChargeCodes])

  async function handleExpiry() {
    setAlertLoading(true)
    try {
      const r = await rpc("api_rate_expiry_check", { p_warn_days: 7 })
      if (r.ok) {
        toast("success", `Đã gửi ${r.alerts_sent} cảnh báo qua email`)
      } else {
        toast("error", r.error || r.message || "Lỗi gửi cảnh báo")
      }
    } finally {
      setAlertLoading(false)
    }
  }

  async function handleImport() {
    let rows: unknown[]
    try {
      rows = JSON.parse(importText)
      if (!Array.isArray(rows)) throw new Error("Dữ liệu phải là JSON array")
    } catch (e) {
      toast("error", "JSON không hợp lệ: " + String(e))
      return
    }
    const r = await rpc<typeof importResult & { ok: boolean }>("api_rate_import", { p_rows: rows })
    if (r && "imported" in r) {
      setImportResult({ imported: r.imported as number, error_count: r.error_count as number, errors: (r.errors as { row: number; error: string }[]) ?? [] })
      if ((r.imported as number) > 0) {
        toast("success", `Nhập thành công ${r.imported} dòng`)
        loadRates()
      }
    } else {
      toast("error", (r as { error?: string; message?: string }).error || (r as { error?: string; message?: string }).message || "Lỗi nhập bảng giá")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bảng giá & Phụ phí</h1>
          <p className="text-sm text-muted-foreground">Quản lý cước vận chuyển và mã phụ phí logistics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.expiring > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span>{summary.expiring} bảng giá sắp hết hạn</span>
            </div>
          )}
          <button
            onClick={handleExpiry}
            disabled={alertLoading}
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            <AlertTriangle className="h-4 w-4 text-warning" />
            {alertLoading ? "Đang gửi…" : "Gửi cảnh báo email"}
          </button>
          <button
            onClick={() => { setShowImport(!showImport); setImportResult(null) }}
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            <UploadCloud className="h-4 w-4" />
            Nhập bảng giá
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Tổng đang hiệu lực" value={String(summary.total)} />
        <StatCard label="Sắp hết hạn (≤7 ngày)" value={String(summary.expiring)} warn={summary.expiring > 0} />
        <StatCard label="Mã phụ phí" value={String(chargeCodes.length)} />
      </div>

      {/* Bulk import panel */}
      {showImport && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Nhập bảng giá hàng loạt (JSON)</h2>
          <p className="text-xs text-muted-foreground">
            Paste JSON array, mỗi phần tử gồm: pol, pod, mode, valid_from (YYYY-MM-DD), valid_to, currency, rate_20ft, rate_40ft, rate_40hc, rate_per_cbm, notes
          </p>
          <textarea
            className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs h-28 resize-y"
            placeholder={'[{"pol":"VNSGN","pod":"CNSHA","mode":"FCL","valid_from":"2026-10-01","valid_to":"2027-03-31","currency":"USD","rate_20ft":350,"rate_40ft":600}]'}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Nhập dữ liệu
            </button>
            <button
              onClick={() => { setShowImport(false); setImportResult(null) }}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Đóng
            </button>
          </div>
          {importResult && (
            <div className={cn("rounded-md border p-3 text-sm", importResult.error_count > 0 ? "border-warning/40 bg-warning/5" : "border-success/40 bg-success/5")}>
              <p className="font-medium">Kết quả: {importResult.imported} dòng thành công, {importResult.error_count} lỗi</p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-destructive">
                  {importResult.errors.map((e) => (
                    <li key={e.row}>Dòng {e.row}: {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["rates", "charges"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "rates" ? "Bảng cước" : "Mã phụ phí"}
          </button>
        ))}
      </div>

      {/* Rates tab */}
      {tab === "rates" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">POL (cảng xếp)</label>
              <input
                className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm w-28"
                placeholder="VNSGN"
                value={filterPol}
                onChange={(e) => setFilterPol(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">POD (cảng dỡ)</label>
              <input
                className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm w-28"
                placeholder="CNSHA"
                value={filterPod}
                onChange={(e) => setFilterPod(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <select
                className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
              >
                <option value="">Tất cả</option>
                {Object.entries(MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button
              onClick={loadRates}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Search className="h-4 w-4" />
              Tìm
            </button>
            <button
              onClick={() => { setFilterPol(""); setFilterPod(""); setFilterMode(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline py-1.5"
            >
              Xóa bộ lọc
            </button>
          </div>

          {error && <ErrorBox message={error} onRetry={loadRates} />}
          {loading
            ? <SkeletonTable rows={4} cols={9} />
            : rates.length === 0
            ? <EmptyState>
                {filterPol || filterPod ? "Không tìm thấy tuyến phù hợp" : "Chưa có bảng cước — nhập bảng giá từ nút phía trên"}
              </EmptyState>
            : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <Th>Tuyến</Th>
                      <Th>Mode</Th>
                      <Th>Hãng tàu</Th>
                      <Th>Hiệu lực</Th>
                      <Th>20DC</Th>
                      <Th>40DC</Th>
                      <Th>40HC</Th>
                      <Th>Per CBM</Th>
                      <Th>Trạng thái</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rates.map((r) => (
                      <tr key={r.id} className={cn("hover:bg-muted/20", r.expiring_soon && "bg-warning/5")}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                          <span>{r.pol}</span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span>{r.pod}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{MODE_LABELS[r.mode] ?? r.mode}</span>
                          {r.rate_type === "CONTRACT" && (
                            <span className="ml-1 rounded bg-info/10 text-info px-1.5 py-0.5 text-xs">Contract</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.carrier_name ?? "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">{r.valid_from} → {r.valid_to}</span>
                            <ExpiryBadge days={r.days_left} show={r.expiring_soon} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(r.rate_20ft, r.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(r.rate_40ft, r.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(r.rate_40hc, r.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(r.rate_per_cbm, r.currency)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <StatusBadge status={r.status} expiring={r.expiring_soon} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* Charge codes tab */}
      {tab === "charges" && (
        <div className="overflow-x-auto rounded-lg border">
          {chargeCodes.length === 0
            ? <EmptyState>Chưa có mã phụ phí — dữ liệu được khởi tạo cùng migration</EmptyState>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <Th>Mã</Th>
                    <Th>Tên</Th>
                    <Th>Phân loại</Th>
                    <Th>Loại</Th>
                    <Th>Tiền tệ</Th>
                    <Th>Bắt buộc</Th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {chargeCodes.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-mono text-xs font-medium">{c.code}</td>
                      <td className="px-3 py-2.5">{c.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium",
                          c.charge_type === "AR" ? "bg-success/10 text-success"
                          : c.charge_type === "AP" ? "bg-destructive/10 text-destructive"
                          : "bg-info/10 text-info"
                        )}>
                          {TYPE_LABEL[c.charge_type] ?? c.charge_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.currency}</td>
                      <td className="px-3 py-2.5">{c.is_mandatory ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  )
}

// ---- Sub-components --------------------------------------------------------

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{children}</th>
}

function StatCard({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", warn && "border-warning/40 bg-warning/5")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", warn && "text-warning")}>{value}</p>
    </div>
  )
}

function StatusBadge({ status, expiring }: { status: string; expiring: boolean }) {
  if (expiring) {
    return <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">Sắp hết hạn</span>
  }
  const cls = status === "ACTIVE"
    ? "bg-success/10 text-success border-success/30"
    : status === "EXPIRED"
    ? "bg-muted text-muted-foreground border-border"
    : "bg-warning/10 text-warning border-warning/30"
  const label = status === "ACTIVE" ? "Hiệu lực" : status === "EXPIRED" ? "Hết hạn" : "Tạm dừng"
  return <span className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", cls)}>{label}</span>
}
