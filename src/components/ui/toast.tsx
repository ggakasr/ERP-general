"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastKind = "success" | "error" | "sod"
interface Toast { id: number; kind: ToastKind; title: string; body?: string }

const ToastContext = createContext<(kind: ToastKind, title: string, body?: string) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, title, body }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "success" ? 4000 : 9000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "sod" ? ShieldAlert : AlertTriangle
          return (
            <div
              key={t.id}
              className={cn(
                "flex gap-3 rounded-lg border p-3 text-sm shadow-lg",
                t.kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                t.kind === "error" && "border-red-200 bg-red-50 text-red-900",
                t.kind === "sod" && "border-orange-300 bg-orange-50 text-orange-900"
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                {t.body && <p className="mt-0.5 break-words opacity-90">{t.body}</p>}
              </div>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Đóng">
                <X className="h-4 w-4 opacity-60" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
