"use client"

import { useEffect, useMemo, useState } from "react"
import { Lock, Search, ShieldCheck, Unlock } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { DirectoryUser } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input, Select } from "@/components/ui/form"
import { useToast } from "@/components/ui/toast"
import { EmptyRow, HeadRow, NoPermission, TableShell, Td, Th } from "@/components/reports/common"

const USER_STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Hoạt động", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  INACTIVE: { label: "Ngừng sử dụng", className: "bg-slate-100 text-slate-600 ring-slate-200" },
  SUSPENDED: { label: "Đã khóa", className: "bg-red-50 text-red-700 ring-red-200" },
}

function RoleDialog({ user, onClose }: { user: DirectoryUser | null; onClose: () => void }) {
  const { master, refreshMaster } = useSession()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) setSelected(new Set(user.roles || []))
  }, [user])

  const save = async () => {
    if (!user) return
    const current = new Set(user.roles || [])
    const changes = [
      ...Array.from(selected).filter((r) => !current.has(r)).map((r) => ({ role: r, grant: true })),
      ...Array.from(current).filter((r) => !selected.has(r)).map((r) => ({ role: r, grant: false })),
    ]
    if (!changes.length) { onClose(); return }
    setBusy(true)
    let okCount = 0
    for (const c of changes) {
      const res = await rpc("api_admin_set_role", { p_user: user.id, p_role: c.role, p_grant: c.grant })
      if (!res.ok) {
        toast(res.code === "SOD_VIOLATION" ? "sod" : "error",
          `Không thể ${c.grant ? "cấp" : "thu hồi"} vai trò ${c.role}`, res.error)
        break
      }
      okCount++
    }
    await refreshMaster()
    setBusy(false)
    if (okCount === changes.length) {
      toast("success", `Đã cập nhật vai trò cho ${user.full_name}`, `${okCount} thay đổi đã được ghi vào audit trail`)
    }
    onClose()
  }

  return (
    <Dialog
      open={!!user}
      onClose={onClose}
      title={user ? `Phân vai trò — ${user.full_name}` : ""}
      description="Mỗi lần cấp/thu hồi được ghi vào audit trail. Hệ thống chặn việc tự sửa quyền của chính mình (SoD)."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</Button>
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {master.roles.map((r) => (
          <label key={r.code} className={cn("flex cursor-pointer gap-2 rounded-md border p-2 text-sm hover:bg-muted/40", selected.has(r.code) && "border-primary/50 bg-primary/5")}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.has(r.code)}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(r.code)
                else next.delete(r.code)
                setSelected(next)
              }}
            />
            <span className="min-w-0">
              <span className="block font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground">{r.description}</span>
            </span>
          </label>
        ))}
      </div>
    </Dialog>
  )
}

export function UsersPanel() {
  const { can, master, me, refreshMaster } = useSession()
  const toast = useToast()
  const [q, setQ] = useState("")
  const [dept, setDept] = useState("")
  const [editing, setEditing] = useState<DirectoryUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const canEdit = can("USER_ADMIN", "EDIT")

  const deptById = useMemo(() => new Map(master.departments.map((d) => [d.id, d])), [master.departments])
  const branchById = useMemo(() => new Map(master.branches.map((b) => [b.id, b])), [master.branches])
  const roleName = useMemo(() => new Map(master.roles.map((r) => [r.code, r.name])), [master.roles])

  if (!can("USER_ADMIN", "VIEW")) return <NoPermission>Danh bạ người dùng (BM-01) yêu cầu quyền xem Quản trị người dùng.</NoPermission>

  const term = q.trim().toLowerCase()
  const users = master.users.filter((u) =>
    (!dept || u.department_id === dept) &&
    (!term || [u.full_name, u.employee_code, u.position].some((v) => (v || "").toLowerCase().includes(term))))

  const toggleStatus = async (u: DirectoryUser) => {
    const next = u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"
    setBusyId(u.id)
    const res = await rpc("api_admin_set_user_status", { p_user: u.id, p_status: next })
    if (!res.ok) {
      toast(res.code === "SOD_VIOLATION" ? "sod" : "error", "Không đổi được trạng thái tài khoản", res.error)
    } else {
      toast("success", next === "SUSPENDED" ? `Đã khóa tài khoản ${u.full_name}` : `Đã mở khóa tài khoản ${u.full_name}`)
      await refreshMaster()
    }
    setBusyId(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Họ tên, mã nhân viên, vị trí…" className="w-64 pl-8" />
        </div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-56">
          <option value="">Tất cả phòng ban</option>
          {master.departments.map((d) => <option key={d.id} value={d.id}>{d.branch_code} · {d.name}</option>)}
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{users.length} / {master.users.length} người dùng</span>
      </div>
      {canEdit && (
        <p className="text-xs text-muted-foreground">Bạn không thể sửa vai trò hoặc khóa tài khoản của chính mình — thay đổi quyền phải do một quản trị viên khác thực hiện.</p>
      )}
      <TableShell>
        <thead>
          <HeadRow>
            <Th>Mã NV</Th><Th>Họ tên</Th><Th>Vị trí</Th><Th>Phòng ban</Th><Th>Chi nhánh</Th><Th>Vai trò</Th><Th>Trạng thái</Th>
            {canEdit && <Th right>Thao tác</Th>}
          </HeadRow>
        </thead>
        <tbody>
          {users.length === 0 && <EmptyRow colSpan={canEdit ? 8 : 7}>Không tìm thấy người dùng</EmptyRow>}
          {users.map((u) => {
            const st = USER_STATUS[u.status]
            const isMe = u.id === me.user.id
            return (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="font-mono">{u.employee_code}</Td>
                <Td className="whitespace-nowrap font-medium">
                  {u.full_name}
                  {isMe && <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">Bạn</span>}
                </Td>
                <Td>{u.position || "—"}</Td>
                <Td className="whitespace-nowrap">{deptById.get(u.department_id)?.name || "—"}</Td>
                <Td>{branchById.get(u.branch_id)?.code || "—"}</Td>
                <Td>
                  <div className="flex max-w-md flex-wrap gap-1">
                    {(u.roles || []).length === 0 && <span className="text-xs text-muted-foreground">Chưa có vai trò</span>}
                    {(u.roles || []).map((r) => (
                      <span key={r} title={r} className="inline-flex whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200">
                        {roleName.get(r) || r}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", st?.className || "bg-slate-100 text-slate-700 ring-slate-200")}>
                    {st?.label || u.status}
                  </span>
                </Td>
                {canEdit && (
                  <Td right>
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled={isMe} title={isMe ? "Không thể sửa vai trò của chính mình" : "Phân vai trò"} onClick={() => setEditing(u)}>
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Vai trò
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn("h-7 px-2", u.status !== "SUSPENDED" && "text-red-700 hover:text-red-800")}
                        disabled={isMe || busyId === u.id}
                        title={isMe ? "Không thể tự khóa tài khoản của mình" : undefined}
                        onClick={() => toggleStatus(u)}
                      >
                        {u.status === "SUSPENDED"
                          ? <><Unlock className="mr-1 h-3.5 w-3.5" /> Mở khóa</>
                          : <><Lock className="mr-1 h-3.5 w-3.5" /> Khóa</>}
                      </Button>
                    </div>
                  </Td>
                )}
              </tr>
            )
          })}
        </tbody>
      </TableShell>
      <RoleDialog user={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
