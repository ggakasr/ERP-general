"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { AlertTriangle, Save } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { ACTION_LABELS, RESOURCE_LABELS } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, Input, Select } from "@/components/ui/form"
import { useToast } from "@/components/ui/toast"
import { ErrorBox, Loading } from "@/components/shared/bits"
import { NoPermission } from "@/components/reports/common"

const ACTIONS = ["VIEW", "CREATE", "EDIT", "APPROVE", "EXECUTE", "AUDIT", "EXPORT"] as const
const SCOPES = ["OWN", "DEPARTMENT", "BRANCH", "COMPANY"] as const
const SCOPE_SHORT: Record<string, string> = { OWN: "Của tôi", DEPARTMENT: "Phòng ban", BRANCH: "Chi nhánh", COMPANY: "Toàn CT" }

interface PermRow {
  id: string; role_code: string; resource: string; action: string; data_scope: string
  field_restrictions: { hidden?: string[] } | null; status: string
}

interface Draft { scope: string; hidden: string }

const cellKey = (resource: string, action: string) => `${resource}:${action}`

function initialDraft(row: PermRow | undefined): Draft {
  if (!row) return { scope: "", hidden: "" }
  return {
    scope: row.status === "ACTIVE" ? row.data_scope : "",
    hidden: (row.field_restrictions?.hidden || []).join(", "),
  }
}

export function PermissionMatrixPanel() {
  const { can, master, me } = useSession()
  const toast = useToast()
  const [role, setRole] = useState(master.roles[0]?.code || "")
  const [rows, setRows] = useState<Map<string, PermRow> | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const canEdit = can("USER_ADMIN", "EDIT")
  const ownsRole = me.roles.some((r) => r.code === role)
  const editable = canEdit && !ownsRole

  const load = useCallback(async () => {
    if (!role) return
    setRows(null)
    const { data, error: err } = await createClient().from("permission_matrix").select("*").eq("role_code", role)
    if (err) { setError(err.message); return }
    setError(null)
    const map = new Map<string, PermRow>()
    ;(data as PermRow[]).forEach((r) => map.set(cellKey(r.resource, r.action), r))
    setRows(map)
    setDrafts({})
  }, [role])

  useEffect(() => { load() }, [load])

  if (!can("USER_ADMIN", "VIEW")) return <NoPermission>Ma trận phân quyền yêu cầu quyền xem Quản trị người dùng.</NoPermission>

  const resources = Object.keys(RESOURCE_LABELS)

  const draftOf = (resource: string, action: string): Draft =>
    drafts[cellKey(resource, action)] ?? initialDraft(rows?.get(cellKey(resource, action)))

  const isDirty = (resource: string, action: string) => {
    const k = cellKey(resource, action)
    if (!drafts[k]) return false
    const base = initialDraft(rows?.get(k))
    const d = drafts[k]
    const norm = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).join(",")
    return d.scope !== base.scope || norm(d.hidden) !== norm(base.hidden)
  }

  const setDraft = (resource: string, action: string, patch: Partial<Draft>) => {
    const k = cellKey(resource, action)
    setDrafts((prev) => ({ ...prev, [k]: { ...draftOf(resource, action), ...patch } }))
  }

  const saveCell = async (resource: string, action: string) => {
    const k = cellKey(resource, action)
    const existing = rows?.get(k)
    const d = draftOf(resource, action)
    const active = d.scope !== ""
    const hidden = action === "VIEW"
      ? d.hidden.split(",").map((x) => x.trim()).filter(Boolean)
      : existing?.field_restrictions?.hidden || []
    setSaving(k)
    const res = await rpc("api_admin_set_permission", {
      p_role: role,
      p_resource: resource,
      p_action: action,
      p_scope: active ? d.scope : existing?.data_scope || "OWN",
      p_hidden: hidden,
      p_active: active,
    })
    setSaving(null)
    if (!res.ok) {
      toast(res.code === "SOD_VIOLATION" ? "sod" : "error", "Không lưu được quyền", res.error)
      return
    }
    toast("success", `Đã cập nhật ${RESOURCE_LABELS[resource] || resource} · ${ACTION_LABELS[action] || action}`,
      active ? `Phạm vi: ${SCOPE_SHORT[d.scope]}` : "Đã vô hiệu hóa quyền")
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Vai trò" className="w-72">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {master.roles.map((r) => <option key={r.code} value={r.code}>{r.name} ({r.code})</option>)}
          </Select>
        </Field>
        <p className="pb-2 text-xs text-muted-foreground">{master.roles.find((r) => r.code === role)?.description}</p>
      </div>

      {ownsRole && canEdit && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-medium">Bạn đang giữ vai trò này nên không thể sửa quyền của nó (tách biệt nhiệm vụ).</p>
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 whitespace-nowrap bg-muted px-3 py-2 font-medium">Tài nguyên</th>
                {ACTIONS.map((a) => <th key={a} className="whitespace-nowrap px-2 py-2 font-medium">{ACTION_LABELS[a]}</th>)}
              </tr>
            </thead>
            <tbody>
              {resources.map((res) => (
                <tr key={res} className="border-b align-top last:border-0 hover:bg-muted/20">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2">
                    <span className="block font-medium">{RESOURCE_LABELS[res]}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">{res}</span>
                  </td>
                  {ACTIONS.map((act) => {
                    const k = cellKey(res, act)
                    const d = draftOf(res, act)
                    const dirty = isDirty(res, act)
                    return (
                      <td key={act} className={cn("px-2 py-1.5", d.scope && "bg-emerald-50/50", dirty && "bg-amber-50")}>
                        <div className="flex min-w-[118px] flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <select
                              value={d.scope}
                              disabled={!editable}
                              onChange={(e) => setDraft(res, act, { scope: e.target.value })}
                              className={cn("h-7 w-full rounded border border-input bg-background px-1 text-xs disabled:opacity-80",
                                !d.scope && "text-muted-foreground")}
                            >
                              <option value="">—</option>
                              {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_SHORT[s]}</option>)}
                            </select>
                            {dirty && (
                              <button
                                onClick={() => saveCell(res, act)}
                                disabled={saving === k}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-50"
                                title="Lưu ô này"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {act === "VIEW" && (d.scope || d.hidden) && (
                            <Fragment>
                              <input
                                value={d.hidden}
                                disabled={!editable}
                                onChange={(e) => setDraft(res, act, { hidden: e.target.value })}
                                placeholder="Trường ẩn: a, b"
                                title="Các trường bị ẩn, phân tách bằng dấu phẩy (vd: unit_price, amount)"
                                className="h-7 w-full rounded border border-input bg-background px-1.5 text-[11px] disabled:opacity-80"
                              />
                            </Fragment>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && <p className="text-xs text-muted-foreground">Chọn “—” để vô hiệu hóa quyền. Ô đã thay đổi được tô vàng — nhấn biểu tượng lưu trong ô để ghi.</p>}
    </div>
  )
}
