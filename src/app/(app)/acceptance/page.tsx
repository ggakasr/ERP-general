"use client"

import { useMemo, useState } from "react"
import { Pencil, RefreshCw, ShieldAlert } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { cn, formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Field, Select, Textarea } from "@/components/ui/form"
import { useToast } from "@/components/ui/toast"
import { ErrorBox, Loading, PageHeader, Stat } from "@/components/shared/bits"
import { Chips, DataTable, Muted, Pill, useReferenceTable } from "@/components/controls/common"

interface AcceptanceRow {
  test_code: string
  test_group: string
  title: string
  related_flow: string | null
  is_blocker: boolean
  status: "NOT_TESTED" | "PASSED" | "FAILED" | "BLOCKED"
  evidence: string | null
  tested_at: string | null
}

const GROUPS: { code: string; label: string; planned: number }[] = [
  { code: "N1_FUNCTIONAL", label: "N1 — Chức năng", planned: 15 },
  { code: "N2_CONTROLS", label: "N2 — Kiểm soát", planned: 12 },
  { code: "N3_TRACEABILITY", label: "N3 — Truy vết", planned: 12 },
  { code: "N4_END_TO_END", label: "N4 — Luồng đầu-cuối", planned: 12 },
  { code: "N5_LOAD_EDGE", label: "N5 — Tải & trường hợp biên", planned: 12 },
]

const STATUS: Record<AcceptanceRow["status"], { label: string; tone: "gray" | "green" | "red" | "amber" }> = {
  NOT_TESTED: { label: "Chưa kiểm thử", tone: "gray" },
  PASSED: { label: "Đạt", tone: "green" },
  FAILED: { label: "Không đạt", tone: "red" },
  BLOCKED: { label: "Bị chặn", tone: "amber" },
}
const STATUS_KEYS = Object.keys(STATUS) as AcceptanceRow["status"][]

function codeSort(a: string, b: string) {
  const pa = a.replace(/^T/, "").split(".").map(Number)
  const pb = b.replace(/^T/, "").split(".").map(Number)
  return pa[0] - pb[0] || pa[1] - pb[1]
}

export default function AcceptancePage() {
  const { scopeOf } = useSession()
  const toast = useToast()
  const canUpdate = scopeOf("AUDIT_TRAIL", "VIEW") === "COMPANY"
  const { rows, loading, error, reload } = useReferenceTable<AcceptanceRow>("acceptance_criteria")
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<AcceptanceRow | null>(null)
  const [form, setForm] = useState<{ status: AcceptanceRow["status"]; evidence: string }>({ status: "NOT_TESTED", evidence: "" })
  const [saving, setSaving] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1))
    return c
  }, [rows])

  const blockers = rows.filter((r) => r.is_blocker)
  const blockersPassed = blockers.filter((r) => r.status === "PASSED").length

  const openEdit = (r: AcceptanceRow) => {
    setEditing(r)
    setForm({ status: r.status, evidence: r.evidence || "" })
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    const res = await rpc("api_update_acceptance", { p_code: editing.test_code, p_status: form.status, p_evidence: form.evidence.trim() || null })
    setSaving(false)
    if (!res.ok) {
      toast("error", "Không cập nhật được kết quả nghiệm thu", res.error)
      return
    }
    toast("success", `Đã cập nhật ${editing.test_code}`, STATUS[form.status].label)
    setEditing(null)
    reload()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Nghiệm thu (BM-14)"
        subtitle="Tiêu chí nghiệm thu theo 5 nhóm kiểm thử — điều kiện bắt buộc trước go-live."
        actions={
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={reload} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        }
      />

      <div className="space-y-1.5 rounded-lg border bg-card p-4 text-sm">
        <p>
          Kế hoạch nghiệm thu gồm <b>63 bài kiểm thử</b> chia 5 nhóm: chức năng (15), kiểm soát (12), truy vết (12), luồng đầu-cuối (12)
          và tải/biên (12). Mỗi bài gắn với luồng nghiệp vụ (L1–L11) và các điều kiện ĐK1–ĐK8.
        </p>
        <p>
          Bốn bài <b>T3.1–T3.4</b> (tách biệt nhiệm vụ) là <b className="text-red-700">điều kiện chặn tuyệt đối</b>: phải đạt 100% mới được go-live.
        </p>
        <p className="text-muted-foreground">
          Chạy <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run test:acceptance</code> để thực thi bộ kiểm thử API tự động
          trên Supabase; kết quả và bằng chứng được ghi lại tại đây.
          {canUpdate
            ? " Bạn có quyền cập nhật kết quả thủ công."
            : " Chỉ kiểm toán nội bộ/lãnh đạo có phạm vi toàn công ty mới được cập nhật kết quả."}
        </p>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && rows.length === 0 ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Tiêu chí đã khai báo" value={rows.length} hint="Kế hoạch: 63" />
            <Stat label="Đạt" value={counts.PASSED || 0} tone="good" />
            <Stat label="Không đạt" value={counts.FAILED || 0} tone={counts.FAILED ? "bad" : "default"} />
            <Stat label="Chưa kiểm thử / bị chặn" value={(counts.NOT_TESTED || 0) + (counts.BLOCKED || 0)} tone="warn" />
            <Stat
              label="Điều kiện chặn go-live"
              value={`${blockersPassed}/${blockers.length}`}
              tone={blockers.length > 0 && blockersPassed === blockers.length ? "good" : "bad"}
              hint="T3.1–T3.4 phải đạt"
            />
          </div>

          <Chips
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: null, label: `Tất cả (${rows.length})` },
              ...STATUS_KEYS.map((s) => ({ value: s, label: `${STATUS[s].label} (${counts[s] || 0})` })),
            ]}
          />

          {GROUPS.map((g) => {
            const all = rows.filter((r) => r.test_group === g.code)
            const groupRows = all.filter((r) => !statusFilter || r.status === statusFilter).sort((a, b) => codeSort(a.test_code, b.test_code))
            const gc: Record<string, number> = {}
            all.forEach((r) => (gc[r.status] = (gc[r.status] || 0) + 1))
            return (
              <section key={g.code} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{g.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {all.length}/{g.planned} tiêu chí
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {STATUS_KEYS.filter((s) => gc[s]).map((s) => (
                      <Pill key={s} tone={STATUS[s].tone}>{STATUS[s].label}: {gc[s]}</Pill>
                    ))}
                  </div>
                </div>
                <DataTable
                  rows={groupRows}
                  rowKey={(r) => r.test_code}
                  empty={all.length === 0 ? "Chưa khai báo tiêu chí cho nhóm này" : "Không có tiêu chí phù hợp bộ lọc"}
                  rowClassName={(r) => (r.is_blocker ? "bg-red-50/40" : undefined)}
                  columns={[
                    { key: "code", label: "Mã", className: "whitespace-nowrap", render: (r) => <span className="font-mono font-medium">{r.test_code}</span> },
                    { key: "title", label: "Tiêu chí", className: "min-w-[240px]", render: (r) => r.title },
                    { key: "flow", label: "Luồng", render: (r) => (r.related_flow ? <span className="font-mono text-xs">{r.related_flow}</span> : <Muted />) },
                    {
                      key: "blocker", label: "Chặn go-live",
                      render: (r) =>
                        r.is_blocker ? (
                          <Pill tone="red" className="gap-1"><ShieldAlert className="h-3 w-3" /> Bắt buộc</Pill>
                        ) : (
                          <Muted />
                        ),
                    },
                    { key: "status", label: "Kết quả", render: (r) => <Pill tone={STATUS[r.status]?.tone || "gray"}>{STATUS[r.status]?.label || r.status}</Pill> },
                    {
                      key: "evidence", label: "Bằng chứng",
                      className: "min-w-[200px] max-w-[360px] break-words text-xs text-muted-foreground",
                      render: (r) => r.evidence || "—",
                    },
                    { key: "tested", label: "Thời điểm kiểm thử", className: "whitespace-nowrap text-xs", render: (r) => formatDateTime(r.tested_at) },
                    ...(canUpdate
                      ? [{
                          key: "edit", label: "",
                          render: (r: AcceptanceRow) => (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} title="Cập nhật kết quả">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ),
                        }]
                      : []),
                  ]}
                />
              </section>
            )
          })}
        </>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Cập nhật ${editing.test_code}` : ""}
        description={editing?.title}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Hủy</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu kết quả"}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {editing?.is_blocker && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
              Đây là điều kiện chặn go-live (SoD). Chỉ đánh dấu “Đạt” khi có bằng chứng kiểm thử rõ ràng.
            </p>
          )}
          <Field label="Kết quả" required>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AcceptanceRow["status"] })}>
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </Select>
          </Field>
          <Field label="Bằng chứng" hint="Ví dụ: số chứng từ, mã lỗi trả về, đường dẫn log/ảnh chụp màn hình.">
            <Textarea rows={4} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
