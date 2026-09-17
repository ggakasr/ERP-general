"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

const quotColumns: Column[] = [
  { key: "number", label: "So BG" },
  { key: "customerName", label: "Khach hang" },
  { key: "status", label: "Trang thai" },
  { key: "totalAmount", label: "Gia tri" },
  { key: "validUntil", label: "Hieu luc den" },
]

const soColumns: Column[] = [
  { key: "number", label: "So SO" },
  { key: "customerName", label: "Khach hang" },
  { key: "status", label: "Trang thai" },
  { key: "totalAmount", label: "Gia tri" },
  { key: "deliveryDate", label: "Ngay giao" },
]

const invColumns: Column[] = [
  { key: "number", label: "So HD" },
  { key: "customerName", label: "Khach hang" },
  { key: "status", label: "Trang thai" },
  { key: "totalAmount", label: "Tong tien" },
  { key: "paidAmount", label: "Da thu" },
  { key: "dueDate", label: "Han thanh toan" },
]

export default function SalesPage() {
  const quotations = useERPStore((s) => s.quotations)
  const salesOrders = useERPStore((s) => s.salesOrders)
  const invoices = useERPStore((s) => s.salesInvoices)

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0)
  const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Ban hang (Sales)</h1>
        <p className="text-muted-foreground">Luong: Quotation → SO → Delivery → Invoice → Collection</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Bao gia</p><p className="text-2xl font-bold">{quotations.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Don hang</p><p className="text-2xl font-bold">{salesOrders.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da thu</p><p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Cong no</p><p className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</p></CardContent></Card>
      </div>

      <DocumentList title="Bao gia (Quotation)" documentType="QUOT" collectionKey="QUOT" data={quotations as unknown as Record<string, unknown>[]} columns={quotColumns} />
      <DocumentList title="Don ban hang (Sales Order)" documentType="SO" collectionKey="SO" data={salesOrders as unknown as Record<string, unknown>[]} columns={soColumns} />
      <DocumentList title="Hoa don (Invoice)" documentType="INV" collectionKey="INV" data={invoices as unknown as Record<string, unknown>[]} columns={invColumns} />
    </div>
  )
}
