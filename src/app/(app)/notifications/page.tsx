"use client"

import { useEffect, useState, useCallback } from "react"
import { Bell, BellOff, CheckCheck } from "lucide-react"
import { rpc } from "@/lib/api"
import { cn, formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/shared/bits"
import { Skeleton } from "@/components/ui/skeleton"
import { PushSubscribeButton } from "@/components/push/push-subscribe-button"

interface Notification {
  id: string
  title: string
  body: string | null
  url: string | null
  is_read: boolean
  created_at: string
}

interface NotifResult {
  ok: boolean
  unread: number
  rows: Notification[]
}

export default function NotificationsPage() {
  const [data, setData] = useState<NotifResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await rpc<NotifResult>("api_notifications", { p_limit: 50 })
    if (r.ok) setData(r)
    else setError(r.error ?? "Lỗi tải thông báo")
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markAllRead() {
    await rpc("api_mark_notifications_read")
    load()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Thông báo" />
        <div className="flex items-center gap-2">
          <PushSubscribeButton />
          {data && data.unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
              <CheckCheck className="h-3.5 w-3.5" />
              Đánh dấu đã đọc
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {!loading && !error && data && (
        data.rows.length === 0 ? (
          <EmptyState>
            <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            Không có thông báo nào.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border bg-card shadow-sm">
            {data.rows.map((n) => (
              <li key={n.id}
                className={cn("px-4 py-3 transition-colors", n.is_read ? "opacity-60" : "bg-primary/5")}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-muted-foreground/30" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
