"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"

const excColumns: Column[] = [
  { key: "number", label: "Ma ngoai le" },
  { key: "exceptionType", label: "Loai" },
  { key: "severity", label: "Muc do",
    render: (val) => {
      const colors: Record<string, string> = {
        LOW: "bg-gray-100 text-gray-800",
        MEDIUM: "bg-blue-100 text-blue-800",
        HIGH: "bg-orange-100 text-orange-800",
        CRITICAL: "bg-red-100 text-red-800",
      }
      return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[val as string] || ""}`}>{val as string}</span>
    },
  },
  { key: "description", label: "Mo ta" },
  { key: "status", label: "Trang thai" },
  { key: "createdAt", label: "Ngay tao" },
]

export default function ExceptionsPage() {
  const exceptions = useERPStore((s) => s.exceptions)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">So ngoai le (Exception Register) — BM-11</h1>
        <p className="text-muted-foreground">Moi ngoai le co quy trinh xu ly rieng, khong bypass duoc SoD</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong ngoai le</p><p className="text-2xl font-bold">{exceptions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Dang xu ly</p><p className="text-2xl font-bold">{exceptions.filter((e) => !["CLOSED", "RESOLVED"].includes(e.status)).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da giai quyet</p><p className="text-2xl font-bold">{exceptions.filter((e) => e.status === "RESOLVED" || e.status === "CLOSED").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Muc do cao</p><p className="text-2xl font-bold">{exceptions.filter((e) => e.severity === "HIGH" || e.severity === "CRITICAL").length}</p></CardContent></Card>
      </div>

      <DocumentList title="Danh sach ngoai le" documentType="EXC" collectionKey="EXC" data={exceptions as unknown as Record<string, unknown>[]} columns={excColumns} />

      {exceptions.map((exc) => (
        <Card key={exc.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="font-mono text-sm">{exc.number}</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                  exc.severity === "CRITICAL" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                }`}>{exc.severity}</span>
              </div>
              <span className="text-xs text-muted-foreground">{exc.exceptionType}</span>
            </div>
            <p className="text-sm mb-2">{exc.description}</p>
            {exc.resolution && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-2 text-sm">
                <strong>Giai phap:</strong> {exc.resolution}
              </div>
            )}
            {exc.rootCause && (
              <p className="text-xs text-muted-foreground mt-1"><strong>Nguyen nhan goc:</strong> {exc.rootCause}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
