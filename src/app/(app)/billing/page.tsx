"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Crown, Loader2, Users, FileText, Zap } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { PageHeader } from "@/components/shared/bits"
import { cn } from "@/lib/utils"

interface FeatureInfo {
  enabled: boolean
  limit: number | null
}

interface SubscriptionInfo {
  ok: boolean
  plan: string
  subscription: {
    id: string
    plan: string
    seats: number
    status: string
    valid_from: string
    valid_to: string | null
    trial_ends: string | null
  } | null
  usage: {
    active_users: number
    doc_types_used: number
    documents_total: number
  }
  features: Record<string, FeatureInfo>
}

const PLAN_META: Record<string, { name: string; icon: React.ElementType; color: string; description: string }> = {
  STARTER:      { name: "Starter",      icon: Zap,    color: "text-blue-600 bg-blue-50",   description: "Kiểm soát cơ bản cho doanh nghiệp nhỏ" },
  PROFESSIONAL: { name: "Professional", icon: Crown,  color: "text-amber-600 bg-amber-50", description: "Đầy đủ tính năng: trace, handoff, exception, audit pack" },
  ENTERPRISE:   { name: "Enterprise",   icon: Crown,  color: "text-purple-600 bg-purple-50", description: "Không giới hạn, SoD nâng cao, custom branding" },
}

const FEATURE_LABELS: Record<string, string> = {
  MAX_USERS: "Số người dùng tối đa",
  MAX_DOC_TYPES: "Số loại chứng từ",
  AUDIT_PACK: "Gói kiểm toán (Audit Pack)",
  SLA_TRACKING: "Theo dõi SLA bàn giao",
  PORTAL: "Cổng khách hàng & đại lý",
  CUSTOM_BRANDING: "Thương hiệu riêng",
  RISK_ALERTS: "Cảnh báo rủi ro",
  DELEGATION: "Uỷ quyền phê duyệt",
}

export default function BillingPage() {
  const { hasRole } = useSession()
  const [info, setInfo] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    rpc<SubscriptionInfo>("api_subscription_info")
      .then((r) => { if (r.ok) setInfo(r) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Gói dịch vụ" />
        <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Không thể tải thông tin gói dịch vụ
        </div>
      </div>
    )
  }

  const meta = PLAN_META[info.plan] || PLAN_META.STARTER
  const sub = info.subscription
  const maxUsers = info.features?.MAX_USERS?.limit
  const usagePct = maxUsers ? Math.round((info.usage.active_users / maxUsers) * 100) : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Gói dịch vụ & Sử dụng" />

      <div className="rounded-lg border bg-background p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", meta.color)}>
              <meta.icon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{meta.name}</h2>
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            </div>
          </div>
          {sub && (
            <div className="shrink-0 text-right text-sm">
              <span className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                sub.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                sub.status === "TRIAL" ? "bg-blue-50 text-blue-700 ring-blue-200" :
                "bg-muted text-muted-foreground ring-border"
              )}>
                {sub.status === "ACTIVE" ? "Đang hoạt động" : sub.status === "TRIAL" ? "Dùng thử" : sub.status}
              </span>
              {sub.trial_ends && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Dùng thử đến {new Date(sub.trial_ends).toLocaleDateString("vi-VN")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            Người dùng
          </div>
          <div className="mt-2 text-2xl font-semibold">{info.usage.active_users}</div>
          {maxUsers && (
            <>
              <div className="mt-1 text-xs text-muted-foreground">/ {maxUsers} tối đa</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", usagePct > 80 ? "bg-orange-500" : "bg-primary")}
                  style={{ width: `${Math.min(usagePct, 100)}%` }}
                />
              </div>
            </>
          )}
          {!maxUsers && <div className="mt-1 text-xs text-muted-foreground">Không giới hạn</div>}
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            Loại chứng từ đã dùng
          </div>
          <div className="mt-2 text-2xl font-semibold">{info.usage.doc_types_used}</div>
          {info.features?.MAX_DOC_TYPES?.limit && (
            <div className="mt-1 text-xs text-muted-foreground">/ {info.features.MAX_DOC_TYPES.limit} tối đa</div>
          )}
          {!info.features?.MAX_DOC_TYPES?.limit && (
            <div className="mt-1 text-xs text-muted-foreground">Không giới hạn</div>
          )}
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            Tổng chứng từ
          </div>
          <div className="mt-2 text-2xl font-semibold">{info.usage.documents_total.toLocaleString("vi-VN")}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Tính năng theo gói</h3>
        </div>
        <div className="divide-y">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => {
            const feat = info.features?.[key]
            const enabled = feat?.enabled ?? false
            return (
              <div key={key} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{label}</span>
                <span className="flex items-center gap-1">
                  {enabled ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {feat?.limit != null && <span className="text-muted-foreground">({feat.limit})</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {hasRole("SYS_ADMIN") && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Để nâng/hạ gói, sử dụng <code className="rounded bg-muted px-1">api_admin_change_plan</code> qua RPC hoặc liên hệ quản trị.
        </div>
      )}
    </div>
  )
}
