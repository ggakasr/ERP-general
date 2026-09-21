"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, LayoutDashboard } from "lucide-react"

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Tổng quan",
  tasks: "Việc cần làm",
  trace: "Truy vết chứng từ",
  planning: "Kế hoạch & Ngân sách",
  sales: "Bán hàng",
  procurement: "Mua hàng",
  inventory: "Kho vận",
  production: "Sản xuất",
  hr: "Nhân sự & Lương",
  finance: "Tài chính & Kế toán",
  assets: "Tài sản",
  "customer-service": "Dịch vụ khách hàng",
  exceptions: "Ngoại lệ",
  controls: "Kiểm soát nội bộ",
  "audit-trail": "Audit trail",
  reports: "Báo cáo & KPI",
  acceptance: "Nghiệm thu",
  admin: "Quản trị hệ thống",
  me: "Quyền hạn của tôi",
  documents: "Chứng từ",
  new: "Tạo mới",
}

interface Crumb { label: string; href?: string }

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  if (!segments.length) return []

  const crumbs: Crumb[] = []

  // First segment
  const first = segments[0]
  const firstLabel = ROUTE_LABELS[first] ?? first
  if (segments.length === 1) {
    crumbs.push({ label: firstLabel })
  } else {
    crumbs.push({ label: firstLabel, href: `/${first}` })
  }

  // Subsequent segments
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    const isLast = i === segments.length - 1
    const label = ROUTE_LABELS[seg] ?? (seg.length === 36 ? "Chi tiết" : seg)
    const href = isLast ? undefined : "/" + segments.slice(0, i + 1).join("/")
    crumbs.push({ label, href })
  }

  return crumbs
}

export function Breadcrumb() {
  const pathname = usePathname()
  const crumbs = buildCrumbs(pathname)

  if (!crumbs.length) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground px-4 lg:px-6 py-1.5 border-b bg-background">
      <Link href="/dashboard" className="flex items-center hover:text-foreground transition-colors" aria-label="Tổng quan">
        <LayoutDashboard className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
