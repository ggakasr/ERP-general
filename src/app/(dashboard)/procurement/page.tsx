"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

const prColumns: Column[] = [
  { key: "number", label: "So PR" },
  { key: "status", label: "Trang thai" },
  { key: "totalAmount", label: "Tong tien" },
  { key: "justification", label: "Ly do" },
  { key: "createdAt", label: "Ngay tao" },
]

const poColumns: Column[] = [
  { key: "number", label: "So PO" },
  { key: "supplierName", label: "Nha cung cap" },
  { key: "status", label: "Trang thai" },
  { key: "totalAmount", label: "Tong tien" },
  { key: "createdAt", label: "Ngay tao" },
]

const grnColumns: Column[] = [
  { key: "number", label: "So GRN" },
  { key: "poNumber", label: "So PO" },
  { key: "supplierName", label: "NCC" },
  { key: "status", label: "Trang thai" },
  { key: "createdAt", label: "Ngay tao" },
]

export default function ProcurementPage() {
  const prs = useERPStore((s) => s.purchaseRequisitions)
  const pos = useERPStore((s) => s.purchaseOrders)
  const grns = useERPStore((s) => s.goodsReceipts)

  const totalPOValue = pos.reduce((sum, po) => sum + po.totalAmount, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Mua hang (Procurement)</h1>
        <p className="text-muted-foreground">Luong: PR → PO → GRN → Invoice Match → Payment</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong PR</p><p className="text-2xl font-bold">{prs.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong PO</p><p className="text-2xl font-bold">{pos.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong GRN</p><p className="text-2xl font-bold">{grns.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Gia tri PO</p><p className="text-2xl font-bold">{formatCurrency(totalPOValue)}</p></CardContent></Card>
      </div>

      <DocumentList
        title="Phieu de nghi mua hang (PR)"
        documentType="PR"
        collectionKey="PR"
        data={prs as unknown as Record<string, unknown>[]}
        columns={prColumns}
      />

      <DocumentList
        title="Don dat hang (PO)"
        description="SoD: Nguoi tao ≠ Nguoi duyet ≠ Nguoi thanh toan"
        documentType="PO"
        collectionKey="PO"
        data={pos as unknown as Record<string, unknown>[]}
        columns={poColumns}
      />

      <DocumentList
        title="Phieu nhap kho (GRN)"
        documentType="GRN"
        collectionKey="GRN"
        data={grns as unknown as Record<string, unknown>[]}
        columns={grnColumns}
        showCreate={false}
      />
    </div>
  )
}
