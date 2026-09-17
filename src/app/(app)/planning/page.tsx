"use client"

import { ModulePage } from "@/components/docs/module-page"
import { BudgetPanel } from "@/components/reports/budget-panel"

export default function PlanningPage() {
  return (
    <ModulePage
      moduleKey="planning"
      extraTabs={[{ key: "variance", label: "Ngân sách vs Thực tế", resources: ["BUDGET"], render: () => <BudgetPanel /> }]}
    />
  )
}
