"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageCircle, RefreshCw, Send } from "lucide-react"
import { rpc } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { DirectoryUser } from "@/lib/types"
import { formatDateTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ErrorBox } from "@/components/shared/bits"

interface Comment {
  id: string
  user_id: string
  user_name: string
  body: string
  mentions: string[]
  created_at: string
}

interface CommentsResult {
  ok: boolean
  comments: Comment[]
}

function HighlightedBody({ body, mentions, users }: { body: string; mentions: string[]; users: DirectoryUser[] }) {
  const mentionNames = new Set(
    mentions.map((id) => users.find((u) => u.id === id)?.full_name).filter(Boolean)
  )
  if (mentionNames.size === 0) return <span>{body}</span>

  const parts: React.ReactNode[] = []
  let remaining = body
  let key = 0

  mentionNames.forEach((name) => {
    const pattern = `@${name}`
    const idx = remaining.indexOf(pattern)
    if (idx !== -1) {
      if (idx > 0) parts.push(<span key={key++}>{remaining.slice(0, idx)}</span>)
      parts.push(
        <span key={key++} className="rounded bg-info-subtle px-1 font-medium text-info">
          {pattern}
        </span>
      )
      remaining = remaining.slice(idx + pattern.length)
    }
  })
  if (remaining) parts.push(<span key={key++}>{remaining}</span>)
  return <>{parts.length > 0 ? parts : body}</>
}

export function CommentsTab({ documentId }: { documentId: string }) {
  const { master } = useSession()
  const [comments, setComments] = useState<Comment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState("")
  const [mentions, setMentions] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // @mention dropdown state
  const [showDrop, setShowDrop] = useState(false)
  const [mentionFilter, setMentionFilter] = useState("")
  const [atPos, setAtPos] = useState(-1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const res = await rpc<CommentsResult>("api_get_comments", { p_document_id: documentId })
    if (!res.ok) {
      setError((res as any).error || "Không tải được bình luận")
      return
    }
    setError(null)
    setComments(res.comments || [])
  }, [documentId])

  useEffect(() => { load() }, [load])

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setBody(val)
    setSubmitError(null)

    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const atIdx = before.lastIndexOf("@")
    if (atIdx !== -1) {
      const between = before.slice(atIdx + 1)
      if (!/\s/.test(between)) {
        setAtPos(atIdx)
        setMentionFilter(between.toLowerCase())
        setShowDrop(true)
        return
      }
    }
    setShowDrop(false)
  }

  function selectMention(user: DirectoryUser) {
    const before = body.slice(0, atPos)
    const after = body.slice(atPos + 1 + mentionFilter.length)
    setBody(`${before}@${user.full_name}${after}`)
    setMentions((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]))
    setShowDrop(false)
    textareaRef.current?.focus()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await rpc("api_add_comment", {
        p_document_id: documentId,
        p_body: body.trim(),
        p_mentions: mentions,
      })
      if (!res.ok) {
        setSubmitError((res as any).error || "Không gửi được bình luận")
        return
      }
      setBody("")
      setMentions([])
      setShowDrop(false)
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const filteredUsers = (master?.users ?? []).filter(
    (u) => u.status === "ACTIVE" && u.full_name.toLowerCase().includes(mentionFilter)
  ).slice(0, 8)

  if (error) return <ErrorBox message={error} onRetry={load} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {comments.length === 0 ? "Chưa có bình luận." : `${comments.length} bình luận`}
        </p>
        <Button variant="ghost" size="sm" className="h-8" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tải lại
        </Button>
      </div>

      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center text-muted-foreground">
          <MessageCircle className="h-8 w-8 opacity-40" />
          <p className="text-sm">Chưa có bình luận. Gõ để bắt đầu thảo luận.</p>
          <p className="text-xs">Dùng @TênNgười để nhắc đến đồng nghiệp.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{c.user_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                <HighlightedBody body={c.body} mentions={c.mentions} users={master?.users ?? []} />
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="relative space-y-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowDrop(false)
          }}
          placeholder="Viết bình luận… (dùng @Tên để nhắc đến đồng nghiệp)"
          rows={3}
          maxLength={4000}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={submitting}
        />

        {showDrop && filteredUsers.length > 0 && (
          <ul className="absolute bottom-full left-0 z-50 mb-1 max-h-48 w-64 overflow-auto rounded-md border bg-popover shadow-md">
            {filteredUsers.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectMention(u) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium">{u.full_name}</span>
                  <span className="text-xs text-muted-foreground">{u.position}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{body.length}/4000 ký tự</p>
          <Button type="submit" size="sm" className="h-8" disabled={!body.trim() || submitting}>
            {submitting ? (
              <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Đang gửi…</>
            ) : (
              <><Send className="mr-1.5 h-3.5 w-3.5" /> Gửi</>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
