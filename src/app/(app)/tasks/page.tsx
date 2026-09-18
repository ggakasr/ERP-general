"use client"

import { useMemo, useState } from "react"
import { DOC_TYPES } from "@/lib/doc-config"
import { cn } from "@/lib/utils"
import { ErrorBox, PageHeader } from "@/components/shared/bits"
import { InboxList, useInbox } from "@/components/docs/inbox"

export default function TasksPage() {
  const { rows, error, reload } = useInbox()
  const [type, setType] = useState<string | null>(null)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    rows?.forEach((r) => (c[r.document.doc_type] = (c[r.document.doc_type] || 0) + 1))
    return c
  }, [rows])
  const filtered = rows && type ? rows.filter((r) => r.document.doc_type === type) : rows

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Việc cần làm" />
      {error && <ErrorBox message={error} />}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setType(null)} className={cn("rounded-full px-2.5 py-1 text-xs", !type ? "bg-foreground text-background" : "bg-muted")}>Tất cả ({rows.length})</button>
          {Object.entries(counts).map(([t, n]) => (
            <button key={t} onClick={() => setType(t)} className={cn("rounded-full px-2.5 py-1 text-xs", type === t ? "bg-foreground text-background" : "bg-muted")}>
              {DOC_TYPES[t]?.label || t} ({n})
            </button>
          ))}
        </div>
      )}
      <InboxList rows={filtered} onReload={reload} />
    </div>
  )
}
