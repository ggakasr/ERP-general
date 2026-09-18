"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Banknote, CheckCircle2, Clock3, Package, Pencil, Printer, RefreshCw, UserCheck } from "lucide-react"
import { rpc } from "@/lib/api"
import { DOC_TYPES } from "@/lib/doc-config"
import { useSession } from "@/lib/session"
import type { DocumentDetail } from "@/lib/types"
import { formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs } from "@/components/ui/tabs"
import { ErrorBox, Loading, StatusBadge } from "@/components/shared/bits"
import { ActionBar } from "@/components/docs/action-bar"
import {
  AuditTable, BudgetUsage, ChainCard, GlTable, HandoffList, InfoGrid, LinesTable, MatchResult, MdcPayload,
  SodChecks, StateMachine, StockTable, Timeline,
} from "@/components/docs/doc-sections"

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { me } = useSession()
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("timeline")

  const load = useCallback(async () => {
    const res = await rpc<DocumentDetail>("api_get_document", { p_id: id })
    if (!res.ok) {
      setError((res as any).error)
      return
    }
    setError(null)
    setDetail(res)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" /> Quay lại</Button>
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!detail) return <Loading />

  const doc = detail.document
  const cfg = DOC_TYPES[doc.doc_type]
  const initial = ["DRAFT", "PLANNED"].includes(doc.status)
  const canEdit = initial && doc.created_by === me.user.id && !cfg?.createVia && doc.doc_type !== "ACCESS_REVIEW"

  const tabs = [
    { key: "timeline", label: "Dòng thời gian", count: detail.actions.length },
    { key: "handoffs", label: "Bàn giao & SLA", count: detail.handoffs.length },
    ...(detail.gl_entries ? [{ key: "gl", label: "Sổ cái", count: detail.gl_entries.length }] : []),
    ...(detail.stock_moves ? [{ key: "stock", label: "Sổ kho (lô FIFO)", count: detail.stock_moves.length }] : []),
    ...(detail.sod_checks ? [{ key: "sod", label: "Kiểm tra SoD", count: detail.sod_checks.length }] : []),
    ...(detail.audit ? [{ key: "audit", label: "Audit trail", count: detail.audit.length }] : []),
    { key: "machine", label: "Máy trạng thái" },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Quay lại
        </Button>
        <div className="flex flex-wrap gap-2">
          <Link href={`/trace?id=${doc.id}&tab=money`}><Button variant="outline" size="sm" className="h-8"><Banknote className="mr-1.5 h-3.5 w-3.5" /> Truy vết tiền</Button></Link>
          <Link href={`/trace?id=${doc.id}&tab=goods`}><Button variant="outline" size="sm" className="h-8"><Package className="mr-1.5 h-3.5 w-3.5" /> Truy vết hàng</Button></Link>
          <Link href={`/trace?id=${doc.id}&tab=responsibility`}><Button variant="outline" size="sm" className="h-8"><UserCheck className="mr-1.5 h-3.5 w-3.5" /> Truy vết trách nhiệm</Button></Link>
          {canEdit && (
            <Link href={`/documents/new?edit=${doc.id}`}><Button variant="outline" size="sm" className="h-8"><Pencil className="mr-1.5 h-3.5 w-3.5" /> Sửa</Button></Link>
          )}
          <Button variant="outline" size="sm" className="h-8" onClick={() => window.print()}><Printer className="mr-1.5 h-3.5 w-3.5" /> In / PDF</Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Tải lại"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{doc.doc_type_name} · Luồng {doc.flow_code}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{doc.number}</h1>
          <StatusBadge status={doc.status} className="text-sm" />
          {doc.data?.backorder && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">Backorder</span>}
        </div>
        {doc.title && <p className="mt-1 text-base">{doc.title}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Lập bởi {doc.created_by_name} lúc {formatDateTime(doc.created_at)} · cập nhật {formatDateTime(doc.updated_at)} · phiên bản {doc.version}
        </p>
        <p className="mt-1.5 text-sm">
          {detail.current_owner_label ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-amber-900 ring-1 ring-inset ring-amber-200">
              <Clock3 className="h-3.5 w-3.5 shrink-0" /> Đang chờ xử lý: <b>{detail.current_owner_label}</b>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-900 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Đã kết thúc luồng xử lý — không cần thao tác thêm
            </span>
          )}
        </p>
      </div>

      <div className="print:hidden">
        <ActionBar doc={doc} actions={detail.available_actions} onDone={load} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Thông tin chứng từ</CardTitle></CardHeader>
            <CardContent><InfoGrid doc={doc} /></CardContent>
          </Card>

          {doc.data?.match_result && <MatchResult doc={doc} />}
          <MdcPayload doc={doc} />

          {detail.lines.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Chi tiết ({detail.lines.length} dòng)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto p-0"><LinesTable detail={detail} onChanged={load} /></CardContent>
            </Card>
          )}

          {detail.budget && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Theo dõi sử dụng ngân sách</CardTitle></CardHeader>
              <CardContent><BudgetUsage detail={detail} /></CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="px-4 pt-2"><Tabs items={tabs} value={tab} onChange={setTab} /></div>
              <div className="overflow-x-auto p-4">
                {tab === "timeline" && <Timeline detail={detail} />}
                {tab === "handoffs" && <HandoffList detail={detail} />}
                {tab === "gl" && detail.gl_entries && <GlTable entries={detail.gl_entries} />}
                {tab === "stock" && detail.stock_moves && <StockTable moves={detail.stock_moves} />}
                {tab === "sod" && detail.sod_checks && <SodChecks rows={detail.sod_checks} />}
                {tab === "audit" && detail.audit && <AuditTable rows={detail.audit} />}
                {tab === "machine" && <StateMachine detail={detail} />}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Chuỗi chứng từ (BM-09)</CardTitle></CardHeader>
            <CardContent><ChainCard detail={detail} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bàn giao đang mở</CardTitle></CardHeader>
            <CardContent>
              {detail.handoffs.filter((h) => h.status === "INITIATED").length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có bàn giao đang chờ.</p>
              ) : (
                <HandoffList detail={{ ...detail, handoffs: detail.handoffs.filter((h) => h.status === "INITIATED") }} />
              )}
            </CardContent>
          </Card>
          {cfg?.hint && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">{cfg.hint}</div>
          )}
        </div>
      </div>
    </div>
  )
}
