"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronRight, RefreshCw, ShieldAlert } from "lucide-react"
import { rpc } from "@/lib/api"
import type { AvailableAction, DocumentRow } from "@/lib/types"
import { cn, formatDateTime, formatMoney } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, Loading, SlaBadge, StatusBadge } from "@/components/shared/bits"

export interface InboxRow {
  document: DocumentRow
  actions: AvailableAction[]
  blocked_by_sod: boolean
  handoff: { expected_action: string; sla_due_at: string; sla_status: string } | null
}

export function useInbox() {
  const [rows, setRows] = useState<InboxRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await rpc<{ rows: InboxRow[] }>("api_inbox")
    if (!res.ok) return setError(res.error || "Lỗi")
    setRows(res.rows)
  }, [])
  useEffect(() => {
    load()
  }, [load])
  return { rows, error, reload: load }
}

export function InboxList({ rows, limit, onReload }: { rows: InboxRow[] | null; limit?: number; onReload?: () => void }) {
  if (!rows) return <Loading label="Đang tìm việc cần xử lý…" />
  if (!rows.length) return <EmptyState>Không có việc nào đang chờ bạn.</EmptyState>
  const sorted = [...rows].sort((a, b) => Number(a.blocked_by_sod) - Number(b.blocked_by_sod))
  const shown = limit ? sorted.slice(0, limit) : sorted
  return (
    <div className="divide-y rounded-lg border bg-card">
      {onReload && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <span>{rows.length} việc</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onReload}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      {shown.map((r) => (
        <Link key={r.document.id} href={`/documents/${r.document.id}`} className={cn("flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40", r.blocked_by_sod && "opacity-70")}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-primary">{r.document.number}</span>
              <StatusBadge status={r.document.status} />
              <span className="text-xs text-muted-foreground">{r.document.doc_type_name}</span>
              {r.handoff && <SlaBadge status={r.handoff.sla_status} />}
            </div>
            <p className="mt-0.5 truncate text-sm">{r.document.title}{r.document.partner_name ? ` · ${r.document.partner_name}` : ""}</p>
            <p className="text-xs text-muted-foreground">
              {r.document.created_by_name} · {r.document.department_name} · cập nhật {formatDateTime(r.document.updated_at)}
              {r.document.amount !== undefined && !["TICKET", "HIRE", "EXC", "MDC"].includes(r.document.doc_type) ? ` · ${formatMoney(r.document.amount)}` : ""}
            </p>
          </div>
          <div className="hidden max-w-[45%] flex-wrap justify-end gap-1 sm:flex">
            {r.actions.slice(0, 3).map((a, i) => (
              <span key={i} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                a.sod_conflict ? "bg-orange-50 text-orange-800 ring-1 ring-orange-200" : a.style === "success" ? "bg-emerald-50 text-emerald-800" : "bg-primary/10 text-primary")}>
                {a.sod_conflict && <ShieldAlert className="h-3 w-3" />}
                {a.label}
              </span>
            ))}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  )
}
