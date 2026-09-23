"use client"

import { useMemo, useState } from "react"
import { DOC_TYPES } from "@/lib/doc-config"
import { cn } from "@/lib/utils"
import { ErrorBox, PageHeader } from "@/components/shared/bits"
import { InboxList, useTasks } from "@/components/docs/inbox"

const ROLE_GROUPS: { key: string; label: string }[] = [
  { key: "ALL",     label: "Tất cả" },
  { key: "APPROVE", label: "Cần duyệt" },
  { key: "EXECUTE", label: "Cần thực hiện" },
  { key: "REQUEST", label: "Đề xuất" },
  { key: "AUDIT",   label: "Kiểm tra" },
]

export default function TasksPage() {
  const { rows, counts, error, reload } = useTasks()
  const [roleGroup, setRoleGroup] = useState<string>("ALL")
  const [docType, setDocType] = useState<string | null>(null)

  const byRole = useMemo(() => {
    if (!rows) return null
    const filtered = roleGroup === "ALL"
      ? rows
      : rows.filter((r) => r.primary_role_group === roleGroup)
    return filtered.sort((a, b) => a.sla_priority - b.sla_priority)
  }, [rows, roleGroup])

  const docTypeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    byRole?.forEach((r) => (c[r.document.doc_type] = (c[r.document.doc_type] || 0) + 1))
    return c
  }, [byRole])

  const filtered = byRole && docType ? byRole.filter((r) => r.document.doc_type === docType) : byRole

  const totalAll = rows?.length ?? 0
  function groupCount(key: string) {
    if (key === "ALL") return totalAll
    return counts[key] ?? 0
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Hàng đợi công việc" />
      {error && <ErrorBox message={error} onRetry={reload} />}

      {/* Role-group tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {ROLE_GROUPS.map(({ key, label }) => {
          const n = groupCount(key)
          if (key !== "ALL" && n === 0) return null
          return (
            <button
              key={key}
              onClick={() => { setRoleGroup(key); setDocType(null) }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
                roleGroup === key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {label}
              {n > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs leading-none",
                  roleGroup === key ? "bg-background/20 text-background" : "bg-background text-foreground"
                )}>
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Doc-type secondary filter */}
      {byRole && byRole.length > 0 && Object.keys(docTypeCounts).length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setDocType(null)}
            className={cn("rounded-full px-2.5 py-1 text-xs", !docType ? "bg-foreground text-background" : "bg-muted")}
          >
            Tất cả loại ({byRole.length})
          </button>
          {Object.entries(docTypeCounts).map(([t, n]) => (
            <button
              key={t}
              onClick={() => setDocType(t)}
              className={cn("rounded-full px-2.5 py-1 text-xs", docType === t ? "bg-foreground text-background" : "bg-muted")}
            >
              {DOC_TYPES[t]?.label || t} ({n})
            </button>
          ))}
        </div>
      )}

      <InboxList rows={filtered} onReload={reload} />
    </div>
  )
}
