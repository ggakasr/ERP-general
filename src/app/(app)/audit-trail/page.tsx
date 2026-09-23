"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, Lock, RefreshCw, Search } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { FIELD_LABELS } from "@/lib/labels"
import { cn, downloadCsv, formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input, Select } from "@/components/ui/form"
import { DocLink, ErrorBox, PageHeader } from "@/components/shared/bits"
import { Chips, DataTable, Muted, NoPermission, Pill } from "@/components/controls/common"

const PAGE = 50

interface AuditRow {
  id: number
  table_name: string
  record_id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  changed_fields: string[] | null
  user_id: string | null
  user_name: string | null
  created_at: string
  document_id: string | null
  document_number: string | null
}

interface AuditResponse {
  total: number
  action_counts: Record<string, number> | null
  table_counts: Record<string, number> | null
  rows: AuditRow[]
}

const ACTIONS: { code: string; label: string; tone: "green" | "blue" | "red" | "amber" }[] = [
  { code: "INSERT", label: "Thêm mới", tone: "green" },
  { code: "UPDATE", label: "Cập nhật", tone: "blue" },
  { code: "DELETE", label: "Xóa", tone: "amber" },
  { code: "SOD_VIOLATION", label: "Vi phạm SoD", tone: "red" },
]
const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.code, a]))

function short(v: unknown): string {
  if (v === null || v === undefined) return "∅"
  const s = typeof v === "string" ? v : JSON.stringify(v)
  return s.length > 80 ? s.slice(0, 77) + "…" : s
}

function AuditDiff({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false)

  if (row.action === "UPDATE" && row.changed_fields?.length) {
    return (
      <ul className="min-w-[280px] space-y-0.5 text-xs">
        {row.changed_fields.map((f) => (
          <li key={f} className="break-words">
            <span className="font-medium" title={f}>{FIELD_LABELS[f] || f}</span>
            <span className="text-muted-foreground">: </span>
            <span className="rounded bg-destructive/10 px-1 font-mono text-destructive line-through decoration-destructive/50">{short(row.old_value?.[f])}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="rounded bg-success-subtle px-1 font-mono text-success">{short(row.new_value?.[f])}</span>
          </li>
        ))}
      </ul>
    )
  }

  if (row.action === "SOD_VIOLATION") {
    const nv = row.new_value || {}
    const ov = row.old_value || {}
    return (
      <p className="min-w-[280px] text-xs text-destructive">
        Cố thực hiện <b>{String(nv.action ?? "—")}</b> với vai trò <b>{String(nv.attempted_role ?? "—")}</b>, trong khi đã là{" "}
        <b>{String(ov.existing_role ?? "—")}</b> trên {String(ov.document_number ?? "chứng từ liên quan")}
        {ov.rule ? ` (${String(ov.rule)})` : ""}.
      </p>
    )
  }

  const payload = row.action === "DELETE" ? row.old_value : row.new_value
  if (!payload) return <Muted />
  const json = JSON.stringify(payload, null, 2)
  const preview = JSON.stringify(payload)
  return (
    <div className="min-w-[280px] max-w-[520px]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left font-mono text-[11px] text-muted-foreground hover:text-foreground"
        title={open ? "Thu gọn" : "Bấm để xem đầy đủ"}
      >
        {open ? "▾ Thu gọn" : `▸ ${preview.length > 110 ? preview.slice(0, 107) + "…" : preview}`}
      </button>
      {open && (
        <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">{json}</pre>
      )}
    </div>
  )
}

export default function AuditTrailPage() {
  const { can } = useSession()
  const allowed = can("AUDIT_TRAIL", "VIEW")

  const [action, setAction] = useState<string | null>(null)
  const [table, setTable] = useState("")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<AuditResponse>("api_audit_trail", {
      p_table: table || null, p_action: action, p_search: query || null, p_limit: PAGE, p_offset: page * PAGE,
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error || "Không tải được audit trail")
      return
    }
    setError(null)
    setData(res)
  }, [allowed, table, action, query, page])

  useEffect(() => {
    load()
  }, [load])

  if (!allowed) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader title="Audit trail" />
        <NoPermission>Chỉ người có quyền xem Audit trail (kiểm toán nội bộ, lãnh đạo) mới truy cập được nhật ký thay đổi.</NoPermission>
      </div>
    )
  }

  const rows = data?.rows || []
  const total = data?.total || 0
  const actionCounts = data?.action_counts || {}
  const tableCounts = data?.table_counts || {}
  const allCount = Object.values(actionCounts).reduce((a, b) => a + Number(b), 0)

  const exportCsv = () =>
    downloadCsv(
      `audit-trail-trang-${page + 1}-${new Date().toISOString().slice(0, 10)}`,
      ["ID", "Thời điểm", "Người thực hiện", "Bảng", "Bản ghi", "Chứng từ", "Hành động", "Trường thay đổi", "Giá trị cũ", "Giá trị mới"],
      rows.map((r) => [
        r.id, formatDateTime(r.created_at), r.user_name, r.table_name, r.record_id, r.document_number, r.action,
        (r.changed_fields || []).join("; "),
        r.old_value ? JSON.stringify(r.old_value) : "", r.new_value ? JSON.stringify(r.new_value) : "",
      ])
    )

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Audit trail"
        actions={
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Tải lại">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={rows.length === 0} title="Xuất trang hiện tại ra CSV">
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Nhật ký này không thể sửa hoặc xóa.</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(0)
            setQuery(search.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Người dùng, mã bản ghi, nội dung…" className="w-72 pl-8" />
        </form>
        <Select
          value={table}
          onChange={(e) => { setTable(e.target.value); setPage(0) }}
          className="w-56"
          aria-label="Lọc theo bảng"
        >
          <option value="">Tất cả bảng</option>
          {Object.entries(tableCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([t, n]) => (
              <option key={t} value={t}>{t} ({n})</option>
            ))}
        </Select>
        <Chips
          value={action}
          onChange={(v) => { setAction(v); setPage(0) }}
          options={[
            { value: null, label: `Tất cả (${allCount})` },
            ...ACTIONS.map((a) => ({ value: a.code, label: `${a.label} (${actionCounts[a.code] || 0})` })),
          ]}
        />
      </div>

      {error && <ErrorBox message={error} />}

      <DataTable
        rows={rows}
        loading={loading}
        rowKey={(r) => r.id}
        empty="Không có bản ghi phù hợp"
        rowClassName={(r) => (r.action === "SOD_VIOLATION" ? "bg-destructive/5" : undefined)}
        columns={[
          { key: "id", label: "#", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span> },
          { key: "time", label: "Thời điểm", className: "whitespace-nowrap", render: (r) => formatDateTime(r.created_at) },
          { key: "user", label: "Người thực hiện", className: "whitespace-nowrap", render: (r) => r.user_name || <Muted>SYSTEM</Muted> },
          { key: "table", label: "Bảng", render: (r) => <span className="font-mono text-xs">{r.table_name}</span> },
          {
            key: "record", label: "Bản ghi",
            render: (r) =>
              r.document_id && r.document_number ? (
                <DocLink id={r.document_id} number={r.document_number} />
              ) : (
                <span className="block max-w-[160px] truncate font-mono text-xs text-muted-foreground" title={r.record_id}>{r.record_id}</span>
              ),
          },
          {
            key: "action", label: "Hành động",
            render: (r) => <Pill tone={ACTION_MAP[r.action]?.tone || "gray"}>{ACTION_MAP[r.action]?.label || r.action}</Pill>,
          },
          { key: "diff", label: "Thay đổi", render: (r) => <AuditDiff row={r} /> },
        ]}
      />

      {total > 0 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total}</span>
          <Button variant="outline" size="sm" className="h-7" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>Trước</Button>
          <Button variant="outline" size="sm" className="h-7" disabled={(page + 1) * PAGE >= total || loading} onClick={() => setPage(page + 1)}>Sau</Button>
        </div>
      )}
    </div>
  )
}
