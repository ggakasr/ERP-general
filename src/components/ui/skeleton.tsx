import { cn } from "@/lib/utils"

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-1">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={cn("h-4 flex-1", j === 0 && "w-24 flex-none")} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

export function SkeletonKpiGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2 w-2 rounded-full" />
          </div>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonInbox({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-lg border bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="hidden gap-1 sm:flex">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-14" />
          </div>
          <Skeleton className="h-4 w-4 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonDocDetail() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="flex gap-1">
        {[88, 104, 72, 88, 80].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-b-none" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-1/3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-1/3" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
