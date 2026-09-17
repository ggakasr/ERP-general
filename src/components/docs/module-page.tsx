"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { MODULES, DOC_TYPES } from "@/lib/doc-config"
import { useSession } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/bits"
import { DocTable } from "@/components/docs/doc-table"

export interface ExtraTab {
  key: string
  label: string
  /** visible if the user holds `action` (default VIEW) on any of these resources */
  resources?: string[]
  action?: string
  render: () => React.ReactNode
}

/** Generic page for a business flow: document lists per type + optional module-specific tabs. */
export function ModulePage({ moduleKey, extraTabs = [], docTypes }: { moduleKey: string; extraTabs?: ExtraTab[]; docTypes?: string[] }) {
  const mod = MODULES.find((m) => m.key === moduleKey)!
  const { can, canAny } = useSession()
  const types = (docTypes || mod.docTypes).filter((t) => can(t, "VIEW"))
  const extras = extraTabs.filter((t) => !t.resources || canAny(t.resources, t.action || "VIEW"))
  const tabs = [
    ...(types.length ? [{ key: "docs", label: "Chứng từ" }] : []),
    ...extras.map((t) => ({ key: t.key, label: t.label })),
  ]
  const [tab, setTab] = useState(tabs[0]?.key || "docs")
  const creatable = types.filter((t) => can(t, "CREATE") && !DOC_TYPES[t]?.requiresParent)

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title={mod.title}
        badge={<span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{mod.flow}</span>}
        subtitle={mod.subtitle}
        actions={creatable.map((t) => (
          <Link key={t} href={`/documents/new?type=${t}`}>
            <Button size="sm" variant={t === creatable[0] ? "default" : "outline"} className="h-8">
              <Plus className="mr-1 h-3.5 w-3.5" /> {DOC_TYPES[t].label}
            </Button>
          </Link>
        ))}
      />
      {tabs.length > 1 && <Tabs items={tabs} value={tab} onChange={setTab} />}
      {tab === "docs" && types.length > 0 && <DocTable docTypes={types} />}
      {extras.map((t) => (tab === t.key ? <div key={t.key}>{t.render()}</div> : null))}
      {tabs.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Vai trò của bạn không có quyền xem dữ liệu trong phân hệ này.
        </p>
      )}
    </div>
  )
}
