"use client"

import { useState } from "react"
import { Info } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { statusLabel } from "@/lib/labels"
import type { Period } from "@/lib/types"
import { cn, formatDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { EmptyRow, HeadRow, TableShell, Td, Th } from "@/components/reports/common"

const PERIOD_CLASS: Record<string, string> = {
  OPEN: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  SOFT_CLOSE: "bg-amber-50 text-amber-800 ring-amber-200",
  HARD_CLOSE: "bg-slate-200 text-slate-700 ring-slate-300",
}
const PERIOD_LABEL: Record<string, string> = { OPEN: "Đang mở", SOFT_CLOSE: statusLabel("SOFT_CLOSE"), HARD_CLOSE: statusLabel("HARD_CLOSE") }

interface PendingChange { period: string; from: string; to: string; label: string; warning: string; danger?: boolean }

export function PeriodsPanel() {
  const { can, master, refreshMaster } = useSession()
  const toast = useToast()
  const canExecute = can("PERIOD", "EXECUTE")
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [busy, setBusy] = useState(false)

  const periods = [...(master.periods || [])].sort((a, b) => b.period.localeCompare(a.period))

  const actionsFor = (p: Period): PendingChange[] => {
    if (p.status === "OPEN") {
      return [{ period: p.period, from: p.status, to: "SOFT_CLOSE", label: "Khóa sơ bộ",
        warning: "Sau khi khóa sơ bộ, chỉ còn cho phép ghi bút toán điều chỉnh (JV) vào kỳ này. Các chứng từ nghiệp vụ khác sẽ bị chặn ghi sổ." }]
    }
    if (p.status === "SOFT_CLOSE") {
      return [
        { period: p.period, from: p.status, to: "OPEN", label: "Mở lại",
          warning: "Mở lại kỳ cho phép mọi chứng từ ghi sổ vào kỳ này. Chỉ thực hiện khi phát hiện sai sót cần xử lý." },
        { period: p.period, from: p.status, to: "HARD_CLOSE", label: "Khóa sổ", danger: true,
          warning: "Khóa sổ là KHÔNG THỂ HOÀN TÁC: không chứng từ nào (kể cả bút toán điều chỉnh) được ghi vào kỳ này nữa. Hệ thống sẽ từ chối nếu còn bút toán chờ ghi sổ trong kỳ." },
      ]
    }
    return []
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    const res = await rpc("api_set_period_status", { p_period: pending.period, p_status: pending.to })
    setBusy(false)
    if (!res.ok) {
      toast("error", `Không thể chuyển kỳ ${pending.period} sang ${PERIOD_LABEL[pending.to]}`, res.error)
      return
    }
    toast("success", `Kỳ ${pending.period}: ${PERIOD_LABEL[pending.from]} → ${PERIOD_LABEL[pending.to]}`)
    setPending(null)
    await refreshMaster()
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p><b>Đang mở</b>: mọi chứng từ được ghi sổ vào kỳ. <b>Khóa sơ bộ</b>: chỉ cho phép bút toán điều chỉnh (JV) để rà soát cuối kỳ. <b>Khóa sổ</b>: chặn mọi ghi sổ và không thể mở lại.</p>
          <p>Quy trình đóng kỳ (T4.11): Khóa sơ bộ → Rà soát &amp; điều chỉnh → Khóa sổ → Lập báo cáo. Ghi sổ vào kỳ đã khóa bị chặn (T1.9).</p>
        </div>
      </div>
      <TableShell>
        <thead>
          <HeadRow>
            <Th>Kỳ</Th><Th>Từ ngày</Th><Th>Đến ngày</Th><Th>Trạng thái</Th>{canExecute && <Th right>Thao tác</Th>}
          </HeadRow>
        </thead>
        <tbody>
          {periods.length === 0 && <EmptyRow colSpan={canExecute ? 5 : 4}>Chưa khai báo kỳ kế toán</EmptyRow>}
          {periods.map((p) => (
            <tr key={p.period} className="border-b last:border-0 hover:bg-muted/30">
              <Td className="font-mono font-medium">{p.period}</Td>
              <Td>{formatDate(p.start_date)}</Td>
              <Td>{formatDate(p.end_date)}</Td>
              <Td>
                <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", PERIOD_CLASS[p.status])}>
                  {PERIOD_LABEL[p.status] || p.status}
                </span>
              </Td>
              {canExecute && (
                <Td right>
                  <div className="flex justify-end gap-1">
                    {actionsFor(p).map((a) => (
                      <Button key={a.to} size="sm" variant={a.danger ? "destructive" : "outline"} className="h-7 px-2" onClick={() => setPending(a)}>
                        {a.label}
                      </Button>
                    ))}
                    {p.status === "HARD_CLOSE" && <span className="text-xs text-muted-foreground">Đã khóa vĩnh viễn</span>}
                  </div>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableShell>
      {!canExecute && <p className="text-xs text-muted-foreground">Bạn chỉ có quyền xem trạng thái kỳ. Thao tác khóa/mở kỳ cần quyền Khóa sổ kỳ · Thực hiện.</p>}

      <Dialog
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        title={pending ? `${pending.label} kỳ ${pending.period}?` : ""}
        description={pending ? `${PERIOD_LABEL[pending.from]} → ${PERIOD_LABEL[pending.to]}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Hủy</Button>
            <Button variant={pending?.danger ? "destructive" : "default"} onClick={confirm} disabled={busy}>
              {busy ? "Đang xử lý…" : `Xác nhận ${pending?.label.toLowerCase() || ""}`}
            </Button>
          </>
        }
      >
        <p className={cn("text-sm", pending?.danger && "font-medium text-red-700")}>{pending?.warning}</p>
        <p className="mt-2 text-xs text-muted-foreground">Thay đổi được ghi nhận người thực hiện, thời điểm và lưu vào audit trail.</p>
      </Dialog>
    </div>
  )
}
