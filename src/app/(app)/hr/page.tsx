"use client"

import { ModulePage } from "@/components/docs/module-page"
import { EmployeesPanel } from "@/components/reports/employees-panel"

export default function HrPage() {
  return (
    <ModulePage
      moduleKey="hr"
      extraTabs={[{ key: "employees", label: "Hồ sơ nhân viên", resources: ["EMPLOYEE"], render: () => <EmployeesPanel /> }]}
    />
  )
}
