"use client"

import { useERPStore } from "@/lib/store"
import { Bell, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  const currentUser = useERPStore((s) => s.currentUser)
  const auditTrail = useERPStore((s) => s.auditTrail)

  const recentCount = auditTrail.filter((a) => {
    const diff = Date.now() - new Date(a.timestamp).getTime()
    return diff < 3600000
  }).length

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tim kiem chung tu, module..."
            className="h-9 w-72 rounded-md border bg-background pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
          Demo Mode
        </span>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {recentCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
              {recentCount > 9 ? "9+" : recentCount}
            </span>
          )}
        </Button>

        {currentUser && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {currentUser.fullName.split(" ").map((n) => n[0]).join("").slice(-2)}
            </div>
            <div>
              <p className="text-xs font-medium">{currentUser.fullName}</p>
              <p className="text-[10px] text-muted-foreground">{currentUser.roles.join(", ")}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
