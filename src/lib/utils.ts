import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const moneyFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const qtyFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

export function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = Number(value)
  if (Number.isNaN(n)) return "—"
  return `${moneyFmt.format(n)} ₫`
}

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  const n = Number(value)
  return Number.isNaN(n) ? "—" : qtyFmt.format(n)
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
  })
}

export function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(-2).toUpperCase()
}

export function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

/** Download rows as a UTF-8 CSV (Excel-friendly BOM). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
