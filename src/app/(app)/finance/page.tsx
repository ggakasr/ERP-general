"use client"

import { ModulePage } from "@/components/docs/module-page"
import { TrialBalancePanel, AgingPanel } from "@/components/reports/financial-panels"
import { DepreciationRunner } from "@/components/reports/depreciation-runner"

export default function FinancePage() {
  return (
    <ModulePage
      moduleKey="finance"
      extraTabs={[
        { key: "tb", label: "Cân đối số phát sinh", resources: ["GL"], render: () => <TrialBalancePanel /> },
        { key: "aging", label: "Công nợ phải thu/phải trả", resources: ["SINV", "INV"], render: () => <AgingPanel /> },
        { key: "depr", label: "Chạy khấu hao", resources: ["DEPRECIATION"], action: "EXECUTE", render: () => <DepreciationRunner /> },
      ]}
    />
  )
}
