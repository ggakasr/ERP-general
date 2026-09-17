"use client"

import { ModulePage } from "@/components/docs/module-page"
import { StockPanel } from "@/components/reports/stock-panel"

export default function InventoryPage() {
  return (
    <ModulePage
      moduleKey="inventory"
      extraTabs={[{ key: "stock", label: "Tồn kho & thẻ kho", resources: ["INVENTORY"], render: () => <StockPanel /> }]}
    />
  )
}
