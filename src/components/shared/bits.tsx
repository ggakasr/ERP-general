import Link from "next/link"
import { Lock } from "lucide-react"
import { cn, formatMoney } from "@/lib/utils"
import { SLA_LABELS, SOD_CLASS, SOD_LABELS, statusClass, statusLabel } from "@/lib/labels"

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusClass(status), className)}>
      {statusLabel(status)}
    </span>
  )
}

export function SodBadge({ role, className }: { role?: string | null; className?: string }) {
  if (!role) return null
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", SOD_CLASS[role], className)}>
      {SOD_LABELS[role] || role}
    </span>
  )
}

export function SlaBadge({ status }: { status: string }) {
  const s = SLA_LABELS[status]
  if (!s) return null
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", s.className)}>{s.label}</span>
}

export function DocLink({ id, number, canView = true, className }: { id: string; number: string; canView?: boolean; className?: string }) {
  if (!canView) {
    return (
      <span className={cn("inline-flex items-center gap-1 font-mono text-muted-foreground", className)} title="Ngoài phạm vi dữ liệu của bạn">
        <Lock className="h-3 w-3" />
        {number}
      </span>
    )
  }
  return (
    <Link href={`/documents/${id}`} className={cn("font-mono text-primary hover:underline", className)}>
      {number}
    </Link>
  )
}

export function Masked({ label = "Ẩn theo quyền" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Trường này bị ẩn theo phân quyền của bạn">
      <Lock className="h-3 w-3" />
      {label}
    </span>
  )
}

export function Money({ value, masked }: { value: unknown; masked?: boolean }) {
  if (masked || value === undefined) return <Masked />
  return <span className="tabular-nums">{formatMoney(value)}</span>
}

export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>
}

export function Loading({ label = "Đang tải…" }: { label?: string }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{label}</div>
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums",
        tone === "good" && "text-emerald-700", tone === "warn" && "text-amber-700", tone === "bad" && "text-red-700")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function CheckList({ checks }: { checks: { label: string; document_number?: string; expected?: number; actual?: number | string; ok: boolean }[] }) {
  if (!checks.length) return <p className="text-sm text-muted-foreground">Không có kiểm tra nào.</p>
  return (
    <ul className="divide-y rounded-lg border">
      {checks.map((c, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold", c.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
            {c.ok ? "✓" : "!"}
          </span>
          <span className="flex-1">{c.label}</span>
          {c.document_number && <span className="font-mono text-xs text-muted-foreground">{c.document_number}</span>}
          {c.expected !== undefined && c.expected !== null && typeof c.actual !== "string" && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatMoneyOrQty(c.actual)} / {formatMoneyOrQty(c.expected)}
            </span>
          )}
          {typeof c.actual === "string" && <span className="text-xs text-muted-foreground">{c.actual}</span>}
        </li>
      ))}
    </ul>
  )
}

function formatMoneyOrQty(v: unknown) {
  const n = Number(v)
  if (Number.isNaN(n)) return "—"
  return Math.abs(n) >= 10000 ? formatMoney(n) : new Intl.NumberFormat("vi-VN").format(n)
}
