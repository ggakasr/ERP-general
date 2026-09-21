"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { newIdempotencyKey, rpc } from "@/lib/api"
import { DOC_TYPES, type HeaderField } from "@/lib/doc-config"
import { useSession } from "@/lib/session"
import type { DocRef, DocumentDetail, DocumentRow } from "@/lib/types"
import { cn, formatMoney, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input, Select, Textarea } from "@/components/ui/form"
import { useToast } from "@/components/ui/toast"
import { DocLink, ErrorBox, Loading, PageHeader, StatusBadge } from "@/components/shared/bits"

interface LineDraft {
  key: string
  source_line_id?: string
  product_id?: string
  product_label?: string
  unit?: string
  description?: string
  quantity?: number | string
  unit_price?: number | string
  price_masked?: boolean
  remaining?: number
  account_code?: string
  debit?: number | string
  credit?: number | string
  amount?: number | string
  date?: string
}

const today = () => new Date().toISOString().slice(0, 10)
let seq = 0
const lineKey = () => `l${++seq}`

function remainingFor(pair: string, qty: number, p: Record<string, number> | null) {
  const g = (k: string) => Number(p?.[k] ?? 0)
  switch (pair) {
    case "PR>PO": return qty - g("ordered")
    case "PO>GRN": return qty - g("received")
    case "PO>SINV": return g("received") - g("invoiced")
    case "QUOT>SO": return qty - g("ordered")
    case "SO>DN": return qty - g("shipped")
    case "SO>INV": return g("shipped") - g("invoiced")
    default: return qty
  }
}

function DocumentForm() {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const { master, can } = useSession()
  const editId = params.get("edit")
  const parentId = params.get("parent")
  const [type, setType] = useState<string | null>(params.get("type"))
  const [parent, setParent] = useState<DocumentDetail | null>(null)
  const [editing, setEditing] = useState<DocumentDetail | null>(null)
  const [values, setValues] = useState<Record<string, any>>({})
  const [lines, setLines] = useState<LineDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const idem = useRef(newIdempotencyKey())

  const cfg = type ? DOC_TYPES[type] : null

  // load parent / edited document and prefill
  useEffect(() => {
    ;(async () => {
      if (editId) {
        const res = await rpc<DocumentDetail>("api_get_document", { p_id: editId })
        if (!res.ok) return setError((res as any).error)
        const d = res.document
        setType(d.doc_type)
        setEditing(res)
        const v: Record<string, any> = {
          title: d.title, partner_id: d.partner_id, warehouse_id: d.warehouse_id, to_warehouse_id: d.to_warehouse_id,
          product_id: d.product_id, doc_date: d.doc_date, amount: d.amount, ...d.data,
        }
        setValues(v)
        setLines(res.lines.map((l) => ({
          key: lineKey(), source_line_id: l.source_line_id || undefined, product_id: l.product_id || undefined,
          product_label: l.product_name ? `${l.product_code} — ${l.product_name}` : undefined, unit: l.unit || undefined,
          description: l.description || undefined, quantity: l.quantity, unit_price: l.unit_price, account_code: l.account_code || undefined,
          debit: l.debit, credit: l.credit, amount: l.amount, date: l.data?.date,
        })))
        setReady(true)
        return
      }
      const t = params.get("type")
      const v: Record<string, any> = { doc_date: today(), fiscal_year: new Date().getFullYear(), priority: "MEDIUM", method: "BANK_TRANSFER", vat_rate: "10" }
      if (parentId && t) {
        const res = await rpc<DocumentDetail>("api_get_document", { p_id: parentId })
        if (!res.ok) return setError((res as any).error)
        setParent(res)
        const p = res.document
        const pair = `${p.doc_type}>${t}`
        v.title = p.title
        if (["PMT", "RCPT"].includes(t)) {
          const paid = Number(p.data?.paid_amount ?? 0)
          v.amount = p.amount !== undefined ? Math.max(Number(p.amount) - paid, 0) : ""
          v.title = `${t === "PMT" ? "Thanh toán" : "Thu tiền"} ${p.number}${p.partner_name ? " — " + p.partner_name : ""}`
        }
        if (t === "WO" && res.lines[0]) {
          v.product_id = res.lines.find((l) => master.products.find((x) => x.id === l.product_id)?.product_type === "FINISHED")?.product_id
          v.planned_qty = res.lines.find((l) => l.product_id === v.product_id)?.quantity
          v.warehouse_id = p.warehouse_id
        }
        if (t === "TICKET") v.subject = `Phản ánh về ${p.number}`
        if (["PO", "GRN", "SINV", "SO", "DN", "INV"].includes(t)) {
          setLines(res.lines
            .map((l) => {
              const rem = remainingFor(pair, Number(l.quantity), l.progress)
              return {
                key: lineKey(), source_line_id: l.id, product_id: l.product_id || undefined,
                product_label: `${l.product_code} — ${l.product_name}`, unit: l.unit || undefined,
                quantity: rem, remaining: rem, unit_price: l.unit_price, price_masked: l._masked?.includes("unit_price"),
              } as LineDraft
            })
            .filter((l) => Number(l.remaining) > 0))
        }
      }
      if (t === "JV") setLines([{ key: lineKey() }, { key: lineKey() }])
      if (["PR", "QUOT", "ST", "ADJ", "BUDGET", "BANKREC"].includes(t || "") || (t && ["PO", "SO"].includes(t) && !parentId)) setLines([{ key: lineKey() }])
      setValues(v)
      setReady(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, parentId])

  const set = (k: string, val: any) => setValues((v) => ({ ...v, [k]: val }))
  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const totals = useMemo(() => {
    const amount = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0)
    const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0)
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0)
    const budget = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
    return { amount, debit, credit, budget }
  }, [lines])

  if (error) return <ErrorBox message={error} />
  if (!ready) return <Loading />
  if (!cfg || !type) return <ErrorBox message="Loại chứng từ không hợp lệ" />
  if (!editId && !can(type, "CREATE")) return <ErrorBox message={`Bạn không có quyền tạo ${cfg.label}.`} />
  if (cfg.requiresParent && !parentId && !editId) {
    return <ErrorBox message={`${cfg.label} phải được lập từ chứng từ gốc. Hãy mở chứng từ gốc và chọn thao tác tạo.`} />
  }

  const productOptions = master.products.filter((p) => p.status === "ACTIVE" && (!cfg.productTypes || cfg.productTypes.includes(p.product_type)))
  const fromParent = !!parent && ["PO", "GRN", "SINV", "SO", "DN", "INV"].includes(type)
  const priceEditable = ["SINV", "PO", "SO", "PR", "QUOT", "ADJ"].includes(type)

  const submit = async () => {
    setBusy(true)
    const header: Record<string, any> = { data: {} }
    const fields = type === "MDC" ? [] : cfg.header
    for (const f of fields) {
      if (f.noParentOnly && parent) continue
      const v = values[f.key]
      if (f.required && (v === undefined || v === null || v === "")) {
        setBusy(false)
        toast("error", `Thiếu thông tin: ${f.label}`)
        return
      }
      if (v === undefined || v === "") continue
      const val = ["number", "money"].includes(f.type) ? Number(v) : v
      if (f.data) header.data[f.key] = val
      else header[f.key] = val
    }
    if (type === "MDC") header.data = { entity: values.entity, op: values.op, target_id: values.target_id, payload: values.payload || {} }
    if (type === "TICKET" && !header.title) header.title = values.subject

    let payloadLines: any[] | null = null
    if (cfg.lineMode === "product") {
      payloadLines = lines.filter((l) => l.product_id || l.source_line_id).map((l) => ({
        source_line_id: l.source_line_id, product_id: l.source_line_id ? undefined : l.product_id,
        quantity: Number(l.quantity), unit_price: l.price_masked || l.unit_price === "" || l.unit_price === undefined ? undefined : Number(l.unit_price),
      }))
    } else if (cfg.lineMode === "journal") {
      payloadLines = lines.filter((l) => l.account_code).map((l) => ({ account_code: l.account_code, description: l.description, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }))
    } else if (cfg.lineMode === "budget") {
      payloadLines = lines.filter((l) => l.account_code).map((l) => ({ account_code: l.account_code, description: l.description, amount: Number(l.amount || 0) }))
    } else if (cfg.lineMode === "bankrec") {
      payloadLines = lines.filter((l) => l.amount).map((l) => ({ amount: Number(l.amount), description: l.description, data: { date: l.date } }))
    }

    const res = editId
      ? await rpc("api_update_document", { p_doc_id: editId, p_header: header, p_lines: payloadLines, p_expected_version: editing?.document.version })
      : await rpc("api_create_document", {
          p_doc_type: type, p_header: header, p_lines: payloadLines, p_parent_id: parentId, p_idempotency_key: idem.current,
        })
    setBusy(false)
    if (!res.ok) {
      toast(res.code === "SOD_VIOLATION" ? "sod" : "error", res.code === "SOD_VIOLATION" ? "Bị chặn bởi SoD" : "Không lưu được", res.error)
      if (res.code === "SOD_VIOLATION") idem.current = newIdempotencyKey()
      return
    }
    toast("success", editId ? "Đã cập nhật" : `Đã tạo ${res.number}`, (res as any).duplicate ? "Yêu cầu trùng — trả về chứng từ đã tạo trước đó (idempotency)" : undefined)
    router.push(`/documents/${res.id}`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" /> Quay lại</Button>
      <PageHeader title={`${editId ? "Sửa" : "Tạo"} ${cfg.label.toLowerCase()}`} />

      {parent && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
          <span className="text-muted-foreground">Lập từ chứng từ gốc:</span>
          <DocLink id={parent.document.id} number={parent.document.number} />
          <span className="text-muted-foreground">{parent.document.doc_type_name} · {parent.document.title}</span>
          <StatusBadge status={parent.document.status} />
          {parent.document.partner_name && <span className="text-muted-foreground">· {parent.document.partner_name}</span>}
        </div>
      )}

      {cfg.createVia === "payroll" && <PayrollGenerator />}
      {cfg.createVia === "access_review" && <AccessReviewGenerator />}

      {!cfg.createVia && (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Thông tin chung</CardTitle></CardHeader>
            <CardContent>
              {type === "MDC" ? (
                <MdcFields values={values} set={set} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {cfg.header.filter((f) => !(f.noParentOnly && parent)).map((f) => (
                    <HeaderInput key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {cfg.lineMode !== "none" && (
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm">Chi tiết</CardTitle>
                {!fromParent && (
                  <Button variant="outline" size="sm" className="h-8" onClick={() => setLines((ls) => [...ls, { key: lineKey() }])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Thêm dòng
                  </Button>
                )}
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {cfg.lineMode === "product" && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2">Sản phẩm</th>
                        {fromParent && <th className="px-3 py-2 text-right">Còn lại</th>}
                        <th className="px-3 py-2 text-right">{cfg.qtyLabel || "Số lượng"}</th>
                        {type !== "ST" && <th className="px-3 py-2 text-right">{cfg.priceLabel || "Đơn giá"}</th>}
                        {type !== "ST" && <th className="px-3 py-2 text-right">Thành tiền</th>}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            {l.source_line_id ? (
                              <span>{l.product_label} <span className="text-xs text-muted-foreground">{l.unit}</span></span>
                            ) : (
                              <Select value={l.product_id || ""} onChange={(e) => {
                                const p = master.products.find((x) => x.id === e.target.value)
                                setLine(l.key, { product_id: e.target.value, unit: p?.unit, unit_price: ["QUOT", "SO"].includes(type) ? p?.sale_price : (p?.standard_cost ?? "") })
                              }}>
                                <option value="">— Chọn sản phẩm —</option>
                                {productOptions.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name} ({p.unit})</option>)}
                              </Select>
                            )}
                          </td>
                          {fromParent && <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatNumber(l.remaining)}</td>}
                          <td className="px-3 py-2"><Input type="number" min={0} step="any" className="w-28 text-right" value={l.quantity ?? ""} onChange={(e) => setLine(l.key, { quantity: e.target.value })} /></td>
                          {type !== "ST" && (
                            <td className="px-3 py-2">
                              {l.price_masked ? <span className="text-xs text-muted-foreground">Theo chứng từ gốc (ẩn)</span> : (
                                <Input type="number" min={0} step="any" className="w-36 text-right" disabled={fromParent && !priceEditable}
                                  value={l.unit_price ?? ""} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} />
                              )}
                            </td>
                          )}
                          {type !== "ST" && <td className="px-3 py-2 text-right tabular-nums">{l.price_masked ? "—" : formatMoney(Number(l.quantity || 0) * Number(l.unit_price || 0))}</td>}
                          <td className="px-2"><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Xóa dòng"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      {type !== "ST" && !lines.some((l) => l.price_masked) && (
                        <tr className="bg-muted/30 font-medium"><td className="px-3 py-2" colSpan={fromParent ? 4 : 3}>Tổng cộng</td><td className="px-3 py-2 text-right">{formatMoney(totals.amount)}</td><td /></tr>
                      )}
                    </tbody>
                  </table>
                )}

                {cfg.lineMode === "journal" && (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-3 py-2">Tài khoản</th><th className="px-3 py-2">Diễn giải</th><th className="px-3 py-2 text-right">Nợ</th><th className="px-3 py-2 text-right">Có</th><th className="w-10" /></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key} className="border-b">
                          <td className="px-3 py-2"><AccountSelect value={l.account_code} onChange={(v) => setLine(l.key, { account_code: v })} /></td>
                          <td className="px-3 py-2"><Input value={l.description || ""} onChange={(e) => setLine(l.key, { description: e.target.value })} /></td>
                          <td className="px-3 py-2"><Input type="number" min={0} className="w-36 text-right" value={l.debit ?? ""} onChange={(e) => setLine(l.key, { debit: e.target.value, credit: "" })} /></td>
                          <td className="px-3 py-2"><Input type="number" min={0} className="w-36 text-right" value={l.credit ?? ""} onChange={(e) => setLine(l.key, { credit: e.target.value, debit: "" })} /></td>
                          <td className="px-2"><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      <tr className={cn("font-medium", totals.debit === totals.credit && totals.debit > 0 ? "bg-success-subtle text-success" : "bg-destructive/10 text-destructive")}>
                        <td className="px-3 py-2" colSpan={2}>{totals.debit === totals.credit && totals.debit > 0 ? "Cân đối Nợ = Có" : "Chưa cân đối — không thể gửi duyệt"}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(totals.debit)}</td><td className="px-3 py-2 text-right">{formatMoney(totals.credit)}</td><td />
                      </tr>
                    </tbody>
                  </table>
                )}

                {cfg.lineMode === "budget" && (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-3 py-2">Tài khoản chi phí</th><th className="px-3 py-2">Hạng mục</th><th className="px-3 py-2 text-right">Số tiền kế hoạch</th><th className="w-10" /></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key} className="border-b">
                          <td className="px-3 py-2"><AccountSelect value={l.account_code} onChange={(v) => setLine(l.key, { account_code: v })} types={["EXPENSE", "ASSET"]} /></td>
                          <td className="px-3 py-2"><Input value={l.description || ""} onChange={(e) => setLine(l.key, { description: e.target.value })} /></td>
                          <td className="px-3 py-2"><Input type="number" min={0} className="w-40 text-right" value={l.amount ?? ""} onChange={(e) => setLine(l.key, { amount: e.target.value })} /></td>
                          <td className="px-2"><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-medium"><td className="px-3 py-2" colSpan={2}>Tổng ngân sách</td><td className="px-3 py-2 text-right">{formatMoney(totals.budget)}</td><td /></tr>
                    </tbody>
                  </table>
                )}

                {cfg.lineMode === "bankrec" && (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Nội dung sao kê</th><th className="px-3 py-2 text-right">Số tiền (+ thu / − chi)</th><th className="w-10" /></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.key} className="border-b">
                          <td className="px-3 py-2"><Input type="date" value={l.date || ""} onChange={(e) => setLine(l.key, { date: e.target.value })} /></td>
                          <td className="px-3 py-2"><Input value={l.description || ""} onChange={(e) => setLine(l.key, { description: e.target.value })} /></td>
                          <td className="px-3 py-2"><Input type="number" className="w-44 text-right" value={l.amount ?? ""} onChange={(e) => setLine(l.key, { amount: e.target.value })} /></td>
                          <td className="px-2"><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => router.back()}>Hủy</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Đang lưu…" : editId ? "Lưu thay đổi" : "Tạo chứng từ"}</Button>
          </div>
        </>
      )}
    </div>
  )
}

function AccountSelect({ value, onChange, types }: { value?: string; onChange: (v: string) => void; types?: string[] }) {
  const { master } = useSession()
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)} className="min-w-[220px]">
      <option value="">— Tài khoản —</option>
      {master.accounts.filter((a) => !types || types.includes(a.account_type)).map((a) => (
        <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
      ))}
    </Select>
  )
}

function HeaderInput({ field, value, onChange }: { field: HeaderField; value: any; onChange: (v: any) => void }) {
  const { master, me } = useSession()
  const f = field
  let input: React.ReactNode
  switch (f.type) {
    case "textarea":
      input = <Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      break
    case "number":
    case "money":
      input = <Input type="number" min={0} step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      break
    case "date":
      input = <Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      break
    case "supplier":
    case "customer": {
      const types = f.type === "supplier" ? ["SUPPLIER", "BOTH"] : ["CUSTOMER", "BOTH"]
      input = (
        <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn —</option>
          {master.partners.filter((p) => types.includes(p.partner_type) && p.status === "ACTIVE").map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </Select>
      )
      break
    }
    case "warehouse":
      input = (
        <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn kho —</option>
          {master.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}{w.branch_id === me.user.branch_id ? "" : " (chi nhánh khác)"}</option>)}
        </Select>
      )
      break
    case "department":
      input = (
        <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn phòng ban —</option>
          {master.departments.map((d) => <option key={d.id} value={d.id}>{d.branch_code} · {d.name}</option>)}
        </Select>
      )
      break
    case "product":
      input = (
        <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn —</option>
          {master.products.filter((p) => !f.productFilter || f.productFilter.includes(p.product_type)).map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </Select>
      )
      break
    case "select":
      input = (
        <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Chọn —</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )
      break
    case "document":
      input = <DocumentPicker value={value} onChange={onChange} />
      break
    default:
      input = <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
  }
  return (
    <Field label={f.label} required={f.required} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
      {input}
    </Field>
  )
}

function DocumentPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<DocRef[]>([])
  const [picked, setPicked] = useState<DocRef | null>(null)
  useEffect(() => {
    if (q.length < 2) return setRows([])
    const t = setTimeout(async () => {
      const res = await rpc<{ ok: boolean; rows: DocRef[] }>("api_search", { p_q: q })
      if (res.ok) setRows(res.rows)
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  if (value && picked) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
        <span className="font-mono">{picked.number}</span><span className="truncate text-muted-foreground">{picked.title}</span>
        <button className="ml-auto text-xs text-primary" onClick={() => { setPicked(null); onChange("") }}>Đổi</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ số chứng từ để tìm…" />
      {rows.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-card shadow">
          {rows.map((r) => (
            <button key={r.id} className="flex w-full gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { setPicked(r); onChange(r.id); setRows([]) }}>
              <span className="font-mono text-xs">{r.number}</span><span className="truncate text-muted-foreground">{r.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const PARTNER_FIELDS = [
  ["code", "Mã"], ["name", "Tên"], ["partner_type", "Loại (CUSTOMER/SUPPLIER/BOTH)"], ["tax_code", "Mã số thuế"],
  ["address", "Địa chỉ"], ["phone", "Điện thoại"], ["payment_terms_days", "Hạn thanh toán (ngày)"], ["credit_limit", "Hạn mức tín dụng"],
]
const PRODUCT_FIELDS = [
  ["code", "Mã"], ["name", "Tên"], ["unit", "Đơn vị tính"], ["product_type", "Loại (RAW/FINISHED/GOODS/SUPPLY)"],
  ["inventory_account", "TK kho (152/155/156/153)"], ["standard_cost", "Giá vốn chuẩn"], ["sale_price", "Giá bán"],
]

function MdcFields({ values, set }: { values: Record<string, any>; set: (k: string, v: any) => void }) {
  const { master } = useSession()
  const entity = values.entity || "PARTNER"
  const op = values.op || "CREATE"
  const payload = values.payload || {}
  useEffect(() => {
    if (!values.entity) set("entity", "PARTNER")
    if (!values.op) set("op", "CREATE")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const fields = entity === "PARTNER" ? PARTNER_FIELDS : PRODUCT_FIELDS
  const targets = entity === "PARTNER" ? master.partners.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })) : master.products.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tiêu đề yêu cầu" required><Input value={values.title || ""} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Đối tượng">
          <Select value={entity} onChange={(e) => { set("entity", e.target.value); set("payload", {}); set("target_id", "") }}>
            <option value="PARTNER">Khách hàng / Nhà cung cấp</option><option value="PRODUCT">Sản phẩm</option>
          </Select>
        </Field>
        <Field label="Thao tác">
          <Select value={op} onChange={(e) => set("op", e.target.value)}>
            <option value="CREATE">Tạo mới</option><option value="UPDATE">Cập nhật</option>
          </Select>
        </Field>
      </div>
      {op === "UPDATE" && (
        <Field label="Bản ghi cần cập nhật" required>
          <Select value={values.target_id || ""} onChange={(e) => set("target_id", e.target.value)}>
            <option value="">— Chọn —</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.filter(([k]) => op === "CREATE" || !["code", "partner_type", "product_type", "inventory_account", "unit"].includes(k)).map(([k, label]) => (
          <Field key={k} label={label}>
            <Input value={payload[k] ?? ""} onChange={(e) => set("payload", { ...payload, [k]: e.target.value })} placeholder={op === "UPDATE" ? "Để trống nếu không đổi" : ""} />
          </Field>
        ))}
      </div>
    </div>
  )
}

function PayrollGenerator() {
  const router = useRouter()
  const toast = useToast()
  const now = new Date()
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
  const [workDays, setWorkDays] = useState("")
  const [busy, setBusy] = useState(false)
  const run = async () => {
    const wd: Record<string, number> = {}
    workDays.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const [code, days] = s.split(/[:=\s]+/)
      if (code && days) wd[code] = Number(days)
    })
    setBusy(true)
    const res = await rpc("api_create_payroll", { p_period: period, p_work_days: wd })
    setBusy(false)
    if (!res.ok) return toast("error", "Không tính được lương", res.error)
    toast("success", `Đã tính lương ${res.number}`)
    router.push(`/documents/${res.id}`)
  }
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kỳ lương (YYYY-MM)" required><Input value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
          <Field label="Ngày công khác chuẩn 22 ngày">
            <Textarea value={workDays} onChange={(e) => setWorkDays(e.target.value)} placeholder={"NV101: 20\nNV103: 19"} />
          </Field>
        </div>
        <div className="flex justify-end"><Button onClick={run} disabled={busy}>{busy ? "Đang tính…" : "Tính lương"}</Button></div>
      </CardContent>
    </Card>
  )
}

function AccessReviewGenerator() {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <CardContent className="space-y-3 pt-6 text-sm">
        <div className="flex justify-end">
          <Button disabled={busy} onClick={async () => {
            setBusy(true)
            const res = await rpc("api_create_access_review")
            setBusy(false)
            if (!res.ok) return toast("error", "Không tạo được", res.error)
            router.push(`/documents/${res.id}`)
          }}>Tạo đợt rà soát</Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function NewDocumentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DocumentForm />
    </Suspense>
  )
}
