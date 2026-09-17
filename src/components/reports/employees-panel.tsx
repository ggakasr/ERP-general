"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RefreshCw, Search } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { SCOPE_LABELS } from "@/lib/labels"
import { cn, downloadCsv, formatDate, formatMoney, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/form"
import { DocLink, ErrorBox, Loading } from "@/components/shared/bits"
import { EmptyRow, HeadRow, NoPermission, TableShell, Td, Th, maskedOr } from "@/components/reports/common"

interface EmployeeRow {
  id: string; code: string; full_name: string; department_name: string; branch_code: string; position: string | null
  base_salary?: number; allowance?: number; dependents?: number; bank_account?: string | null; start_date?: string | null
  status: string; source_document_id?: string | null; source_document_number?: string | null
  _masked?: string[]
}

const EMP_STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Đang làm việc", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ON_LEAVE: { label: "Tạm nghỉ", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  TERMINATED: { label: "Đã nghỉ việc", className: "bg-slate-100 text-slate-600 ring-slate-200" },
}

export function EmployeesPanel() {
  const { can, scopeOf } = useSession()
  const allowed = can("EMPLOYEE", "VIEW")
  const [rows, setRows] = useState<EmployeeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<{ rows: EmployeeRow[] }>("api_employees")
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được hồ sơ nhân sự"); return }
    setError(null)
    setRows(res.rows)
  }, [allowed])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Hồ sơ nhân sự yêu cầu quyền xem EMPLOYEE.</NoPermission>

  const term = q.trim().toLowerCase()
  const filtered = (rows || []).filter((r) =>
    !term || [r.code, r.full_name, r.department_name, r.position].some((v) => (v || "").toLowerCase().includes(term)))
  const scope = scopeOf("EMPLOYEE", "VIEW")

  const exportCsv = () => {
    const m = (r: EmployeeRow, k: keyof EmployeeRow) => (r._masked?.includes(k as string) ? "(ẩn)" : (r[k] as any) ?? "")
    downloadCsv(`nhan-su-${new Date().toISOString().slice(0, 10)}`,
      ["Mã NV", "Họ tên", "Phòng ban", "Chi nhánh", "Vị trí", "Lương cơ bản", "Phụ cấp", "Người phụ thuộc", "Tài khoản ngân hàng", "Ngày bắt đầu", "Trạng thái", "Chứng từ gốc"],
      filtered.map((r) => [r.code, r.full_name, r.department_name, r.branch_code, r.position, m(r, "base_salary"), m(r, "allowance"),
        m(r, "dependents"), m(r, "bank_account"), m(r, "start_date"), EMP_STATUS[r.status]?.label || r.status, r.source_document_number || ""]))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã, họ tên, phòng ban…" className="w-64 pl-8" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {scope && <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">Phạm vi: {SCOPE_LABELS[scope]}</span>}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!rows}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Mã NV</Th><Th>Họ tên</Th><Th>Phòng ban</Th><Th>Chi nhánh</Th><Th>Vị trí</Th><Th right>Lương cơ bản</Th><Th right>Phụ cấp</Th>
              <Th right>Người phụ thuộc</Th><Th>Tài khoản NH</Th><Th>Ngày bắt đầu</Th><Th>Trạng thái</Th><Th>Chứng từ gốc</Th>
            </HeadRow>
          </thead>
          <tbody>
            {filtered.length === 0 && <EmptyRow colSpan={12}>Không có nhân sự trong phạm vi của bạn</EmptyRow>}
            {filtered.map((r) => {
              const st = EMP_STATUS[r.status]
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <Td className="font-mono">{r.code}</Td>
                  <Td className="whitespace-nowrap font-medium">{r.full_name}</Td>
                  <Td className="whitespace-nowrap">{r.department_name}</Td>
                  <Td>{r.branch_code}</Td>
                  <Td>{r.position || "—"}</Td>
                  <Td right>{maskedOr(r, "base_salary", (v) => formatMoney(v))}</Td>
                  <Td right>{maskedOr(r, "allowance", (v) => formatMoney(v))}</Td>
                  <Td right>{maskedOr(r, "dependents", (v) => formatNumber(v))}</Td>
                  <Td className="font-mono text-xs">{maskedOr(r, "bank_account", (v) => v || "—")}</Td>
                  <Td className="whitespace-nowrap">{maskedOr(r, "start_date", (v) => formatDate(v))}</Td>
                  <Td>
                    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", st?.className || "bg-slate-100 text-slate-700 ring-slate-200")}>
                      {st?.label || r.status}
                    </span>
                  </Td>
                  <Td>
                    {r.source_document_id && r.source_document_number ? (
                      <DocLink id={r.source_document_id} number={r.source_document_number} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
