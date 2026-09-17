"use client"

import { ModulePage } from "@/components/docs/module-page"
import { DepreciationRunner } from "@/components/reports/depreciation-runner"

export default function AssetsPage() {
  return (
    <ModulePage
      moduleKey="assets"
      extraTabs={[{ key: "depr", label: "Khấu hao hằng tháng", resources: ["DEPRECIATION"], action: "EXECUTE", render: () => <DepreciationRunner /> }]}
    />
  )
}
