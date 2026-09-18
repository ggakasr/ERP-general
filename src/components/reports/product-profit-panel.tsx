"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { cn, downloadCsv, formatMoney } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, Select } from "@/components/ui/form"
import { ErrorBox, Loading, Stat } from "@/components/shared/bits"
import { EmptyRow, HeadRow, NoPermission, TableShell, Td, Th, currentPeriod, num } from "@/components/reports/common"

interface ProfitRow { code: string; name: string; qty?: number; revenue: number; cogs: number; gross_margin: number; margin_pct: number | null }
interface ProfitResponse { from: string; to: string; by_product: ProfitRow[]; by_customer: ProfitRow[] }

function ProfitTable({ rows, itemLabel, showQty }: { rows: ProfitRow[]; itemLabel: string; showQty: boolean }) {
  const totalRevenue = rows.reduce((s, r) => s + num(r.revenue), 0)
  const totalCogs = rows.reduce((s, r) => s + num(r.cogs), 0)
  const totalMargin = totalRevenue - totalCogs
  return (
    <TableShell>
      <thead>
        <HeadRow>
          <Th>{itemLabel}</Th>
          {showQty && <Th right>SL bán</Th>}
          <Th right>Doanh thu</Th>
          <Th right>Giá vốn</Th>
          <Th right>Lãi gộp</Th>
          <Th right>Biên LN gộp</Th>
        </HeadRow>
      </thead>
      <tbody>
        {rows.length === 0 && <EmptyRow colSpan={showQty ? 6 : 5}>Không có doanh thu trong kỳ đã chọn</EmptyRow>}
        {rows.map((r) => (
          <tr key={r.code} className="border-b last:border-0 hover:bg-muted/30">
            <Td><span className="mr-2 font-mono text-xs text-primary">{r.code}</span>{r.name}</Td>
            {showQty && <Td right>{r.qty ?? "—"}</Td>}
            <Td right>{formatMoney(r.revenue)}</Td>
            <Td right>{formatMoney(r.cogs)}</Td>
            <Td right className={cn("font-medium", num(r.gross_margin) < 0 && "text-red-700")}>{formatMoney(r.gross_margin)}</Td>
            <Td right className={cn(num(r.margin_pct) < 15 ? "text-amber-700" : "text-emerald-700")}>
              {r.margin_pct === null ? "—" : `${r.margin_pct}%`}
            </Td>
          </tr>
        ))}
        {rows.length > 0 && (
          <tr className="bg-muted/30 font-medium">
            <Td>Tổng</Td>
            {showQty && <Td right />}
            <Td right>{formatMoney(totalRevenue)}</Td>
            <Td right>{formatMoney(totalCogs)}</Td>
            <Td right>{formatMoney(totalMargin)}</Td>
            <Td right>{totalRevenue ? `${Math.round((totalMargin / totalRevenue) * 1000) / 10}%` : "—"}</Td>
          </tr>
        )}
      </tbody>
    </TableShell>
  )
}

export function ProductProfitPanel() {
  const { can, master } = useSession()
  const allowed = can("GL", "VIEW")
  const periods = useMemo(() => (master.periods || []).map((p) => p.period).sort(), [master.periods])
  const cur = currentPeriod()
  const [from, setFrom] = useState(periods.includes("2026-07") ? "2026-07" : periods[0] || "2026-07")
  const [to, setTo] = useState(periods.includes(cur) ? cur : periods[periods.length - 1] || cur)
  const [view, setView] = useState<"product" | "customer">("product")
  const [data, setData] = useState<ProfitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<ProfitResponse>("api_product_profit", { p_from: from, p_to: to })
    setLoading(false)
    if (!res.ok) { setError((res as any).error || "Không tải được báo cáo"); return }
    setError(null)
    setData(res)
  }, [allowed, from, to])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Báo cáo lãi gộp theo sản phẩm/khách hàng yêu cầu quyền xem Sổ cái (GL).</NoPermission>

  const rows = view === "product" ? data?.by_product || [] : data?.by_customer || []
  const opts = periods.length ? periods : [from]

  const exportCsv = () => {
    if (!data) return
    const rs = view === "product" ? data.by_product : data.by_customer
    downloadCsv(`lai-gop-${view === "product" ? "san-pham" : "khach-hang"}-${from}-${to}`,
      [view === "product" ? "Mã sản phẩm" : "Mã khách hàng", "Tên", ...(view === "product" ? ["SL bán"] : []), "Doanh thu", "Giá vốn", "Lãi gộp", "Biên LN gộp %"],
      rs.map((r) => [r.code, r.name, ...(view === "product" ? [r.qty ?? ""] : []), r.revenue, r.cogs, r.gross_margin, r.margin_pct ?? ""]))
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Doanh thu tính theo hóa đơn bán hàng đã phát hành (TK 511); giá vốn tính theo lô FIFO đã xuất giao (TK 632) trong cùng kỳ —
        khớp với Báo cáo tài chính. Việc theo dõi &amp; cải thiện biên lợi nhuận theo sản phẩm/khách hàng là việc của <b>Kế toán trưởng và CFO</b>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Từ kỳ" className="w-32">
          <Select value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }}>
            {opts.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Đến kỳ" className="w-32">
          <Select value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value) }}>
            {opts.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Xem theo" className="w-40">
          <Select value={view} onChange={(e) => setView(e.target.value as any)}>
            <option value="product">Sản phẩm</option>
            <option value="customer">Khách hàng</option>
          </Select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
        </div>
      </div>

      {!data && !error && <Loading />}
      {error && <ErrorBox message={error} />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Tổng doanh thu" value={formatMoney(rows.reduce((s, r) => s + num(r.revenue), 0))} />
            <Stat label="Tổng giá vốn" value={formatMoney(rows.reduce((s, r) => s + num(r.cogs), 0))} />
            <Stat label="Tổng lãi gộp" value={formatMoney(rows.reduce((s, r) => s + num(r.gross_margin), 0))} />
          </div>
          <ProfitTable rows={rows} itemLabel={view === "product" ? "Sản phẩm" : "Khách hàng"} showQty={view === "product"} />
        </>
      )}
    </div>
  )
}
