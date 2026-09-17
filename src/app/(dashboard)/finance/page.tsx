"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

const jvColumns: Column[] = [
  { key: "number", label: "So but toan" },
  { key: "description", label: "Dien giai" },
  { key: "period", label: "Ky" },
  { key: "status", label: "Trang thai" },
  { key: "totalDebit", label: "Tong no" },
  { key: "totalCredit", label: "Tong co" },
]

const pmtColumns: Column[] = [
  { key: "number", label: "So phieu chi" },
  { key: "payeeName", label: "Nguoi nhan" },
  { key: "amount", label: "So tien" },
  { key: "method", label: "Phuong thuc" },
  { key: "status", label: "Trang thai" },
  { key: "referenceDoc", label: "Chung tu goc" },
]

export default function FinancePage() {
  const jvs = useERPStore((s) => s.journalEntries)
  const payments = useERPStore((s) => s.payments)

  const totalDebit = jvs.filter((j) => j.status === "POSTED").reduce((sum, j) => sum + j.totalDebit, 0)
  const totalPayments = payments.filter((p) => p.status === "COMPLETED").reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Tai chinh & Ke toan (Finance)</h1>
        <p className="text-muted-foreground">Luong: JV → GL Posting → Period Close → Financial Statements</p>
        <div className="mt-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>SoD bat buoc:</strong> Nguoi tao ≠ Nguoi duyet ≠ Nguoi thuc hien ≠ Nguoi kiem tra
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">But toan</p><p className="text-2xl font-bold">{jvs.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong ghi no</p><p className="text-2xl font-bold">{formatCurrency(totalDebit)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Phieu chi</p><p className="text-2xl font-bold">{payments.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da chi</p><p className="text-2xl font-bold">{formatCurrency(totalPayments)}</p></CardContent></Card>
      </div>

      <DocumentList title="But toan (Journal Entry)" description="Debit phai bang Credit" documentType="JV" collectionKey="JV" data={jvs as unknown as Record<string, unknown>[]} columns={jvColumns} />
      <DocumentList title="Phieu chi (Payment)" description="SoD: Nguoi tao ≠ Nguoi duyet ≠ Nguoi thuc hien" documentType="PMT" collectionKey="PMT" data={payments as unknown as Record<string, unknown>[]} columns={pmtColumns} />
    </div>
  )
}
