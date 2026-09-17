"use client"

import { ModulePage } from "@/components/docs/module-page"
import { DocTable } from "@/components/docs/doc-table"

export default function SalesPage() {
  return (
    <ModulePage
      moduleKey="sales"
      extraTabs={[
        { key: "delivery", label: "Giao hàng & thu tiền", resources: ["DN", "RCPT"], render: () => <DocTable docTypes={["DN", "RCPT"]} /> },
        { key: "tickets", label: "Ticket khách hàng", resources: ["TICKET"], render: () => <DocTable docTypes={["TICKET"]} /> },
      ]}
    />
  )
}
