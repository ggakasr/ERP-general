"use client"

import { useCallback, useEffect, useState } from "react"
import { ShieldOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/** Friendly block shown when the current user lacks a permission. */
export function NoPermission({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <ShieldOff className="h-6 w-6" />
      <p className="font-medium text-foreground">Bạn chưa được cấp quyền xem nội dung này</p>
      <p className="max-w-md">
        {children || "Vui lòng liên hệ quản trị hệ thống nếu bạn cần truy cập."}
      </p>
    </div>
  )
}

export interface Column<T> {
  key: string
  label: React.ReactNode
  align?: "left" | "right" | "center"
  className?: string
  render: (row: T, index: number) => React.ReactNode
}

/** Plain table with the same look as DocTable (rounded border, muted header, horizontal scroll). */
export function DataTable<T>({
  columns, rows, rowKey, empty = "Không có dữ liệu", loading, rowClassName,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  empty?: React.ReactNode
  loading?: boolean
  rowClassName?: (row: T) => string | undefined
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("whitespace-nowrap px-3 py-2 font-medium", c.align === "right" && "text-right", c.align === "center" && "text-center")}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                {loading ? "Đang tải…" : empty}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className={cn("border-b align-top last:border-0 hover:bg-muted/30", rowClassName?.(r))}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-3 py-2", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                >
                  {c.render(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Pill-style filter chips (same look as DocTable status filter). */
export function Chips<V extends string | null>({
  options, value, onChange,
}: { options: { value: V; label: React.ReactNode }[]; value: V; onChange: (v: V) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs",
            value === o.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Small tone pill for enums without a dedicated badge. */
export function Pill({ tone = "gray", children, className }: { tone?: "gray" | "blue" | "amber" | "green" | "red" | "violet"; children: React.ReactNode; className?: string }) {
  const toneClass = {
    gray: "bg-slate-100 text-slate-700 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
  }[tone]
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", toneClass, className)}>
      {children}
    </span>
  )
}

/** Reads a reference table directly (SELECT is granted for reference tables in 006_security.sql). */
export function useReferenceTable<T>(table: string, orderBy?: string) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = createClient().from(table).select("*")
      if (orderBy) q = q.order(orderBy, { ascending: true })
      const { data, error: err } = await q
      if (err) setError(err.message)
      else {
        setError(null)
        setRows((data || []) as T[])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không xác định")
    }
    setLoading(false)
  }, [table, orderBy])

  useEffect(() => {
    load()
  }, [load])

  return { rows, loading, error, reload: load }
}

export function Muted({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}
