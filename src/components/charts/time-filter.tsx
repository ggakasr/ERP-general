"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

export type TimeRange = "1m" | "3m" | "6m" | "1y"

const OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "1m", label: "1 tháng" },
  { key: "3m", label: "3 tháng" },
  { key: "6m", label: "6 tháng" },
  { key: "1y", label: "1 năm" },
]

export function getDateRange(range: TimeRange): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  if (range === "1m") from.setMonth(from.getMonth() - 1)
  else if (range === "3m") from.setMonth(from.getMonth() - 3)
  else if (range === "6m") from.setMonth(from.getMonth() - 6)
  else from.setFullYear(from.getFullYear() - 1)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

interface TimeFilterProps {
  value: TimeRange
  onChange: (v: TimeRange) => void
  className?: string
}

export function TimeFilter({ value, onChange, className }: TimeFilterProps) {
  return (
    <div className={cn("flex gap-1 rounded-md border bg-muted/40 p-0.5", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
