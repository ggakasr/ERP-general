"use client"

import { useERPStore } from "@/lib/store"
import { DocumentList, type Column } from "@/components/shared/document-list"
import { Card, CardContent } from "@/components/ui/card"

const ticketColumns: Column[] = [
  { key: "number", label: "Ma ticket" },
  { key: "customerName", label: "Khach hang" },
  { key: "subject", label: "Tieu de" },
  { key: "priority", label: "Uu tien",
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
  { key: "status", label: "Trang thai" },
  { key: "slaDeadline", label: "SLA Deadline" },
]

export default function CustomerServicePage() {
  const tickets = useERPStore((s) => s.serviceTickets)

  const openTickets = tickets.filter((t) => t.status !== "CLOSED" && t.status !== "RESOLVED").length
  const highPriority = tickets.filter((t) => t.priority === "HIGH" || t.priority === "CRITICAL").length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dich vu khach hang (Customer Service)</h1>
        <p className="text-muted-foreground">Luong: Ticket → Classification → Assignment → Resolution → Feedback</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Tong ticket</p><p className="text-2xl font-bold">{tickets.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Dang mo</p><p className="text-2xl font-bold">{openTickets}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Uu tien cao</p><p className="text-2xl font-bold text-orange-600">{highPriority}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Da giai quyet</p><p className="text-2xl font-bold">{tickets.length - openTickets}</p></CardContent></Card>
      </div>

      <DocumentList title="Ticket ho tro" documentType="TICKET" collectionKey="TICKET" data={tickets as unknown as Record<string, unknown>[]} columns={ticketColumns} />
    </div>
  )
}
