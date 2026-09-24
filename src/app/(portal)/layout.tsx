"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, Home, LogOut, Package, Ship } from "lucide-react"
import { SessionProvider, useSession } from "@/lib/session"
import { ToastProvider } from "@/components/ui/toast"
import { ChatBubble } from "@/components/cskh/chat-bubble"
import { cn } from "@/lib/utils"

const NAV = [
  { name: "Tổng quan", href: "/portal", icon: Home },
  { name: "Lô hàng", href: "/portal/shipments", icon: Ship },
  { name: "Chứng từ", href: "/portal/documents", icon: FileText },
]

function PortalNav() {
  const path = usePathname()
  const { me, signOut } = useSession()
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b bg-background px-4 py-2 lg:px-6">
      <div className="flex items-center gap-6">
        <Link href="/portal" className="flex items-center gap-2 font-semibold text-primary">
          <Package className="h-5 w-5" />
          <span className="hidden sm:inline">Portal</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = n.href === "/portal" ? path === "/portal" : path.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.name}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-muted-foreground sm:inline">{me.user.full_name}</span>
        <button onClick={signOut} className="flex items-center gap-1 text-muted-foreground hover:text-foreground" title="Đăng xuất">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

function PortalShell({ children }: { children: React.ReactNode }) {
  const { me } = useSession()
  const [widgetKey, setWidgetKey] = useState<string>("")

  useEffect(() => {
    fetch("/api/cskh/widget-key")
      .then(r => r.json())
      .then(d => { if (d.ok && d.widget_key) setWidgetKey(d.widget_key) })
      .catch(() => {})
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <PortalNav />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 lg:p-6">{children}</main>
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        ERP-General Portal
      </footer>
      {widgetKey && (
        <ChatBubble
          widgetKey={widgetKey}
          portalContext={{ customerId: me.user.id, customerName: me.user.full_name }}
        />
      )}
    </div>
  )
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <PortalShell>{children}</PortalShell>
      </ToastProvider>
    </SessionProvider>
  )
}
