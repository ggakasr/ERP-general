"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

const budgetColumns: Column[] = [
  { key: "number", label: "Ma ngan sach" },
  { key: "departmentName", label: "Phong ban" },
  { key: "fiscalYear", label: "Nam" },
  { key: "status", label: "Trang thai" },
  { key: "totalPlanned", label: "Ke hoach" },
  { key: "totalActual", label: "Thuc te" },
  {
    key: "totalPlanned", label: "Ti le su dung",
    render: (_val, row) => {
      const pct = Math.round(((row.totalActual as number) / (row.totalPlanned as number)) * 100)
      const color = pct > 90 ? "text-red-600" : pct > 70 ? "text-amber-600" : "text-green-600"
      return (
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className={`text-xs font-medium ${color}`}>{pct}%</span>
        </div>
      )
    },
  },
]

export default function PlanningPage() {
  const budgets = useERPStore((s) => s.budgets)

  const totalPlanned = budgets.reduce((sum, b) => sum + b.totalPlanned, 0)
  const totalActual = budgets.reduce((sum, b) => sum + b.totalActual, 0)
  const variance = totalPlanned - totalActual

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Ke hoach & Ngan sach (Planning & Budget)</h1>
        <p className="text-muted-foreground">Luong: Budget Plan → Allocation → Approval → Monitoring → Variance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ke hoach</p><p className="text-2xl font-bold">{formatCurrency(totalPlanned)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Thuc te</p><p className="text-2xl font-bold">{formatCurrency(totalActual)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Chenh lech</p><p className="text-2xl font-bold text-green-600">{formatCurrency(variance)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ti le</p><p className="text-2xl font-bold">{Math.round((totalActual / totalPlanned) * 100)}%</p></CardContent></Card>
      </div>

      <DocumentList title="Ngan sach" documentType="BUDGET" collectionKey="BUDGET" data={budgets as unknown as Record<string, unknown>[]} columns={budgetColumns} />

      {budgets.map((budget) => (
        <Card key={budget.id}>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">{budget.departmentName} — {budget.fiscalYear}</h3>
            <div className="space-y-2">
              {budget.lines.map((line) => (
                <div key={line.id} className="flex items-center gap-4 text-sm">
                  <span className="w-40 shrink-0">{line.category}</span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(Math.round((line.actual / line.planned) * 100), 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-28 text-right">{formatCurrency(line.actual)}</span>
                  <span className="w-28 text-right text-muted-foreground">/ {formatCurrency(line.planned)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
