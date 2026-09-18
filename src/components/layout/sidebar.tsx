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
  /** visible if user has VIEW on any of these resources (empty = everyone) */
  resources: string[]
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Làm việc",
    items: [
      { name: "Tổng quan", href: "/dashboard", icon: LayoutDashboard, resources: [] },
      { name: "Việc cần làm", href: "/tasks", icon: Inbox, resources: [] },
      { name: "Truy vết chứng từ", href: "/trace", icon: Route, resources: [] },
    ],
  },
  {
    label: "Nghiệp vụ",
    items: [
      { name: "Kế hoạch & Ngân sách", href: "/planning", icon: CalendarClock, resources: ["BUDGET"] },
      { name: "Bán hàng", href: "/sales", icon: ShoppingCart, resources: ["QUOT", "SO", "INV"] },
      { name: "Mua hàng", href: "/procurement", icon: ShoppingBag, resources: ["PR", "PO", "SINV"] },
      { name: "Kho vận", href: "/inventory", icon: Package, resources: ["GRN", "DN", "ST", "ADJ", "INVENTORY"] },
      { name: "Sản xuất", href: "/production", icon: Factory, resources: ["WO"] },
      { name: "Nhân sự & Lương", href: "/hr", icon: Users, resources: ["HIRE", "PAYROLL", "EMPLOYEE"] },
      { name: "Tài chính & Kế toán", href: "/finance", icon: Landmark, resources: ["JV", "PMT", "RCPT", "SINV", "BANKREC", "GL"] },
      { name: "Tài sản", href: "/assets", icon: Building2, resources: ["ASSET"] },
      { name: "Dịch vụ khách hàng", href: "/customer-service", icon: Headphones, resources: ["TICKET"] },
    ],
  },
  {
    label: "Kiểm soát & Báo cáo",
    items: [
      { name: "Ngoại lệ", href: "/exceptions", icon: AlertTriangle, resources: ["EXC"] },
      { name: "Kiểm soát nội bộ", href: "/controls", icon: Shield, resources: ["SOD_LOG", "HANDOFF", "AUDIT_TRAIL"] },
      { name: "Audit trail", href: "/audit-trail", icon: FileSearch, resources: ["AUDIT_TRAIL"] },
      { name: "Báo cáo & KPI", href: "/reports", icon: BarChart3, resources: ["GL", "KPI", "REPORT_OPS", "BUDGET"] },
      { name: "Nghiệm thu", href: "/acceptance", icon: ClipboardCheck, resources: [] },
      { name: "Quản trị hệ thống", href: "/admin", icon: Settings, resources: ["USER_ADMIN", "ACCESS_REVIEW", "MDC"] },
    ],
  },
]

export function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const { canAny } = useSession()

  return (
    <aside
      className={cn(
        "w-60 shrink-0 flex-col border-r bg-card lg:static lg:flex",
        mobileOpen ? "fixed inset-y-0 left-0 z-50 flex shadow-xl" : "hidden"
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">E</div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">ERP General</p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => i.resources.length === 0 || canAny(i.resources, "VIEW"))
          if (!items.length) return null
          return (
            <div key={g.label}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
