"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AlertTriangle, BarChart3, Building2, CalendarClock, ClipboardCheck, Factory, FileSearch, Headphones,
  Inbox, Landmark, LayoutDashboard, Package, Route, Settings, Shield, ShoppingBag, ShoppingCart, Users,
} from "lucide-react"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"

interface Item {
  name: string
  href: string
  icon: React.ElementType
  resources: string[]
  moduleKey?: string
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Làm việc",
    items: [
      { name: "Tổng quan", href: "/dashboard", icon: LayoutDashboard, resources: [] },
      { name: "Việc cần làm", href: "/tasks", icon: Inbox, resources: [] },
      { name: "Truy vết", href: "/trace", icon: Route, resources: [] },
    ],
  },
  {
    label: "Nghiệp vụ",
    items: [
      { name: "Kế hoạch", href: "/planning", icon: CalendarClock, resources: ["BUDGET"], moduleKey: "planning" },
      { name: "Bán hàng", href: "/sales", icon: ShoppingCart, resources: ["QUOT", "SO", "INV"], moduleKey: "sales" },
      { name: "Mua hàng", href: "/procurement", icon: ShoppingBag, resources: ["PR", "PO", "SINV"], moduleKey: "procurement" },
      { name: "Kho vận", href: "/inventory", icon: Package, resources: ["GRN", "DN", "ST", "ADJ", "INVENTORY"], moduleKey: "inventory" },
      { name: "Sản xuất", href: "/production", icon: Factory, resources: ["WO"], moduleKey: "production" },
      { name: "Nhân sự & Lương", href: "/hr", icon: Users, resources: ["HIRE", "PAYROLL", "EMPLOYEE"], moduleKey: "hr" },
      { name: "Tài chính", href: "/finance", icon: Landmark, resources: ["JV", "PMT", "RCPT", "SINV", "BANKREC", "GL"], moduleKey: "finance" },
      { name: "Tài sản", href: "/assets", icon: Building2, resources: ["ASSET"], moduleKey: "assets" },
      { name: "Dịch vụ KH", href: "/customer-service", icon: Headphones, resources: ["TICKET"], moduleKey: "customer-service" },
    ],
  },
  {
    label: "Kiểm soát",
    items: [
      { name: "Ngoại lệ", href: "/exceptions", icon: AlertTriangle, resources: ["EXC"], moduleKey: "exceptions" },
      { name: "Kiểm soát nội bộ", href: "/controls", icon: Shield, resources: ["SOD_LOG", "HANDOFF", "AUDIT_TRAIL"] },
      { name: "Audit trail", href: "/audit-trail", icon: FileSearch, resources: ["AUDIT_TRAIL"] },
      { name: "Báo cáo & KPI", href: "/reports", icon: BarChart3, resources: ["GL", "KPI", "REPORT_OPS", "BUDGET"] },
      { name: "Nghiệm thu", href: "/acceptance", icon: ClipboardCheck, resources: [] },
      { name: "Quản trị", href: "/admin", icon: Settings, resources: ["USER_ADMIN", "ACCESS_REVIEW", "MDC"] },
    ],
  },
]

export function Sidebar({
  mobileOpen = false,
  onNavigate,
  counts = {},
}: {
  mobileOpen?: boolean
  onNavigate?: () => void
  counts?: Record<string, number>
}) {
  const pathname = usePathname()
  const { canAny } = useSession()

  return (
    <aside
      className={cn(
        "w-56 shrink-0 flex-col border-r bg-card lg:static lg:flex",
        mobileOpen ? "fixed inset-y-0 left-0 z-50 flex shadow-xl" : "hidden"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground select-none">
          E
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">ERP General</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => i.resources.length === 0 || canAny(i.resources, "VIEW"))
          if (!items.length) return null
          return (
            <div key={g.label}>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                {g.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/")
                  const count = item.moduleKey ? (counts[item.moduleKey] ?? 0) : 0
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.name}</span>
                        {count > 0 && (
                          <span className={cn(
                            "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums",
                            active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
