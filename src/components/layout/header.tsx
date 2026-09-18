"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, LogOut, Menu, Search, Users } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { DocRef } from "@/lib/types"
import { cn, formatDateTime, initials } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/bits"
import { SwitchAccountDialog } from "@/components/layout/switch-account-dialog"

interface Notification { id: string; title: string; body: string | null; document_id: string | null; is_read: boolean; created_at: string }

export function Header({ onMenu }: { onMenu?: () => void }) {
  const router = useRouter()
  const { me, unread, setUnread, signOut } = useSession()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<DocRef[]>([])
  const [openSearch, setOpenSearch] = useState(false)
  const [openBell, setOpenBell] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const [openSwitch, setOpenSwitch] = useState(false)
  const [notes, setNotes] = useState<Notification[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      const res = await rpc<{ ok: boolean; rows: DocRef[] }>("api_search", { p_q: q })
      if (res.ok) setResults(res.rows)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpenSearch(false)
        setOpenBell(false)
        setOpenUser(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  // poll notifications every 60s; best-effort kick the email outbox too (real cron
  // covers production — this just keeps local dev / no-cron deployments moving)
  useEffect(() => {
    const tick = async () => {
      const res = await rpc<{ ok: boolean; unread: number; rows: Notification[] }>("api_notifications", { p_limit: 20 })
      if (res.ok) {
        setUnread(res.unread)
        setNotes(res.rows)
      }
      fetch("/api/notifications/flush", { method: "POST" }).catch(() => {})
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [setUnread])

  const markAllRead = async () => {
    await rpc("api_mark_notifications_read", { p_ids: null })
    setUnread(0)
    setNotes((n) => n.map((x) => ({ ...x, is_read: true })))
  }

  const user = me.user

  return (
    <header ref={boxRef} className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 lg:px-6">
      <button onClick={onMenu} className="rounded-md p-2 hover:bg-accent lg:hidden" aria-label="Mở menu">
        <Menu className="h-4 w-4" />
      </button>
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpenSearch(true) }}
          onFocus={() => setOpenSearch(true)}
          placeholder="Tìm chứng từ theo số hoặc diễn giải (vd: PO-202607)…"
          className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {openSearch && results.length > 0 && (
          <div className="absolute left-0 right-0 top-10 z-40 max-h-80 overflow-y-auto rounded-lg border bg-card p-1 shadow-lg">
            {results.map((r) => (
              <button
                key={r.id}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => { setOpenSearch(false); setQ(""); router.push(`/documents/${r.id}`) }}
              >
                <span className="font-mono text-xs text-primary">{r.number}</span>
                <span className="flex-1 truncate text-muted-foreground">{r.title}</span>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 md:inline">
          Supabase · {user.branch_code}
        </span>

        <div className="relative">
          <button
            onClick={() => { setOpenBell(!openBell); setOpenUser(false) }}
            className="relative rounded-md p-2 hover:bg-accent"
            aria-label="Thông báo"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {openBell && (
            <div className="absolute right-0 top-11 z-40 w-96 rounded-lg border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-medium">Thông báo</p>
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">Đánh dấu đã đọc</button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notes.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Chưa có thông báo</p>}
                {notes.map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      setOpenBell(false)
                      if (!n.is_read) {
                        await rpc("api_mark_notifications_read", { p_ids: [n.id] })
                        setUnread(Math.max(0, unread - 1))
                        setNotes((x) => x.map((y) => (y.id === n.id ? { ...y, is_read: true } : y)))
                      }
                      if (n.document_id) router.push(`/documents/${n.document_id}`)
                    }}
                    className={cn("block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-accent", !n.is_read && "bg-primary/5")}
                  >
                    <p className={cn("text-sm", !n.is_read && "font-medium")}>{n.title}</p>
                    {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => { setOpenUser(!openUser); setOpenBell(false) }}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(user.full_name)}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-medium">{user.full_name}</span>
              <span className="block text-[11px] text-muted-foreground">{user.position}</span>
            </span>
          </button>
          {openUser && (
            <div className="absolute right-0 top-11 z-40 w-80 rounded-lg border bg-card p-3 text-sm shadow-lg">
              <p className="font-medium">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">{user.email} · {user.employee_code}</p>
              <p className="mt-2 text-xs text-muted-foreground">{user.department_name} — {user.branch_name}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {me.roles.map((r) => (
                  <span key={r.code} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{r.name}</span>
                ))}
              </div>
              <Link href="/me" onClick={() => setOpenUser(false)} className="mt-3 block text-xs text-primary hover:underline">
                Xem quyền hạn & phạm vi dữ liệu của tôi →
              </Link>
              <button
                onClick={() => { setOpenUser(false); setOpenSwitch(true) }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 hover:bg-accent"
              >
                <Users className="h-4 w-4" /> Chuyển tài khoản demo
              </button>
              <button onClick={signOut} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 hover:bg-accent">
                <LogOut className="h-4 w-4" /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
      <SwitchAccountDialog open={openSwitch} onClose={() => setOpenSwitch(false)} />
    </header>
  )
}
