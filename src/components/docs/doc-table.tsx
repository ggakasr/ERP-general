"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, Plus, RefreshCw, Search } from "lucide-react"
import { rpc } from "@/lib/api"
import { DOC_TYPES, type ListColumn } from "@/lib/doc-config"
import { useSession } from "@/lib/session"
import { SCOPE_LABELS, statusLabel, PRIORITY_LABELS, EXC_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/labels"
import type { DocumentRow } from "@/lib/types"
import { cn, downloadCsv, formatDate, formatMoney, formatNumber, getPath } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/form"
import { Tabs } from "@/components/ui/tabs"
import { EmptyState, ErrorBox, Masked, StatusBadge } from "@/components/shared/bits"

const PAGE = 25

const ENUM_LABELS: Record<string, Record<string, string>> = {
  "data.priority": PRIORITY_LABELS,
  "data.exception_type": EXC_TYPE_LABELS,
  "data.severity": SEVERITY_LABELS,
}

export function renderCell(row: DocumentRow, col: ListColumn) {
  const masked = row._masked?.includes(col.key.replace(/^data\./, ""))
  if (masked) return <Masked />
  const v = getPath(row, col.key)
  if (col.kind === "status") return <StatusBadge status={v} />
  if (col.key === "number") return <span className="font-mono text-primary">{v}</span>
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>
  if (col.kind === "money") return <span className="tabular-nums">{formatMoney(v)}</span>
  if (col.kind === "number") return <span className="tabular-nums">{formatNumber(v)}</span>
  if (col.kind === "date") return formatDate(v)
  if (ENUM_LABELS[col.key]) return ENUM_LABELS[col.key][v] || v
  return String(v)
}

export function DocTable({
  docTypes, title, defaultType, compact, hideCreate,
}: { docTypes: string[]; title?: string; defaultType?: string; compact?: boolean; hideCreate?: boolean }) {
  const router = useRouter()
  const { scopeOf, can } = useSession()
  const visibleTypes = docTypes.filter((t) => can(t, "VIEW"))
  const [type, setType] = useState(defaultType && visibleTypes.includes(defaultType) ? defaultType : visibleTypes[0])
  const [status, setStatus] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<DocumentRow[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cfg = type ? DOC_TYPES[type] : undefined

  const load = useCallback(async () => {
    if (!type) return
    setLoading(true)
    const res = await rpc<{ ok: boolean; rows: DocumentRow[]; total: number; status_counts: Record<string, number> }>(
      "api_list_documents",
      { p_doc_types: [type], p_status: status, p_search: query || null, p_limit: PAGE, p_offset: page * PAGE }
    )
    setLoading(false)
    if (!res.ok) {
      setError((res as any).error)
      return
    }
    setError(null)
    setRows(res.rows)
    setTotal(res.total)
    setCounts(res.status_counts)
  }, [type, status, query, page])

  useEffect(() => {
    load()
  }, [load])

  if (!type || !cfg) {
    return <EmptyState>Bạn không có quyền xem các chứng từ trong phân hệ này.</EmptyState>
  }

  const scope = scopeOf(type, "VIEW")
  const canCreate = !hideCreate && can(type, "CREATE") && !cfg.requiresParent

  const exportCsv = async () => {
    const res = await rpc<{ ok: boolean; rows: DocumentRow[] }>("api_list_documents", {
      p_doc_types: [type], p_status: status, p_search: query || null, p_limit: 5000, p_offset: 0,
    })
    if (!res.ok) return
    downloadCsv(
      `${type}-${new Date().toISOString().slice(0, 10)}`,
      cfg.columns.map((c) => c.label),
      res.rows.map((r) =>
        cfg.columns.map((c) => {
          if (r._masked?.includes(c.key.replace(/^data\./, ""))) return "(ẩn)"
          const v = getPath(r, c.key)
          if (c.kind === "status") return statusLabel(v)
          if (c.kind === "date") return formatDate(v)
          return v ?? ""
        })
      )
    )
  }

  return (
    <div className="space-y-3">
      {visibleTypes.length > 1 && (
        <Tabs
          items={visibleTypes.map((t) => ({ key: t, label: DOC_TYPES[t]?.plural || t }))}
          value={type}
          onChange={(t) => {
            setType(t)
            setStatus(null)
            setPage(0)
          }}
        />
      )}
      {title && visibleTypes.length === 1 && <h2 className="text-base font-semibold">{title}</h2>}

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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Số chứng từ, diễn giải, đối tác…" className="w-72 pl-8" />
        </form>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => { setStatus(null); setPage(0) }}
            className={cn("rounded-full px-2.5 py-1 text-xs", status === null ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
          >
            Tất cả ({Object.values(counts).reduce((a, b) => a + b, 0)})
          </button>
          {Object.entries(counts).map(([s, n]) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(0) }}
              className={cn("rounded-full px-2.5 py-1 text-xs", status === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {statusLabel(s)} ({n})
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {scope && (
            <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground" title="Phạm vi dữ liệu theo ma trận phân quyền">
              Phạm vi: {SCOPE_LABELS[scope]}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} title="Xuất danh sách đang lọc ra CSV">
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          {canCreate && (
            <Button size="sm" className="h-8" onClick={() => router.push(`/documents/new?type=${type}`)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Tạo {cfg.label.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              {cfg.columns.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 font-medium", c.align === "right" && "text-right")}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={cfg.columns.length} className="px-3 py-8 text-center text-muted-foreground">Không có chứng từ trong phạm vi của bạn</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => router.push(`/documents/${r.id}`)}>
                {cfg.columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2", c.align === "right" && "text-right", c.key === "title" && "max-w-[320px] truncate")}>
                    {c.key === "number" ? <Link href={`/documents/${r.id}`} className="font-mono text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.number}</Link> : renderCell(r, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total}</span>
          <Button variant="outline" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</Button>
          <Button variant="outline" size="sm" className="h-7" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Sau</Button>
        </div>
      )}
    </div>
  )
}
