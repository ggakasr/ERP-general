"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FileText, Loader2, Ship } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { StatusBadge } from "@/components/shared/bits"

interface PortalShipment {
  id: string
  number: string
  doc_type: string
  status: string
  partner_name: string
  data: Record<string, any>
  created_at: string
  updated_at: string
}

export default function PortalDashboard() {
  const { me } = useSession()
  const [shipments, setShipments] = useState<PortalShipment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rpc<{ rows: PortalShipment[] }>("api_portal_shipments", { p_limit: 5 })
      .then((r) => { if (r.ok) setShipments(r.rows || []) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Xin chào, {me.user.full_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portal theo dõi lô hàng và chứng từ
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/portal/shipments"
          className="flex items-center gap-4 rounded-lg border bg-background p-5 transition-shadow hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Ship className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Lô hàng</div>
            <div className="text-sm text-muted-foreground">Tra cứu và theo dõi lô hàng</div>
          </div>
        </Link>
        <Link
          href="/portal/documents"
          className="flex items-center gap-4 rounded-lg border bg-background p-5 transition-shadow hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Chứng từ</div>
            <div className="text-sm text-muted-foreground">Xem hóa đơn, báo giá, vận đơn</div>
          </div>
        </Link>
      </div>

      <div className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Lô hàng gần đây</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Chưa có lô hàng nào</div>
        ) : (
          <div className="divide-y">
            {shipments.map((s) => (
              <Link
                key={s.id}
                href={`/portal/shipments/${s.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
              >
                <div>
                  <span className="font-mono text-sm font-medium">{s.number}</span>
                  {s.data?.pol && s.data?.pod && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.data.pol} → {s.data.pod}
                    </span>
                  )}
                </div>
                <StatusBadge status={s.status} />
              </Link>
            ))}
          </div>
        )}
        {shipments.length > 0 && (
          <div className="border-t px-4 py-2">
            <Link href="/portal/shipments" className="text-xs text-primary hover:underline">
              Xem tất cả →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
