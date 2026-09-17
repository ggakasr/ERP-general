"use client"

import { useERPStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { formatDateTime } from "@/lib/utils"

const SOD_MATRIX = [
  { roleA: "REQUESTER", roleB: "APPROVER", type: "HARD", desc: "Nguoi de xuat ≠ Nguoi phe duyet" },
  { roleA: "APPROVER", roleB: "EXECUTOR", type: "HARD", desc: "Nguoi phe duyet ≠ Nguoi thuc hien" },
  { roleA: "EXECUTOR", roleB: "AUDITOR", type: "HARD", desc: "Nguoi thuc hien ≠ Nguoi kiem tra" },
  { roleA: "REQUESTER", roleB: "EXECUTOR", type: "HARD", desc: "Nguoi de xuat ≠ Nguoi thuc hien" },
]

export default function ControlsPage() {
  const sodCheckLog = useERPStore((s) => s.sodCheckLog)
  const auditTrail = useERPStore((s) => s.auditTrail)

  const violations = sodCheckLog.filter((l) => l.result === "BLOCKED")
  const passed = sodCheckLog.filter((l) => l.result === "PASSED")
  const sodViolationAudits = auditTrail.filter((a) => a.action === "SOD_VIOLATION")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Kiem soat noi bo (Internal Controls)</h1>
        <p className="text-muted-foreground">Tach biet nhiem vu (SoD), kiem soat phong ngua, kiem soat phat hien</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">SoD Passed</p>
                <p className="text-2xl font-bold text-green-600">{passed.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">SoD Blocked</p>
                <p className="text-2xl font-bold text-red-600">{violations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tong kiem tra</p>
                <p className="text-2xl font-bold">{sodCheckLog.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vi pham audit</p>
                <p className="text-2xl font-bold">{sodViolationAudits.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ma tran tach biet nhiem vu (SoD Matrix) — BM-06</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Vai tro A</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Vai tro B</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Loai</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Mo ta</th>
                </tr>
              </thead>
              <tbody>
                {SOD_MATRIX.map((rule, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3 text-sm font-medium">{rule.roleA}</td>
                    <td className="px-4 py-3 text-sm font-medium">{rule.roleB}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{rule.type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">{rule.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {sodCheckLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lich su kiem tra SoD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sodCheckLog.slice(0, 20).map((log) => (
                <div key={log.id} className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${log.result === "BLOCKED" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
                  {log.result === "BLOCKED" ? <XCircle className="h-4 w-4 text-red-600 shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                  <div className="flex-1">
                    <span className="font-medium">{log.userName}</span> — {log.attemptedRole} tren {log.transactionType} ({log.transactionId.slice(-6)})
                    {log.result === "BLOCKED" && <span className="text-red-600 ml-1">— Xung dot voi {log.conflictingRole}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(log.checkedAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 p-4 text-sm">
        <p className="font-semibold mb-1">Cach demo SoD:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Dang nhap bang user &quot;Le Van Cuong&quot; (Procurement) → tao PO</li>
          <li>Dang nhap bang user &quot;Pham Thi Dung&quot; (Finance) → phe duyet PO</li>
          <li>Thu dang nhap lai &quot;Le Van Cuong&quot; → phe duyet PO do → se bi chan boi SoD</li>
        </ol>
      </div>
    </div>
  )
}
