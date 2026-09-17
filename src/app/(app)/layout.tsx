"use client"

import { useState } from "react"
import { SessionProvider } from "@/lib/session"
import { ToastProvider } from "@/components/ui/toast"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <SessionProvider>
      <ToastProvider>
        <div className="flex h-screen overflow-hidden bg-muted/20">
          <Sidebar mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />
          {menuOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <Header onMenu={() => setMenuOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </SessionProvider>
  )
}
