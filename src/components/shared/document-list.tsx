"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useERPStore } from "@/lib/store"
import { getAvailableTransitions, getStatusColor } from "@/lib/state-machines"
import type { DocumentStatus, SodRole } from "@/lib/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, AlertTriangle, CheckCircle2 } from "lucide-react"

export interface Column {
  key: string
  label: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

interface DocumentListProps {
  title: string
  description?: string
  documentType: string
  collectionKey: string
  data: Array<Record<string, unknown>>
  columns: Column[]
  showCreate?: boolean
  onCreateClick?: () => void
}

export function DocumentList({
  title,
  description,
  documentType,
  collectionKey,
  data,
  columns,
  showCreate = true,
  onCreateClick,
}: DocumentListProps) {
  const { currentUser, transitionStatus, checkSoD } = useERPStore()
  const [sodMessage, setSodMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [filter, setFilter] = useState("")

  const filtered = data.filter((row) => {
    if (!filter) return true
    return Object.values(row).some((v) =>
      String(v).toLowerCase().includes(filter.toLowerCase())
    )
  })

  function handleTransition(
    docId: string,
    newStatus: DocumentStatus,
    requiredRole?: string
  ) {
    if (!currentUser) return

    if (requiredRole) {
      const sodRole = requiredRole as SodRole
      if (["REQUESTER", "APPROVER", "EXECUTOR", "AUDITOR"].includes(sodRole)) {
        const check = checkSoD(docId, documentType, currentUser.id, sodRole)
        if (!check.allowed) {
          setSodMessage({ type: "error", text: check.conflict || "SoD violation" })
          setTimeout(() => setSodMessage(null), 5000)
          return
        }
      }
    }

    const result = transitionStatus(collectionKey, docId, documentType, newStatus)
    if (result.success) {
      setSodMessage({ type: "success", text: `Chuyen trang thai thanh cong: ${newStatus}` })
      setTimeout(() => setSodMessage(null), 3000)
    } else {
      setSodMessage({ type: "error", text: result.error || "Error" })
      setTimeout(() => setSodMessage(null), 5000)
    }
  }

  const statusCounts = data.reduce<Record<string, number>>((acc, row) => {
    const status = row.status as string
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
        </div>
        {showCreate && (
          <Button onClick={onCreateClick}>
            <Plus className="mr-2 h-4 w-4" />
            Tao moi
          </Button>
        )}
      </div>

      {sodMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            sodMessage.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {sodMessage.type === "error" ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {sodMessage.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div
            key={status}
            className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(status as DocumentStatus)}`}
          >
            {status}: {count}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Loc du lieu..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-64 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length} / {data.length} ban ghi
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Hanh dong
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Khong co du lieu
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id as string} className="border-b hover:bg-muted/30 transition-colors">
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3 text-sm">
                          {col.render
                            ? col.render(row[col.key], row)
                            : col.key === "status"
                              ? (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(row[col.key] as DocumentStatus)}`}>
                                  {row[col.key] as string}
                                </span>
                              )
                              : col.key === "totalAmount" || col.key === "amount"
                                ? formatCurrency(row[col.key] as number)
                                : col.key.includes("At") || col.key.includes("Date") || col.key.includes("date")
                                  ? row[col.key] ? formatDate(row[col.key] as string) : "-"
                                  : String(row[col.key] ?? "-")}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {getAvailableTransitions(documentType, row.status as DocumentStatus).map((t) => (
                            <Button
                              key={`${t.from}-${t.to}`}
                              variant={t.color === "red" ? "destructive" : t.color === "green" ? "default" : "outline"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() =>
                                handleTransition(row.id as string, t.to, t.requiredRole)
                              }
                            >
                              {t.label}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
