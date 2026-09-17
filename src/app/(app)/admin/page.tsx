"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Info, Plus } from "lucide-react"
import { useSession } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/ui/tabs"
import { PageHeader } from "@/components/shared/bits"
import { DocTable } from "@/components/docs/doc-table"
import { NoPermission } from "@/components/reports/common"
import { UsersPanel } from "@/components/admin/users-panel"
import { PermissionMatrixPanel } from "@/components/admin/permission-matrix-panel"
import { PeriodsPanel } from "@/components/admin/periods-panel"
import { MasterCatalog } from "@/components/admin/master-catalog"
import { DataDictionaryPanel } from "@/components/admin/data-dictionary-panel"

function AccessReviewTab() {
  const { can } = useSession()
  const router = useRouter()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-1 gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Rà soát quyền định kỳ (T4.12): hệ thống chụp danh sách toàn bộ vai trò đang cấp → người lập đánh dấu Giữ/Thu hồi từng dòng →
            gửi duyệt → khi được duyệt, các quyền bị đánh dấu thu hồi sẽ được gỡ tự động và lưu vết đầy đủ.
          </p>
        </div>
        {can("ACCESS_REVIEW", "CREATE") && (
          <Button onClick={() => router.push("/documents/new?type=ACCESS_REVIEW")}>
            <Plus className="mr-1.5 h-4 w-4" /> Tạo đợt rà soát quyền
          </Button>
        )}
      </div>
      <DocTable docTypes={["ACCESS_REVIEW"]} compact hideCreate />
    </div>
  )
}

function MasterDataTab() {
  const { can } = useSession()
  const router = useRouter()
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-1 gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Dữ liệu chủ (khách hàng, nhà cung cấp, sản phẩm, kho, tài khoản…) không được sửa trực tiếp. Mọi thay đổi phải lập
              <b> yêu cầu thay đổi dữ liệu chủ</b> và được một người khác phê duyệt trước khi áp dụng (T1.15, BM-08).
            </p>
          </div>
          {can("MDC", "CREATE") && (
            <Button onClick={() => router.push("/documents/new?type=MDC")}>
              <Plus className="mr-1.5 h-4 w-4" /> Yêu cầu thay đổi
            </Button>
          )}
        </div>
        {can("MDC", "VIEW") ? (
          <DocTable docTypes={["MDC"]} compact hideCreate />
        ) : (
          <NoPermission>Bạn không có quyền xem các yêu cầu thay đổi dữ liệu chủ, nhưng vẫn có thể tra cứu danh mục bên dưới.</NoPermission>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Danh mục dữ liệu chủ (chỉ xem)</h2>
        <MasterCatalog />
      </section>
    </div>
  )
}

export default function AdminPage() {
  const { can } = useSession()

  const tabs = [
    { key: "users", label: "Người dùng & vai trò (BM-01)", visible: can("USER_ADMIN", "VIEW") },
    { key: "perms", label: "Ma trận phân quyền (BM-12)", visible: can("USER_ADMIN", "VIEW") },
    { key: "review", label: "Rà soát quyền (T4.12)", visible: can("ACCESS_REVIEW", "VIEW") },
    { key: "master", label: "Thay đổi dữ liệu chủ (BM-08)", visible: true },
    { key: "periods", label: "Kỳ kế toán", visible: true },
    { key: "dictionary", label: "Từ điển dữ liệu (BM-07)", visible: true },
  ].filter((t) => t.visible)

  const [tab, setTab] = useState(tabs[0].key)
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quản trị hệ thống"
        badge={<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">L10</span>}
        subtitle="Người dùng, phân quyền 3 tầng, rà soát quyền, dữ liệu chủ, kỳ kế toán và từ điển dữ liệu — mọi thay đổi đều được ghi audit trail."
      />
      <Tabs items={tabs.map((t) => ({ key: t.key, label: t.label }))} value={active} onChange={setTab} />
      <div>
        {active === "users" && <UsersPanel />}
        {active === "perms" && <PermissionMatrixPanel />}
        {active === "review" && <AccessReviewTab />}
        {active === "master" && <MasterDataTab />}
        {active === "periods" && <PeriodsPanel />}
        {active === "dictionary" && <DataDictionaryPanel />}
      </div>
    </div>
  )
}
