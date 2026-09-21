"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, CheckSquare, LayoutDashboard, User } from "lucide-react"
import { rpc } from "@/lib/api"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badgeKey?: "tasks" | "notif"
}

const ITEMS: NavItem[] = [
  { label: "Việc của tôi", href: "/tasks",         icon: CheckSquare, badgeKey: "tasks" },
  { label: "Tổng quan",   href: "/dashboard",      icon: LayoutDashboard },
  { label: "Thông báo",   href: "/notifications",  icon: Bell,        badgeKey: "notif" },
  { label: "Tài khoản",   href: "/me",             icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const [taskCount, setTaskCount] = useState(0)
  const [notifCount, setNotifCount] = useState(0)

  useEffect(() => {
    rpc<{ ok: boolean; count?: number }>("api_inbox")
      .then((r) => { if (r.ok && r.count) setTaskCount(r.count as number) })
      .catch(() => {})

    rpc<{ ok: boolean; unread?: number }>("api_notifications")
      .then((r) => { if (r.ok && r.unread) setNotifCount(r.unread as number) })
      .catch(() => {})
  }, [pathname])

  const badge = (key?: "tasks" | "notif") => {
    const n = key === "tasks" ? taskCount : key === "notif" ? notifCount : 0
    if (!n) return null
    return (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
        {n > 99 ? "99+" : n}
      </span>
    )
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-card/95 backdrop-blur-sm lg:hidden"
         style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/")
        const Icon = item.icon
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="relative">
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              {badge(item.badgeKey)}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
