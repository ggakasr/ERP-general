"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/form"
import { ErrorBox, Loading } from "@/components/shared/bits"
import { EmptyRow, HeadRow, TableShell, Td, Th } from "@/components/reports/common"

interface DictRow { id: string; term: string; definition: string; data_type: string | null; domain: string | null; used_in: string[] | null; status: string | null }

export function DataDictionaryPanel() {
  const [rows, setRows] = useState<DictRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")

  useEffect(() => {
    let cancelled = false
    createClient().from("data_dictionary").select("*").order("term").then(({ data, error: err }) => {
      if (cancelled) return
      if (err) setError(err.message)
      else setRows((data || []) as DictRow[])
    })
    return () => { cancelled = true }
  }, [])

  const term = q.trim().toLowerCase()
  const filtered = (rows || []).filter((r) =>
    !term || [r.term, r.definition, r.domain, ...(r.used_in || [])].some((v) => (v || "").toLowerCase().includes(term)))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Thuật ngữ, định nghĩa, bảng…" className="w-72 pl-8" />
        </div>
        {rows && <span className="ml-auto text-xs text-muted-foreground">{filtered.length} / {rows.length} thuật ngữ</span>}
      </div>
      {error && <ErrorBox message={error} />}
      {!rows && !error && <Loading />}
      {rows && (
        <TableShell>
          <thead><HeadRow><Th>Thuật ngữ</Th><Th>Định nghĩa</Th><Th>Kiểu dữ liệu</Th><Th>Lĩnh vực</Th><Th>Dùng trong</Th><Th>Trạng thái</Th></HeadRow></thead>
          <tbody>
            {filtered.length === 0 && <EmptyRow colSpan={6}>Không có thuật ngữ phù hợp</EmptyRow>}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0 hover:bg-muted/30">
                <Td className="whitespace-nowrap font-mono font-medium">{r.term}</Td>
                <Td className="min-w-[280px]">{r.definition}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">{r.data_type || "—"}</Td>
                <Td className="whitespace-nowrap">{r.domain || "—"}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {(r.used_in || []).map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{t}</span>)}
                  </div>
                </Td>
                <Td className="whitespace-nowrap">{r.status === "DEPRECATED" ? "Ngừng dùng" : "Đang hiệu lực"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  )
}
