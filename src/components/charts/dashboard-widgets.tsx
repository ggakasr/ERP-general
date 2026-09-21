"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney, formatNumber } from "@/lib/utils"
import { PALETTE, STATUS_COLORS } from "./chart-colors"

// ─── Shared empty/loading states ───────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="flex h-52 items-center justify-center">
      <div className="w-full space-y-2 px-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

function ChartEmpty({ msg = "Không có dữ liệu" }: { msg?: string }) {
  return (
    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
      {msg}
    </div>
  )
}

const CustomTooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  padding: "8px 12px",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
}

// ─── 1. Pipeline chứng từ theo trạng thái ──────────────────────────────────

interface PipelineRow { doc_type: string; status: string; count: number }

export function PipelineChart({ data }: { data: PipelineRow[] | null }) {
  if (!data) return <ChartSkeleton />

  // Pivot: one entry per doc_type; each status is a bar
  const statuses = Array.from(new Set(data.map((r) => r.status)))
  const docTypes  = Array.from(new Set(data.map((r) => r.doc_type)))
  const pivoted = docTypes.map((dt) => {
    const entry: Record<string, unknown> = { doc_type: dt }
    data.filter((r) => r.doc_type === dt).forEach((r) => { entry[r.status] = r.count })
    return entry
  })

  if (pivoted.length === 0) return <ChartEmpty />

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={pivoted} barSize={16} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="doc_type" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
        <Tooltip contentStyle={CustomTooltipStyle} />
        {statuses.map((s, i) => (
          <Bar key={s} dataKey={s} name={s} stackId="a"
            fill={STATUS_COLORS[s] ?? PALETTE[i % PALETTE.length]} radius={i === statuses.length - 1 ? [2, 2, 0, 0] : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 2. Vi phạm SoD theo tuần ──────────────────────────────────────────────

interface SeriesRow { period: string; value?: number; cash_in?: number; cash_out?: number }

export function SodViolationsChart({ data }: { data: SeriesRow[] | null }) {
  if (!data) return <ChartSkeleton />
  if (data.length === 0) return <ChartEmpty msg="Không có vi phạm SoD trong kỳ này" />

  const formatted = data.map((r) => ({
    ...r,
    period: r.period.slice(0, 10),
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={formatted} barSize={20} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
        <Tooltip contentStyle={CustomTooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Vi phạm"]} />
        <Bar dataKey="value" name="Vi phạm SoD" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 3. Ngoại lệ quá hạn SLA / 4. Bàn giao AT_RISK / BREACHED ─────────────

interface StatusRow { status: string; count: number }

const SLA_COLORS: Record<string, string> = {
  ON_TIME:  "hsl(var(--success))",
  AT_RISK:  "hsl(var(--warning))",
  BREACHED: "hsl(var(--destructive))",
}

export function HandoffSlaChart({ data }: { data: StatusRow[] | null }) {
  if (!data) return <ChartSkeleton />
  if (data.length === 0) return <ChartEmpty msg="Không có bàn giao đang mở" />

  const pieData = data.map((r) => ({
    name: r.status === "ON_TIME" ? "Đúng hạn" : r.status === "AT_RISK" ? "Sắp trễ" : "Trễ hạn",
    value: r.count,
    fill: SLA_COLORS[r.status] ?? PALETTE[0],
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
          innerRadius={45} outerRadius={72} paddingAngle={2}>
          {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
        </Pie>
        <Tooltip contentStyle={CustomTooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Bàn giao"]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function ExcStatusChart({ data }: { data: StatusRow[] | null }) {
  if (!data) return <ChartSkeleton />
  if (data.length === 0) return <ChartEmpty msg="Không có ngoại lệ trong kỳ" />

  const pieData = data.map((r, i) => ({
    name: r.status,
    value: r.count,
    fill: STATUS_COLORS[r.status] ?? PALETTE[i % PALETTE.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
          innerRadius={45} outerRadius={72} paddingAngle={2}>
          {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
        </Pie>
        <Tooltip contentStyle={CustomTooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Ngoại lệ"]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── 5. Top khách theo doanh thu ────────────────────────────────────────────

interface OwnerRow { label: string; value: number; value2?: number }

export function PartnerRevenueChart({ data }: { data: OwnerRow[] | null }) {
  if (!data) return <ChartSkeleton />
  if (data.length === 0) return <ChartEmpty msg="Chưa có hóa đơn xuất trong kỳ" />

  const formatted = data.slice(0, 8).map((r) => ({
    ...r,
    shortLabel: r.label.length > 20 ? r.label.slice(0, 18) + "…" : r.label,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} layout="vertical" barSize={14}
        margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => formatMoney(v, true)} />
        <YAxis type="category" dataKey="shortLabel" width={110}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={CustomTooltipStyle} formatter={(v) => [formatMoney(Number(v)), "Doanh thu"]} />
        <Bar dataKey="value" name="Doanh thu" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]}>
          {formatted.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 6. Dòng tiền vào / ra ──────────────────────────────────────────────────

export function CashFlowChart({ data }: { data: SeriesRow[] | null }) {
  if (!data) return <ChartSkeleton />
  if (data.length === 0) return <ChartEmpty msg="Chưa có bút toán tiền mặt / ngân hàng trong kỳ" />

  const formatted = data.map((r) => ({
    ...r,
    period: r.period.slice(0, 7), // YYYY-MM
    cash_in:  Number(r.cash_in  ?? 0),
    cash_out: Number(r.cash_out ?? 0),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} barSize={18} barCategoryGap="30%"
        margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => formatMoney(v, true)} />
        <Tooltip contentStyle={CustomTooltipStyle}
          formatter={(v, name) => [formatMoney(Number(v)), name === "cash_in" ? "Tiền vào" : "Tiền ra"]} />
        <Bar dataKey="cash_in"  name="cash_in"  fill="hsl(var(--success))"     radius={[2, 2, 0, 0]} />
        <Bar dataKey="cash_out" name="cash_out" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }}
          formatter={(v) => v === "cash_in" ? "Tiền vào" : "Tiền ra"} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 7. Số dư kho theo mặt hàng ─────────────────────────────────────────────

export function InventoryBalanceChart({ data }: { data: OwnerRow[] | null }) {
  if (!data) return <ChartSkeleton />
  if (data.length === 0) return <ChartEmpty msg="Không có dữ liệu tồn kho trong kỳ" />

  const formatted = data.slice(0, 8).map((r) => ({
    ...r,
    shortLabel: r.label.length > 20 ? r.label.slice(0, 18) + "…" : r.label,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} layout="vertical" barSize={14}
        margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => formatMoney(v, true)} />
        <YAxis type="category" dataKey="shortLabel" width={120}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={CustomTooltipStyle}
          formatter={(v, name) => [
            name === "value" ? `${formatNumber(Number(v))} ĐV` : formatMoney(Number(v)),
            name === "value" ? "Số lượng" : "Giá trị",
          ]} />
        <Bar dataKey="value2" name="value2" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]}>
          {formatted.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
