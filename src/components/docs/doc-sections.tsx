"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Check, User, X } from "lucide-react"
import { rpc } from "@/lib/api"
import { EXC_TYPE_LABELS, FIELD_LABELS, MOVE_LABELS, PRIORITY_LABELS, SEVERITY_LABELS, SOD_LABELS, statusLabel } from "@/lib/labels"
import { useSession } from "@/lib/session"
import type { DocLine, DocumentDetail, DocumentRow } from "@/lib/types"
import { cn, formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { DocLink, Masked, Money, SlaBadge, SodBadge, StatusBadge } from "@/components/shared/bits"

const MONEY_KEYS = new Set(["base_salary", "allowance", "total_gross", "total_insurance", "total_pit", "total_net", "material_cost",
  "unit_cost", "opening_accumulated", "accumulated_depreciation", "paid_amount", "outstanding", "cogs", "credit_limit", "gross", "insurance", "pit", "net",
  "vat_amount", "subtotal"])
const DATETIME_KEYS = /(_at)$/
const DATE_KEYS = /(_on|valid_until|delivery_date|start_date|needed_by|date)$/
const SKIP_KEYS = new Set(["match_result", "assets", "payload", "department_id", "affected_document_id", "target_id", "employee_id", "sla_hours"])

export function formatDataValue(key: string, value: any, masterDepartments?: { id: string; name: string }[]): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Có" : "Không"
  if (MONEY_KEYS.has(key)) return formatMoney(value)
  if (DATETIME_KEYS.test(key)) return formatDateTime(value)
  if (DATE_KEYS.test(key)) return formatDate(value)
  if (key === "priority") return PRIORITY_LABELS[value] || value
  if (key === "exception_type") return EXC_TYPE_LABELS[value] || value
  if (key === "severity") return SEVERITY_LABELS[value] || value
  if (key === "department_id") return masterDepartments?.find((d) => d.id === value)?.name || value
  if (typeof value === "object") return <code className="text-xs">{JSON.stringify(value)}</code>
  return String(value)
}

export function InfoGrid({ doc }: { doc: DocumentRow }) {
  const { master } = useSession()
  const masked = new Set(doc._masked || [])
  const rows: { label: string; value: React.ReactNode }[] = []
  const push = (label: string, value: React.ReactNode, show = true) => show && rows.push({ label, value })

  push("Đối tác", doc.partner_name ? `${doc.partner_code} — ${doc.partner_name}` : null, !!doc.partner_name)
  push(doc.doc_type === "ST" ? "Kho nguồn" : "Kho", doc.warehouse_name, !!doc.warehouse_name)
  push("Kho đích", doc.to_warehouse_name, !!doc.to_warehouse_name)
  push("Sản phẩm", doc.product_name ? `${doc.product_code} — ${doc.product_name}` : null, !!doc.product_name)
  push("Nhân viên", doc.employee_name, !!doc.employee_name)
  push("Bộ phận lập / Chi nhánh", `${doc.department_name} · ${doc.branch_code}`)
  push("Bộ phận chịu chi phí", doc.cost_center_name, !!doc.cost_center_name && doc.cost_center_name !== doc.department_name)
  push("Ngày chứng từ", formatDate(doc.doc_date))
  push("Hạn", formatDate(doc.due_date), !!doc.due_date)
  push("Giá trị", <Money value={doc.amount} masked={masked.has("amount")} />, !["TICKET", "HIRE", "EXC", "MDC", "ACCESS_REVIEW", "ST"].includes(doc.doc_type))
  push("Người lập", doc.created_by_name)
  push("Người phụ trách", doc.owner_name, !!doc.owner_name)
  if (doc.data?.affected_document_id) {
    push("Chứng từ bị ảnh hưởng", <DocLink id={doc.data.affected_document_id} number={doc.data.affected_document_number || "Xem"} />)
  }
  Object.entries(doc.data || {}).forEach(([k, v]) => {
    if (SKIP_KEYS.has(k)) {
      if (k === "department_id") push(FIELD_LABELS[k] || k, formatDataValue(k, v, master.departments))
      return
    }
    push(FIELD_LABELS[k] || k, formatDataValue(k, v))
  })
  ;(doc._masked || []).forEach((k) => {
    if (!["amount", "unit_price", "debit", "credit", "value", "unit_cost"].includes(k)) push(FIELD_LABELS[k] || k, <Masked />)
  })

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{r.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={cn("whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground", right ? "text-right" : "text-left")}>{children}</th>
}
function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-3 py-2 align-top", right && "text-right tabular-nums", className)}>{children}</td>
}

function price(line: DocLine, key: "unit_price" | "amount" | "debit" | "credit") {
  if (line._masked?.includes(key)) return <Masked label="Ẩn" />
  return formatMoney(line[key])
}

export function LinesTable({ detail, onChanged }: { detail: DocumentDetail; onChanged: () => void }) {
  const { me } = useSession()
  const toast = useToast()
  const doc = detail.document
  const lines = detail.lines
  const [saving, setSaving] = useState<string | null>(null)
  if (!lines.length) return null

  if (doc.doc_type === "JV") {
    const d = lines.reduce((s, l) => s + Number(l.debit || 0), 0)
    const c = lines.reduce((s, l) => s + Number(l.credit || 0), 0)
    return (
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/40"><Th>Tài khoản</Th><Th>Diễn giải</Th><Th right>Nợ</Th><Th right>Có</Th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <Td><span className="font-mono">{l.account_code}</span> <span className="text-muted-foreground">{l.account_name}</span></Td>
              <Td>{l.description}</Td>
              <Td right>{Number(l.debit) ? price(l, "debit") : ""}</Td>
              <Td right>{Number(l.credit) ? price(l, "credit") : ""}</Td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-medium">
            <Td>Tổng</Td><Td>{d === c ? <span className="text-emerald-700">Cân đối</span> : <span className="text-red-700">Không cân</span>}</Td>
            <Td right>{formatMoney(d)}</Td><Td right>{formatMoney(c)}</Td>
          </tr>
        </tbody>
      </table>
    )
  }

  if (doc.doc_type === "BUDGET") {
    return (
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/40"><Th>Tài khoản</Th><Th>Hạng mục</Th><Th right>Kế hoạch</Th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <Td><span className="font-mono">{l.account_code}</span> <span className="text-muted-foreground">{l.account_name}</span></Td>
              <Td>{l.description}</Td><Td right>{price(l, "amount")}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (doc.doc_type === "PAYROLL") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <Th>Nhân viên</Th><Th right>Lương CB</Th><Th right>Phụ cấp</Th><Th right>Ngày công</Th>
            <Th right>Thu nhập</Th><Th right>BHXH</Th><Th right>Thuế TNCN</Th><Th right>Thực lĩnh</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <Td><span className="font-mono text-xs text-muted-foreground">{l.data.employee_code}</span> {l.description}</Td>
              <Td right>{formatMoney(l.data.base_salary)}</Td><Td right>{formatMoney(l.data.allowance)}</Td>
              <Td right>{l.data.work_days}/{l.data.standard_days}</Td><Td right>{formatMoney(l.data.gross)}</Td>
              <Td right>{formatMoney(l.data.insurance)}</Td><Td right>{formatMoney(l.data.pit)}</Td>
              <Td right className="font-medium">{price(l, "amount")}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (doc.doc_type === "BANKREC") {
    return (
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/40"><Th>Ngày</Th><Th>Nội dung sao kê</Th><Th right>Số tiền</Th><Th>Khớp với</Th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <Td>{formatDate(l.data.date)}</Td><Td>{l.description}</Td>
              <Td right className={cn(Number(l.amount) < 0 ? "text-red-700" : "text-emerald-700")}>{price(l, "amount")}</Td>
              <Td>{l.data.matched_document_id ? <DocLink id={l.data.matched_document_id} number={l.data.matched_number} /> : <span className="text-amber-700">Chưa khớp</span>}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (doc.doc_type === "ACCESS_REVIEW") {
    const editable = doc.status === "DRAFT" && doc.created_by === me.user.id
    const decide = async (line: DocLine, decision: string) => {
      setSaving(line.id)
      const res = await rpc("api_access_review_decide", { p_line_id: line.id, p_decision: decision })
      setSaving(null)
      if (!res.ok) toast("error", "Không lưu được", res.error)
      onChanged()
    }
    return (
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/40"><Th>Người dùng</Th><Th>Phòng ban</Th><Th>Vai trò</Th><Th>Quyết định</Th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={cn("border-b last:border-0", l.data.decision === "REVOKE" && "bg-red-50/60")}>
              <Td><span className="font-mono text-xs text-muted-foreground">{l.data.employee_code}</span> {l.data.user_name}</Td>
              <Td>{l.data.department}</Td>
              <Td>{l.data.role_name} <span className="font-mono text-xs text-muted-foreground">{l.data.role_code}</span></Td>
              <Td>
                {editable ? (
                  <div className="flex gap-1">
                    {(["KEEP", "REVOKE"] as const).map((d) => (
                      <button key={d} disabled={saving === l.id} onClick={() => decide(l, d)}
                        className={cn("rounded px-2 py-0.5 text-xs ring-1 ring-inset", l.data.decision === d
                          ? d === "KEEP" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-red-600 text-white ring-red-600"
                          : "ring-border hover:bg-accent")}>
                        {d === "KEEP" ? "Giữ" : "Thu hồi"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className={cn("text-xs font-medium", l.data.decision === "REVOKE" ? "text-red-700" : "text-emerald-700")}>
                    {l.data.decision === "REVOKE" ? "Thu hồi" : "Giữ"}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const progressKeys = Array.from(new Set(lines.flatMap((l) => Object.keys(l.progress || {}))))
  const PROGRESS_LABEL: Record<string, string> = { ordered: "Đã lập đơn", received: "Đã nhập", invoiced: "Đã HĐ", shipped: "Đã giao" }
  const showPrice = !["ST"].includes(doc.doc_type)
  const isAdj = doc.doc_type === "ADJ"

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/40">
          <Th>#</Th><Th>Sản phẩm</Th><Th right>{isAdj ? "SL thực đếm" : doc.doc_type === "WO" ? "SL định mức" : "Số lượng"}</Th>
          {isAdj && <Th right>SL sổ sách</Th>}{isAdj && <Th right>Chênh lệch</Th>}
          {showPrice && <Th right>{doc.doc_type === "WO" ? "Giá chuẩn" : "Đơn giá"}</Th>}
          {showPrice && <Th right>Thành tiền</Th>}
          {progressKeys.map((k) => <Th key={k} right>{PROGRESS_LABEL[k] || k}</Th>)}
          <Th>Dòng gốc</Th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-b last:border-0">
            <Td className="text-muted-foreground">{l.line_no}</Td>
            <Td><span className="font-mono text-xs text-muted-foreground">{l.product_code}</span> {l.product_name}</Td>
            <Td right>{formatNumber(l.quantity)} <span className="text-xs text-muted-foreground">{l.unit}</span></Td>
            {isAdj && <Td right>{formatNumber(l.data.system_qty_at_post ?? l.data.system_qty)}</Td>}
            {isAdj && <Td right className={cn(Number(l.data.diff) < 0 ? "text-red-700" : Number(l.data.diff) > 0 ? "text-emerald-700" : "")}>{formatNumber(l.data.diff)}</Td>}
            {showPrice && <Td right>{price(l, "unit_price")}</Td>}
            {showPrice && <Td right>{price(l, "amount")}</Td>}
            {progressKeys.map((k) => (
              <Td key={k} right className={cn(Number(l.progress?.[k]) >= Number(l.quantity) ? "text-emerald-700" : Number(l.progress?.[k]) > 0 ? "text-amber-700" : "text-muted-foreground")}>
                {formatNumber(l.progress?.[k] ?? 0)}
              </Td>
            ))}
            <Td>{l.source_document_id ? <DocLink id={l.source_document_id} number={l.source_document_number || ""} /> : <span className="text-muted-foreground">—</span>}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function MatchResult({ doc }: { doc: DocumentRow }) {
  const mr = doc.data?.match_result
  if (!mr) return null
  return (
    <div className={cn("rounded-lg border p-3", mr.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50")}>
      <p className={cn("text-sm font-medium", mr.ok ? "text-emerald-800" : "text-red-800")}>
        Đối chiếu 3 chiều PO ↔ GRN ↔ Hóa đơn: {mr.ok ? "KHỚP" : "LỆCH — hóa đơn bị tạm giữ"}
      </p>
      <p className="text-xs text-muted-foreground">Dung sai: số lượng 0, đơn giá ±2% · kiểm tra lúc {formatDateTime(mr.checked_at)}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3">Sản phẩm</th><th className="py-1 pr-3 text-right">SL đặt</th><th className="py-1 pr-3 text-right">SL đã nhập</th>
              <th className="py-1 pr-3 text-right">Đã HĐ trước</th><th className="py-1 pr-3 text-right">SL hóa đơn</th>
              <th className="py-1 pr-3 text-right">Giá PO</th><th className="py-1 pr-3 text-right">Giá HĐ</th><th className="py-1 text-right">Lệch giá</th>
            </tr>
          </thead>
          <tbody>
            {mr.lines.map((l: any) => (
              <tr key={l.line_no} className="border-t">
                <td className="py-1 pr-3">{l.product}</td>
                <td className="py-1 pr-3 text-right">{formatNumber(l.po_qty)}</td>
                <td className="py-1 pr-3 text-right">{formatNumber(l.received_qty)}</td>
                <td className="py-1 pr-3 text-right">{formatNumber(l.previously_invoiced)}</td>
                <td className={cn("py-1 pr-3 text-right font-medium", !l.qty_ok && "text-red-700")}>{formatNumber(l.invoiced_qty)} {l.qty_ok ? <Check className="inline h-3 w-3" /> : <X className="inline h-3 w-3" />}</td>
                <td className="py-1 pr-3 text-right">{formatMoney(l.po_price)}</td>
                <td className="py-1 pr-3 text-right">{formatMoney(l.invoice_price)}</td>
                <td className={cn("py-1 text-right font-medium", !l.price_ok && "text-red-700")}>{l.price_diff_pct}% {l.price_ok ? <Check className="inline h-3 w-3" /> : <X className="inline h-3 w-3" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function MdcPayload({ doc }: { doc: DocumentRow }) {
  if (doc.doc_type !== "MDC" || !doc.data?.payload) return null
  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="font-medium">{doc.data.op === "CREATE" ? "Tạo mới" : "Cập nhật"} {doc.data.entity === "PARTNER" ? "đối tác" : "sản phẩm"}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {Object.entries(doc.data.payload).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>
        ))}
      </dl>
    </div>
  )
}

export function BudgetUsage({ detail }: { detail: DocumentDetail }) {
  const b = detail.budget
  if (!b) return null
  const remaining = Number(b.planned) - Number(b.committed) - Number(b.actual)
  const pct = Number(b.planned) ? Math.round(((Number(b.committed) + Number(b.actual)) / Number(b.planned)) * 1000) / 10 : 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Kế hoạch", b.planned], ["Cam kết (PO đã duyệt)", b.committed], ["Thực chi (HĐ đã ghi sổ)", b.actual], ["Còn lại", remaining]].map(([l, v]) => (
          <div key={l as string} className="rounded-md bg-muted/40 p-2">
            <p className="text-[11px] text-muted-foreground">{l}</p>
            <p className="text-sm font-semibold tabular-nums">{formatMoney(v)}</p>
          </div>
        ))}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Đã sử dụng {pct}%</p>
      {b.usage.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="border-b"><Th>Chứng từ</Th><Th>Loại</Th><Th right>Số tiền</Th><Th>Thời điểm</Th></tr></thead>
          <tbody>
            {b.usage.map((u, i) => (
              <tr key={i} className="border-b last:border-0">
                <Td><DocLink id={u.document_id} number={u.number} /></Td>
                <Td>{u.usage_type === "COMMITTED" ? "Cam kết" : "Thực chi"}</Td>
                <Td right className={cn(Number(u.amount) < 0 && "text-muted-foreground")}>{formatMoney(u.amount)}</Td>
                <Td>{formatDateTime(u.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function ChainCard({ detail }: { detail: DocumentDetail }) {
  const LINK_LABEL: Record<string, string> = { SOURCE: "", EXCEPTION: "Ngoại lệ", REFERENCE: "Tham chiếu", DEPRECIATION: "Khấu hao" }
  const Row = ({ r, dir }: { r: DocumentDetail["parents"][number]; dir: "up" | "down" }) => (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      {dir === "up" ? <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />}
      <DocLink id={r.id} number={r.number} canView={r.can_view} className="text-xs" />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{r.doc_type_name}{r.link_type && LINK_LABEL[r.link_type] ? ` · ${LINK_LABEL[r.link_type]}` : ""}</span>
      <StatusBadge status={r.status} className="text-[10px]" />
    </li>
  )
  return (
    <div>
      {detail.parents.length === 0 && detail.children.length === 0 && (
        <p className="text-sm text-muted-foreground">Chứng từ gốc — chưa có chứng từ liên kết.</p>
      )}
      {detail.parents.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground">Chứng từ gốc</p>
          <ul className="mb-2 divide-y">{detail.parents.map((r) => <Row key={r.id} r={r} dir="up" />)}</ul>
        </>
      )}
      {detail.children.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground">Chứng từ phát sinh</p>
          <ul className="divide-y">{detail.children.map((r) => <Row key={r.id} r={r} dir="down" />)}</ul>
        </>
      )}
    </div>
  )
}

export function Timeline({ detail }: { detail: DocumentDetail }) {
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {detail.actions.map((a) => (
        <li key={a.id} className="relative">
          <span className={cn("absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background",
            a.sod_role === "APPROVER" ? "bg-emerald-500" : a.sod_role === "EXECUTOR" ? "bg-orange-500" : a.sod_role === "AUDITOR" ? "bg-purple-500" : a.sod_role === "REQUESTER" ? "bg-sky-500" : "bg-slate-400")} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{a.label}</span>
            {a.to_status && a.from_status !== a.to_status && <StatusBadge status={a.to_status} className="text-[10px]" />}
            <SodBadge role={a.sod_role} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="text-foreground">{a.user_name}</span> · {a.position} · {a.department_name} · {formatDateTime(a.created_at)}
          </p>
          {a.comment && <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs">“{a.comment}”</p>}
        </li>
      ))}
    </ol>
  )
}

export function HandoffList({ detail }: { detail: DocumentDetail }) {
  if (!detail.handoffs.length) return <p className="text-sm text-muted-foreground">Chưa phát sinh bàn giao.</p>
  return (
    <ul className="space-y-2">
      {detail.handoffs.map((h) => (
        <li key={h.id} className="rounded-md border p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{h.expected_action}</span>
            <SlaBadge status={h.sla_status} />
            {h.cross_department && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700 ring-1 ring-indigo-200">Liên phòng ban</span>}
          </div>
          <p className="mt-1 text-muted-foreground">
            {h.from_department || "—"} ({h.from_user_name}) → <b className="text-foreground">{h.to_role_name}</b>
            {h.to_user_name ? ` · nhận bởi ${h.to_user_name} (${h.to_department})` : " · đang chờ"}
          </p>
          <p className="text-muted-foreground">
            Giao {formatDateTime(h.initiated_at)} · hạn {formatDateTime(h.sla_due_at)}{h.completed_at ? ` · xong ${formatDateTime(h.completed_at)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function StateMachine({ detail }: { detail: DocumentDetail }) {
  const doc = detail.document
  const visited = new Set(detail.actions.flatMap((a) => [a.from_status, a.to_status]).filter(Boolean) as string[])
  return (
    <div className="space-y-1.5 text-xs">
      {detail.transitions.map((t, i) => (
        <div key={i} className={cn("flex flex-wrap items-center gap-1.5 rounded px-1.5 py-1", t.from === doc.status && !t.system_only && "bg-primary/5")}>
          <span className={cn("rounded px-1.5 py-0.5 ring-1 ring-inset", t.from === doc.status ? "bg-primary text-primary-foreground ring-primary" : visited.has(t.from) ? "bg-muted ring-border" : "ring-border text-muted-foreground")}>{statusLabel(t.from)}</span>
          <span className="text-muted-foreground">→</span>
          <span className={cn("rounded px-1.5 py-0.5 ring-1 ring-inset", visited.has(t.to) ? "bg-muted ring-border" : "ring-border text-muted-foreground")}>{statusLabel(t.to)}</span>
          <span className="text-muted-foreground">{t.label}</span>
          {t.system_only && <span className="text-[10px] text-muted-foreground">(tự động khi chứng từ liên quan xử lý xong)</span>}
          {t.sod_role && <span className="text-[10px] text-muted-foreground">· {SOD_LABELS[t.sod_role]}</span>}
          {t.actor_label && (
            <span className="ml-auto inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              <User className="h-3 w-3" /> {t.actor_label}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function GlTable({ entries }: { entries: NonNullable<DocumentDetail["gl_entries"]> }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">Chứng từ chưa phát sinh bút toán sổ cái.</p>
  const d = entries.reduce((s, e) => s + Number(e.debit), 0)
  const c = entries.reduce((s, e) => s + Number(e.credit), 0)
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b bg-muted/40"><Th>Ngày</Th><Th>TK</Th><Th>Diễn giải</Th><Th>Đối tác</Th><Th right>Nợ</Th><Th right>Có</Th></tr></thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i} className="border-b last:border-0">
            <Td>{formatDate(e.posting_date)}</Td>
            <Td><span className="font-mono">{e.account_code}</span> <span className="text-xs text-muted-foreground">{e.account_name}</span></Td>
            <Td>{e.description}</Td><Td className="text-xs">{e.partner_name}</Td>
            <Td right>{Number(e.debit) ? formatMoney(e.debit) : ""}</Td><Td right>{Number(e.credit) ? formatMoney(e.credit) : ""}</Td>
          </tr>
        ))}
        <tr className="bg-muted/30 font-medium"><Td>Tổng</Td><Td /><Td /><Td /><Td right>{formatMoney(d)}</Td><Td right>{formatMoney(c)}</Td></tr>
      </tbody>
    </table>
  )
}

export function StockTable({ moves }: { moves: NonNullable<DocumentDetail["stock_moves"]> }) {
  if (!moves.length) return <p className="text-sm text-muted-foreground">Chứng từ chưa phát sinh nhập/xuất kho.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b bg-muted/40"><Th>Loại</Th><Th>Sản phẩm</Th><Th>Kho</Th><Th right>SL</Th><Th right>Giá vốn</Th><Th right>Còn lại của lô</Th><Th>Lô nguồn</Th></tr></thead>
      <tbody>
        {moves.map((m) => (
          <tr key={m.id} className="border-b last:border-0">
            <Td>{MOVE_LABELS[m.move_type] || m.move_type}</Td>
            <Td><span className="font-mono text-xs text-muted-foreground">{m.product_code}</span> {m.product_name}</Td>
            <Td className="text-xs">{m.warehouse_name}</Td>
            <Td right className={cn(Number(m.qty) < 0 ? "text-red-700" : "text-emerald-700")}>{formatNumber(m.qty)} {m.unit}</Td>
            <Td right>{m.unit_cost === undefined ? <Masked label="Ẩn" /> : formatMoney(m.unit_cost)}</Td>
            <Td right>{Number(m.qty) > 0 ? formatNumber(m.remaining_qty) : ""}</Td>
            <Td className="font-mono text-xs">{m.source_document_number || "—"}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function AuditTable({ rows }: { rows: NonNullable<DocumentDetail["audit"]> }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Không có bản ghi audit.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b bg-muted/40"><Th>#</Th><Th>Thời điểm</Th><Th>Người dùng</Th><Th>Bảng</Th><Th>Thao tác</Th><Th>Trước → Sau</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b align-top last:border-0">
            <Td className="font-mono text-xs text-muted-foreground">{r.id}</Td>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
            <Td className="text-xs">{r.user_name}</Td>
            <Td className="text-xs">{r.table_name}</Td>
            <Td><span className={cn("rounded px-1.5 py-0.5 text-[11px]", r.action === "SOD_VIOLATION" ? "bg-red-100 text-red-700" : "bg-muted")}>{r.action}</span></Td>
            <Td className="max-w-[420px] text-xs">
              {r.action === "UPDATE" ? (
                <div className="space-y-0.5">
                  {(r.changed_fields || []).map((f) => (
                    <div key={f} className="break-all">
                      <span className="font-mono text-muted-foreground">{f}:</span>{" "}
                      <span className="text-red-700 line-through">{short(r.old_value?.[f])}</span> →{" "}
                      <span className="text-emerald-700">{short(r.new_value?.[f])}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="break-all text-muted-foreground">{short(r.new_value || r.old_value, 160)}</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function short(v: unknown, n = 80) {
  if (v === null || v === undefined) return "∅"
  const s = typeof v === "string" ? v : JSON.stringify(v)
  return s.length > n ? s.slice(0, n) + "…" : s
}

export function SodChecks({ rows }: { rows: NonNullable<DocumentDetail["sod_checks"]> }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Chưa có lần kiểm tra SoD nào trên chứng từ này.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b bg-muted/40"><Th>Thời điểm</Th><Th>Người dùng</Th><Th>Thao tác</Th><Th>Vai trò thử</Th><Th>Kết quả</Th><Th>Chi tiết</Th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={cn("border-b align-top last:border-0", r.result === "BLOCKED" && "bg-red-50/60")}>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(r.checked_at)}</Td>
            <Td className="text-xs">{r.user_name}</Td>
            <Td className="font-mono text-xs">{r.action}</Td>
            <Td><SodBadge role={r.attempted_role} /></Td>
            <Td><span className={cn("text-xs font-medium", r.result === "BLOCKED" ? "text-red-700" : "text-emerald-700")}>{r.result === "BLOCKED" ? "Bị chặn" : "Đạt"}</span></Td>
            <Td className="text-xs text-muted-foreground">{r.detail}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
