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
  flow?: string
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
      { name: "Kế hoạch & Ngân sách", href: "/planning", icon: CalendarClock, resources: ["BUDGET"], flow: "L1" },
      { name: "Bán hàng", href: "/sales", icon: ShoppingCart, resources: ["QUOT", "SO", "INV"], flow: "L2" },
      { name: "Mua hàng", href: "/procurement", icon: ShoppingBag, resources: ["PR", "PO", "SINV"], flow: "L3" },
      { name: "Kho vận", href: "/inventory", icon: Package, resources: ["GRN", "DN", "ST", "ADJ", "INVENTORY"], flow: "L4" },
      { name: "Sản xuất", href: "/production", icon: Factory, resources: ["WO"], flow: "L5" },
      { name: "Nhân sự & Lương", href: "/hr", icon: Users, resources: ["HIRE", "PAYROLL", "EMPLOYEE"], flow: "L6" },
      { name: "Tài chính & Kế toán", href: "/finance", icon: Landmark, resources: ["JV", "PMT", "RCPT", "SINV", "BANKREC", "GL"], flow: "L7" },
      { name: "Tài sản", href: "/assets", icon: Building2, resources: ["ASSET"], flow: "L8" },
      { name: "Dịch vụ khách hàng", href: "/customer-service", icon: Headphones, resources: ["TICKET"], flow: "L9" },
    ],
  },
  {
    label: "Kiểm soát & Báo cáo",
    items: [
      { name: "Ngoại lệ", href: "/exceptions", icon: AlertTriangle, resources: ["EXC"] },
      { name: "Kiểm soát nội bộ", href: "/controls", icon: Shield, resources: ["SOD_LOG", "HANDOFF", "AUDIT_TRAIL"] },
      { name: "Audit trail", href: "/audit-trail", icon: FileSearch, resources: ["AUDIT_TRAIL"] },
      { name: "Báo cáo & KPI", href: "/reports", icon: BarChart3, resources: ["GL", "KPI", "REPORT_OPS", "BUDGET"], flow: "L11" },
      { name: "Nghiệm thu (BM-14)", href: "/acceptance", icon: ClipboardCheck, resources: [] },
      { name: "Quản trị hệ thống", href: "/admin", icon: Settings, resources: ["USER_ADMIN", "ACCESS_REVIEW", "MDC"], flow: "L10" },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { canAny } = useSession()

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">E</div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">ERP General</p>
          <p className="text-[11px] text-muted-foreground">11 luồng nghiệp vụ</p>
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
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.flow && <span className="text-[10px] text-muted-foreground/70">{item.flow}</span>}
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
