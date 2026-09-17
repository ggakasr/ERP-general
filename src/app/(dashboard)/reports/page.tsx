"use client"

import { useERPStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { BarChart3, TrendingUp, FileSearch, PieChart } from "lucide-react"

export default function ReportsPage() {
  const store = useERPStore()

  const totalPOValue = store.purchaseOrders.reduce((sum, po) => sum + po.totalAmount, 0)
  const totalSOValue = store.salesOrders.reduce((sum, so) => sum + so.totalAmount, 0)
  const totalPayments = store.payments.reduce((sum, p) => sum + p.amount, 0)
  const totalBudget = store.budgets.reduce((sum, b) => sum + b.totalPlanned, 0)
  const totalBudgetUsed = store.budgets.reduce((sum, b) => sum + b.totalActual, 0)

  const reports = [
    {
      category: "Tai chinh",
      icon: TrendingUp,
      items: [
        { name: "Tong gia tri ban hang", value: formatCurrency(totalSOValue) },
        { name: "Tong gia tri mua hang", value: formatCurrency(totalPOValue) },
        { name: "Tong chi tra", value: formatCurrency(totalPayments) },
        { name: "Bien loi nhuan gop", value: `${Math.round(((totalSOValue - totalPOValue) / totalSOValue) * 100)}%` },
      ],
    },
    {
      category: "Ngan sach",
      icon: PieChart,
      items: [
        { name: "Tong ngan sach", value: formatCurrency(totalBudget) },
        { name: "Da su dung", value: formatCurrency(totalBudgetUsed) },
        { name: "Con lai", value: formatCurrency(totalBudget - totalBudgetUsed) },
        { name: "Ti le su dung", value: `${Math.round((totalBudgetUsed / totalBudget) * 100)}%` },
      ],
    },
    {
      category: "Van hanh",
      icon: BarChart3,
      items: [
        { name: "PO chua xu ly", value: String(store.purchaseOrders.filter((p) => p.status === "DRAFT").length) },
        { name: "Ticket dang mo", value: String(store.serviceTickets.filter((t) => t.status !== "CLOSED").length) },
        { name: "WO dang san xuat", value: String(store.workOrders.filter((w) => w.status === "IN_PRODUCTION").length) },
        { name: "Ton kho SKU", value: String(store.inventoryItems.length) },
      ],
    },
    {
      category: "Kiem soat",
      icon: FileSearch,
      items: [
        { name: "Audit entries", value: String(store.auditTrail.length) },
        { name: "SoD checks", value: String(store.sodCheckLog.length) },
        { name: "SoD violations", value: String(store.sodCheckLog.filter((l) => l.result === "BLOCKED").length) },
        { name: "Ngoai le", value: String(store.exceptions.length) },
      ],
    },
  ]

  const tracePaths = [
    {
      name: "Trace by Money (Theo dong tien)",
      path: "Payment → Invoice → PO → PR → Budget",
      example: `PMT-001 → PO-001 (${formatCurrency(50000000)}) → PR-001 → Budget San xuat`,
    },
    {
      name: "Trace by Goods (Theo dong hang)",
      path: "Delivery → Stock → GRN → PO → PR",
      example: "Delivery → Kho chinh HN (98kg thep) → GRN-001 → PO-001 → PR-001",
    },
    {
      name: "Trace by Responsibility (Theo trach nhiem)",
      path: "Action → User → Role → Department → Owner",
      example: "Tao PO → Le Van Cuong → PROCUREMENT/REQUESTER → Mua hang → Procurement Director",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Bao cao & Phan tich (Reports)</h1>
        <p className="text-muted-foreground">Tong hop bao cao tai chinh, van hanh, kiem soat va 3 trace paths</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reports.map((report) => (
          <Card key={report.category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <report.icon className="h-5 w-5" />
                {report.category}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {report.items.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                    <span className="text-sm font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3 Trace Paths (Truy vet)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tracePaths.map((trace) => (
              <div key={trace.name} className="rounded-lg border p-4">
                <h4 className="font-semibold mb-1">{trace.name}</h4>
                <p className="text-sm text-muted-foreground mb-2">{trace.path}</p>
                <div className="rounded bg-muted p-2 text-xs font-mono">{trace.example}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
