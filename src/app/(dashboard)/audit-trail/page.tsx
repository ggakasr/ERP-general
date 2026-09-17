"use client"

import { useERPStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/utils"
import { useState } from "react"

export default function AuditTrailPage() {
  const auditTrail = useERPStore((s) => s.auditTrail)
  const [filter, setFilter] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("ALL")

  const filtered = auditTrail.filter((entry) => {
    if (actionFilter !== "ALL" && entry.action !== actionFilter) return false
    if (filter) {
      const search = filter.toLowerCase()
      return (
        entry.userName.toLowerCase().includes(search) ||
        entry.entityType.toLowerCase().includes(search) ||
        entry.entityId.toLowerCase().includes(search) ||
        (entry.newValue || "").toLowerCase().includes(search)
      )
    }
    return true
  })

  const actionCounts = auditTrail.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Trail</h1>
        <p className="text-muted-foreground">Nhat ky thay doi — Bat bien (Immutable), chi ghi them (INSERT only)</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActionFilter("ALL")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${actionFilter === "ALL" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          Tat ca ({auditTrail.length})
        </button>
        {Object.entries(actionCounts).map(([action, count]) => (
          <button
            key={action}
            onClick={() => setActionFilter(action)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${actionFilter === action ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {action} ({count})
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Tim kiem theo nguoi dung, loai chung tu, ID..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-9 w-full max-w-md rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Thoi gian</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nguoi dung</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Hanh dong</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Loai</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Gia tri cu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Gia tri moi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className={`border-b hover:bg-muted/30 ${entry.action === "SOD_VIOLATION" ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono">{formatDateTime(entry.timestamp)}</td>
                    <td className="px-4 py-3 text-sm">{entry.userName}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        entry.action === "SOD_VIOLATION" ? "bg-red-100 text-red-800" :
                        entry.action === "CREATE" ? "bg-blue-100 text-blue-800" :
                        entry.action === "APPROVE" ? "bg-green-100 text-green-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>{entry.action}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{entry.entityType}</td>
                    <td className="px-4 py-3 text-xs font-mono">{entry.entityId.slice(-8)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.oldValue || "-"}</td>
                    <td className="px-4 py-3 text-sm font-medium">{entry.newValue || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
