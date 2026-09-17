"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"

const inventoryColumns: Column[] = [
  { key: "sku", label: "SKU" },
  { key: "productName", label: "San pham" },
  { key: "warehouseName", label: "Kho" },
  { key: "quantity", label: "Ton kho" },
  { key: "reservedQty", label: "Da dat truoc" },
  { key: "unit", label: "DVT" },
  {
    key: "quantity", label: "Kha dung",
    render: (_val, row) => {
      const avail = (row.quantity as number) - (row.reservedQty as number)
      return <span className={avail < 10 ? "text-red-600 font-medium" : ""}>{avail}</span>
    },
  },
]

const transferColumns: Column[] = [
  { key: "number", label: "So phieu" },
  { key: "fromWarehouseName", label: "Kho xuat" },
  { key: "toWarehouseName", label: "Kho nhan" },
  { key: "status", label: "Trang thai" },
  { key: "createdAt", label: "Ngay tao" },
]

export default function InventoryPage() {
  const items = useERPStore((s) => s.inventoryItems)
  const transfers = useERPStore((s) => s.stockTransfers)

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalReserved = items.reduce((sum, i) => sum + i.reservedQty, 0)
  const warehouses = new Set(items.map((i) => i.warehouseName)).size

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Kho (Inventory)</h1>
        <p className="text-muted-foreground">Quan ly ton kho, dieu chuyen, kiem ke</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong SKU</p><p className="text-2xl font-bold">{items.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong ton</p><p className="text-2xl font-bold">{totalItems}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da dat truoc</p><p className="text-2xl font-bold">{totalReserved}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">So kho</p><p className="text-2xl font-bold">{warehouses}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {inventoryColumns.map((col) => (
                    <th key={col.key + col.label} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-mono">{item.sku}</td>
                    <td className="px-4 py-3 text-sm">{item.productName}</td>
                    <td className="px-4 py-3 text-sm">{item.warehouseName}</td>
                    <td className="px-4 py-3 text-sm font-medium">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm">{item.reservedQty}</td>
                    <td className="px-4 py-3 text-sm">{item.unit}</td>
                    <td className="px-4 py-3 text-sm">
                      {(() => {
                        const avail = item.quantity - item.reservedQty
                        return <span className={avail < 10 ? "text-red-600 font-bold" : "text-green-600 font-medium"}>{avail}</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DocumentList title="Phieu dieu chuyen kho (Stock Transfer)" documentType="ST" collectionKey="ST" data={transfers as unknown as Record<string, unknown>[]} columns={transferColumns} />
    </div>
  )
}
