"use client"

import { ModulePage } from "@/components/docs/module-page"
import { useSession } from "@/lib/session"
import { formatNumber } from "@/lib/utils"
import { StockPanel } from "@/components/reports/stock-panel"

function BomList() {
  const { master } = useSession()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {master.boms.map((b) => (
        <div key={b.id} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{b.code}</p>
          <p className="font-medium">{b.product_name}</p>
          <p className="text-xs text-muted-foreground">Định mức cho {formatNumber(b.output_qty)} đơn vị thành phẩm</p>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide"><th className="py-1">Vật tư</th><th className="py-1 text-right">Số lượng</th></tr></thead>
            <tbody>
              {b.lines?.map((l) => (
                <tr key={l.product_id} className="border-b last:border-0"><td className="py-1">{l.product_name}</td><td className="py-1 text-right tabular-nums">{formatNumber(l.quantity)} {l.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default function ProductionPage() {
  return (
    <ModulePage
      moduleKey="production"
      extraTabs={[
        { key: "bom", label: "Định mức (BOM)", render: () => <BomList /> },
        { key: "stock", label: "Tồn vật tư & thành phẩm", resources: ["INVENTORY"], render: () => <StockPanel /> },
      ]}
    />
  )
}
