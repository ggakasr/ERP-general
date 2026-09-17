"use client"

import { cn } from "@/lib/utils"

export interface TabItem {
  key: string
  label: React.ReactNode
  count?: number
}

export function Tabs({
  items, value, onChange, className,
}: { items: TabItem[]; value: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b", className)} role="tablist">
      {items.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
            value === t.key
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
