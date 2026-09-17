"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, ShoppingCart, ShoppingBag, Package, Factory,
  Users, Landmark, Building2, Headphones, Settings, BarChart3,
  CalendarClock, Shield, FileSearch, AlertTriangle, ChevronDown,
  LogOut,
} from "lucide-react"
import { useERPStore } from "@/lib/store"
import { useState } from "react"

const MODULES = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { divider: true, label: "Nghiep vu" },
  { name: "Ke hoach & Ngan sach", href: "/planning", icon: CalendarClock },
  { name: "Ban hang", href: "/sales", icon: ShoppingCart },
  { name: "Mua hang", href: "/procurement", icon: ShoppingBag },
  { name: "Kho", href: "/inventory", icon: Package },
  { name: "San xuat", href: "/production", icon: Factory },
  { name: "Nhan su & Luong", href: "/hr", icon: Users },
  { name: "Tai chinh", href: "/finance", icon: Landmark },
  { name: "Tai san", href: "/assets", icon: Building2 },
  { name: "Dich vu KH", href: "/customer-service", icon: Headphones },
  { divider: true, label: "Kiem soat" },
  { name: "Kiem soat noi bo", href: "/controls", icon: Shield },
  { name: "Audit Trail", href: "/audit-trail", icon: FileSearch },
  { name: "Ngoai le", href: "/exceptions", icon: AlertTriangle },
  { divider: true, label: "Bao cao & He thong" },
  { name: "Bao cao", href: "/reports", icon: BarChart3 },
  { name: "Quan tri", href: "/admin", icon: Settings },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const currentUser = useERPStore((s) => s.currentUser)
  const setCurrentUser = useERPStore((s) => s.setCurrentUser)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 items-center border-b px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              E
            </div>
            <span>ERP General</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "ml-auto rounded-md p-1 hover:bg-accent",
            collapsed && "mx-auto"
          )}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed ? "rotate-[-90deg]" : "rotate-90"
            )}
          />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {MODULES.map((item, i) => {
          if ("divider" in item) {
            if (collapsed) return <div key={i} className="my-2 border-t" />
            return (
              <div key={i} className="mt-4 mb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {item.label}
              </div>
            )
          }

          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {currentUser && (
        <div className="border-t p-3">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
              {currentUser.fullName.split(" ").map((n) => n[0]).join("").slice(-2)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{currentUser.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{currentUser.position}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={() => setCurrentUser(null)}
                className="rounded-md p-1 hover:bg-accent"
                title="Dang xuat"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
