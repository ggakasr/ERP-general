"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { DEMO_GROUPS, DEMO_PASSWORD } from "@/lib/demo-accounts"
import { Button } from "@/components/ui/button"
import { Field, Input } from "@/components/ui/form"
import { cn } from "@/lib/utils"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (e?: React.FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault()
    const creds = override || { email, password }
    setLoading(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({
      email: creds.email.includes("@") ? creds.email : `${creds.email}@erp.demo`,
      password: creds.password,
    })
    setLoading(false)
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Sai email hoặc mật khẩu" : error.message)
      return
    }
    router.replace(params.get("next") || "/dashboard")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[380px_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">E</div>
            <div>
              <h1 className="text-xl font-semibold">ERP General</h1>
              <p className="text-sm text-muted-foreground">Hệ thống ERP phổ quát — 11 luồng nghiệp vụ</p>
            </div>
          </div>

          <form onSubmit={signIn} className="mt-8 space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <Field label="Email hoặc tên đăng nhập">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vd: cfo hoặc cfo@erp.demo" autoComplete="username" required />
            </Field>
            <Field label="Mật khẩu">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Đăng nhập
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
            <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" /> Môi trường giáo dục</p>
            <p className="mt-1 text-blue-900/80">
              Tất cả tài khoản demo dùng mật khẩu <code className="rounded bg-white px-1">{DEMO_PASSWORD}</code>.
            </p>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground">Đăng nhập nhanh bằng tài khoản demo</p>
          <div className="grid gap-4 md:grid-cols-2">
            {DEMO_GROUPS.map((g) => (
              <div key={g.title} className="rounded-xl border bg-card p-3">
                <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
                <div className="space-y-1">
                  {g.accounts.map((a) => (
                    <button
                      key={a.email}
                      disabled={loading}
                      onClick={() => signIn(undefined, { email: a.email, password: DEMO_PASSWORD })}
                      className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent disabled:opacity-50")}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {a.name.split(" ").slice(-2).map((x) => x[0]).join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name} <span className="font-normal text-muted-foreground">· {a.role}</span></span>
                        <span className="block truncate text-xs text-muted-foreground">{a.email}@erp.demo — {a.note}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
