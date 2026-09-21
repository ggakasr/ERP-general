"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Banknote, ChevronRight, Package, Search, ShieldAlert, UserCheck } from "lucide-react"
import { rpc } from "@/lib/api"
import { MOVE_LABELS } from "@/lib/labels"
import type { DocRef } from "@/lib/types"
import { cn, formatDateTime, formatMoney, formatNumber } from "@/lib/utils"
import { Input } from "@/components/ui/form"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Tabs } from "@/components/ui/tabs"
import { CheckList, DocLink, EmptyState, ErrorBox, Loading, Masked, PageHeader, SlaBadge, SodBadge, StatusBadge } from "@/components/shared/bits"

interface TraceNode {
  id: string; number: string; doc_type: string; doc_type_name: string; flow_code: string; status: string; title: string | null
  doc_date: string; created_at: string; partner_name: string | null; created_by_name: string; is_start: boolean; can_view: boolean
  amount: number | null; paid_amount: number | null
}
interface Edge { parent_id: string; child_id: string; link_type: string }
interface Check { label: string; document_number?: string; expected?: number; actual?: number | string; ok: boolean }

const LINK_LABEL: Record<string, string> = { SOURCE: "", REFERENCE: "tham chiếu ngân sách", EXCEPTION: "ngoại lệ", DEPRECIATION: "khấu hao" }

function ChainTree({ nodes, edges, render }: { nodes: TraceNode[]; edges: Edge[]; render: (n: TraceNode) => React.ReactNode }) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const children = useMemo(() => {
    const m = new Map<string, Edge[]>()
    edges.forEach((e) => m.set(e.parent_id, [...(m.get(e.parent_id) || []), e]))
    return m
  }, [edges])
  const roots = nodes.filter((n) => !edges.some((e) => e.child_id === n.id))
  const seen = new Set<string>()
  const renderNode = (n: TraceNode, depth: number, linkType?: string): React.ReactNode => {
    if (seen.has(n.id)) return null
    seen.add(n.id)
    const kids = (children.get(n.id) || []).map((e) => ({ e, node: byId.get(e.child_id) })).filter((x) => x.node)
    return (
      <div key={n.id}>
        <div className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2", n.is_start ? "border-primary bg-primary/5" : "bg-card")} style={{ marginLeft: depth * 22 }}>
          {depth > 0 && <ChevronRight className="-ml-1 h-3.5 w-3.5 text-muted-foreground" />}
          {linkType && LINK_LABEL[linkType] && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{LINK_LABEL[linkType]}</span>}
          {render(n)}
        </div>
        {kids.length > 0 && <div className="mt-1.5 space-y-1.5">{kids.map((k) => renderNode(k.node!, depth + 1, k.e.link_type))}</div>}
      </div>
    )
  }
  return <div className="space-y-1.5">{roots.map((r) => renderNode(r, 0))}</div>
}

function NodeHead({ n }: { n: TraceNode }) {
  return (
    <>
      <DocLink id={n.id} number={n.number} canView={n.can_view} className="text-sm" />
      <span className="text-xs text-muted-foreground">{n.doc_type_name}</span>
      <StatusBadge status={n.status} className="text-[10px]" />
      {n.is_start && <span className="rounded bg-primary px-1.5 text-[10px] text-primary-foreground">điểm bắt đầu</span>}
    </>
  )
}

function MoneyTrace({ id }: { id: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => { setData(null); setError(null); rpc("api_trace_money", { p_id: id }).then((r) => (r.ok ? setData(r) : setError(r.error || "Lỗi"))) }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!data) return <SkeletonTable rows={4} cols={4} />
  const nodes: TraceNode[] = data.nodes
  const glByDoc = new Map<string, any>((data.gl || []).map((g: any) => [g.document_id, g]))
  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Đường tiền ngược về nguồn (Payment → Invoice → PO → PR → Budget)</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          {data.path.map((p: any, i: number) => (
            <span key={p.id} className="flex items-center gap-1.5">
              {i > 0 && <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              <DocLink id={p.id} number={p.number} canView={nodes.find((n) => n.id === p.id)?.can_view} />
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Chuỗi chứng từ và dòng tiền</h3>
        <ChainTree nodes={nodes} edges={data.edges} render={(n) => (
          <>
            <NodeHead n={n} />
            <span className="ml-auto flex flex-wrap items-center gap-3 text-xs">
              {n.partner_name && <span className="text-muted-foreground">{n.partner_name}</span>}
              {n.can_view && (n.amount === null ? <Masked /> : Number(n.amount) !== 0 && <span className="font-medium tabular-nums">{formatMoney(n.amount)}</span>)}
              {n.paid_amount !== null && n.paid_amount !== undefined && <span className="tabular-nums text-success">đã TT {formatMoney(n.paid_amount)}</span>}
              {glByDoc.has(n.id) && <span className="rounded bg-info-subtle px-1.5 text-info">{glByDoc.get(n.id).entries.length} bút toán</span>}
            </span>
          </>
        )} />
      </div>

      {data.gl ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Bút toán sổ cái theo từng chứng từ</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.gl.map((g: any) => (
              <div key={g.document_id} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs">
                  <DocLink id={g.document_id} number={g.number} /><span className="text-muted-foreground">{g.doc_type}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {g.entries.map((e: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1 font-mono">{e.account_code}</td>
                        <td className="px-1 py-1 text-muted-foreground">{e.account_name}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{Number(e.debit) ? formatMoney(e.debit) : ""}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{Number(e.credit) ? formatMoney(e.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Vai trò của bạn không có quyền xem sổ cái — chỉ hiển thị chuỗi chứng từ.</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Kiểm tra tính nhất quán số tiền</h3>
        <CheckList checks={data.checks as Check[]} />
      </div>
    </div>
  )
}

function MoveTree({ node, depth, dir }: { node: any; depth: number; dir: "up" | "down" }) {
  const next = dir === "up" ? node.sources : node.consumers
  const masked = node._masked?.includes("unit_cost")
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs" style={{ marginLeft: depth * 22 }}>
        {depth > 0 && <ChevronRight className="-ml-1 h-3.5 w-3.5 text-muted-foreground" />}
        <span className={cn("rounded px-1.5 py-0.5 font-medium", Number(node.qty) < 0 ? "bg-destructive/10 text-destructive" : "bg-success-subtle text-success")}>
          {MOVE_LABELS[node.move_type] || node.move_type}
        </span>
        <DocLink id={node.document_id} number={node.document_number} />
        <span>{node.product_code} · <b className="tabular-nums">{formatNumber(Math.abs(node.qty))}</b> {node.unit}</span>
        <span className="text-muted-foreground">{node.warehouse_name}</span>
        {!masked && <span className="tabular-nums text-muted-foreground">@ {formatMoney(node.unit_cost)}</span>}
        {Number(node.qty) > 0 && <span className="text-muted-foreground">còn {formatNumber(node.remaining_qty)}</span>}
        {node.lineage?.length > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            ← {node.lineage.map((l: any, i: number) => <span key={l.id}>{i > 0 && " ← "}<DocLink id={l.id} number={l.number} className="text-[11px]" /></span>)}
          </span>
        )}
        {node.partner_name && <span className="text-muted-foreground">· {node.partner_name}</span>}
        <span className="ml-auto text-muted-foreground">{formatDateTime(node.created_at)}</span>
      </div>
      {next?.length > 0 && <div className="mt-1 space-y-1">{next.map((c: any, i: number) => <MoveTree key={i} node={c} depth={depth + 1} dir={dir} />)}</div>}
    </div>
  )
}

function GoodsTrace({ id }: { id: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => { setData(null); setError(null); rpc("api_trace_goods", { p_id: id }).then((r) => (r.ok ? setData(r) : setError(r.error || "Lỗi"))) }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!data) return <SkeletonTable rows={4} cols={4} />
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Chuỗi chứng từ hàng hóa</h3>
        <ChainTree nodes={data.nodes} edges={data.edges} render={(n) => <><NodeHead n={n} />{n.partner_name && <span className="ml-auto text-xs text-muted-foreground">{n.partner_name}</span>}</>} />
      </div>
      {data.restricted ? (
        <EmptyState>Vai trò của bạn không có quyền xem sổ kho — không hiển thị lô hàng.</EmptyState>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-semibold">Nguồn gốc hàng đã xuất (truy ngược theo lô FIFO)</h3>
            {data.upstream.length === 0 ? <EmptyState>Chuỗi này chưa có hàng xuất kho.</EmptyState> : (
              <div className="space-y-3">{data.upstream.map((u: any, i: number) => <MoveTree key={i} node={u} depth={0} dir="up" />)}</div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Hàng đã nhập đi đâu (truy xuôi)</h3>
            <p className="mb-2 text-xs text-muted-foreground">Lô nhập → được xuất cho sản xuất / chuyển kho / giao khách</p>
            {data.downstream.length === 0 ? <EmptyState>Chuỗi này chưa có hàng nhập kho.</EmptyState> : (
              <div className="space-y-3">{data.downstream.map((u: any, i: number) => <MoveTree key={i} node={u} depth={0} dir="down" />)}</div>
            )}
          </div>
        </>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Kiểm tra số lượng (không có hàng “ảo”)</h3>
        <CheckList checks={data.checks} />
      </div>
    </div>
  )
}

function ResponsibilityTrace({ id }: { id: string }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => { setData(null); setError(null); rpc("api_trace_responsibility", { p_id: id }).then((r) => (r.ok ? setData(r) : setError(r.error || "Lỗi"))) }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} onRetry={load} />
  if (!data) return <SkeletonTable rows={4} cols={5} />
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Những người tham gia chuỗi giao dịch & vai trò SoD</h3>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.people.map((p: any) => (
            <div key={p.user_id} className={cn("rounded-lg border bg-card p-3", p.conflict && "border-destructive/40 bg-destructive/10")}>
              <p className="text-sm font-medium">{p.user_name}</p>
              <p className="text-xs text-muted-foreground">{p.position} · {p.department_name} · {p.action_count} thao tác</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.sod_roles.length ? p.sod_roles.map((r: string) => <SodBadge key={r} role={r} />) : <span className="text-xs text-muted-foreground">Không giữ vai trò SoD</span>}
              </div>
              {p.conflict && <p className="mt-1 flex items-center gap-1 text-xs text-red-700"><ShieldAlert className="h-3 w-3" /> Giữ vai trò xung đột</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Hành động → Người dùng → Vai trò → Phòng ban → Chủ sở hữu quy trình</h3>
        {data.documents.map((d: any) => (
          <div key={d.document.id} className={cn("rounded-lg border bg-card", d.document.is_start && "border-primary")}>
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <DocLink id={d.document.id} number={d.document.number} canView={d.document.can_view} />
              <span className="text-xs text-muted-foreground">{d.document.doc_type_name}</span>
              <StatusBadge status={d.document.status} className="text-[10px]" />
              <span className="ml-auto text-xs">
                {d.owner ? (
                  <>Chủ sở hữu ({d.owner.flow_code} {d.owner.process}): <b>{d.owner.owner_name}</b> — {d.owner.owner_position}{d.owner.deputy_name ? ` · dự phòng ${d.owner.deputy_name}` : ""}</>
                ) : <span className="text-red-700">Chưa có chủ sở hữu</span>}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="px-3 py-1.5">Thời điểm</th><th className="px-3 py-1.5">Hành động</th><th className="px-3 py-1.5">Người dùng</th>
                  <th className="px-3 py-1.5">Vai trò hệ thống</th><th className="px-3 py-1.5">Phòng ban</th><th className="px-3 py-1.5">Vai trò SoD</th>
                </tr></thead>
                <tbody>
                  {d.actions.map((a: any) => (
                    <tr key={a.id} className={cn("border-b last:border-0", a.highlight && "bg-primary/10")}>
                      <td className="whitespace-nowrap px-3 py-1.5">{formatDateTime(a.created_at)}</td>
                      <td className="px-3 py-1.5">{a.label}{a.comment ? <span className="block text-muted-foreground">“{a.comment}”</span> : null}</td>
                      <td className="px-3 py-1.5"><span className="font-medium">{a.user_name}</span> <span className="text-muted-foreground">{a.employee_code} · {a.position}</span></td>
                      <td className="px-3 py-1.5">{(a.roles || []).filter((r: any) => r.code !== "EMPLOYEE").map((r: any) => r.name).join(", ")}</td>
                      <td className="px-3 py-1.5">{a.department_name} · {a.branch_code}</td>
                      <td className="px-3 py-1.5"><SodBadge role={a.sod_role} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.handoffs.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t px-3 py-2 text-xs">
                {d.handoffs.map((h: any, i: number) => (
                  <span key={i} className="flex items-center gap-1 rounded bg-muted/50 px-2 py-0.5">
                    {h.from_department} → {h.to_department || h.to_role} · {h.expected_action} <SlaBadge status={h.sla_status} />
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Kiểm tra trách nhiệm</h3>
        <CheckList checks={data.checks} />
      </div>
    </div>
  )
}

function TraceView() {
  const params = useSearchParams()
  const router = useRouter()
  const id = params.get("id")
  const tab = params.get("tab") || "money"
  const [q, setQ] = useState("")
  const [results, setResults] = useState<DocRef[]>([])
  const [current, setCurrent] = useState<DocRef | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const t = setTimeout(() => rpc<{ rows: DocRef[] }>("api_search", { p_q: q }).then((r) => r.ok && setResults(r.rows)), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (!id) return setCurrent(null)
    rpc<any>("api_get_document", { p_id: id }).then((r) => {
      if (r.ok) setCurrent({ id, number: r.document.number, doc_type: r.document.doc_type, doc_type_name: r.document.doc_type_name, status: r.document.status, title: r.document.title, link_type: null, created_at: r.document.created_at, can_view: true })
    })
  }, [id])

  const go = (docId: string, t = tab) => router.push(`/trace?id=${docId}&tab=${t}`)

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader title="Truy vết chứng từ" />
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhập số chứng từ: PAY-202607-00001, DN-202607-00001, SI-202609…" className="pl-8" />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-card p-1 shadow-lg">
            {results.map((r) => (
              <button key={r.id} onClick={() => { setResults([]); setQ(""); go(r.id) }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                <span className="font-mono text-xs text-primary">{r.number}</span>
                <span className="flex-1 truncate text-muted-foreground">{r.title}</span>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {!id ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Tìm chứng từ ở ô tìm kiếm bên trên để bắt đầu truy vết theo một trong ba hướng:</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { icon: Banknote, title: "Theo tiền", desc: "Payment → Invoice → PO → PR → Ngân sách" },
              { icon: Package, title: "Theo hàng", desc: "Phiếu xuất → Tồn kho → GRN → PO → PR" },
              { icon: UserCheck, title: "Theo trách nhiệm", desc: "Hành động → Người dùng → Vai trò → Phòng ban" },
            ].map((c) => (
              <div key={c.title} className="rounded-lg border bg-card p-4">
                <c.icon className="h-5 w-5 text-primary" />
                <p className="mt-2 font-medium">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {current && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">Điểm bắt đầu:</span>
              <DocLink id={current.id} number={current.number} />
              <span className="text-muted-foreground">{current.doc_type_name}</span>
              <StatusBadge status={current.status} />
              <span className="truncate text-muted-foreground">{current.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">Nhấp số chứng từ trong cây để mở; hoặc tìm chứng từ khác ở ô tìm kiếm.</span>
            </div>
          )}
          <Tabs
            items={[
              { key: "money", label: <span className="flex items-center gap-1.5"><Banknote className="h-4 w-4" /> Theo tiền</span> },
              { key: "goods", label: <span className="flex items-center gap-1.5"><Package className="h-4 w-4" /> Theo hàng</span> },
              { key: "responsibility", label: <span className="flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> Theo trách nhiệm</span> },
            ]}
            value={tab}
            onChange={(t) => go(id, t)}
          />
          {tab === "money" && <MoneyTrace id={id} />}
          {tab === "goods" && <GoodsTrace id={id} />}
          {tab === "responsibility" && <ResponsibilityTrace id={id} />}
        </>
      )}
    </div>
  )
}

export default function TracePage() {
  return (
    <Suspense fallback={<Loading />}>
      <TraceView />
    </Suspense>
  )
}
