"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import { rpc } from "@/lib/api"
import type { VesselSchedule, Carrier, Port } from "@/lib/types"
import { useToast } from "@/components/ui/toast"

// ─────────── tiny UI primitives ───────────────────────────────────
function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
      {label}
      <input
        {...props}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </label>
  )
}

function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
      {label}
      <select
        {...props}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {children}
      </select>
    </label>
  )
}

// ─────────── CSV import dialog ─────────────────────────────────────
type ImportType = "carrier" | "port" | "vessel" | "schedule"

const CSV_TEMPLATES: Record<ImportType, { header: string; example: string }> = {
  carrier: {
    header: "code,name,scac,iata,country,mode",
    example: "EVER,Evergreen Marine,EGLV,,TW,SEA",
  },
  port: {
    header: "locode,name,country,timezone,mode",
    example: "VNSGN,Ho Chi Minh,VN,Asia/Ho_Chi_Minh,SEA",
  },
  vessel: {
    header: "name,imo_no,carrier_code,flag,vessel_type",
    example: "EVER LIVING,9604430,EVER,PA,CONTAINER",
  },
  schedule: {
    header: "carrier_code,vessel_name,pol_code,pod_code,voyage_no,etd,eta,cutoff_date,notes",
    example: "EVER,EVER LIVING,VNSGN,USHOU,0138W,2026-10-01,2026-11-05,2026-09-28,",
  },
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim())
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]))
  })
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [importType, setImportType] = useState<ImportType>("carrier")
  const [csvText, setCsvText] = useState("")
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const tpl = CSV_TEMPLATES[importType]

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCsvText(ev.target?.result as string)
    reader.readAsText(file, "utf-8")
  }

  const handleImport = async () => {
    const rows = parseCsv(csvText)
    if (rows.length === 0) { toast("error", "CSV rỗng hoặc không hợp lệ"); return }
    setLoading(true)
    try {
      const r = await rpc<{ ok: boolean; inserted: number; errors: { row: number; error: string }[] }>(
        "api_import_reference",
        { p_type: importType, p_rows: rows }
      )
      if (!r.ok) { toast("error", "Import thất bại"); return }
      const errMsg = r.errors?.length ? ` (${r.errors.length} lỗi)` : ""
      toast(r.errors?.length ? "error" : "success", `Đã nhập ${r.inserted}/${rows.length} bản ghi${errMsg}`)
      onDone()
    } catch {
      toast("error", "Lỗi kết nối")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-card border border-border shadow-xl p-6 space-y-4">
        <h2 className="font-semibold text-lg">Nhập danh mục từ CSV</h2>

        <Select label="Loại dữ liệu" value={importType} onChange={(e) => { setImportType(e.target.value as ImportType); setCsvText("") }}>
          <option value="carrier">Hãng tàu / hãng hàng không</option>
          <option value="port">Cảng / sân bay</option>
          <option value="vessel">Tàu / máy bay</option>
          <option value="schedule">Lịch tàu</option>
        </Select>

        <div className="rounded-md bg-muted p-3 text-xs font-mono space-y-1">
          <div className="text-muted-foreground">Header bắt buộc:</div>
          <div>{tpl.header}</div>
          <div className="text-muted-foreground mt-1">Ví dụ:</div>
          <div>{tpl.example}</div>
        </div>

        <div className="space-y-2">
          <button
            className="text-sm underline text-primary"
            onClick={() => fileRef.current?.click()}
          >
            Chọn file CSV...
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder={`${tpl.header}\n${tpl.example}`}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Huỷ</button>
          <button
            onClick={handleImport}
            disabled={loading || !csvText.trim()}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Đang nhập..." : "Nhập dữ liệu"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────── main page ─────────────────────────────────────────────
export default function SchedulePage() {
  const toast = useToast()
  const [pol, setPol]         = useState("")
  const [pod, setPod]         = useState("")
  const [fromDate, setFrom]   = useState("")
  const [toDate, setTo]       = useState("")
  const [carrierId, setCarrierId] = useState("")
  const [schedules, setSchedules] = useState<VesselSchedule[]>([])
  const [carriers, setCarriers]   = useState<Carrier[]>([])
  const [ports, setPorts]         = useState<Port[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched]   = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Load carriers + ports on mount for dropdowns
  useEffect(() => {
    rpc<{ ok: boolean; rows: Carrier[] }>("api_carriers", {}).then((r) => { if (r.ok) setCarriers(r.rows) })
    rpc<{ ok: boolean; rows: Port[] }>("api_ports", {}).then((r) => { if (r.ok) setPorts(r.rows) })
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    setSearched(true)
    try {
      const r = await rpc<{ ok: boolean; rows: VesselSchedule[] }>("api_vessel_schedules", {
        p_pol:        pol.trim().toUpperCase() || null,
        p_pod:        pod.trim().toUpperCase() || null,
        p_from_date:  fromDate || null,
        p_to_date:    toDate   || null,
        p_carrier_id: carrierId || null,
        p_limit:      100,
      })
      if (r.ok) setSchedules(r.rows)
      else toast("error", "Không tải được lịch tàu")
    } catch { toast("error", "Lỗi kết nối") }
    finally { setLoading(false) }
  }, [pol, pod, fromDate, toDate, carrierId, toast])

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"

  const statusBadge = (s: string) => {
    const cls = s === "OPEN" ? "bg-success-subtle text-success" : "bg-destructive/10 text-destructive"
    return <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", cls)}>{s}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Lịch tàu</h1>
          <p className="text-sm text-muted-foreground">Tra cứu lịch tàu / chuyến bay theo tuyến đường</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
        >
          <span>⬆</span> Nhập CSV
        </button>
      </div>

      {/* Search form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Cảng xếp hàng (POL)
              <input
                list="pol-list"
                value={pol}
                onChange={(e) => setPol(e.target.value)}
                placeholder="VNSGN"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="pol-list">
                {ports.map((p) => <option key={p.id} value={p.locode}>{p.locode} — {p.name}</option>)}
              </datalist>
            </label>
          </div>

          <div className="col-span-2 md:col-span-1">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Cảng dỡ hàng (POD)
              <input
                list="pod-list"
                value={pod}
                onChange={(e) => setPod(e.target.value)}
                placeholder="USHOU"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <datalist id="pod-list">
                {ports.map((p) => <option key={p.id} value={p.locode}>{p.locode} — {p.name}</option>)}
              </datalist>
            </label>
          </div>

          <Input label="ETD từ ngày" type="date" value={fromDate} onChange={(e) => setFrom(e.target.value)} />
          <Input label="ETD đến ngày" type="date" value={toDate} onChange={(e) => setTo(e.target.value)} />

          <Select label="Hãng tàu" value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
            <option value="">Tất cả</option>
            {carriers.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </Select>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={search}
            disabled={loading}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Đang tìm..." : "Tìm kiếm"}
          </button>
          <button
            onClick={() => { setPol(""); setPod(""); setFrom(""); setTo(""); setCarrierId(""); setSchedules([]); setSearched(false) }}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted"
          >
            Xoá bộ lọc
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-medium text-sm">{schedules.length} kết quả</span>
          </div>

          {schedules.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Không tìm thấy lịch tàu phù hợp</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Tàu</th>
                    <th className="text-left px-4 py-2.5">Hãng</th>
                    <th className="text-left px-4 py-2.5">Chuyến</th>
                    <th className="text-left px-4 py-2.5">Cảng xếp</th>
                    <th className="text-left px-4 py-2.5">Cảng dỡ</th>
                    <th className="text-left px-4 py-2.5">ETD</th>
                    <th className="text-left px-4 py-2.5">ETA</th>
                    <th className="text-right px-4 py-2.5">Hành trình</th>
                    <th className="text-left px-4 py-2.5">Cắt hàng</th>
                    <th className="text-left px-4 py-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedules.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{s.vessel_name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{s.carrier_code}</span>
                        <span className="ml-1.5 text-muted-foreground">{s.carrier_name}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{s.voyage_no ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-xs">{s.pol_code}</div>
                        <div className="text-xs text-muted-foreground">{s.pol_name}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-xs">{s.pod_code}</div>
                        <div className="text-xs text-muted-foreground">{s.pod_name}</div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{fmtDate(s.etd)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{fmtDate(s.eta)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-right">{s.transit_days != null ? `${s.transit_days} ngày` : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{fmtDate(s.cutoff_date)}</td>
                      <td className="px-4 py-2.5">{statusBadge(s.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false)
            rpc<{ ok: boolean; rows: Carrier[] }>("api_carriers", {}).then((r) => { if (r.ok) setCarriers(r.rows) })
            rpc<{ ok: boolean; rows: Port[] }>("api_ports", {}).then((r) => { if (r.ok) setPorts(r.rows) })
          }}
        />
      )}
    </div>
  )
}
