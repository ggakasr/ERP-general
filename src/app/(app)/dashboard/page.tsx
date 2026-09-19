"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Plus, ShieldAlert } from "lucide-react"
import { rpc } from "@/lib/api"
import { DOC_TYPES, MODULES } from "@/lib/doc-config"
import { SCOPE_LABELS } from "@/lib/labels"
import { useSession } from "@/lib/session"
import type { DocRef } from "@/lib/types"
import { cn, formatDateTime, formatMoney, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocLink, SodBadge, StatusBadge } from "@/components/shared/bits"
import { InboxList, useInbox } from "@/components/docs/inbox"

interface Kpi { code: string; name: string; category: string; value: number | null; target: number | null; unit: string; status: string }
interface Activity { document_id: string; number: string; doc_type: string; label: string; to_status: string; user_name: string; department_name: string; sod_role: string | null; created_at: string }

function kpiValue(k: Kpi) {
  if (k.value === null || k.value === undefined) return "—"
  if (k.unit === "VND") return formatMoney(k.value)
  if (k.unit === "%") return `${formatNumber(k.value)}%`
  return `${formatNumber(k.value)} ${k.unit || ""}`
}

export default function DashboardPage() {
  const { me, can } = useSession()
  const { rows, reload } = useInbox()
  const [kpis, setKpis] = useState<Kpi[] | null>(null)
  const [dash, setDash] = useState<{ activity: Activity[]; my_documents: DocRef[]; module_counts: Record<string, number>; sod_blocked_today: number } | null>(null)

  useEffect(() => {
    rpc<typeof dash & object>("api_dashboard").then((r) => r.ok && setDash(r as any))
    if (can("KPI", "VIEW")) rpc<{ rows: Kpi[] }>("api_kpis").then((r) => r.ok && setKpis(r.rows))
  }, [can])

  const creatable = Object.values(DOC_TYPES).filter((t) => can(t.code, "CREATE") && !t.requiresParent)
  const pickKpis = kpis?.filter((k) => ["FIN-001", "FIN-002", "FIN-003", "OPS-001", "CMP-001", "CMP-002", "CMP-003", "CUS-001"].includes(k.code))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Xin chào, {me.user.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {me.user.position} · {me.user.department_name} · {me.user.branch_name}
          </p>
        </div>
        {creatable.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {creatable.slice(0, 4).map((t) => (
              <Link key={t.code} href={`/documents/new?type=${t.code}`}>
                <Button size="sm" variant="outline" className="h-8"><Plus className="mr-1 h-3.5 w-3.5" />{t.label}</Button>
              </Link>
            ))}
          </div>
        )}
      </div>

      {dash && dash.sod_blocked_today > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <ShieldAlert className="h-4 w-4" />
          Trong 30 ngày qua, hệ thống đã chặn {dash.sod_blocked_today} thao tác của bạn do vi phạm tách biệt nhiệm vụ (SoD).
        </div>
      )}

      {pickKpis && pickKpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {pickKpis.map((k) => (
            <Link key={k.code} href="/reports" className="rounded-lg border bg-card p-3 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <p className="truncate text-xs text-muted-foreground">{k.name}</p>
                <span className={cn("h-2 w-2 rounded-full", k.status === "GREEN" ? "bg-emerald-500" : k.status === "YELLOW" ? "bg-amber-500" : k.status === "RED" ? "bg-red-500" : "bg-slate-300")} />
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{kpiValue(k)}</p>
              <p className="text-[11px] text-muted-foreground">{k.code}{k.target !== null ? ` · mục tiêu ${k.unit === "VND" ? formatMoney(k.target) : `${formatNumber(k.target)}${k.unit === "%" ? "%" : " " + k.unit}`}` : ""}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Việc cần làm {rows ? `(${rows.length})` : ""}</h2>
              <Link href="/tasks" className="flex items-center gap-1 text-xs text-primary hover:underline">Xem tất cả <ArrowRight className="h-3 w-3" /></Link>
            </div>
            <InboxList rows={rows} limit={8} onReload={reload} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Hoạt động gần đây trong phạm vi của bạn</CardTitle></CardHeader>
            <CardContent>
              {!dash ? <p className="text-sm text-muted-foreground">Đang tải…</p> : dash.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>
              ) : (
                <ul className="space-y-2.5">
                  {dash.activity.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span className="font-medium">{a.user_name}</span>
                      <span className="text-muted-foreground">{a.label.toLowerCase()}</span>
                      <DocLink id={a.document_id} number={a.number} className="text-xs" />
                      {a.to_status && <StatusBadge status={a.to_status} className="text-[10px]" />}
                      <SodBadge role={a.sod_role} />
                      <span className="ml-auto text-xs text-muted-foreground">{a.department_name} · {formatDateTime(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Chứng từ tôi lập đang xử lý</CardTitle></CardHeader>
            <CardContent>
              {!dash?.my_documents.length ? <p className="text-sm text-muted-foreground">Không có.</p> : (
                <ul className="divide-y">
                  {dash.my_documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <DocLink id={d.id} number={d.number} className="text-xs" />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{d.title}</span>
                      <StatusBadge status={d.status} className="text-[10px]" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Phân hệ bạn được truy cập</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {MODULES.filter((m) => m.docTypes.some((t) => can(t, "VIEW"))).map((m) => (
                <Link key={m.key} href={m.href} className="rounded-md border p-2 hover:bg-accent">
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{dash?.module_counts?.[m.key] ?? 0} chứng từ</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Phạm vi dữ liệu của tôi</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {Array.from(new Set(me.permissions.filter((p) => p.action === "VIEW").map((p) => p.resource)))
                .filter((r) => DOC_TYPES[r])
                .slice(0, 10)
                .map((r) => {
                  const p = me.permissions.find((x) => x.resource === r && x.action === "VIEW")!
                  return (
                    <div key={r} className="flex justify-between">
                      <span>{DOC_TYPES[r].label}</span>
                      <span className="text-muted-foreground">{SCOPE_LABELS[p.scope]}</span>
                    </div>
                  )
                })}
              <Link href="/me" className="block pt-1 text-primary hover:underline">Xem đầy đủ quyền hạn →</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
