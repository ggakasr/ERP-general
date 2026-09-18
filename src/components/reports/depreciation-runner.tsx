"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Calculator } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { formatMoney } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, Input } from "@/components/ui/form"
import { useToast } from "@/components/ui/toast"
import { currentPeriod } from "@/components/reports/common"

export function DepreciationRunner() {
  const { can } = useSession()
  const router = useRouter()
  const toast = useToast()
  const [period, setPeriod] = useState(currentPeriod())
  const [busy, setBusy] = useState(false)
  const allowed = can("DEPRECIATION", "EXECUTE")
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period)

  const run = async () => {
    if (!valid) return
    setBusy(true)
    const res = await rpc<{ id: string; number: string; amount: number }>("api_run_depreciation", { p_period: period })
    setBusy(false)
    if (!res.ok) {
      toast(res.code === "SOD_VIOLATION" ? "sod" : "error", "Không chạy được khấu hao", res.error)
      return
    }
    toast("success", `Đã tạo bút toán khấu hao ${res.number}`, `Tổng khấu hao kỳ ${period}: ${formatMoney(res.amount)} — đã gửi duyệt`)
    router.push(`/documents/${res.id}`)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" /> Chạy khấu hao TSCĐ theo kỳ</CardTitle>
        <CardDescription>Tạo bút toán (JV) Nợ 642 / Có 214 cho mọi tài sản đang sử dụng, rồi gửi duyệt theo quy trình bút toán.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!allowed ? (
          <p className="text-sm text-muted-foreground">Bạn không có quyền thực hiện chạy khấu hao.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Kỳ khấu hao (YYYY-MM)" className="w-44">
              <Input value={period} onChange={(e) => setPeriod(e.target.value.trim())} placeholder="2026-09" maxLength={7} />
            </Field>
            <Button onClick={run} disabled={!valid || busy}>
              {busy ? "Đang tính…" : "Chạy khấu hao"}
            </Button>
            {!valid && period && <p className="pb-2 text-xs text-red-700">Kỳ phải có dạng YYYY-MM</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
