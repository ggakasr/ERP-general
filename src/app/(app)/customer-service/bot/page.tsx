"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, BarChart3, Bot, CheckCircle2, Clock, Headphones, Inbox, MessageSquare,
  RotateCcw, Send, Settings2, TrendingUp, User, XCircle,
} from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/shared/bits"

// ─── Types ────────────────────────────────────────────────────
interface SessionRow {
  id: string
  status: string
  channel: string
  source: string
  handoff_reason: string | null
  agent_user_id: string | null
  assigned_name: string | null
  msg_count: number
  ticket_id: string | null
  ticket_number: string | null
  csat: number | null
  created_at: string
  updated_at: string
}

interface Counts {
  awaiting_human: number
  human_serving: number
  serving: number
  closed: number
}

interface MsgRow {
  id: string
  role: string
  content: string | null
  tool_calls: unknown[] | null
  agent_user_id: string | null
  agent_name: string | null
  created_at: string
}

interface TranscriptData {
  session: {
    id: string; status: string; channel: string; source: string
    agent_user_id: string | null; assigned_name: string | null
    handoff_reason: string | null; ticket_id: string | null
    ticket_number: string | null; created_at: string; csat: number | null
  }
  messages: MsgRow[]
}

interface BotConfig {
  persona: string; greeting: string; provider: string; model: string
  handoff_confidence: number; forbidden_promises: string[]
  sensitive_fields: string[]; bot_enabled: boolean; voice_enabled: boolean
  widget_key: string
}

const STATUS_TAB_MAP: Record<string, string> = {
  awaiting_human: "Chờ người",
  human_serving: "Đang xử lý",
  serving: "Bot đang phục vụ",
  closed: "Đã đóng",
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  awaiting_human: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  human_serving: <Headphones className="h-3.5 w-3.5 text-blue-500" />,
  serving: <Bot className="h-3.5 w-3.5 text-green-500" />,
  closed: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />,
}

// ─── Main Page ────────────────────────────────────────────────
export default function BotConsolePage() {
  const { hasRole } = useSession()
  const isAgent = hasRole("CS_AGENT") || hasRole("CS_MANAGER")
  const isManager = hasRole("CS_MANAGER")

  const canSeeCost = hasRole("CS_MANAGER") || hasRole("CEO") || hasRole("CFO") || hasRole("COO")
  const [mainTab, setMainTab] = useState("overview")
  const mainTabs = useMemo(() => {
    const t = [{ key: "overview", label: "Tổng quan" }]
    t.push({ key: "inbox", label: "Hộp thư" })
    t.push({ key: "kb", label: "Tri thức" })
    if (isManager) t.push({ key: "config", label: "Cấu hình bot" })
    return t
  }, [isManager])

  if (!isAgent) {
    return (
      <div className="mx-auto max-w-4xl p-8 text-center text-muted-foreground">
        <p>Bạn cần vai trò CS_AGENT hoặc CS_MANAGER để truy cập trang này.</p>
        <Link href="/customer-service" className="mt-4 text-primary underline">← Quay lại</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Điều hành Bot CSKH"
        actions={[
          <Link key="back" href="/customer-service">
            <Button size="sm" variant="outline" className="h-8"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Dịch vụ KH</Button>
          </Link>,
        ]}
      />
      <Tabs items={mainTabs} value={mainTab} onChange={setMainTab} />
      {mainTab === "overview" && <StatsTab showCost={canSeeCost} />}
      {mainTab === "inbox" && <InboxTab />}
      {mainTab === "kb" && <KBTab />}
      {mainTab === "config" && isManager && <ConfigTab />}
    </div>
  )
}

// ─── Stats types ─────────────────────────────────────────────
interface StatsData {
  from: string; to: string
  totals: { total_sessions: number; total_messages: number; active_sessions: number }
  sessions_by_channel: Array<{ channel: string; count: number }>
  sessions_by_day: Array<{ day: string; count: number }>
  resolution: { total: number; closed: number; bot_resolved: number; handed_off: number }
  handoff_reasons: Array<{ reason: string; count: number }>
  response_time: { avg_minutes: number; median_minutes: number }
  csat: { avg: number; count: number; distribution: Array<{ score: number; count: number }> }
  ticket_sla: { total_tickets: number; closed_tickets: number; avg_resolve_hours: number }
  cost: Array<{ provider: string; model: string; tokens_in: number; tokens_out: number; cost: number }> | null
  rails: { blocked: number }
}

// ─── Stats Tab (Overview) ────────────────────────────────────
function StatsTab({ showCost }: { showCost: boolean }) {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState("30")

  const load = useCallback(async () => {
    setLoading(true)
    const from = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10)
    const to = new Date().toISOString().slice(0, 10)
    const r = await rpc<StatsData>("api_cskh_stats", { p_from: from, p_to: to })
    if (r.ok) setData(r as unknown as StatsData)
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Đang tải thống kê...</p>

  const res = data.resolution
  const botRate = res.closed > 0 ? Math.round((res.bot_resolved / res.closed) * 100) : 0
  const handoffRate = res.total > 0 ? Math.round((res.handed_off / res.total) * 100) : 0

  const StatCard = ({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode }) => (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Khoảng thời gian:</span>
        {["7", "30", "90"].map((d) => (
          <Button key={d} size="sm" variant={range === d ? "default" : "outline"} className="h-7 text-xs"
            onClick={() => setRange(d)}>
            {d} ngày
          </Button>
        ))}
      </div>

      {/* KPI cards row 1 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng phiên" value={data.totals.total_sessions}
          sub={`${data.totals.active_sessions} đang hoạt động`}
          icon={<MessageSquare className="h-3.5 w-3.5" />} />
        <StatCard label="Bot tự giải quyết" value={`${botRate}%`}
          sub={`${res.bot_resolved}/${res.closed} phiên đóng`}
          icon={<Bot className="h-3.5 w-3.5" />} />
        <StatCard label="Tỉ lệ chuyển người" value={`${handoffRate}%`}
          sub={`${res.handed_off} phiên`}
          icon={<Headphones className="h-3.5 w-3.5" />} />
        <StatCard label="CSAT trung bình" value={data.csat.avg || "—"}
          sub={`${data.csat.count} đánh giá`}
          icon={<TrendingUp className="h-3.5 w-3.5" />} />
      </div>

      {/* KPI cards row 2 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Thời gian phản hồi NV" value={`${data.response_time.avg_minutes} phút`}
          sub={`Trung vị: ${data.response_time.median_minutes} phút`}
          icon={<Clock className="h-3.5 w-3.5" />} />
        <StatCard label="Ticket từ bot" value={data.ticket_sla.total_tickets}
          sub={`Đã đóng: ${data.ticket_sla.closed_tickets}, ~${data.ticket_sla.avg_resolve_hours}h`}
          icon={<Inbox className="h-3.5 w-3.5" />} />
        <StatCard label="Tổng tin nhắn" value={data.totals.total_messages}
          icon={<MessageSquare className="h-3.5 w-3.5" />} />
        <StatCard label="Vi phạm rails bị chặn" value={data.rails.blocked}
          icon={<XCircle className="h-3.5 w-3.5" />} />
      </div>

      {/* Sessions by channel + CSAT distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h4 className="mb-3 text-sm font-medium">Phiên theo kênh</h4>
          {data.sessions_by_channel.length === 0 && <p className="text-xs text-muted-foreground">Chưa có dữ liệu</p>}
          {data.sessions_by_channel.map((c) => (
            <div key={c.channel} className="flex items-center justify-between py-1 text-sm">
              <span className="capitalize">{c.channel === "chat" ? "Chat" : c.channel === "voice" ? "Voice" : c.channel}</span>
              <Badge variant="secondary">{c.count}</Badge>
            </div>
          ))}
        </div>
        <div className="rounded-lg border p-4">
          <h4 className="mb-3 text-sm font-medium">Phân bố CSAT</h4>
          {(!data.csat.distribution || data.csat.distribution.length === 0) && <p className="text-xs text-muted-foreground">Chưa có đánh giá</p>}
          <div className="space-y-1">
            {(data.csat.distribution || []).map((d) => {
              const maxCount = Math.max(...(data.csat.distribution || []).map(x => x.count), 1)
              return (
                <div key={d.score} className="flex items-center gap-2 text-sm">
                  <span className="w-12 text-right">{"★".repeat(d.score)}</span>
                  <div className="h-4 flex-1 rounded bg-muted">
                    <div className="h-4 rounded bg-amber-400" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                  </div>
                  <span className="w-8 text-xs text-muted-foreground">{d.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top handoff reasons */}
      <div className="rounded-lg border p-4">
        <h4 className="mb-3 text-sm font-medium">Lý do chuyển người hàng đầu</h4>
        {data.handoff_reasons.length === 0 && <p className="text-xs text-muted-foreground">Chưa có dữ liệu</p>}
        <div className="space-y-1">
          {data.handoff_reasons.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-sm">
              <span className="truncate">{r.reason}</span>
              <Badge variant="outline">{r.count}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions by day */}
      <div className="rounded-lg border p-4">
        <h4 className="mb-3 text-sm font-medium">Phiên theo ngày</h4>
        {data.sessions_by_day.length === 0 && <p className="text-xs text-muted-foreground">Chưa có dữ liệu</p>}
        <div className="flex items-end gap-1" style={{ height: "120px" }}>
          {data.sessions_by_day.map((d) => {
            const max = Math.max(...data.sessions_by_day.map(x => x.count), 1)
            return (
              <div key={d.day} className="group relative flex-1" title={`${d.day}: ${d.count}`}>
                <div className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }} />
              </div>
            )
          })}
        </div>
        {data.sessions_by_day.length > 0 && (
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{data.sessions_by_day[0]?.day}</span>
            <span>{data.sessions_by_day[data.sessions_by_day.length - 1]?.day}</span>
          </div>
        )}
      </div>

      {/* AI Cost (only for managers/execs) */}
      {showCost && data.cost && (
        <div className="rounded-lg border p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4" /> Chi phí AI
          </h4>
          {data.cost.length === 0 && <p className="text-xs text-muted-foreground">Chưa có dữ liệu usage</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Nhà cung cấp</th>
                  <th className="py-2 text-left font-medium">Model</th>
                  <th className="py-2 text-right font-medium">Tokens vào</th>
                  <th className="py-2 text-right font-medium">Tokens ra</th>
                  <th className="py-2 text-right font-medium">Chi phí ước tính</th>
                </tr>
              </thead>
              <tbody>
                {data.cost.map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{c.provider}</td>
                    <td className="py-2 font-mono text-xs">{c.model}</td>
                    <td className="py-2 text-right">{c.tokens_in?.toLocaleString("vi-VN")}</td>
                    <td className="py-2 text-right">{c.tokens_out?.toLocaleString("vi-VN")}</td>
                    <td className="py-2 text-right font-medium">
                      {typeof c.cost === "number" ? `$${c.cost.toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Inbox Tab ────────────────────────────────────────────────
function InboxTab() {
  const [statusFilter, setStatusFilter] = useState("awaiting_human")
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [counts, setCounts] = useState<Counts>({ awaiting_human: 0, human_serving: 0, serving: 0, closed: 0 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await rpc<{ sessions: SessionRow[]; counts: Counts }>("api_cskh_staff_sessions", { p_status: statusFilter })
    if (r.ok) { setSessions(r.sessions || []); setCounts(r.counts) }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { setLoading(true); load() }, [load])
  useEffect(() => { const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  if (selected) return <SessionDetail id={selected} onBack={() => { setSelected(null); load() }} />

  const tabs = Object.entries(STATUS_TAB_MAP).map(([key, label]) => ({
    key, label, count: counts[key as keyof Counts] || 0,
  }))

  return (
    <div className="space-y-3">
      <Tabs items={tabs} value={statusFilter} onChange={(k) => { setStatusFilter(k); setSelected(null) }} />
      {loading && <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>}
      {!loading && sessions.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Không có phiên nào.</p>
      )}
      <div className="space-y-2">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="mt-0.5">{STATUS_ICON[s.status] || <MessageSquare className="h-3.5 w-3.5" />}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.ticket_number || `Phiên ${s.id.slice(0, 8)}`}</span>
                <Badge variant="outline" className="text-[10px]">{s.channel}</Badge>
                {s.csat && <span className="text-xs text-amber-500">{"★".repeat(s.csat)}</span>}
              </div>
              {s.handoff_reason && <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.handoff_reason}</p>}
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                {s.assigned_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{s.assigned_name}</span>}
                <span>{s.msg_count} tin nhắn</span>
                <span>{new Date(s.updated_at).toLocaleString("vi-VN")}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Session Detail (Transcript + Actions) ────────────────────
function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { me } = useSession()
  const [data, setData] = useState<TranscriptData | null>(null)
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await rpc<TranscriptData>("api_cskh_staff_transcript", { p_session_id: id })
    if (r.ok) setData(r)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])

  if (!data) return <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>

  const s = data.session
  const isMine = s.agent_user_id === me.user.id
  const canReply = s.status === "human_serving" && isMine
  const canClaim = s.status === "awaiting_human" || (s.status === "human_serving" && !isMine)

  async function handleClaim() {
    setBusy(true)
    await rpc("api_cskh_claim_session", { p_session_id: id })
    await load()
    setBusy(false)
  }

  async function handleReply() {
    if (!reply.trim()) return
    setBusy(true)
    await rpc("api_cskh_staff_reply", { p_session_id: id, p_content: reply.trim() })
    setReply("")
    await load()
    setBusy(false)
  }

  async function handleReturn() {
    setBusy(true)
    await rpc("api_cskh_return_to_bot", { p_session_id: id })
    await load()
    setBusy(false)
  }

  async function handleClose() {
    setBusy(true)
    await rpc("api_cskh_close_session", { p_session_id: id })
    await load()
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Quay lại</Button>
        <span className="text-sm font-medium">{s.ticket_number || `Phiên ${s.id.slice(0, 8)}`}</span>
        <Badge variant="outline">{STATUS_TAB_MAP[s.status] || s.status}</Badge>
        {s.assigned_name && <span className="text-xs text-muted-foreground">Nhân viên: {s.assigned_name}</span>}
        {s.handoff_reason && <span className="text-xs text-muted-foreground">Lý do: {s.handoff_reason}</span>}
      </div>

      {/* Transcript */}
      <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-lg border p-3">
        {data.messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "" : "flex-row-reverse"}`}>
            <div className="mt-0.5 shrink-0">
              {m.role === "user" ? <User className="h-4 w-4 text-muted-foreground" />
                : m.role === "agent" ? <Headphones className="h-4 w-4 text-blue-500" />
                : <Bot className="h-4 w-4 text-green-500" />}
            </div>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "bg-muted" : m.role === "agent" ? "bg-blue-50 dark:bg-blue-950" : "bg-green-50 dark:bg-green-950"
            }`}>
              {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
              {m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-muted-foreground">
                    {m.tool_calls.length} tool call(s)
                  </summary>
                  <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">
                    {JSON.stringify(m.tool_calls, null, 2)}
                  </pre>
                </details>
              )}
              {m.agent_name && <span className="mt-0.5 block text-[10px] text-muted-foreground">{m.agent_name}</span>}
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                {new Date(m.created_at).toLocaleTimeString("vi-VN")}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {canClaim && (
          <Button size="sm" onClick={handleClaim} disabled={busy}>
            <Inbox className="mr-1 h-3.5 w-3.5" /> Nhận xử lý
          </Button>
        )}
        {canReply && (
          <div className="flex flex-1 items-center gap-2">
            <input
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
              placeholder="Nhập tin nhắn trả lời..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReply()}
            />
            <Button size="sm" onClick={handleReply} disabled={busy || !reply.trim()}>
              <Send className="mr-1 h-3.5 w-3.5" /> Gửi
            </Button>
          </div>
        )}
        {isMine && s.status === "human_serving" && (
          <>
            <Button size="sm" variant="outline" onClick={handleReturn} disabled={busy}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Trả lại bot
            </Button>
            <Button size="sm" variant="outline" onClick={handleClose} disabled={busy}>
              <XCircle className="mr-1 h-3.5 w-3.5" /> Đóng phiên
            </Button>
          </>
        )}
        {s.status !== "closed" && !isMine && s.status !== "awaiting_human" && (
          <Button size="sm" variant="outline" onClick={handleClose} disabled={busy}>
            <XCircle className="mr-1 h-3.5 w-3.5" /> Đóng phiên
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── KB Tab ───────────────────────────────────────────────────
function KBTab() {
  const { hasRole } = useSession()
  const isManager = hasRole("CS_MANAGER")
  const [articles, setArticles] = useState<Array<{
    id: string; number: string; title: string; status: string
    data: { topic?: string; body?: string }; created_by_name: string
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rpc<{ documents: typeof articles }>("api_list_documents", { p_doc_types: ["KB_ARTICLE"] }).then((r) => {
      if (r.ok) setArticles(r.documents || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Bài viết tri thức (KB_ARTICLE)</h3>
        <Link href="/documents/new?type=KB_ARTICLE">
          <Button size="sm" className="h-8">+ Tạo bài viết</Button>
        </Link>
      </div>
      {articles.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Chưa có bài viết nào.</p>
      )}
      <div className="space-y-2">
        {articles.map((a) => (
          <Link key={a.id} href={`/documents/${a.id}`} className="block rounded-lg border p-3 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{a.number}</span>
              <span className="text-sm font-medium">{a.title}</span>
              <Badge variant={a.status === "PUBLISHED" ? "default" : a.status === "DRAFT" ? "secondary" : "outline"} className="text-[10px]">
                {a.status}
              </Badge>
            </div>
            {a.data?.topic && <span className="mt-1 text-xs text-muted-foreground">Chủ đề: {a.data.topic}</span>}
            <span className="mt-1 block text-xs text-muted-foreground">Soạn bởi: {a.created_by_name}</span>
          </Link>
        ))}
      </div>
      {isManager && (
        <p className="text-xs text-muted-foreground">
          TP CSKH có thể đăng/lưu trữ bài viết. Mở bài viết → thay đổi trạng thái (SoD: không đăng bài mình soạn).
        </p>
      )}
    </div>
  )
}

// ─── Config Tab (CS_MANAGER only) ─────────────────────────────
function ConfigTab() {
  const [config, setConfig] = useState<BotConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    rpc<{ config: BotConfig }>("api_cskh_config_get").then((r) => {
      // Older rows saved the OpenAI adapter as "openai"; show it under its current value.
      if (r.ok && r.config) setConfig({ ...r.config, provider: r.config.provider === "openai" ? "openai-compat" : r.config.provider })
    })
  }, [])

  async function save() {
    if (!config) return
    setSaving(true); setSaved(false)
    const r = await rpc("api_cskh_config_set", {
      p_changes: {
        persona: config.persona, greeting: config.greeting,
        provider: config.provider, model: config.model,
        handoff_confidence: config.handoff_confidence,
        bot_enabled: config.bot_enabled, voice_enabled: config.voice_enabled,
      },
    })
    setSaving(false)
    if (r.ok) setSaved(true)
  }

  if (!config) return <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )

  const inputCls = "h-9 w-full rounded-md border bg-background px-3 text-sm"

  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên/giọng điệu bot (persona)">
          <textarea className={`${inputCls} h-20`} value={config.persona} onChange={(e) => setConfig({ ...config, persona: e.target.value })} />
        </Field>
        <Field label="Lời chào">
          <textarea className={`${inputCls} h-20`} value={config.greeting} onChange={(e) => setConfig({ ...config, greeting: e.target.value })} />
        </Field>
        <Field label="Nhà cung cấp AI">
          <select className={inputCls} value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })}>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai-compat">OpenAI Compatible (DeepSeek/Gemini/OpenAI)</option>
            <option value="mock">Mock (Test)</option>
          </select>
        </Field>
        <Field label="Model">
          <input className={inputCls} value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} />
        </Field>
        <Field label="Ngưỡng handoff (0–1)">
          <input type="number" className={inputCls} min={0} max={1} step={0.1}
            value={config.handoff_confidence}
            onChange={(e) => setConfig({ ...config, handoff_confidence: Number(e.target.value) })} />
        </Field>
        <Field label="Widget Key">
          <input className={inputCls} value={config.widget_key} readOnly />
        </Field>
      </div>

      <Field label="Từ cấm hứa (mỗi dòng 1 từ/cụm)">
        <textarea className={`${inputCls} h-20`}
          value={(config.forbidden_promises || []).join("\n")}
          onChange={(e) => setConfig({ ...config, forbidden_promises: e.target.value.split("\n").filter(Boolean) })} />
      </Field>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.bot_enabled}
            onChange={(e) => setConfig({ ...config, bot_enabled: e.target.checked })} />
          Bật bot
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.voice_enabled}
            onChange={(e) => setConfig({ ...config, voice_enabled: e.target.checked })} />
          Bật voice
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          <Settings2 className="mr-1 h-3.5 w-3.5" /> {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
        {saved && <span className="text-xs text-green-600">Đã lưu!</span>}
      </div>
    </div>
  )
}
