"use client"

import { ShieldOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Masked } from "@/components/shared/bits"

/** Friendly "not permitted" notice used by report/admin panels. */
export function NoPermission({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
      <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-medium text-foreground">Bạn chưa được cấp quyền xem nội dung này</p>
        <p className="mt-1">{children || "Quyền truy cập được quản lý theo ma trận phân quyền 3 tầng (BM-12). Liên hệ quản trị hệ thống nếu bạn cần quyền."}</p>
      </div>
    </div>
  )
}

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border bg-card", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th className={cn("whitespace-nowrap px-3 py-2 font-medium", right && "text-right", className)}>{children}</th>
}

export function HeadRow({ children }: { children: React.ReactNode }) {
  return <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">{children}</tr>
}

export function Td({ children, right, className, colSpan }: { children?: React.ReactNode; right?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2", right && "whitespace-nowrap text-right tabular-nums", className)}>
      {children}
    </td>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">{children}</td>
    </tr>
  )
}

/** Render a possibly-masked field: <Masked/> when the backend stripped it. */
export function maskedOr(row: { _masked?: string[] } & Record<string, any>, key: string, render: (v: any) => React.ReactNode) {
  if (row._masked?.includes(key) || (row._masked && row[key] === undefined)) return <Masked />
  return render(row[key])
}

export function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function num(v: unknown): number {
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}
