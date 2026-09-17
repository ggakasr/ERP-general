"use client"

import { useState } from "react"
import { useSession } from "@/lib/session"
import { PageHeader } from "@/components/shared/bits"
import { Tabs } from "@/components/ui/tabs"
import { HandoffsTab, OverviewTab, SodLogTab } from "@/components/controls/runtime-tabs"
import {
  OwnershipTab, PermissionMatrixTab, ShadowItImpactTab, SodMatrixTab, StateMachineTab,
} from "@/components/controls/reference-tabs"

export default function ControlsPage() {
  const { can } = useSession()
  const canControls = can("SOD_LOG", "VIEW") || can("AUDIT_TRAIL", "VIEW")
  const canHandoff = can("HANDOFF", "VIEW")

  const tabs = [
    ...(canControls ? [{ key: "overview", label: "Tổng quan" }] : []),
    { key: "sod-matrix", label: "Ma trận SoD (BM-06)" },
    ...(canControls ? [{ key: "sod-log", label: "Nhật ký SoD" }] : []),
    ...(canHandoff ? [{ key: "handoffs", label: "Bàn giao (BM-04)" }] : []),
    { key: "ownership", label: "Chủ sở hữu quy trình (BM-02)" },
    { key: "permissions", label: "Ma trận phân quyền (BM-12)" },
    { key: "state-machines", label: "Máy trạng thái (BM-05)" },
    { key: "shadow-it", label: "Shadow-IT (BM-13) & Tác động (BM-03)" },
  ]

  const [tab, setTab] = useState(tabs[0].key)
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Kiểm soát nội bộ"
        subtitle="Tầng L4 — tách biệt nhiệm vụ, bàn giao, chủ sở hữu, phân quyền 3 tầng và máy trạng thái (ĐK1–ĐK8)."
      />
      {!canControls && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Bạn đang xem các bảng cấu hình kiểm soát. Báo cáo tổng quan và nhật ký SoD chỉ dành cho người có quyền xem Nhật ký SoD hoặc Audit trail.
        </p>
      )}
      <Tabs items={tabs} value={active} onChange={setTab} />
      <div>
        {active === "overview" && <OverviewTab />}
        {active === "sod-matrix" && <SodMatrixTab />}
        {active === "sod-log" && <SodLogTab />}
        {active === "handoffs" && <HandoffsTab />}
        {active === "ownership" && <OwnershipTab />}
        {active === "permissions" && <PermissionMatrixTab />}
        {active === "state-machines" && <StateMachineTab />}
        {active === "shadow-it" && <ShadowItImpactTab />}
      </div>
    </div>
  )
}
