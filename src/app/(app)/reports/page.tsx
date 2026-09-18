"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Banknote, Package, UserCheck } from "lucide-react"
import { useSession } from "@/lib/session"
import { Tabs } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/bits"
import { NoPermission } from "@/components/reports/common"
import { KpiPanel } from "@/components/reports/kpi-panel"
import { AgingPanel, FinancialStatementsPanel, TrialBalancePanel } from "@/components/reports/financial-panels"
import { BudgetPanel } from "@/components/reports/budget-panel"
import { StockPanel } from "@/components/reports/stock-panel"
import { ProductProfitPanel } from "@/components/reports/product-profit-panel"

const TRACES = [
  { icon: Banknote, title: "Truy vết theo dòng tiền", path: "Phiếu chi → Hóa đơn NCC → Đơn mua hàng → Đề nghị mua → Ngân sách" },
  { icon: Package, title: "Truy vết theo dòng hàng", path: "Phiếu xuất giao → Lô tồn kho → Phiếu nhập kho → Đơn mua hàng → Đề nghị mua" },
  { icon: UserCheck, title: "Truy vết theo trách nhiệm", path: "Hành động → Người dùng → Vai trò → Phòng ban → Chủ sở hữu quy trình" },
]

function TracePaths() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {TRACES.map((t) => (
        <Link key={t.title} href="/trace" className="group flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><t.icon className="h-4 w-4" /></span>
            <p className="font-medium">{t.title}</p>
          </div>
          <p className="mt-3 rounded-md bg-muted/50 px-2 py-1.5 font-mono text-xs">{t.path}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
            Mở công cụ truy vết <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  )
}

export default function ReportsPage() {
  const { can } = useSession()

  const tabs = [
    { key: "kpi", label: "KPI", visible: can("KPI", "VIEW") },
    { key: "fs", label: "Báo cáo tài chính", visible: can("GL", "VIEW") },
    { key: "profit", label: "Lãi gộp SP/KH", visible: can("GL", "VIEW") },
    { key: "tb", label: "Bảng cân đối số phát sinh", visible: can("GL", "VIEW") },
    { key: "aging", label: "Công nợ (AR/AP aging)", visible: can("INV", "VIEW") || can("SINV", "VIEW") },
    { key: "budget", label: "Ngân sách vs Thực tế", visible: can("BUDGET", "VIEW") },
    { key: "stock", label: "Tồn kho", visible: can("INVENTORY", "VIEW") },
    { key: "trace", label: "3 đường truy vết", visible: true },
  ].filter((t) => t.visible)

  const [tab, setTab] = useState(tabs[0]?.key || "trace")
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key

  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo & KPI" />
      {tabs.length === 1 && (
        <NoPermission>Bạn chưa có quyền xem báo cáo nghiệp vụ nào. Bạn vẫn có thể dùng công cụ truy vết bên dưới.</NoPermission>
      )}
      <Tabs items={tabs.map((t) => ({ key: t.key, label: t.label }))} value={active} onChange={setTab} className="print:hidden" />
      <div>
        {active === "kpi" && <KpiPanel />}
        {active === "fs" && <FinancialStatementsPanel />}
        {active === "profit" && <ProductProfitPanel />}
        {active === "tb" && <TrialBalancePanel />}
        {active === "aging" && <AgingPanel />}
        {active === "budget" && <BudgetPanel />}
        {active === "stock" && <StockPanel />}
        {active === "trace" && <TracePaths />}
      </div>
    </div>
  )
}
