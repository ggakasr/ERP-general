"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"

const woColumns: Column[] = [
  { key: "number", label: "So WO" },
  { key: "productName", label: "San pham" },
  { key: "status", label: "Trang thai" },
  { key: "plannedQty", label: "KH san xuat" },
  { key: "completedQty", label: "Da hoan thanh" },
  { key: "startDate", label: "Ngay bat dau" },
  {
    key: "completedQty", label: "Tien do",
    render: (_val, row) => {
      const pct = Math.round(((row.completedQty as number) / (row.plannedQty as number)) * 100)
      return (
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs">{pct}%</span>
        </div>
      )
    },
  },
]

export default function ProductionPage() {
  const workOrders = useERPStore((s) => s.workOrders)
  const boms = useERPStore((s) => s.boms)

  const inProduction = workOrders.filter((w) => w.status === "IN_PRODUCTION").length
  const totalPlanned = workOrders.reduce((sum, w) => sum + w.plannedQty, 0)
  const totalCompleted = workOrders.reduce((sum, w) => sum + w.completedQty, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">San xuat (Production)</h1>
        <p className="text-muted-foreground">Luong: BOM → Work Order → Material Issue → Production → QC → FG</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Work Orders</p><p className="text-2xl font-bold">{workOrders.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Dang san xuat</p><p className="text-2xl font-bold">{inProduction}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">KH san xuat</p><p className="text-2xl font-bold">{totalPlanned}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da hoan thanh</p><p className="text-2xl font-bold">{totalCompleted}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Bill of Materials (BOM)</h3>
          {boms.map((bom) => (
            <div key={bom.id} className="border rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{bom.productName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${bom.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {bom.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                {bom.components.map((c, i) => (
                  <div key={i} className="bg-muted/50 rounded p-2">
                    <p className="font-medium">{c.materialName}</p>
                    <p className="text-muted-foreground">{c.quantity} {c.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <DocumentList title="Lenh san xuat (Work Order)" documentType="WO" collectionKey="WO" data={workOrders as unknown as Record<string, unknown>[]} columns={woColumns} />
    </div>
  )
}
