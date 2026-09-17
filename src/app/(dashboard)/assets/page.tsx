"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

const assetColumns: Column[] = [
  { key: "number", label: "Ma TS" },
  { key: "name", label: "Ten tai san" },
  { key: "category", label: "Nhom" },
  { key: "status", label: "Trang thai" },
  { key: "acquisitionCost", label: "Nguyen gia" },
  { key: "currentValue", label: "Gia tri con lai" },
  { key: "location", label: "Vi tri" },
]

export default function AssetsPage() {
  const assets = useERPStore((s) => s.assets)

  const totalCost = assets.reduce((sum, a) => sum + a.acquisitionCost, 0)
  const totalCurrentValue = assets.reduce((sum, a) => sum + a.currentValue, 0)
  const totalDepreciation = totalCost - totalCurrentValue
  const activeAssets = assets.filter((a) => a.status === "ACTIVE").length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Tai san (Assets)</h1>
        <p className="text-muted-foreground">Luong: Request → Acquisition → Registration → Depreciation → Disposal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong tai san</p><p className="text-2xl font-bold">{assets.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Nguyen gia</p><p className="text-2xl font-bold">{formatCurrency(totalCost)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Gia tri con lai</p><p className="text-2xl font-bold">{formatCurrency(totalCurrentValue)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da khau hao</p><p className="text-2xl font-bold">{formatCurrency(totalDepreciation)}</p></CardContent></Card>
      </div>

      <DocumentList title="Danh sach tai san" documentType="ASSET" collectionKey="ASSET" data={assets as unknown as Record<string, unknown>[]} columns={assetColumns} />
    </div>
  )
}
