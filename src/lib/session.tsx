"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { rpc } from "@/lib/api"
import type { MasterData, MeResponse, Scope } from "@/lib/types"

const SCOPE_RANK: Record<Scope, number> = { OWN: 1, DEPARTMENT: 2, BRANCH: 3, COMPANY: 4 }

interface SessionValue {
  me: MeResponse
  master: MasterData
  unread: number
  setUnread: (n: number) => void
  /** highest scope the user holds for resource × action, or null */
  scopeOf: (resource: string, action: string) => Scope | null
  can: (resource: string, action: string) => boolean
  canAny: (resources: string[], action: string) => boolean
  hasRole: (role: string) => boolean
  refreshMaster: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [master, setMaster] = useState<MasterData | null>(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const signOut = useCallback(async () => {
    await createClient().auth.signOut()
    router.replace("/login")
    router.refresh()
  }, [router])

  const refreshMaster = useCallback(async () => {
    const m = await rpc<MasterData & { ok: boolean }>("api_master_data")
    if (m.ok) setMaster(m)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [meRes, masterRes] = await Promise.all([
        rpc<MeResponse>("api_me"),
        rpc<MasterData & { ok: boolean }>("api_master_data"),
      ])
      if (cancelled) return
      if (!meRes.ok) {
        if ((meRes as any).code === "UNAUTHENTICATED" || (meRes as any).code === "PGRST301") {
          await signOut()
          return
        }
        setError((meRes as any).error || "Không tải được thông tin người dùng")
        return
      }
      setMe(meRes)
      setUnread(meRes.unread_notifications)
      if (masterRes.ok) setMaster(masterRes)
      else setError((masterRes as any).error)
    })()
    return () => {
      cancelled = true
    }
  }, [signOut])

  const permIndex = useMemo(() => {
    const idx = new Map<string, Scope>()
    me?.permissions.forEach((p) => idx.set(`${p.resource}:${p.action}`, p.scope))
    return idx
  }, [me])

  const value = useMemo<SessionValue | null>(() => {
    if (!me || !master) return null
    const scopeOf = (resource: string, action: string) => permIndex.get(`${resource}:${action}`) ?? null
    return {
      me,
      master,
      unread,
      setUnread,
      scopeOf,
      can: (resource, action) => permIndex.has(`${resource}:${action}`),
      canAny: (resources, action) => resources.some((r) => permIndex.has(`${r}:${action}`)),
      hasRole: (role) => me.roles.some((r) => r.code === role),
      refreshMaster,
      signOut,
    }
  }, [me, master, unread, permIndex, refreshMaster, signOut])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Không thể tải phiên làm việc</p>
          <p className="mt-1">{error}</p>
          <button onClick={signOut} className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-white">Đăng nhập lại</button>
        </div>
      </div>
    )
  }

  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Đang tải phiên làm việc…
      </div>
    )
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useSession must be used inside SessionProvider")
  return ctx
}

export function scopeRank(scope: Scope | null) {
  return scope ? SCOPE_RANK[scope] : 0
}
