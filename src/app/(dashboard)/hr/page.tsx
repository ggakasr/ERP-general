"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"

const payrollColumns: Column[] = [
  { key: "number", label: "So phieu" },
  { key: "period", label: "Ky luong" },
  { key: "status", label: "Trang thai" },
  { key: "employeeCount", label: "So NV" },
  { key: "totalGross", label: "Tong gross" },
  { key: "totalNet", label: "Tong net" },
]

export default function HRPage() {
  const employees = useERPStore((s) => s.employees)
  const payrollRuns = useERPStore((s) => s.payrollRuns)

  const totalPayroll = employees.reduce((sum, e) => sum + e.baseSalary, 0)
  const activeCount = employees.filter((e) => e.status === "ACTIVE").length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Nhan su & Tien luong (HR & Payroll)</h1>
        <p className="text-muted-foreground">Luong: Recruitment → Onboarding → Attendance → Payroll → Payment</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong nhan su</p><p className="text-2xl font-bold">{employees.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Dang lam viec</p><p className="text-2xl font-bold">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong quy luong</p><p className="text-2xl font-bold">{formatCurrency(totalPayroll)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ky luong</p><p className="text-2xl font-bold">{payrollRuns.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ma NV</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ho ten</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Chuc vu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phong ban</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Luong co ban</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Trang thai</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-mono">{emp.userId.replace("user-", "NV00")}</td>
                    <td className="px-4 py-3 text-sm font-medium">{emp.fullName}</td>
                    <td className="px-4 py-3 text-sm">{emp.position}</td>
                    <td className="px-4 py-3 text-sm">{emp.departmentName}</td>
                    <td className="px-4 py-3 text-sm">{formatCurrency(emp.baseSalary)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${emp.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                        {emp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DocumentList title="Bang luong (Payroll)" documentType="PAY_RUN" collectionKey="PAY_RUN" data={payrollRuns as unknown as Record<string, unknown>[]} columns={payrollColumns} />
    </div>
  )
}
