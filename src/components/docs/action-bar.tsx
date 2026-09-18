"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowRight, FilePlus2, ShieldAlert } from "lucide-react"
import { rpc } from "@/lib/api"
import { DOC_TYPES } from "@/lib/doc-config"
import { SOD_LABELS, statusLabel } from "@/lib/labels"
import { useSession } from "@/lib/session"
import type { AvailableAction, DocumentRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Field, Input, Select, Textarea } from "@/components/ui/form"
import { useToast } from "@/components/ui/toast"
import { SodBadge, StatusBadge } from "@/components/shared/bits"

const COMMENT_REQUIRED = new Set(["reject", "cancel", "qc_fail", "reverse", "return", "reopen", "lose"])

const CONDITION_LABELS: Record<string, string> = {
  has_lines: "Có dòng chi tiết",
  budget_available: "Còn ngân sách",
  stock_available: "Đủ tồn kho khả dụng",
  balanced: "Nợ = Có",
  period_open: "Kỳ kế toán đang mở",
  period_open_jv: "Kỳ của ngày hạch toán chưa khóa cứng",
  exception_approved: "Ngoại lệ đã được duyệt",
  resolution_provided: "Có nội dung xử lý",
  amount_positive: "Số tiền > 0",
  all_matched: "Đã khớp toàn bộ sao kê",
}

export function ActionBar({ doc, actions, onDone }: { doc: DocumentRow; actions: AvailableAction[]; onDone: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const { master } = useSession()
  const [active, setActive] = useState<AvailableAction | null>(null)
  const [comment, setComment] = useState("")
  const [payload, setPayload] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)

  if (!actions.length) return null

  const open = (a: AvailableAction) => {
    if (a.kind === "create") {
      router.push(`/documents/new?type=${a.child_type}&parent=${doc.id}`)
      return
    }
    setActive(a)
    setComment("")
    const init: Record<string, any> = {}
    if (a.action === "qc_pass") init.completed_qty = doc.data?.planned_qty
    if (a.action === "close" && doc.doc_type === "TICKET") init.csat = 5
    setPayload(init)
  }

  const submit = async () => {
    if (!active?.action) return
    if (COMMENT_REQUIRED.has(active.action) && !comment.trim()) {
      toast("error", "Vui lòng nhập lý do")
      return
    }
    setBusy(true)
    const res = await rpc<{ ok: boolean; status?: string; message?: string; code?: string; error?: string }>("api_transition", {
      p_doc_id: doc.id,
      p_action: active.action,
      p_comment: comment || null,
      p_expected_version: doc.version,
      p_payload: payload,
    })
    setBusy(false)
    setActive(null)
    if (res.ok) {
      toast("success", `${doc.number}: ${active.label}`, res.message || `Trạng thái mới: ${statusLabel(res.status || "")}`)
    } else if (res.code === "SOD_VIOLATION") {
      toast("sod", "Bị chặn bởi kiểm soát tách biệt nhiệm vụ (SoD)", `${res.error} — Lần thử này đã được ghi vào nhật ký SoD.`)
    } else {
      toast("error", "Không thực hiện được", res.error)
    }
    onDone()
  }

  const agents = master.users.filter((u) => u.roles.includes("CS_AGENT") && u.status === "ACTIVE")

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Bạn có thể:</span>
        {actions.map((a, i) => (
          <Button
            key={i}
            size="sm"
            variant={a.style === "danger" ? "outline" : a.style === "default" ? "outline" : "default"}
            className={cn(
              "h-8",
              a.style === "success" && "bg-emerald-600 hover:bg-emerald-700",
              a.style === "danger" && "border-red-200 text-red-700 hover:bg-red-50",
              a.sod_conflict && "ring-2 ring-orange-300"
            )}
            onClick={() => open(a)}
            title={
              a.sod_conflict
                ? `Cảnh báo SoD: bạn đã là ${SOD_LABELS[a.sod_conflict.existing_role]} trên ${a.sod_conflict.document_number}`
                : a.next_owner_label
                ? `Sau khi xác nhận, việc chuyển cho: ${a.next_owner_label}`
                : undefined
            }
          >
            {a.kind === "create" && <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />}
            {a.sod_conflict && <ShieldAlert className="mr-1.5 h-3.5 w-3.5 text-orange-300" />}
            {a.label}
          </Button>
        ))}
      </div>

      <Dialog
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.label || ""}
        description={`${DOC_TYPES[doc.doc_type]?.label || doc.doc_type} ${doc.number}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setActive(null)}>Hủy</Button>
            <Button size="sm" onClick={submit} disabled={busy} className={cn(active?.style === "danger" && "bg-red-600 hover:bg-red-700")}>
              {busy ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </>
        }
      >
        {active && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={doc.status} />
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <StatusBadge status={active.to_status || ""} />
              {active.sod_role && (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  Vai trò SoD của bạn: <SodBadge role={active.sod_role} />
                </span>
              )}
            </div>

            {active.sod_conflict && (
              <div className="flex gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-orange-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Thao tác này vi phạm SoD và sẽ bị chặn</p>
                  <p className="mt-0.5 text-xs">
                    Bạn đã là <b>{SOD_LABELS[active.sod_conflict.existing_role]}</b> trên {active.sod_conflict.document_number} ({active.sod_conflict.rule}).
                    Nếu tiếp tục, hệ thống sẽ từ chối và ghi lần thử vào nhật ký SoD.
                  </p>
                </div>
              </div>
            )}

            {active.next_owner_label && (
              <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-inset ring-sky-200">
                Sau khi xác nhận, việc sẽ chuyển cho: <b>{active.next_owner_label}</b>
              </p>
            )}

            {!!active.conditions?.length && (
              <div className="rounded-md bg-muted/50 p-3 text-xs">
                <p className="font-medium text-foreground">Điều kiện hệ thống kiểm tra:</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {active.conditions.map((c) => <li key={c}>{CONDITION_LABELS[c] || c}</li>)}
                </ul>
              </div>
            )}

            {doc.doc_type === "SO" && active.action === "confirm" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!payload.allow_backorder} onChange={(e) => setPayload({ ...payload, allow_backorder: e.target.checked })} />
                Cho phép backorder nếu thiếu hàng (sẽ lập lệnh sản xuất / mua bổ sung)
              </label>
            )}
            {active.action === "qc_pass" && (
              <Field label="Số lượng thành phẩm đạt" required>
                <Input type="number" min={0} value={payload.completed_qty ?? ""} onChange={(e) => setPayload({ ...payload, completed_qty: e.target.value })} />
              </Field>
            )}
            {doc.doc_type === "TICKET" && (active.action === "assign" || active.action === "reassign") && (
              <Field label="Giao cho nhân viên CSKH" required>
                <Select value={payload.owner_id || ""} onChange={(e) => setPayload({ ...payload, owner_id: e.target.value })}>
                  <option value="">— Chọn —</option>
                  {agents.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.employee_code})</option>)}
                </Select>
              </Field>
            )}
            {active.action === "resolve" && (
              <Field label="Nội dung xử lý" required>
                <Textarea value={payload.resolution || ""} onChange={(e) => setPayload({ ...payload, resolution: e.target.value })} />
              </Field>
            )}
            {doc.doc_type === "EXC" && active.action === "resolve" && (
              <>
                <Field label="Nguyên nhân gốc">
                  <Textarea value={payload.root_cause || ""} onChange={(e) => setPayload({ ...payload, root_cause: e.target.value })} />
                </Field>
                <Field label="Hành động phòng ngừa">
                  <Textarea value={payload.preventive_action || ""} onChange={(e) => setPayload({ ...payload, preventive_action: e.target.value })} />
                </Field>
              </>
            )}
            {doc.doc_type === "TICKET" && active.action === "close" && (
              <Field label="Điểm hài lòng của khách (1–5)">
                <Select value={payload.csat ?? 5} onChange={(e) => setPayload({ ...payload, csat: Number(e.target.value) })}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </Field>
            )}
            {doc.doc_type === "BANKREC" && active.action === "reconcile" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!payload.accept_unmatched} onChange={(e) => setPayload({ ...payload, accept_unmatched: e.target.checked })} />
                Chấp nhận các dòng chưa khớp (phí ngân hàng…) và xử lý bằng bút toán riêng
              </label>
            )}

            <Field label={COMMENT_REQUIRED.has(active.action || "") ? "Lý do (bắt buộc)" : "Ghi chú (tùy chọn)"}>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ghi chú…" />
            </Field>

            {active.style === "danger" && (
              <p className="flex items-center gap-1.5 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Thao tác không thể hoàn tác.</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
