"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RefreshCw } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import { MOVE_LABELS } from "@/lib/labels"
import { cn, downloadCsv, formatDateTime, formatMoney, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Field, Select } from "@/components/ui/form"
import { DocLink, ErrorBox, Loading, Stat } from "@/components/shared/bits"
import { EmptyRow, HeadRow, NoPermission, TableShell, Td, Th, maskedOr, num } from "@/components/reports/common"

interface StockRow {
  product_id: string; product_code: string; product_name: string; product_type: string; unit: string
  warehouse_id: string; warehouse_name: string; branch_code: string
  qty: number; value?: number; unit_cost?: number | null; reserved: number; available: number; lots: number
  _masked?: string[]
}

interface LedgerRow {
  id: string; created_at: string; move_type: string; document_id: string; document_number: string; doc_type: string
  warehouse_name: string; qty: number; unit_cost?: number; value?: number; balance: number; remaining_qty: number
  source_document_number: string | null
  _masked?: string[]
}

function StockLedger({ product, warehouseId, onClose }: { product: StockRow | null; warehouseId: string; onClose: () => void }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!product) return
    let cancelled = false
    setRows(null)
    setError(null)
    rpc<{ rows: LedgerRow[] }>("api_stock_ledger", { p_product: product.product_id, p_warehouse: warehouseId || null }).then((res) => {
      if (cancelled) return
      if (!res.ok) setError(res.error || "Không tải được thẻ kho")
      else setRows(res.rows)
    })
    return () => { cancelled = true }
  }, [product, warehouseId])

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      title={product ? `Thẻ kho — ${product.product_code} ${product.product_name}` : ""}
      description={warehouseId && product ? `Kho: ${product.warehouse_name}` : "Tất cả kho trong phạm vi (số dư chạy tính theo từng kho)"}
      className="max-w-5xl"
    >
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Thời điểm</Th><Th>Loại</Th><Th>Chứng từ</Th><Th>Kho</Th><Th right>SL</Th><Th right>Đơn giá</Th><Th right>Giá trị</Th><Th right>Tồn chạy</Th><Th>Lô nguồn</Th>
            </HeadRow>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>Chưa có biến động kho</EmptyRow>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="whitespace-nowrap">{formatDateTime(r.created_at)}</Td>
                <Td className="whitespace-nowrap">{MOVE_LABELS[r.move_type] || r.move_type}</Td>
                <Td><DocLink id={r.document_id} number={r.document_number} /></Td>
                <Td className="whitespace-nowrap">{r.warehouse_name}</Td>
                <Td right className={cn(num(r.qty) < 0 ? "text-red-700" : "text-emerald-700")}>
                  {num(r.qty) > 0 ? "+" : ""}{formatNumber(r.qty)}
                </Td>
                <Td right>{maskedOr(r, "unit_cost", (v) => formatMoney(v))}</Td>
                <Td right>{maskedOr(r, "value", (v) => formatMoney(v))}</Td>
                <Td right className="font-medium">{formatNumber(r.balance)}</Td>
                <Td className="font-mono text-xs text-muted-foreground">{r.source_document_number || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </Dialog>
  )
}

export function StockPanel() {
  const { can, master } = useSession()
  const allowed = can("INVENTORY", "VIEW")
  const [warehouse, setWarehouse] = useState("")
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<StockRow | null>(null)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    const res = await rpc<{ rows: StockRow[] }>("api_stock_on_hand", { p_warehouse: warehouse || null })
    setLoading(false)
    if (!res.ok) { setError(res.error || "Không tải được tồn kho"); return }
    setError(null)
    setRows(res.rows)
  }, [allowed, warehouse])

  useEffect(() => { load() }, [load])

  if (!allowed) return <NoPermission>Báo cáo tồn kho yêu cầu quyền xem Tồn kho.</NoPermission>

  const valueMasked = (rows || []).some((r) => r._masked?.includes("value"))
  const totalValue = (rows || []).reduce((s, r) => s + num(r.value), 0)
  const totalQty = (rows || []).reduce((s, r) => s + num(r.qty), 0)

  const exportCsv = () => {
    if (!rows) return
    const m = (r: StockRow, k: keyof StockRow) => (r._masked?.includes(k as string) ? "(ẩn)" : (r[k] as any) ?? "")
    downloadCsv(`ton-kho-${new Date().toISOString().slice(0, 10)}`,
      ["Mã hàng", "Tên hàng", "ĐVT", "Kho", "Tồn", "Đã giữ chỗ", "Khả dụng", "Đơn giá bình quân", "Giá trị", "Số lô"],
      rows.map((r) => [r.product_code, r.product_name, r.unit, r.warehouse_name, r.qty, r.reserved, r.available, m(r, "unit_cost"), m(r, "value"), r.lots]))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Kho" className="w-64">
          <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">Tất cả</option>
            {master.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </Select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="Tải lại">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Số mặt hàng × kho" value={formatNumber(rows?.length ?? 0)} />
        <Stat label="Tổng số lượng tồn" value={formatNumber(totalQty)} />
        <Stat label="Tổng giá trị tồn (FIFO)" value={valueMasked ? "Ẩn theo quyền" : formatMoney(totalValue)} />
      </div>
      <p className="text-xs text-muted-foreground">Nhấn vào một mặt hàng để xem thẻ kho.</p>

      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Mặt hàng</Th><Th>Kho</Th><Th right>Tồn</Th><Th right>Đã giữ chỗ</Th><Th right>Khả dụng</Th><Th right>Đơn giá BQ</Th><Th right>Giá trị</Th><Th right>Số lô</Th>
            </HeadRow>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8}>Không có tồn kho trong phạm vi của bạn</EmptyRow>}
            {rows.map((r) => (
              <tr key={`${r.product_id}-${r.warehouse_id}`} className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => setSelected(r)}>
                <Td>
                  <span className="mr-2 font-mono text-xs text-primary">{r.product_code}</span>
                  <span className="hover:underline">{r.product_name}</span>
                </Td>
                <Td className="whitespace-nowrap">{r.warehouse_name} <span className="text-xs text-muted-foreground">({r.branch_code})</span></Td>
                <Td right>{formatNumber(r.qty)} <span className="text-xs text-muted-foreground">{r.unit}</span></Td>
                <Td right>{formatNumber(r.reserved)}</Td>
                <Td right className={cn("font-medium", num(r.available) <= 0 && "text-red-700")}>{formatNumber(r.available)}</Td>
                <Td right>{maskedOr(r, "unit_cost", (v) => formatMoney(v))}</Td>
                <Td right>{maskedOr(r, "value", (v) => formatMoney(v))}</Td>
                <Td right>{r.lots}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <StockLedger product={selected} warehouseId={selected?.warehouse_id || ""} onClose={() => setSelected(null)} />
    </div>
  )
}
