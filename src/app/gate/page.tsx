import { KeyRound, ShieldCheck } from "lucide-react"

export default function GatePage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string }
}) {
  const next = searchParams.next || "/login"
  const hasError = searchParams.error === "1"

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">E</div>
          <div>
            <h1 className="text-lg font-semibold">ERP General</h1>
            <p className="text-sm text-muted-foreground">Demo giáo dục — cần mã truy cập</p>
          </div>
        </div>

        <form action="/api/gate" method="POST" className="mt-6 space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Mã truy cập demo</span>
            <input
              type="password"
              name="code"
              autoFocus
              required
              autoComplete="off"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </label>
          {hasError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Mã truy cập không đúng.</p>}
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <KeyRound className="h-4 w-4" /> Tiếp tục
          </button>
        </form>

        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Hỏi người quản lý dự án để lấy mã truy cập.
        </p>
      </div>
    </div>
  )
}
