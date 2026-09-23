"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, FileWarning, RefreshCw } from "lucide-react"
import { rpc } from "@/lib/api"
import { RESOURCE_LABELS, ACTION_LABELS, SLA_LABELS, statusLabel, SOD_LABELS } from "@/lib/labels"
import { cn, downloadCsv, formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocLink, ErrorBox, Loading, SlaBadge, SodBadge, Stat, StatusBadge } from "@/components/shared/bits"
import { Chips, DataTable, Muted, NoPermission, Pill } from "./common"

// ------------------------------------------------------------------
// a. Overview — api_control_summary()
// ------------------------------------------------------------------
interface ControlSummary {
  ok: boolean
  sod: { passed: number; blocked: number }
  exceptions: Record<string, number>
  handoffs: { total: number; open: number; breached: number; cross_department: number }
  orphans: { id: string; number: string; doc_type: string }[]
  documents_total: number
  actions_total: number
  audit_total: number
  audit_24h: number
  gl_balanced: boolean
  overlapping_permissions: { user_name: string; resource: string; actions: string[] }[]
}

// ------------------------------------------------------------------
// Missing-attachments warning — api_missing_attachments()
// ------------------------------------------------------------------
interface MissingRow {
  id: string
  number: string
  doc_type: string
  doc_type_name: string
  status: string
}

function MissingAttachmentsCard() {
  const [total, setTotal] = useState<number | null>(null)
  const [rows, setRows] = useState<MissingRow[]>([])

  useEffect(() => {
    rpc<{ total: number; rows: MissingRow[] }>("api_missing_attachments", { p_limit: 20 }).then((res) => {
      if (res.ok) {
        setTotal(res.total)
        setRows(res.rows || [])
      }
    })
  }, [])

  if (total === null || total === 0) return null

  return (
    <Card className="border-amber-400">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-700">
          <FileWarning className="h-4 w-4" />
          Chứng từ thiếu file đính kèm ({total})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Các chứng từ sau đã có hoạt động trong audit trail nhưng chưa có file gốc đính kèm.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-sm dark:border-amber-800 dark:bg-amber-950">
              <DocLink id={r.id} number={r.number} />
              <span className="ml-1.5 text-xs text-muted-foreground">{r.doc_type_name || r.doc_type}</span>
            </li>
          ))}
          {total > rows.length && (
            <li className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
              +{total - rows.length} chứng từ khác…
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

export function OverviewTab() {
  const [data, setData] = useState<ControlSummary | null>(null)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)

  const load = useCallback(async () => {
    const res = await rpc<ControlSummary>("api_control_summary")
    if (!res.ok) {
      setError({ code: res.code, message: res.error || "Không tải được báo cáo kiểm soát" })
      return
    }
    setError(null)
    setData(res)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error?.code === "FORBIDDEN") return <NoPermission>{error.message}</NoPermission>
  if (error) return <ErrorBox message={error.message} />
  if (!data) return <Loading />

  const excTotal = Object.values(data.exceptions || {}).reduce((a, b) => a + Number(b), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-8" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tải lại
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Kiểm tra SoD đạt" value={data.sod.passed} tone="good" />
        <Stat label="Vi phạm SoD bị chặn" value={data.sod.blocked} tone={data.sod.blocked > 0 ? "warn" : "default"} />
        <Stat label="Tổng chứng từ" value={data.documents_total} hint={`${data.actions_total} lượt thao tác`} />
        <Stat label="Bản ghi audit trail" value={data.audit_total} hint={`${data.audit_24h} trong 24 giờ qua`} />
        <Stat label="Bàn giao" value={data.handoffs.total} hint={`${data.handoffs.cross_department} liên phòng ban`} />
        <Stat label="Bàn giao đang mở" value={data.handoffs.open} tone={data.handoffs.open > 0 ? "warn" : "default"} />
        <Stat label="Bàn giao trễ SLA" value={data.handoffs.breached} tone={data.handoffs.breached > 0 ? "bad" : "good"} />
        <Stat
          label="Sổ cái cân đối (Nợ = Có)"
          value={data.gl_balanced ? "Cân đối" : "Lệch"}
          tone={data.gl_balanced ? "good" : "bad"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ngoại lệ theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            {excTotal === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có ngoại lệ nào.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {Object.entries(data.exceptions).map(([s, n]) => (
                  <li key={s} className="flex items-center justify-between px-3 py-2 text-sm">
                    <StatusBadge status={s} />
                    <span className="tabular-nums">{n}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-3 py-2 text-sm font-medium">
                  <span>Tổng</span>
                  <span className="tabular-nums">{excTotal}</span>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Chứng từ mồ côi</CardTitle>
            <p className="text-xs text-muted-foreground">
              Phiếu nhập kho, hóa đơn, phiếu chi/thu, phiếu xuất giao hàng không liên kết tới chứng từ nguồn.
            </p>
          </CardHeader>
          <CardContent>
            {data.orphans.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold">✓</span>
                Không có chứng từ mồ côi — chuỗi chứng từ đầy đủ.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.orphans.map((o) => (
                  <li key={o.id} className="rounded-md border px-2 py-1 text-sm">
                    <DocLink id={o.id} number={o.number} />
                    <span className="ml-1.5 text-xs text-muted-foreground">{RESOURCE_LABELS[o.doc_type] || o.doc_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quyền chồng lấn theo vai trò</CardTitle>
          <p className="text-xs text-muted-foreground">
            Người dùng có vai trò cấp từ 2 quyền trở lên trong nhóm Tạo / Duyệt / Thực hiện trên cùng một loại chứng từ.
          </p>
        </CardHeader>
        <CardContent>
          <DataTable
            rows={data.overlapping_permissions}
            rowKey={(r, i) => `${r.user_name}-${r.resource}-${i}`}
            empty="Không có quyền chồng lấn"
            columns={[
              { key: "user", label: "Người dùng", render: (r) => r.user_name },
              { key: "resource", label: "Tài nguyên", render: (r) => <>{RESOURCE_LABELS[r.resource] || r.resource} <span className="font-mono text-xs text-muted-foreground">{r.resource}</span></> },
              {
                key: "actions", label: "Quyền chồng lấn",
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    {r.actions.map((a) => <Pill key={a} tone="amber">{ACTION_LABELS[a] || a}</Pill>)}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <MissingAttachmentsCard />
    </div>
  )
}

// ------------------------------------------------------------------
// c. SoD log — api_sod_log(p_result, p_limit)
// ------------------------------------------------------------------
interface SodLogRow {
  id: string
  document_id: string
  doc_type: string | null
  document_number: string | null
  action: string | null
  user_id: string
  user_name: string | null
  position: string | null
  attempted_role: string | null
  conflicting_role: string | null
  conflicting_document_id: string | null
  conflicting_document_number: string | null
  result: "PASSED" | "BLOCKED" | "OVERRIDE_APPROVED"
  detail: string | null
  checked_at: string
}

const RESULT_LABELS: Record<string, { label: string; tone: "green" | "red" | "amber" }> = {
  PASSED: { label: "Đạt", tone: "green" },
  BLOCKED: { label: "Bị chặn", tone: "red" },
  OVERRIDE_APPROVED: { label: "Ngoại lệ được duyệt", tone: "amber" },
}

export function SodLogTab() {
  const [result, setResult] = useState<string | null>(null)
  const [rows, setRows] = useState<SodLogRow[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [scope, setScope] = useState<"ALL" | "MINE">("ALL")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await rpc<{ rows: SodLogRow[]; summary: Record<string, number> | null; scope: "ALL" | "MINE" }>("api_sod_log", {
      p_result: result, p_limit: 500,
    })
    setLoading(false)
    if (!res.ok) {
      setError({ code: res.code, message: res.error || "Không tải được nhật ký SoD" })
      return
    }
    setError(null)
    setRows(res.rows)
    setSummary(res.summary || {})
    setScope(res.scope)
  }, [result])

  useEffect(() => {
    load()
  }, [load])

  if (error?.code === "FORBIDDEN") return <NoPermission>{error.message}</NoPermission>

  const total = Object.values(summary).reduce((a, b) => a + Number(b), 0)

  const exportCsv = () =>
    downloadCsv(
      `nhat-ky-sod-${new Date().toISOString().slice(0, 10)}`,
      ["Thời điểm", "Người dùng", "Chức danh", "Chứng từ", "Thao tác", "Vai trò SoD", "Vai trò xung đột", "Chứng từ xung đột", "Kết quả", "Chi tiết"],
      rows.map((r) => [
        formatDateTime(r.checked_at), r.user_name, r.position, r.document_number, r.action,
        r.attempted_role ? SOD_LABELS[r.attempted_role] || r.attempted_role : "",
        r.conflicting_role ? SOD_LABELS[r.conflicting_role] || r.conflicting_role : "",
        r.conflicting_document_number, RESULT_LABELS[r.result]?.label || r.result, r.detail,
      ])
    )

  return (
    <div className="space-y-3">
      {scope === "MINE" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bạn không có quyền xem nhật ký SoD toàn hệ thống — chỉ hiển thị các lượt kiểm tra của chính bạn.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Chips
          value={result}
          onChange={setResult}
          options={[
            { value: null, label: `Tất cả (${total})` },
            { value: "PASSED", label: `Đạt (${summary.PASSED || 0})` },
            { value: "BLOCKED", label: `Bị chặn (${summary.BLOCKED || 0})` },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>
      {error && <ErrorBox message={error.message} />}
      <DataTable
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        empty="Chưa có lượt kiểm tra SoD nào"
        rowClassName={(r) => (r.result === "BLOCKED" ? "bg-red-50/40" : undefined)}
        columns={[
          { key: "time", label: "Thời điểm", className: "whitespace-nowrap", render: (r) => formatDateTime(r.checked_at) },
          {
            key: "user", label: "Người dùng",
            render: (r) => (
              <div className="min-w-[140px]">
                <p>{r.user_name || <Muted />}</p>
                {r.position && <p className="text-xs text-muted-foreground">{r.position}</p>}
              </div>
            ),
          },
          {
            key: "doc", label: "Chứng từ",
            render: (r) => (r.document_number ? <DocLink id={r.document_id} number={r.document_number} /> : <Muted />),
          },
          { key: "action", label: "Thao tác", render: (r) => <span className="font-mono text-xs">{r.action || "—"}</span> },
          { key: "role", label: "Vai trò SoD", render: (r) => <SodBadge role={r.attempted_role} /> },
          { key: "conflict", label: "Vai trò đã giữ", render: (r) => (r.conflicting_role ? <SodBadge role={r.conflicting_role} /> : <Muted />) },
          {
            key: "cdoc", label: "Chứng từ xung đột",
            render: (r) =>
              r.conflicting_document_id && r.conflicting_document_number ? (
                <DocLink id={r.conflicting_document_id} number={r.conflicting_document_number} />
              ) : (
                <Muted />
              ),
          },
          {
            key: "result", label: "Kết quả",
            render: (r) => <Pill tone={RESULT_LABELS[r.result]?.tone || "gray"}>{RESULT_LABELS[r.result]?.label || r.result}</Pill>,
          },
          { key: "detail", label: "Chi tiết", className: "min-w-[260px] text-xs text-muted-foreground", render: (r) => r.detail || "—" },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------
// d. Handoffs — api_handoffs(p_status, p_limit)
// ------------------------------------------------------------------
interface HandoffRow {
  id: string
  flow_code: string
  document_id: string
  number: string
  doc_type: string
  trigger_status: string
  expected_action: string
  to_role: string
  to_role_name: string
  from_user_name: string | null
  from_department: string | null
  to_user_name: string | null
  to_department: string | null
  status: "INITIATED" | "COMPLETED" | "CANCELLED"
  initiated_at: string
  completed_at: string | null
  sla_due_at: string | null
  sla_status: string
  cross_department: boolean
}

const HANDOFF_STATUS: Record<string, { label: string; tone: "blue" | "green" | "gray" }> = {
  INITIATED: { label: "Đang chờ nhận", tone: "blue" },
  COMPLETED: { label: "Đã hoàn tất", tone: "green" },
  CANCELLED: { label: "Đã hủy", tone: "gray" },
}

export function HandoffsTab() {
  const [status, setStatus] = useState<string | null>(null)
  const [sla, setSla] = useState<string | null>(null)
  const [rows, setRows] = useState<HandoffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await rpc<{ rows: HandoffRow[] }>("api_handoffs", { p_status: status, p_limit: 500 })
    setLoading(false)
    if (!res.ok) {
      setError({ code: res.code, message: res.error || "Không tải được sổ bàn giao" })
      return
    }
    setError(null)
    setRows(res.rows)
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const slaCounts = useMemo(() => {
    const c: Record<string, number> = {}
    rows.forEach((r) => (c[r.sla_status] = (c[r.sla_status] || 0) + 1))
    return c
  }, [rows])

  const visible = sla ? rows.filter((r) => r.sla_status === sla) : rows

  if (error?.code === "FORBIDDEN") return <NoPermission>{error.message}</NoPermission>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Trạng thái:</span>
          <Chips
            value={status}
            onChange={(v) => { setStatus(v); setSla(null) }}
            options={[
              { value: null, label: "Tất cả" },
              { value: "INITIATED", label: "Đang chờ nhận" },
              { value: "COMPLETED", label: "Đã hoàn tất" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">SLA:</span>
          <Chips
            value={sla}
            onChange={setSla}
            options={[
              { value: null, label: `Tất cả (${rows.length})` },
              ...["ON_TIME", "AT_RISK", "BREACHED"].map((s) => ({ value: s, label: `${SLA_LABELS[s].label} (${slaCounts[s] || 0})` })),
            ]}
          />
        </div>
        <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={load} title="Tải lại">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
      {error && <ErrorBox message={error.message} />}
      <DataTable
        rows={visible}
        loading={loading}
        rowKey={(r) => r.id}
        empty="Không có bàn giao nào trong phạm vi của bạn"
        columns={[
          { key: "flow", label: "Luồng", render: (r) => <span className="font-mono text-xs">{r.flow_code}</span> },
          {
            key: "doc", label: "Chứng từ",
            render: (r) => (
              <div className="whitespace-nowrap">
                <DocLink id={r.document_id} number={r.number} />
                <p className="text-xs text-muted-foreground">{statusLabel(r.trigger_status)}</p>
              </div>
            ),
          },
          { key: "expected", label: "Việc cần làm", className: "min-w-[180px]", render: (r) => r.expected_action },
          {
            key: "from", label: "Từ",
            render: (r) => (
              <div className="min-w-[130px]">
                <p>{r.from_user_name || <Muted />}</p>
                <p className="text-xs text-muted-foreground">{r.from_department || ""}</p>
              </div>
            ),
          },
          {
            key: "to", label: "Đến",
            render: (r) => (
              <div className="min-w-[150px]">
                <p className="font-medium">{r.to_role_name}</p>
                <p className="text-xs text-muted-foreground">
                  {[r.to_user_name, r.to_department].filter(Boolean).join(" · ") || "Chưa có người nhận cụ thể"}
                </p>
              </div>
            ),
          },
          {
            key: "cross", label: "Liên phòng ban",
            render: (r) => (r.cross_department ? <Pill tone="violet">Liên phòng ban</Pill> : <Muted>Nội bộ</Muted>),
          },
          {
            key: "status", label: "Trạng thái",
            render: (r) => <Pill tone={HANDOFF_STATUS[r.status]?.tone || "gray"}>{HANDOFF_STATUS[r.status]?.label || r.status}</Pill>,
          },
          { key: "sla", label: "SLA", render: (r) => <SlaBadge status={r.sla_status} /> },
          { key: "initiated", label: "Khởi tạo", className: "whitespace-nowrap text-xs", render: (r) => formatDateTime(r.initiated_at) },
          { key: "due", label: "Hạn", className: "whitespace-nowrap text-xs", render: (r) => formatDateTime(r.sla_due_at) },
          { key: "completed", label: "Hoàn tất", className: "whitespace-nowrap text-xs", render: (r) => formatDateTime(r.completed_at) },
        ]}
      />
    </div>
  )
}
