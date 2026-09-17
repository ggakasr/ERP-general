"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { cn, formatMoney, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorBox, Loading } from "@/components/shared/bits"
import { NoPermission } from "@/components/reports/common"

interface KpiRow {
  code: string; name: string; category: "FINANCIAL" | "OPERATIONAL" | "COMPLIANCE" | "CUSTOMER"; formula: string
  value: number | null; target: number | null; unit: string | null; direction: "HIGHER" | "LOWER"; flow_code: string | null
  status: "GREEN" | "YELLOW" | "RED" | "NEUTRAL"
}

const CATEGORIES: { key: KpiRow["category"]; label: string }[] = [
  { key: "FINANCIAL", label: "Tài chính" },
  { key: "OPERATIONAL", label: "Vận hành" },
  { key: "COMPLIANCE", label: "Tuân thủ & kiểm soát" },
  { key: "CUSTOMER", label: "Khách hàng" },
]

const STATUS_STYLE: Record<KpiRow["status"], { bar: string; badge: string; label: string }> = {
  GREEN: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Đạt" },
  YELLOW: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-800 ring-amber-200", label: "Cảnh báo" },
  RED: { bar: "bg-red-500", badge: "bg-red-50 text-red-700 ring-red-200", label: "Không đạt" },
  NEUTRAL: { bar: "bg-slate-300", badge: "bg-slate-100 text-slate-600 ring-slate-200", label: "Theo dõi" },
}

export function formatKpi(value: unknown, unit: string | null) {
  if (value === null || value === undefined) return "—"
  if (unit === "VND") return formatMoney(value)
  if (unit === "%") return `${formatNumber(value)}%`
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`
}

export function KpiPanel() {
  const { can } = useSession()
  const allowed = can("KPI", "VIEW")
  const [rows, setRows] = useState<KpiRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<{ rows: KpiRow[] | null }>("api_kpis")
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được KPI"); return }
    setError(null)
    setRows(res.rows || [])
  }, [allowed])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Danh mục KPI (BM-10) yêu cầu quyền xem KPI.</NoPermission>
  if (error) return <ErrorBox message={error} />
  if (!rows) return <Loading />
  if (!rows.length) return <EmptyState>Chưa có KPI nào trong danh mục.</EmptyState>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>KPI được tính trực tiếp từ sổ cái, chứng từ và nhật ký kiểm soát tại thời điểm xem.</span>
        <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={load} title="Tính lại">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
      {CATEGORIES.map((cat) => {
        const items = rows.filter((r) => r.category === cat.key)
        if (!items.length) return null
        return (
          <section key={cat.key} className="space-y-2">
            <h3 className="text-sm font-semibold">{cat.label}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((k) => {
                const st = STATUS_STYLE[k.status] || STATUS_STYLE.NEUTRAL
                return (
                  <div key={k.code} className="relative overflow-hidden rounded-lg border bg-card p-4">
                    <div className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted-foreground">{k.code}{k.flow_code ? ` · ${k.flow_code}` : ""}</p>
                        <p className="text-sm font-medium">{k.name}</p>
                      </div>
                      <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", st.badge)}>{st.label}</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{formatKpi(k.value, k.unit)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {k.target === null || k.target === undefined
                        ? "Không đặt mục tiêu"
                        : `Mục tiêu: ${k.direction === "HIGHER" ? "≥" : "≤"} ${formatKpi(k.target, k.unit)}`}
                    </p>
                    <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">Công thức: {k.formula}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
