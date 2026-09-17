"use client"

import { Fragment, useState } from "react"
import { useSession } from "@/lib/session"
import { formatMoney, formatNumber } from "@/lib/utils"
import { Tabs } from "@/components/ui/tabs"
import { EmptyRow, HeadRow, TableShell, Td, Th } from "@/components/reports/common"
import { Masked } from "@/components/shared/bits"

const PARTNER_TYPE: Record<string, string> = { CUSTOMER: "Khách hàng", SUPPLIER: "Nhà cung cấp", BOTH: "KH & NCC" }
const PRODUCT_TYPE: Record<string, string> = { RAW: "Nguyên vật liệu", FINISHED: "Thành phẩm", GOODS: "Hàng hóa", SUPPLY: "Vật tư", SERVICE: "Dịch vụ" }
const ACCOUNT_TYPE: Record<string, string> = { ASSET: "Tài sản", LIABILITY: "Nợ phải trả", EQUITY: "Vốn chủ sở hữu", REVENUE: "Doanh thu", EXPENSE: "Chi phí" }
const MASTER_STATUS: Record<string, string> = { ACTIVE: "Đang dùng", INACTIVE: "Ngừng dùng" }

export function MasterCatalog() {
  const { master } = useSession()
  const [tab, setTab] = useState("partners")
  const costHidden = master.products.some((p) => p.standard_cost === undefined)

  return (
    <div className="space-y-3">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "partners", label: "Khách hàng/NCC", count: master.partners.length },
          { key: "products", label: "Sản phẩm", count: master.products.length },
          { key: "warehouses", label: "Kho", count: master.warehouses.length },
          { key: "boms", label: "Định mức BOM", count: master.boms?.length || 0 },
          { key: "accounts", label: "Hệ thống tài khoản", count: master.accounts.length },
        ]}
      />

      {tab === "partners" && (
        <TableShell>
          <thead><HeadRow><Th>Mã</Th><Th>Tên</Th><Th>Loại</Th><Th>Mã số thuế</Th><Th>Điện thoại</Th><Th right>Hạn TT (ngày)</Th><Th right>Hạn mức tín dụng</Th><Th>Trạng thái</Th></HeadRow></thead>
          <tbody>
            {master.partners.length === 0 && <EmptyRow colSpan={8}>Chưa có đối tác</EmptyRow>}
            {master.partners.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="font-mono">{p.code}</Td>
                <Td className="font-medium">{p.name}{p.address && <span className="block text-xs font-normal text-muted-foreground">{p.address}</span>}</Td>
                <Td className="whitespace-nowrap">{PARTNER_TYPE[p.partner_type] || p.partner_type}</Td>
                <Td className="font-mono text-xs">{p.tax_code || "—"}</Td>
                <Td className="whitespace-nowrap">{p.phone || "—"}</Td>
                <Td right>{formatNumber(p.payment_terms_days)}</Td>
                <Td right>{formatMoney(p.credit_limit)}</Td>
                <Td>{MASTER_STATUS[p.status] || p.status}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {tab === "products" && (
        <TableShell>
          <thead>
            <HeadRow>
              <Th>Mã</Th><Th>Tên</Th><Th>ĐVT</Th><Th>Loại</Th><Th>TK kho</Th>
              {!costHidden && <Th right>Giá vốn chuẩn</Th>}
              <Th right>Giá bán</Th><Th>Trạng thái</Th>
            </HeadRow>
          </thead>
          <tbody>
            {master.products.length === 0 && <EmptyRow colSpan={8}>Chưa có sản phẩm</EmptyRow>}
            {master.products.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="font-mono">{p.code}</Td>
                <Td className="font-medium">{p.name}</Td>
                <Td>{p.unit}</Td>
                <Td className="whitespace-nowrap">{PRODUCT_TYPE[p.product_type] || p.product_type}</Td>
                <Td className="font-mono">{p.inventory_account}</Td>
                {!costHidden && <Td right>{p.standard_cost === undefined ? <Masked /> : formatMoney(p.standard_cost)}</Td>}
                <Td right>{formatMoney(p.sale_price)}</Td>
                <Td>{MASTER_STATUS[p.status] || p.status}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {tab === "products" && costHidden && <p className="text-xs text-muted-foreground">Cột giá vốn chuẩn bị ẩn theo ma trận phân quyền của bạn.</p>}

      {tab === "warehouses" && (
        <TableShell>
          <thead><HeadRow><Th>Mã</Th><Th>Tên kho</Th><Th>Chi nhánh</Th></HeadRow></thead>
          <tbody>
            {master.warehouses.length === 0 && <EmptyRow colSpan={3}>Chưa có kho</EmptyRow>}
            {master.warehouses.map((w) => (
              <tr key={w.id} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="font-mono">{w.code}</Td>
                <Td className="font-medium">{w.name}</Td>
                <Td>{master.branches.find((b) => b.id === w.branch_id)?.name || w.branch_code}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {tab === "boms" && (
        <TableShell>
          <thead><HeadRow><Th>Mã định mức</Th><Th>Thành phẩm / nguyên vật liệu</Th><Th right>Số lượng</Th><Th>ĐVT</Th></HeadRow></thead>
          <tbody>
            {!master.boms?.length && <EmptyRow colSpan={4}>Chưa có định mức</EmptyRow>}
            {(master.boms || []).map((b) => (
              <Fragment key={b.id}>
                <tr className="border-b bg-muted/30">
                  <Td className="font-mono font-medium">{b.code}</Td>
                  <Td className="font-medium">{b.product_name}</Td>
                  <Td right className="font-medium">{formatNumber(b.output_qty)}</Td>
                  <Td className="text-xs text-muted-foreground">sản lượng đầu ra</Td>
                </tr>
                {(b.lines || []).map((l, i) => (
                  <tr key={`${b.id}-${i}`} className="border-b last:border-0">
                    <Td />
                    <Td className="pl-8 text-muted-foreground">↳ {l.product_name}</Td>
                    <Td right>{formatNumber(l.quantity)}</Td>
                    <Td>{l.unit}</Td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </TableShell>
      )}

      {tab === "accounts" && (
        <TableShell>
          <thead><HeadRow><Th>Số hiệu</Th><Th>Tên tài khoản</Th><Th>Loại</Th><Th>Số dư thông thường</Th></HeadRow></thead>
          <tbody>
            {master.accounts.length === 0 && <EmptyRow colSpan={4}>Chưa có tài khoản</EmptyRow>}
            {master.accounts.map((a) => (
              <tr key={a.code} className="border-b last:border-0 hover:bg-muted/30">
                <Td className="font-mono font-medium">{a.code}</Td>
                <Td>{a.name}</Td>
                <Td>{ACCOUNT_TYPE[a.account_type] || a.account_type}</Td>
                <Td>{a.normal_balance === "D" ? "Dư Nợ" : a.normal_balance === "C" ? "Dư Có" : a.normal_balance}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
