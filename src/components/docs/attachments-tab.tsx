"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, FileText, Paperclip, RefreshCw, Trash2, Upload } from "lucide-react"
import { rpc } from "@/lib/api"
import { createClient } from "@/lib/supabase/client"
import { formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ErrorBox, Loading } from "@/components/shared/bits"

interface Attachment {
  id: string
  file_name: string
  mime: string
  size_bytes: number
  storage_path: string
  checksum: string | null
  uploaded_by: string
  created_at: string
}

interface AttachmentsResult {
  ok: boolean
  attachments: Attachment[]
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentsTab({ documentId }: { documentId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await rpc<AttachmentsResult>("api_get_attachments", { p_document_id: documentId })
    if (!res.ok) {
      setError((res as any).error || "Không tải được danh sách file")
      return
    }
    setError(null)
    setAttachments(res.attachments || [])
  }, [documentId])

  useEffect(() => {
    load()
  }, [load])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? ""
      const uniqueName = `${documentId}/${Date.now()}_${file.name}`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(uniqueName, file, { contentType: file.type || "application/octet-stream" })

      if (uploadErr) {
        setUploadError(`Upload thất bại: ${uploadErr.message}`)
        return
      }

      // Compute simple checksum via SubtleCrypto (optional; skip if unavailable)
      let checksum: string | null = null
      try {
        const buf = await file.arrayBuffer()
        const hashBuf = await crypto.subtle.digest("SHA-256", buf)
        checksum = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      } catch {
        // SubtleCrypto not available in some environments — skip
      }

      const res = await rpc("api_attach_file", {
        p_document_id: documentId,
        p_file_name: file.name,
        p_mime: file.type || "application/octet-stream",
        p_size_bytes: file.size,
        p_storage_path: uploadData.path,
        p_checksum: checksum,
      })

      if (!res.ok) {
        setUploadError((res as any).error || "Không ghi metadata")
        // Attempt to remove the orphaned storage object
        await supabase.storage.from("documents").remove([uploadData.path])
        return
      }

      await load()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleDownload(att: Attachment) {
    const supabase = createClient()
    const { data, error: signErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(att.storage_path, 300)
    if (signErr || !data?.signedUrl) {
      alert(`Không tạo được link tải: ${signErr?.message ?? "Lỗi không xác định"}`)
      return
    }
    const a = document.createElement("a")
    a.href = data.signedUrl
    a.download = att.file_name
    a.click()
  }

  if (error) return <ErrorBox message={error} onRetry={load} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {attachments.length === 0 ? "Chưa có file đính kèm." : `${attachments.length} file đính kèm`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={load} disabled={uploading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tải lại
          </Button>
          <Button
            size="sm"
            className="h-8"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Đang tải lên…</>
            ) : (
              <><Upload className="mr-1.5 h-3.5 w-3.5" /> Đính kèm file</>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept="*/*"
          />
        </div>
      </div>

      {uploadError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center text-muted-foreground">
          <Paperclip className="h-8 w-8 opacity-40" />
          <p className="text-sm">Nhấn &quot;Đính kèm file&quot; để tải lên chứng từ gốc.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {humanSize(att.size_bytes)} · {att.mime} · {att.uploaded_by} · {formatDateTime(att.created_at)}
                  {att.checksum && (
                    <span className="ml-2 font-mono opacity-60">SHA-256: {att.checksum.slice(0, 12)}…</span>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => handleDownload(att)}
                title={`Tải ${att.file_name}`}
              >
                <Download className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
