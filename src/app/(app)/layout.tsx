"use client"

import { useEffect, useState } from "react"
import { SessionProvider } from "@/lib/session"
import { ToastProvider } from "@/components/ui/toast"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { rpc } from "@/lib/api"

function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    rpc<{ ok: boolean; module_counts?: Record<string, number> }>("api_dashboard")
      .then((r) => { if (r.ok && r.module_counts) setCounts(r.module_counts) })
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} counts={counts} />
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMenuOpen(true)} />
        <Breadcrumb />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </SessionProvider>
  )
}
