"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
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
import { EmailOutboxPanel } from "@/components/admin/email-outbox-panel"

function AccessReviewTab() {
  const { can } = useSession()
  const router = useRouter()
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-end gap-3">
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
        <div className="flex flex-wrap items-start justify-end gap-3">
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
    { key: "users", label: "Người dùng & vai trò", visible: can("USER_ADMIN", "VIEW") },
    { key: "perms", label: "Ma trận phân quyền", visible: can("USER_ADMIN", "VIEW") },
    { key: "review", label: "Rà soát quyền", visible: can("ACCESS_REVIEW", "VIEW") },
    { key: "master", label: "Thay đổi dữ liệu chủ", visible: true },
    { key: "periods", label: "Kỳ kế toán", visible: true },
    { key: "dictionary", label: "Từ điển dữ liệu", visible: true },
    { key: "email", label: "Hàng đợi email", visible: can("USER_ADMIN", "VIEW") },
  ].filter((t) => t.visible)

  const [tab, setTab] = useState(tabs[0].key)
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key

  return (
    <div className="space-y-4">
      <PageHeader title="Quản trị hệ thống" />
      <Tabs items={tabs.map((t) => ({ key: t.key, label: t.label }))} value={active} onChange={setTab} />
      <div>
        {active === "users" && <UsersPanel />}
        {active === "perms" && <PermissionMatrixPanel />}
        {active === "review" && <AccessReviewTab />}
        {active === "master" && <MasterDataTab />}
        {active === "periods" && <PeriodsPanel />}
        {active === "dictionary" && <DataDictionaryPanel />}
        {active === "email" && <EmailOutboxPanel />}
      </div>
    </div>
  )
}
