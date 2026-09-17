"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Printer, RefreshCw } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { SCOPE_LABELS } from "@/lib/labels"
import { cn, downloadCsv, formatDate, formatMoney } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, Select } from "@/components/ui/form"
import { DocLink, ErrorBox, Loading, Stat, StatusBadge } from "@/components/shared/bits"
import { EmptyRow, HeadRow, NoPermission, TableShell, Td, Th, currentPeriod, num } from "@/components/reports/common"

// ------------------------------------------------------------
// Period range selector (shared)
// ------------------------------------------------------------
function usePeriodRange() {
  const { master } = useSession()
  const periods = useMemo(() => (master.periods || []).map((p) => p.period).sort(), [master.periods])
  const defaultFrom = periods.includes("2026-07") ? "2026-07" : periods[0] || "2026-07"
  const cur = currentPeriod()
  const defaultTo = periods.includes(cur) ? cur : periods[periods.length - 1] || cur
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo < defaultFrom ? defaultFrom : defaultTo)
  return { periods, from, to, setFrom, setTo }
}

function PeriodRange({
  periods, from, to, setFrom, setTo,
}: { periods: string[]; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const opts = periods.length ? periods : [from]
  return (
    <>
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
    </>
  )
}

// ------------------------------------------------------------
// Financial statements
// ------------------------------------------------------------
interface FsRow { account_code: string; account_name: string; account_type: string; amount: number }
interface FsResponse {
  from: string
  to: string
  income_statement: { rows: FsRow[]; revenue: number; expense: number; net_profit: number }
  balance_sheet: { rows: FsRow[]; total_assets: number; total_liabilities: number; total_equity: number; retained_profit: number }
}

function AmountLines({ rows, empty }: { rows: FsRow[]; empty: string }) {
  if (!rows.length) {
    return <tr><td colSpan={2} className="px-3 py-2 pl-6 text-xs text-muted-foreground">{empty}</td></tr>
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={r.account_code} className="border-b last:border-0">
          <td className="px-3 py-1.5 pl-6"><span className="mr-2 font-mono text-xs text-muted-foreground">{r.account_code}</span>{r.account_name}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.amount)}</td>
        </tr>
      ))}
    </>
  )
}

function SectionRow({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <tr className={cn("border-b bg-muted/30", strong && "bg-muted/60")}>
      <td className={cn("px-3 py-2", strong ? "font-semibold" : "font-medium")}>{label}</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", strong ? "font-semibold" : "font-medium",
        tone === "good" && "text-emerald-700", tone === "bad" && "text-red-700")}>{formatMoney(value)}</td>
    </tr>
  )
}

export function FinancialStatementsPanel() {
  const { can } = useSession()
  const range = usePeriodRange()
  const [data, setData] = useState<FsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const allowed = can("GL", "VIEW")

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<FsResponse>("api_financial_statements", { p_from: range.from, p_to: range.to })
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được báo cáo"); return }
    setError(null)
    setData(res)
  }, [allowed, range.from, range.to])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Báo cáo tài chính yêu cầu quyền xem Sổ cái &amp; BCTC (GL).</NoPermission>

  const is = data?.income_statement
  const bs = data?.balance_sheet
  const assets = bs?.rows.filter((r) => r.account_type === "ASSET") || []
  const liabilities = bs?.rows.filter((r) => r.account_type === "LIABILITY") || []
  const equity = bs?.rows.filter((r) => r.account_type === "EQUITY") || []
  const revenue = is?.rows.filter((r) => r.account_type === "REVENUE") || []
  const expense = is?.rows.filter((r) => r.account_type === "EXPENSE") || []
  const rhs = bs ? num(bs.total_liabilities) + num(bs.total_equity) + num(bs.retained_profit) : 0
  const balanced = bs ? Math.abs(num(bs.total_assets) - rhs) < 1 : false

  const exportCsv = () => {
    if (!data || !is || !bs) return
    const rows: (string | number)[][] = [
      ["KẾT QUẢ KINH DOANH", "", "", ""],
      ...revenue.map((r) => ["Doanh thu", r.account_code, r.account_name, num(r.amount)]),
      ["Tổng doanh thu", "", "", num(is.revenue)],
      ...expense.map((r) => ["Chi phí", r.account_code, r.account_name, num(r.amount)]),
      ["Tổng chi phí", "", "", num(is.expense)],
      ["Lợi nhuận thuần", "", "", num(is.net_profit)],
      ["BẢNG CÂN ĐỐI KẾ TOÁN", "", "", ""],
      ...assets.map((r) => ["Tài sản", r.account_code, r.account_name, num(r.amount)]),
      ["Tổng tài sản", "", "", num(bs.total_assets)],
      ...liabilities.map((r) => ["Nợ phải trả", r.account_code, r.account_name, num(r.amount)]),
      ["Tổng nợ phải trả", "", "", num(bs.total_liabilities)],
      ...equity.map((r) => ["Vốn chủ sở hữu", r.account_code, r.account_name, num(r.amount)]),
      ["Tổng vốn chủ sở hữu", "", "", num(bs.total_equity)],
      ["Lợi nhuận lũy kế chưa kết chuyển", "", "", num(bs.retained_profit)],
    ]
    downloadCsv(`bao-cao-tai-chinh-${data.from}_${data.to}`, ["Mục", "Tài khoản", "Tên tài khoản", "Số tiền"], rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <PeriodRange {...range} />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> In</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Loading />}
      {data && is && bs && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Doanh thu trong kỳ" value={formatMoney(is.revenue)} />
            <Stat label="Chi phí trong kỳ" value={formatMoney(is.expense)} />
            <Stat label="Lợi nhuận thuần" value={formatMoney(is.net_profit)} tone={num(is.net_profit) >= 0 ? "good" : "bad"} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Báo cáo kết quả kinh doanh <span className="font-normal text-muted-foreground">({data.from} → {data.to})</span></h3>
              <TableShell>
                <thead><HeadRow><Th>Chỉ tiêu</Th><Th right>Số tiền</Th></HeadRow></thead>
                <tbody>
                  <SectionRow label="Doanh thu" value={is.revenue} />
                  <AmountLines rows={revenue} empty="Không có phát sinh doanh thu" />
                  <SectionRow label="Chi phí" value={is.expense} />
                  <AmountLines rows={expense} empty="Không có phát sinh chi phí" />
                  <SectionRow label="Lợi nhuận thuần" value={is.net_profit} strong tone={num(is.net_profit) >= 0 ? "good" : "bad"} />
                </tbody>
              </TableShell>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Bảng cân đối kế toán <span className="font-normal text-muted-foreground">(tại cuối kỳ {data.to})</span></h3>
              <TableShell>
                <thead><HeadRow><Th>Chỉ tiêu</Th><Th right>Số dư</Th></HeadRow></thead>
                <tbody>
                  <SectionRow label="Tài sản" value={bs.total_assets} strong />
                  <AmountLines rows={assets} empty="Không có số dư tài sản" />
                  <SectionRow label="Nợ phải trả" value={bs.total_liabilities} />
                  <AmountLines rows={liabilities} empty="Không có số dư nợ phải trả" />
                  <SectionRow label="Vốn chủ sở hữu" value={bs.total_equity} />
                  <AmountLines rows={equity} empty="Không có số dư vốn chủ sở hữu" />
                  <SectionRow label="Lợi nhuận lũy kế (chưa kết chuyển)" value={bs.retained_profit} />
                  <SectionRow label="Tổng nguồn vốn" value={rhs} strong />
                </tbody>
              </TableShell>
              <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                balanced ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
                <span className="font-bold">{balanced ? "✓" : "✗"}</span>
                <span>Tài sản = Nợ phải trả + Vốn CSH + Lợi nhuận</span>
                <span className="ml-auto tabular-nums">{formatMoney(bs.total_assets)} {balanced ? "=" : "≠"} {formatMoney(rhs)}</span>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Trial balance
// ------------------------------------------------------------
interface TbRow { account_code: string; account_name: string; account_type: string; opening: number; debit: number; credit: number; closing: number }

export function TrialBalancePanel() {
  const { can } = useSession()
  const range = usePeriodRange()
  const [rows, setRows] = useState<TbRow[] | null>(null)
  const [scope, setScope] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const allowed = can("GL", "VIEW")

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<{ rows: TbRow[]; scope: string }>("api_trial_balance", { p_from: range.from, p_to: range.to })
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được bảng cân đối"); return }
    setError(null)
    setRows(res.rows)
    setScope(res.scope)
  }, [allowed, range.from, range.to])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Bảng cân đối số phát sinh yêu cầu quyền xem Sổ cái &amp; BCTC (GL).</NoPermission>

  const totals = (rows || []).reduce(
    (acc, r) => ({ opening: acc.opening + num(r.opening), debit: acc.debit + num(r.debit), credit: acc.credit + num(r.credit), closing: acc.closing + num(r.closing) }),
    { opening: 0, debit: 0, credit: 0, closing: 0 }
  )
  const balanced = Math.abs(totals.debit - totals.credit) < 1

  const exportCsv = () => {
    if (!rows) return
    downloadCsv(`bang-can-doi-so-phat-sinh-${range.from}_${range.to}`,
      ["Tài khoản", "Tên tài khoản", "Số dư đầu kỳ", "Phát sinh Nợ", "Phát sinh Có", "Số dư cuối kỳ"],
      [...rows.map((r) => [r.account_code, r.account_name, num(r.opening), num(r.debit), num(r.credit), num(r.closing)]),
        ["Tổng cộng", "", totals.opening, totals.debit, totals.credit, totals.closing]])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <PeriodRange {...range} />
        {scope && (
          <span className="mb-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground" title="Phạm vi dữ liệu sổ cái theo ma trận phân quyền">
            Phạm vi: {SCOPE_LABELS[scope] || scope}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Số dư quy ước dương = dư Nợ, âm = dư Có. Số dư cuối kỳ = Đầu kỳ + Phát sinh Nợ − Phát sinh Có.</p>
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Tài khoản</Th><Th>Tên tài khoản</Th><Th right>Số dư đầu kỳ</Th><Th right>Phát sinh Nợ</Th><Th right>Phát sinh Có</Th><Th right>Số dư cuối kỳ</Th>
            </HeadRow>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>Không có phát sinh trong phạm vi của bạn</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.account_code} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="font-mono">{r.account_code}</Td>
                <Td>{r.account_name}</Td>
                <Td right>{formatMoney(r.opening)}</Td>
                <Td right>{formatMoney(r.debit)}</Td>
                <Td right>{formatMoney(r.credit)}</Td>
                <Td right className={cn(num(r.closing) < 0 && "text-red-700")}>{formatMoney(r.closing)}</Td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t bg-muted/50 font-semibold">
                <Td colSpan={2}>
                  Tổng cộng{" "}
                  <span className={cn("ml-2 text-xs font-normal", balanced ? "text-emerald-700" : "text-red-700")}>
                    {balanced ? "✓ Nợ = Có" : "✗ Nợ ≠ Có"}
                  </span>
                </Td>
                <Td right>{formatMoney(totals.opening)}</Td>
                <Td right>{formatMoney(totals.debit)}</Td>
                <Td right>{formatMoney(totals.credit)}</Td>
                <Td right>{formatMoney(totals.closing)}</Td>
              </tr>
            )}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// AR / AP aging
// ------------------------------------------------------------
interface AgingRow {
  id: string; number: string; status: string; partner_name: string; amount: number; paid: number; outstanding: number
  due_date: string | null; days_overdue: number; bucket: "CURRENT" | "1-30" | "31-60" | ">60"
}

const BUCKETS: { key: AgingRow["bucket"]; label: string; tone: "default" | "good" | "warn" | "bad" }[] = [
  { key: "CURRENT", label: "Chưa đến hạn", tone: "good" },
  { key: "1-30", label: "Quá hạn 1–30 ngày", tone: "warn" },
  { key: "31-60", label: "Quá hạn 31–60 ngày", tone: "bad" },
  { key: ">60", label: "Quá hạn trên 60 ngày", tone: "bad" },
]

const BUCKET_CLASS: Record<string, string> = {
  CURRENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "1-30": "bg-amber-50 text-amber-800 ring-amber-200",
  "31-60": "bg-orange-50 text-orange-700 ring-orange-200",
  ">60": "bg-red-50 text-red-700 ring-red-200",
}

export function AgingPanel() {
  const { can } = useSession()
  const canAR = can("INV", "VIEW")
  const canAP = can("SINV", "VIEW")
  const [kind, setKind] = useState<"AR" | "AP">(canAR ? "AR" : "AP")
  const [rows, setRows] = useState<AgingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!canAR && !canAP) return
    setLoading(true)
    const res = await rpc<{ rows: AgingRow[] }>("api_aging", { p_kind: kind })
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được công nợ"); return }
    setError(null)
    setRows(res.rows)
  }, [kind, canAR, canAP])

  useEffect(() => { load() }, [load])

  if (!canAR && !canAP) return <NoPermission>Báo cáo công nợ yêu cầu quyền xem Hóa đơn bán hàng (AR) hoặc Hóa đơn NCC (AP).</NoPermission>

  const sums = BUCKETS.map((b) => ({
    ...b,
    total: (rows || []).filter((r) => r.bucket === b.key).reduce((s, r) => s + num(r.outstanding), 0),
    count: (rows || []).filter((r) => r.bucket === b.key).length,
  }))
  const total = sums.reduce((s, b) => s + b.total, 0)

  const exportCsv = () => {
    if (!rows) return
    downloadCsv(`cong-no-${kind}-${new Date().toISOString().slice(0, 10)}`,
      ["Chứng từ", kind === "AR" ? "Khách hàng" : "Nhà cung cấp", "Giá trị", "Đã thanh toán", "Còn lại", "Hạn thanh toán", "Số ngày quá hạn", "Nhóm tuổi nợ"],
      rows.map((r) => [r.number, r.partner_name, num(r.amount), num(r.paid), num(r.outstanding), formatDate(r.due_date), r.days_overdue, r.bucket]))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          {(["AR", "AP"] as const).map((k) => {
            const ok = k === "AR" ? canAR : canAP
            return (
              <button
                key={k}
                disabled={!ok}
                onClick={() => setKind(k)}
                title={ok ? undefined : "Bạn không có quyền xem loại công nợ này"}
                className={cn("rounded px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40",
                  kind === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
              >
                {k === "AR" ? "Phải thu (AR)" : "Phải trả (AP)"}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-muted-foreground">
          {kind === "AR" ? "Hóa đơn bán hàng đã ghi sổ chưa thu đủ" : "Hóa đơn nhà cung cấp đã ghi sổ chưa chi đủ"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Tổng còn phải thu/trả" value={formatMoney(total)} hint={`${rows?.length ?? 0} chứng từ`} />
        {sums.map((b) => (
          <Stat key={b.key} label={b.label} value={formatMoney(b.total)} hint={`${b.count} chứng từ`} tone={b.total > 0 ? b.tone : "default"} />
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Chứng từ</Th><Th>Trạng thái</Th><Th>{kind === "AR" ? "Khách hàng" : "Nhà cung cấp"}</Th>
              <Th right>Giá trị</Th><Th right>Đã thanh toán</Th><Th right>Còn lại</Th><Th>Hạn thanh toán</Th><Th right>Quá hạn (ngày)</Th><Th>Nhóm</Th>
            </HeadRow>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>Không có công nợ mở trong phạm vi của bạn</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                <Td><DocLink id={r.id} number={r.number} /></Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td>{r.partner_name}</Td>
                <Td right>{formatMoney(r.amount)}</Td>
                <Td right>{formatMoney(r.paid)}</Td>
                <Td right className="font-medium">{formatMoney(r.outstanding)}</Td>
                <Td className="whitespace-nowrap">{formatDate(r.due_date)}</Td>
                <Td right className={cn(r.days_overdue > 0 && "text-red-700")}>{r.days_overdue}</Td>
                <Td>
                  <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BUCKET_CLASS[r.bucket])}>
                    {BUCKETS.find((b) => b.key === r.bucket)?.label || r.bucket}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
