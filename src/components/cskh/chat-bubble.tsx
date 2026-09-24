"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageCircle, Send, Star, X, Loader2, User, Bot } from "lucide-react"
import { cn } from "@/lib/utils"

type Message = {
  role: "user" | "assistant" | "agent"
  content: string
  agent_name?: string
}

type SessionState = "greeting" | "serving" | "awaiting_human" | "human_serving" | "closed"

type Props = {
  widgetKey?: string
  portalContext?: { customerId: string; customerName: string }
}

const STORAGE_KEY = "erp_cskh_session"

function loadSession(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function saveSession(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id) } catch {}
}
function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

export function ChatBubble({ widgetKey, portalContext }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<SessionState>("greeting")
  const [csat, setCsat] = useState<number | null>(null)
  const [csatSent, setCsatSent] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const saved = loadSession()
    if (saved) setSessionId(saved)
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  // Poll for new messages when awaiting/human_serving (simple polling, no Realtime needed)
  useEffect(() => {
    if (!sessionId || (status !== "awaiting_human" && status !== "human_serving")) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/cskh/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = await res.json()
        if (data.ok && data.messages) {
          setMessages(data.messages.map((m: any) => ({
            role: m.role, content: m.content, agent_name: m.agent_name,
          })))
          if (data.status) setStatus(data.status)
        }
      } catch {}
    }
    pollRef.current = setInterval(poll, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId, status])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setInput("")
    setMessages(prev => [...prev, { role: "user", content: text }])
    setSending(true)

    try {
      const payload: Record<string, unknown> = {
        message: text,
        session_id: sessionId,
      }
      if (!sessionId && widgetKey) {
        payload.widget_key = widgetKey
        payload.source = portalContext ? "portal" : "public"
        payload.channel = "chat"
      }

      const res = await fetch("/api/cskh/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id)
        saveSession(data.session_id)
      }

      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }])
      }

      if (data.status) setStatus(data.status as SessionState)
      if (data.handed_off) setStatus("awaiting_human")
      if (data.awaiting_human) setStatus("awaiting_human")
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Xin lỗi, không thể kết nối. Vui lòng thử lại sau.",
      }])
    } finally {
      setSending(false)
    }
  }, [input, sending, sessionId, widgetKey, portalContext])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleClose = () => {
    setOpen(false)
    if (status === "closed") {
      clearSession()
      setSessionId(null)
      setMessages([])
      setStatus("greeting")
      setCsat(null)
      setCsatSent(false)
    }
  }

  const handleEndChat = () => {
    setStatus("closed")
  }

  const submitCsat = async (score: number) => {
    setCsat(score)
    setCsatSent(true)
    if (sessionId) {
      try {
        await fetch("/api/cskh/csat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, csat: score }),
        })
      } catch {}
    }
  }

  const statusBanner = () => {
    if (status === "awaiting_human") {
      return (
        <div className="bg-warning/10 border-b border-warning/20 px-3 py-1.5 text-center text-xs text-warning-foreground">
          Nhân viên đang tiếp nhận...
        </div>
      )
    }
    if (status === "human_serving") {
      return (
        <div className="bg-success/10 border-b border-success/20 px-3 py-1.5 text-center text-xs text-success-foreground">
          Nhân viên đang hỗ trợ
        </div>
      )
    }
    return null
  }

  return (
    <>
      {/* Bubble button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105",
            "bottom-6 right-6 lg:bottom-8 lg:right-8",
          )}
          aria-label="Mở chat hỗ trợ"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
            "bottom-6 right-6 lg:bottom-8 lg:right-8",
            "w-[min(380px,calc(100vw-3rem))] h-[min(560px,calc(100vh-6rem))]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="text-sm font-medium">Hỗ trợ khách hàng</span>
            </div>
            <button onClick={handleClose} className="rounded p-0.5 hover:bg-primary-foreground/20" aria-label="Đóng">
              <X className="h-4 w-4" />
            </button>
          </div>

          {statusBanner()}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && status === "greeting" && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                Xin chào! Tôi là trợ lý AI. Anh/chị cần hỗ trợ gì ạ?
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {m.role !== "user" && (
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
                    m.role === "agent"
                      ? "bg-success/10 text-success-foreground"
                      : "bg-primary/10 text-primary",
                  )}>
                    {m.role === "agent" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {m.role === "agent" && m.agent_name && (
                    <div className="mb-0.5 text-xs font-medium text-muted-foreground">
                      {m.agent_name}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Đang trả lời...</span>
              </div>
            )}
          </div>

          {/* CSAT rating (shown when closed) */}
          {status === "closed" && !csatSent && (
            <div className="border-t px-3 py-3 text-center">
              <p className="mb-2 text-xs text-muted-foreground">Đánh giá cuộc trò chuyện:</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    onClick={() => submitCsat(s)}
                    className={cn(
                      "rounded p-1 transition-colors hover:text-warning",
                      csat && csat >= s ? "text-warning" : "text-muted-foreground",
                    )}
                    aria-label={`${s} sao`}
                  >
                    <Star className={cn("h-6 w-6", csat && csat >= s ? "fill-current" : "")} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {status === "closed" && csatSent && (
            <div className="border-t px-3 py-3 text-center text-xs text-muted-foreground">
              Cảm ơn đánh giá! Bạn có thể đóng cửa sổ chat.
            </div>
          )}

          {/* Input */}
          {status !== "closed" && (
            <div className="border-t p-2">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập tin nhắn..."
                  rows={1}
                  className={cn(
                    "flex-1 resize-none rounded-lg border bg-muted/50 px-3 py-2 text-sm",
                    "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary",
                    "max-h-24 min-h-[2.25rem]",
                  )}
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    "bg-primary text-primary-foreground transition-opacity",
                    (!input.trim() || sending) && "opacity-50",
                  )}
                  aria-label="Gửi"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              {status === "serving" && messages.length > 2 && (
                <button
                  onClick={handleEndChat}
                  className="mt-1.5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Kết thúc trò chuyện
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
