"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Info, RefreshCw } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { cn, formatMoney } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, Select } from "@/components/ui/form"
import { DocLink, ErrorBox, Loading, Stat, StatusBadge } from "@/components/shared/bits"
import { EmptyRow, HeadRow, NoPermission, TableShell, Td, Th, num } from "@/components/reports/common"

interface BudgetRow {
  id: string; number: string; status: string; department_name: string
  planned: number; committed: number; actual: number; remaining: number; utilization_pct: number | null
  lines: { account_code: string | null; account_name: string | null; description: string | null; planned: number }[] | null
}

function barClass(pct: number) {
  if (pct >= 90) return "bg-red-500"
  if (pct >= 70) return "bg-amber-500"
  return "bg-emerald-500"
}

export function BudgetPanel() {
  const { can } = useSession()
  const allowed = can("BUDGET", "VIEW")
  const thisYear = new Date().getFullYear()
  const years = Array.from(new Set([2025, 2026, 2027, thisYear])).sort()
  const [year, setYear] = useState(2026)
  const [rows, setRows] = useState<BudgetRow[] | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<{ rows: BudgetRow[] }>("api_budget_report", { p_year: year })
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được báo cáo ngân sách"); return }
    setError(null)
    setRows(res.rows)
  }, [allowed, year])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Báo cáo ngân sách yêu cầu quyền xem Ngân sách (BUDGET).</NoPermission>

  const t = (rows || []).reduce(
    (a, r) => ({ planned: a.planned + num(r.planned), committed: a.committed + num(r.committed), actual: a.actual + num(r.actual), remaining: a.remaining + num(r.remaining) }),
    { planned: 0, committed: 0, actual: 0, remaining: 0 }
  )
  const totalPct = t.planned > 0 ? ((t.committed + t.actual) / t.planned) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Năm tài chính" className="w-32">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Button variant="ghost" size="icon" className="ml-auto h-9 w-9" onClick={load} title="Tải lại">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <b>Cam kết</b> = giá trị đơn mua hàng (PO) đã duyệt; <b>Thực chi</b> = hóa đơn nhà cung cấp đã ghi sổ.
          Còn lại = Kế hoạch − Cam kết − Thực chi. PO vượt ngân sách còn lại sẽ bị chặn khi gửi duyệt (T1.14, T4.8).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Kế hoạch" value={formatMoney(t.planned)} hint={`${rows?.length ?? 0} ngân sách`} />
        <Stat label="Cam kết (PO đã duyệt)" value={formatMoney(t.committed)} />
        <Stat label="Thực chi (hóa đơn NCC)" value={formatMoney(t.actual)} />
        <Stat label="Còn lại" value={formatMoney(t.remaining)} hint={`Đã dùng ${totalPct.toFixed(1)}%`}
          tone={totalPct >= 90 ? "bad" : totalPct >= 70 ? "warn" : "good"} />
      </div>

      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th className="w-8" /><Th>Ngân sách</Th><Th>Phòng ban</Th><Th>Trạng thái</Th>
              <Th right>Kế hoạch</Th><Th right>Cam kết</Th><Th right>Thực chi</Th><Th right>Còn lại</Th><Th className="min-w-[160px]">Mức sử dụng</Th>
            </HeadRow>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>Không có ngân sách năm {year} trong phạm vi của bạn</EmptyRow>}
            {rows.map((r) => {
              const pct = num(r.utilization_pct)
              const isOpen = !!open[r.id]
              return (
                <Fragment key={r.id}>
                  <tr className="border-b last:border-0 hover:bg-muted/30">
                    <Td>
                      <button
                        onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                        aria-label={isOpen ? "Thu gọn" : "Xem dòng kế hoạch"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </Td>
                    <Td><DocLink id={r.id} number={r.number} /></Td>
                    <Td>{r.department_name}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td right>{formatMoney(r.planned)}</Td>
                    <Td right>{formatMoney(r.committed)}</Td>
                    <Td right>{formatMoney(r.actual)}</Td>
                    <Td right className={cn(num(r.remaining) < 0 && "text-red-700")}>{formatMoney(r.remaining)}</Td>
                    <Td>
                      {r.utilization_pct === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", barClass(pct))} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums">{pct.toFixed(1)}%</span>
                        </div>
                      )}
                    </Td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={9} className="px-3 py-2 pl-12">
                        {!r.lines?.length ? (
                          <p className="text-xs text-muted-foreground">Không có dòng kế hoạch.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground">
                                <th className="py-1 pr-3 font-medium">Tài khoản</th>
                                <th className="py-1 pr-3 font-medium">Diễn giải</th>
                                <th className="py-1 text-right font-medium">Kế hoạch</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.lines.map((l, i) => (
                                <tr key={i} className="border-t">
                                  <td className="py-1 pr-3"><span className="font-mono">{l.account_code || "—"}</span> {l.account_name}</td>
                                  <td className="py-1 pr-3">{l.description || "—"}</td>
                                  <td className="py-1 text-right tabular-nums">{formatMoney(l.planned)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
