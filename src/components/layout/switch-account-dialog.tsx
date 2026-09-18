"use client"

import { useState } from "react"
import { UserCog } from "lucide-react"
import { DEMO_GROUPS, DEMO_PASSWORD } from "@/lib/demo-accounts"
import { useSession } from "@/lib/session"
import { cn } from "@/lib/utils"
import { Dialog } from "@/components/ui/dialog"

/**
 * Lets you jump straight into any demo account from wherever you are in the app —
 * no sign-out needed. Meant for testing a cross-role flow (e.g. PR → PO → GRN → SINV
 * → PMT, 5+ different actors) without losing your place: after switching, the page
 * reloads on the SAME url as the new user.
 */
export function SwitchAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, switchUser } = useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = async (email: string) => {
    setBusy(email)
    setError(null)
    const err = await switchUser(email, DEMO_PASSWORD)
    if (err) {
      setError(err)
      setBusy(null)
    }
    // on success switchUser() reloads the page — nothing else to do here
  }

  return (
    <Dialog open={open} onClose={onClose} title="Chuyển tài khoản demo" description="Đang đăng nhập: mọi tài khoản khác dùng chung mật khẩu Demo@123." className="max-w-2xl">
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {DEMO_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {g.accounts.map((a) => {
                const isCurrent = me.user.email === `${a.email}@erp.demo`
                return (
                  <button
                    key={a.email}
                    disabled={isCurrent || busy !== null}
                    onClick={() => pick(a.email)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent disabled:cursor-default disabled:opacity-60",
                      isCurrent && "bg-primary/5 ring-1 ring-inset ring-primary/20"
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {a.name.split(" ").slice(-2).map((x) => x[0]).join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {a.name} <span className="font-normal text-muted-foreground">· {a.role}</span>
                        {isCurrent && <span className="ml-1.5 text-xs text-primary">(đang dùng)</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{a.email}@erp.demo — {a.note}</span>
                    </span>
                    {busy === a.email && <UserCog className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
