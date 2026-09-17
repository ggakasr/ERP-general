"use client"

import { ModulePage } from "@/components/docs/module-page"
import { DocTable } from "@/components/docs/doc-table"

export default function ProcurementPage() {
  return (
    <ModulePage
      moduleKey="procurement"
      extraTabs={[
        { key: "receipts", label: "Nhập kho & thanh toán", resources: ["GRN", "PMT"], render: () => <DocTable docTypes={["GRN", "PMT"]} /> },
        { key: "exceptions", label: "Ngoại lệ đối chiếu", resources: ["EXC"], render: () => <DocTable docTypes={["EXC"]} /> },
      ]}
    />
  )
}
