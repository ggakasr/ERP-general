"use client"

import { useMemo, useState } from "react"
import { useSession } from "@/lib/session"
import { ACTION_LABELS, RESOURCE_LABELS, SCOPE_LABELS, SEVERITY_LABELS, statusLabel } from "@/lib/labels"
import { cn, formatDate } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Select } from "@/components/ui/form"
import { ErrorBox, Loading, SodBadge, StatusBadge } from "@/components/shared/bits"
import { DataTable, Muted, Pill, useReferenceTable } from "./common"

const SOD_ROLES = ["REQUESTER", "APPROVER", "EXECUTOR", "AUDITOR"] as const

// ------------------------------------------------------------------
// b. SoD matrix (BM-06)
// ------------------------------------------------------------------
interface SodMatrixRow { id: string; role_a: string; role_b: string; conflict_type: "HARD" | "SOFT"; description: string | null }

export function SodMatrixTab() {
  const { rows, loading, error } = useReferenceTable<SodMatrixRow>("sod_matrix")
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const find = (a: string, b: string) => rows.find((r) => (r.role_a === a && r.role_b === b) || (r.role_a === b && r.role_b === a))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ma trận tách biệt nhiệm vụ: trên <b>cùng một chứng từ</b> (và chuỗi chứng từ liên quan), một người không được giữ hai vai trò
        xung đột. Xung đột <b>HARD</b> bị chặn tuyệt đối, không có ngoại lệ (T3.1–T3.4).
      </p>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2" />
                {SOD_ROLES.map((r) => (
                  <th key={r} className="whitespace-nowrap px-3 py-2 text-center font-medium"><SodBadge role={r} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SOD_ROLES.map((a) => (
                <tr key={a} className="border-b last:border-0">
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium"><SodBadge role={a} /></th>
                  {SOD_ROLES.map((b) => {
                    if (a === b) {
                      return <td key={b} className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">—</td>
                    }
                    const c = find(a, b)
                    return (
                      <td
                        key={b}
                        title={c?.description || "Không xung đột"}
                        className={cn(
                          "px-3 py-2 text-center text-xs font-semibold",
                          c?.conflict_type === "HARD" && "bg-red-50 text-red-700",
                          c?.conflict_type === "SOFT" && "bg-amber-50 text-amber-800",
                          !c && "text-emerald-700"
                        )}
                      >
                        {c ? (c.conflict_type === "HARD" ? "✕ Cấm" : "! Cảnh báo") : "✓"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quy tắc xung đột</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <SodBadge role={r.role_a} />
                  <span className="text-muted-foreground">≠</span>
                  <SodBadge role={r.role_b} />
                  <Pill tone={r.conflict_type === "HARD" ? "red" : "amber"}>{r.conflict_type}</Pill>
                  <span className="flex-1 text-muted-foreground">{r.description}</span>
                </li>
              ))}
              {rows.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Chưa cấu hình quy tắc SoD.</li>}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Cặp Người phê duyệt – Người kiểm tra không xung đột: người duyệt vẫn có thể hậu kiểm chứng từ khác, nhưng người thực hiện thì không.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// e. Ownership matrix (BM-02)
// ------------------------------------------------------------------
interface OwnershipRow {
  id: string; flow_code: string; business_process: string; doc_types: string[]
  owner_user_id: string; deputy_user_id: string | null; department_id: string | null
  effective_from: string; effective_to: string | null
}

export function OwnershipTab() {
  const { master } = useSession()
  const { rows, loading, error } = useReferenceTable<OwnershipRow>("ownership_matrix", "flow_code")
  const users = useMemo(() => new Map(master.users.map((u) => [u.id, u])), [master.users])
  const depts = useMemo(() => new Map(master.departments.map((d) => [d.id, d])), [master.departments])

  if (error) return <ErrorBox message={error} />
  const sorted = [...rows].sort((a, b) => Number(a.flow_code.slice(1)) - Number(b.flow_code.slice(1)))

  const person = (id: string | null) => {
    if (!id) return <Muted />
    const u = users.get(id)
    if (!u) return <Muted>(không rõ)</Muted>
    return (
      <div className="min-w-[140px]">
        <p>{u.full_name}</p>
        <p className="text-xs text-muted-foreground">{u.position}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Nguyên tắc NT1 — một nghiệp vụ, một chủ sở hữu (ĐK1). Chủ sở hữu chịu trách nhiệm cuối cùng trong truy vết trách nhiệm.
      </p>
      <DataTable
        rows={sorted}
        loading={loading}
        rowKey={(r) => r.id}
        empty="Chưa có ma trận sở hữu"
        columns={[
          { key: "flow", label: "Luồng", render: (r) => <span className="font-mono text-xs">{r.flow_code}</span> },
          { key: "process", label: "Quy trình nghiệp vụ", className: "font-medium", render: (r) => r.business_process },
          {
            key: "types", label: "Loại chứng từ",
            render: (r) => (
              <div className="flex max-w-[280px] flex-wrap gap-1">
                {r.doc_types.map((t) => (
                  <span key={t} title={RESOURCE_LABELS[t] || t} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{t}</span>
                ))}
              </div>
            ),
          },
          { key: "owner", label: "Chủ sở hữu", render: (r) => person(r.owner_user_id) },
          { key: "deputy", label: "Người thay thế", render: (r) => person(r.deputy_user_id) },
          { key: "dept", label: "Phòng ban", render: (r) => (r.department_id ? depts.get(r.department_id)?.name || <Muted /> : <Muted />) },
          {
            key: "effective", label: "Hiệu lực", className: "whitespace-nowrap text-xs",
            render: (r) => `${formatDate(r.effective_from)} → ${r.effective_to ? formatDate(r.effective_to) : "nay"}`,
          },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------
// f. Permission matrix (BM-12)
// ------------------------------------------------------------------
interface PermissionRow {
  id: string; role_code: string; resource: string; action: string; data_scope: string
  field_restrictions: { hidden?: string[] } | null; status: string
}

const ACTION_ORDER = ["VIEW", "CREATE", "EDIT", "APPROVE", "EXECUTE", "AUDIT", "EXPORT"]

export function PermissionMatrixTab() {
  const { master } = useSession()
  const roles = useMemo(() => [...master.roles].sort((a, b) => a.sort - b.sort), [master.roles])
  const [role, setRole] = useState(roles[0]?.code || "")
  const { rows, loading, error } = useReferenceTable<PermissionRow>("permission_matrix")

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {}
    rows.forEach((r) => (c[r.role_code] = (c[r.role_code] || 0) + 1))
    return c
  }, [rows])

  const selected = useMemo(
    () =>
      rows
        .filter((r) => r.role_code === role)
        .sort((a, b) => a.resource.localeCompare(b.resource) || ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)),
    [rows, role]
  )

  if (error) return <ErrorBox message={error} />
  const roleInfo = roles.find((r) => r.code === role)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Quyền = <b>Hành động</b> × <b>Phạm vi dữ liệu</b> × <b>Trường</b> (NT5, ĐK8). Bảng chỉ để xem — thay đổi quyền thực hiện ở
        phân hệ Quản trị hệ thống và được ghi audit trail.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Vai trò" className="w-72">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({roleCounts[r.code] || 0})
              </option>
            ))}
          </Select>
        </Field>
        {roleInfo && <p className="pb-2 text-sm text-muted-foreground">{roleInfo.description}</p>}
      </div>
      <DataTable
        rows={selected}
        loading={loading}
        rowKey={(r) => r.id}
        empty="Vai trò này chưa được cấp quyền nào"
        columns={[
          {
            key: "resource", label: "Tài nguyên",
            render: (r) => (
              <span>
                {RESOURCE_LABELS[r.resource] || r.resource}{" "}
                <span className="font-mono text-xs text-muted-foreground">{r.resource}</span>
              </span>
            ),
          },
          { key: "action", label: "Hành động", render: (r) => ACTION_LABELS[r.action] || r.action },
          { key: "scope", label: "Phạm vi dữ liệu", render: (r) => <Pill tone="blue">{SCOPE_LABELS[r.data_scope] || r.data_scope}</Pill> },
          {
            key: "hidden", label: "Trường bị ẩn",
            render: (r) => {
              const hidden = r.field_restrictions?.hidden || []
              if (!hidden.length) return <Muted />
              return (
                <div className="flex flex-wrap gap-1">
                  {hidden.map((f) => <span key={f} className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[11px] text-red-700">{f}</span>)}
                </div>
              )
            },
          },
          {
            key: "status", label: "Trạng thái",
            render: (r) => (r.status === "ACTIVE" ? <Pill tone="green">Hiệu lực</Pill> : <Pill>{r.status}</Pill>),
          },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------
// g. State machines (BM-05)
// ------------------------------------------------------------------
interface TransitionRow {
  id: string; doc_type: string; from_status: string; to_status: string; action: string; label: string
  permission_action: string; permission_resource: string | null; sod_role: string | null
  conditions: string[]; system_only: boolean; sort: number
}
interface DocTypeFull {
  code: string; name: string; prefix: string; flow_code: string; module: string; initial_status: string
  terminal_statuses: string[]; financial: boolean; create_sod_role: string | null; sort: number
}

export function StateMachineTab() {
  const docTypes = useReferenceTable<DocTypeFull>("doc_types", "sort")
  const transitions = useReferenceTable<TransitionRow>("state_transitions", "sort")
  const [type, setType] = useState<string>("")

  if (docTypes.error || transitions.error) return <ErrorBox message={(docTypes.error || transitions.error)!} />
  if (docTypes.loading || transitions.loading) return <Loading />

  const current = docTypes.rows.find((d) => d.code === type) || docTypes.rows[0]
  if (!current) return <Muted>Chưa có loại chứng từ.</Muted>
  const rows = transitions.rows.filter((t) => t.doc_type === current.code)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        NT3 — trạng thái là hợp đồng: mọi chuyển trạng thái đều được kiểm tra bởi engine (quyền, điều kiện, SoD). Chuyển trạng thái
        không có trong bảng sẽ bị từ chối (T2.11).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Loại chứng từ" className="w-80">
          <Select value={current.code} onChange={(e) => setType(e.target.value)}>
            {docTypes.rows.map((d) => (
              <option key={d.code} value={d.code}>
                {d.flow_code} · {d.name} ({d.code})
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-muted-foreground">
          <span>Tiền tố: <b className="font-mono">{current.prefix}</b></span>
          <span>· Khởi tạo:</span> <StatusBadge status={current.initial_status} />
          <span>· Kết thúc:</span>
          {current.terminal_statuses.map((s) => <StatusBadge key={s} status={s} />)}
          {current.financial && <Pill tone="amber">Chứng từ tài chính</Pill>}
          {current.create_sod_role && <><span>· Người tạo giữ vai trò</span> <SodBadge role={current.create_sod_role} /></>}
        </div>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty="Loại chứng từ này chưa có chuyển trạng thái"
        columns={[
          {
            key: "from", label: "Từ → Đến",
            render: (r) => (
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {r.from_status === "*" || r.from_status === "ANY" ? <Pill>Bất kỳ</Pill> : <StatusBadge status={r.from_status} />}
                <span className="text-muted-foreground">→</span>
                <StatusBadge status={r.to_status} />
              </div>
            ),
          },
          {
            key: "label", label: "Thao tác",
            render: (r) => (
              <div>
                <p className="font-medium">{r.label}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{r.action}</p>
              </div>
            ),
          },
          {
            key: "perm", label: "Quyền yêu cầu",
            render: (r) => (
              <span className="whitespace-nowrap">
                {ACTION_LABELS[r.permission_action] || r.permission_action}
                <span className="text-muted-foreground"> · {RESOURCE_LABELS[r.permission_resource || r.doc_type] || r.permission_resource || r.doc_type}</span>
              </span>
            ),
          },
          { key: "sod", label: "Vai trò SoD", render: (r) => (r.sod_role ? <SodBadge role={r.sod_role} /> : <Muted />) },
          {
            key: "conditions", label: "Điều kiện",
            render: (r) =>
              r.conditions?.length ? (
                <div className="flex max-w-[260px] flex-wrap gap-1">
                  {r.conditions.map((c) => <span key={c} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{c}</span>)}
                </div>
              ) : (
                <Muted />
              ),
          },
          {
            key: "system", label: "Tự động",
            render: (r) => (r.system_only ? <Pill tone="violet">Hệ thống</Pill> : <Muted>Người dùng</Muted>),
          },
        ]}
      />
    </div>
  )
}

// ------------------------------------------------------------------
// h. Shadow-IT (BM-13) & Impact matrix (BM-03)
// ------------------------------------------------------------------
interface ShadowItRow {
  id: string; name: string; it_type: string; department_id: string | null; description: string | null
  risk_level: string | null; migration_target_module: string | null; migration_status: string; target_date: string | null
}
interface ImpactRow {
  id: string; change_type: string; description: string; affected_flows: string[] | null
  severity: string | null; mitigation_plan: string | null; status: string
}

const IT_TYPE_LABELS: Record<string, string> = {
  SPREADSHEET: "Bảng tính", EXTERNAL_APP: "Ứng dụng ngoài", MANUAL_PROCESS: "Quy trình thủ công", EMAIL_BASED: "Qua email",
}
const MIGRATION_LABELS: Record<string, { label: string; tone: "gray" | "blue" | "amber" | "green" }> = {
  IDENTIFIED: { label: "Đã nhận diện", tone: "gray" },
  PLANNED: { label: "Đã lập kế hoạch", tone: "blue" },
  IN_PROGRESS: { label: "Đang chuyển đổi", tone: "amber" },
  MIGRATED: { label: "Đã chuyển vào ERP", tone: "green" },
  DECOMMISSIONED: { label: "Đã ngừng sử dụng", tone: "green" },
}
const CHANGE_TYPE_LABELS: Record<string, string> = { PROCESS: "Quy trình", DATA: "Dữ liệu", SYSTEM: "Hệ thống", ORGANIZATION: "Tổ chức" }
const IMPACT_STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Đã nhận diện", ASSESSED: "Đã đánh giá", MITIGATED: "Đã giảm thiểu", ACCEPTED: "Chấp nhận rủi ro",
}
const RISK_TONE: Record<string, "green" | "amber" | "red"> = { LOW: "green", MEDIUM: "amber", HIGH: "red", CRITICAL: "red" }

export function ShadowItImpactTab() {
  const { master } = useSession()
  const shadow = useReferenceTable<ShadowItRow>("shadow_it_register", "name")
  const impact = useReferenceTable<ImpactRow>("impact_matrix")
  const depts = useMemo(() => new Map(master.departments.map((d) => [d.id, d.name])), [master.departments])

  const pending = shadow.rows.filter((r) => !["MIGRATED", "DECOMMISSIONED"].includes(r.migration_status)).length

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Sổ Shadow-IT (BM-13)</h2>
          <p className="text-sm text-muted-foreground">
            ĐK7 — mọi dữ liệu nghiệp vụ phải đi qua ERP. Còn <b>{pending}</b> mục chưa chuyển đổi xong.
          </p>
        </div>
        {shadow.error && <ErrorBox message={shadow.error} />}
        <DataTable
          rows={shadow.rows}
          loading={shadow.loading}
          rowKey={(r) => r.id}
          empty="Không có shadow-IT nào được ghi nhận"
          columns={[
            {
              key: "name", label: "Công cụ ngoài ERP",
              render: (r) => (
                <div className="min-w-[220px]">
                  <p className="font-medium">{r.name}</p>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                </div>
              ),
            },
            { key: "type", label: "Loại", className: "whitespace-nowrap", render: (r) => IT_TYPE_LABELS[r.it_type] || r.it_type },
            { key: "dept", label: "Phòng ban", render: (r) => (r.department_id ? depts.get(r.department_id) || <Muted /> : <Muted />) },
            {
              key: "risk", label: "Rủi ro",
              render: (r) => (r.risk_level ? <Pill tone={RISK_TONE[r.risk_level]}>{SEVERITY_LABELS[r.risk_level] || r.risk_level}</Pill> : <Muted />),
            },
            { key: "target", label: "Phân hệ ERP thay thế", render: (r) => r.migration_target_module || <Muted /> },
            {
              key: "status", label: "Tiến độ",
              render: (r) => <Pill tone={MIGRATION_LABELS[r.migration_status]?.tone || "gray"}>{MIGRATION_LABELS[r.migration_status]?.label || r.migration_status}</Pill>,
            },
            { key: "date", label: "Hạn", className: "whitespace-nowrap", render: (r) => formatDate(r.target_date) },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Ma trận tác động (BM-03)</h2>
          <p className="text-sm text-muted-foreground">Các thay đổi khi đưa ERP vào vận hành, luồng bị ảnh hưởng và kế hoạch giảm thiểu.</p>
        </div>
        {impact.error && <ErrorBox message={impact.error} />}
        <DataTable
          rows={impact.rows}
          loading={impact.loading}
          rowKey={(r) => r.id}
          empty="Chưa ghi nhận tác động nào"
          columns={[
            { key: "type", label: "Loại thay đổi", className: "whitespace-nowrap", render: (r) => CHANGE_TYPE_LABELS[r.change_type] || r.change_type },
            { key: "desc", label: "Mô tả", className: "min-w-[220px] font-medium", render: (r) => r.description },
            {
              key: "flows", label: "Luồng ảnh hưởng",
              render: (r) => (
                <div className="flex flex-wrap gap-1">
                  {(r.affected_flows || []).map((f) => <span key={f} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{f}</span>)}
                </div>
              ),
            },
            {
              key: "severity", label: "Mức độ",
              render: (r) => (r.severity ? <Pill tone={RISK_TONE[r.severity]}>{SEVERITY_LABELS[r.severity] || r.severity}</Pill> : <Muted />),
            },
            { key: "mitigation", label: "Kế hoạch giảm thiểu", className: "min-w-[220px] text-muted-foreground", render: (r) => r.mitigation_plan || "—" },
            { key: "status", label: "Trạng thái", className: "whitespace-nowrap", render: (r) => IMPACT_STATUS_LABELS[r.status] || statusLabel(r.status) },
          ]}
        />
      </section>
    </div>
  )
}

