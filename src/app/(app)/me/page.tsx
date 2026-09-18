"use client"

import { useMemo } from "react"
import { useSession } from "@/lib/session"
import { ACTION_LABELS, RESOURCE_LABELS, SCOPE_LABELS } from "@/lib/labels"
import { cn, initials } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState, PageHeader } from "@/components/shared/bits"

const ACTIONS = ["VIEW", "CREATE", "EDIT", "APPROVE", "EXECUTE", "AUDIT", "EXPORT"]

const SCOPE_CLASS: Record<string, string> = {
  OWN: "bg-sky-50 text-sky-700 ring-sky-200",
  DEPARTMENT: "bg-teal-50 text-teal-700 ring-teal-200",
  BRANCH: "bg-violet-50 text-violet-700 ring-violet-200",
  COMPANY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
}

export default function MePage() {
  const { me, master } = useSession()
  const user = me.user

  const roleInfo = useMemo(() => new Map(master.roles.map((r) => [r.code, r])), [master.roles])

  const matrix = useMemo(() => {
    const byResource = new Map<string, Record<string, string>>()
    me.permissions.forEach((p) => {
      const row = byResource.get(p.resource) || {}
      row[p.action] = p.scope
      byResource.set(p.resource, row)
    })
    return Array.from(byResource.entries()).sort(([a], [b]) => (RESOURCE_LABELS[a] || a).localeCompare(RESOURCE_LABELS[b] || b, "vi"))
  }, [me.permissions])

  const info: [string, React.ReactNode][] = [
    ["Mã nhân viên", <span key="c" className="font-mono">{user.employee_code}</span>],
    ["Email", user.email],
    ["Chức danh", user.position || "—"],
    ["Phòng ban", user.department_name],
    ["Chi nhánh", user.branch_name],
    ["Trạng thái", user.status === "ACTIVE" ? "Đang hoạt động" : user.status],
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Quyền của tôi" />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0 pb-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(user.full_name)}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{user.full_name}</CardTitle>
              <p className="text-sm text-muted-foreground">{user.position}</p>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {info.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vai trò được gán ({me.roles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {me.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bạn chưa được gán vai trò nào.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {me.roles.map((r) => (
                  <li key={r.code} className="px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                    </div>
                    {roleInfo.get(r.code)?.description && (
                      <p className="text-xs text-muted-foreground">{roleInfo.get(r.code)?.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Ma trận quyền của tôi</h2>
        <p className="text-xs text-muted-foreground">Mỗi ô cho biết phạm vi dữ liệu bạn có với hành động tương ứng; “—” nghĩa là không có quyền.</p>
        {matrix.length === 0 ? (
          <EmptyState>Tài khoản của bạn chưa có quyền nghiệp vụ nào.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Tài nguyên</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="whitespace-nowrap px-3 py-2 text-center font-medium">{ACTION_LABELS[a]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map(([resource, cells]) => (
                  <tr key={resource} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">
                      {RESOURCE_LABELS[resource] || resource}{" "}
                      <span className="font-mono text-[11px] text-muted-foreground">{resource}</span>
                    </td>
                    {ACTIONS.map((a) => (
                      <td key={a} className="px-3 py-2 text-center">
                        {cells[a] ? (
                          <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", SCOPE_CLASS[cells[a]])}>
                            {SCOPE_LABELS[cells[a]] || cells[a]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
