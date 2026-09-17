"use client"

import { useERPStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { getStatusColor } from "@/lib/state-machines"
import type { DocumentStatus } from "@/lib/types"
import {
  ShoppingBag, ShoppingCart, Package, Factory, Users,
  Landmark, Building2, Headphones, AlertTriangle, FileSearch,
  TrendingUp, Clock, CheckCircle2, XCircle,
} from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const store = useERPStore()
  const { currentUser, auditTrail } = store

  const stats = [
    { label: "Purchase Orders", value: store.purchaseOrders.length, icon: ShoppingBag, href: "/procurement", color: "text-orange-600 bg-orange-100" },
    { label: "Sales Orders", value: store.salesOrders.length, icon: ShoppingCart, href: "/sales", color: "text-blue-600 bg-blue-100" },
    { label: "Inventory Items", value: store.inventoryItems.length, icon: Package, href: "/inventory", color: "text-yellow-600 bg-yellow-100" },
    { label: "Work Orders", value: store.workOrders.length, icon: Factory, href: "/production", color: "text-indigo-600 bg-indigo-100" },
    { label: "Employees", value: store.employees.length, icon: Users, href: "/hr", color: "text-pink-600 bg-pink-100" },
    { label: "Journal Entries", value: store.journalEntries.length, icon: Landmark, href: "/finance", color: "text-green-600 bg-green-100" },
    { label: "Assets", value: store.assets.length, icon: Building2, href: "/assets", color: "text-purple-600 bg-purple-100" },
    { label: "Tickets", value: store.serviceTickets.length, icon: Headphones, href: "/customer-service", color: "text-teal-600 bg-teal-100" },
  ]

  const kpis = [
    {
      label: "Doanh thu thang",
      value: formatCurrency(250000000),
      change: "+12%",
      icon: TrendingUp,
      positive: true,
    },
    {
      label: "Don hang cho duyet",
      value: String(store.purchaseOrders.filter((p) => p.status === "SUBMITTED").length + store.purchaseRequisitions.filter((p) => p.status === "SUBMITTED").length),
      change: "Can xu ly",
      icon: Clock,
      positive: false,
    },
    {
      label: "Ti le SoD Pass",
      value: "100%",
      change: "0 vi pham",
      icon: CheckCircle2,
      positive: true,
    },
    {
      label: "Ngoai le mo",
      value: String(store.exceptions.filter((e) => e.status !== "CLOSED" && e.status !== "RESOLVED").length),
      change: store.exceptions.length > 0 ? "Dang xu ly" : "Khong co",
      icon: AlertTriangle,
      positive: store.exceptions.filter((e) => e.status !== "CLOSED" && e.status !== "RESOLVED").length === 0,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Xin chao, {currentUser?.fullName}!
        </h1>
        <p className="text-muted-foreground">
          Tong quan hoat dong he thong ERP — {new Date().toLocaleDateString("vi-VN")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                  <p className={`text-xs mt-1 ${kpi.positive ? "text-green-600" : "text-amber-600"}`}>
                    {kpi.change}
                  </p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${kpi.positive ? "bg-green-100" : "bg-amber-100"}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.positive ? "text-green-600" : "text-amber-600"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 text-center">
                <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${stat.color} mb-2`}>
                  <stat.icon className="h-4 w-4" />
                </div>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Audit Trail gan day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditTrail.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    entry.action === "SOD_VIOLATION"
                      ? "bg-red-100 text-red-700"
                      : entry.action === "APPROVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                  }`}>
                    {entry.userName.split(" ").map((n) => n[0]).join("").slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p>
                      <span className="font-medium">{entry.userName}</span>
                      {" "}
                      <span className="text-muted-foreground">
                        {entry.action === "CREATE" && "tao moi"}
                        {entry.action === "STATUS_CHANGE" && `chuyen trang thai ${entry.oldValue} → ${entry.newValue}`}
                        {entry.action === "APPROVE" && "phe duyet"}
                        {entry.action === "REJECT" && "tu choi"}
                        {entry.action === "SOD_VIOLATION" && "bi chan boi SoD"}
                      </span>
                      {" "}
                      <span className="font-medium">{entry.entityType}-{entry.entityId.slice(-3)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Chung tu can xu ly
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                ...store.purchaseRequisitions.filter((d) => d.status === "SUBMITTED").map((d) => ({ ...d, docType: "PR" })),
                ...store.purchaseOrders.filter((d) => d.status === "SUBMITTED" || d.status === "DRAFT").map((d) => ({ ...d, docType: "PO" })),
                ...store.payments.filter((d) => d.status === "SUBMITTED").map((d) => ({ ...d, docType: "PMT" })),
                ...store.journalEntries.filter((d) => d.status === "DRAFT").map((d) => ({ ...d, docType: "JV" })),
              ].slice(0, 8).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{doc.number}</span>
                    <span className="text-muted-foreground ml-2">{doc.docType}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(doc.status as DocumentStatus)}`}>
                    {doc.status}
                  </span>
                </div>
              ))}
              {store.purchaseRequisitions.filter((d) => d.status === "SUBMITTED").length === 0 &&
               store.purchaseOrders.filter((d) => d.status === "SUBMITTED" || d.status === "DRAFT").length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Khong co chung tu can xu ly</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
