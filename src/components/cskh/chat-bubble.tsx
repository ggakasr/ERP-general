"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MessageCircle, Send, Star, X, Loader2, User, Bot, Phone, PhoneOff, Mic } from "lucide-react"
import { cn } from "@/lib/utils"
import { useVoiceCall, type CallState } from "./use-voice-call"

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
const CALL_GREETING = "Xin chào, em là trợ lý AI chăm sóc khách hàng. Anh chị cần hỗ trợ gì ạ?"

const CALL_STATE_LABEL: Record<CallState, string> = {
  idle: "",
  connecting: "Đang kết nối...",
  listening: "Đang nghe — anh/chị cứ nói",
  thinking: "Đang xử lý...",
  speaking: "Đang trả lời...",
}

function formatDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}

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
  const sessionIdRef = useRef<string | null>(null)
  const statusRef = useRef<SessionState>("greeting")
  const spokenAgentCountRef = useRef(0)
  const [callNote, setCallNote] = useState<string | null>(null)
  sessionIdRef.current = sessionId
  statusRef.current = status

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

  // One turn through /api/cskh/chat (typed or spoken). Returns the bot reply, if any.
  const sendText = useCallback(async (text: string, channel: "chat" | "voice"): Promise<string | null> => {
    setMessages(prev => [...prev, { role: "user", content: text }])
    setSending(true)

    try {
      const sid = sessionIdRef.current
      const payload: Record<string, unknown> = {
        message: text,
        session_id: sid,
      }
      if (!sid && widgetKey) {
        payload.widget_key = widgetKey
        payload.source = portalContext ? "portal" : "public"
        payload.channel = channel
      }

      const res = await fetch("/api/cskh/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (data.session_id && data.session_id !== sessionIdRef.current) {
        sessionIdRef.current = data.session_id
        setSessionId(data.session_id)
        saveSession(data.session_id)
      }

      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }])
      }

      let next = (data.status as SessionState) || statusRef.current
      if (data.handed_off || data.awaiting_human) next = data.status === "human_serving" ? "human_serving" : "awaiting_human"
      statusRef.current = next
      setStatus(next)
      return data.reply || null
    } catch {
      const msg = "Xin lỗi, không thể kết nối. Vui lòng thử lại sau."
      setMessages(prev => [...prev, { role: "assistant", content: msg }])
      return msg
    } finally {
      setSending(false)
    }
  }, [widgetKey, portalContext])

  const call = useVoiceCall({ send: (text) => sendText(text, "voice"), greeting: CALL_GREETING })

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput("")
    await sendText(text, "chat")
  }, [input, sending, sendText])

  const startCall = () => {
    setCallNote(null)
    spokenAgentCountRef.current = messages.filter(m => m.role === "agent").length
    void call.start()
  }

  const endCall = useCallback(() => {
    if (!call.active) return
    setCallNote(`Cuộc gọi đã kết thúc · ${formatDuration(call.elapsed)}`)
    call.end()
  }, [call])

  const callActive = call.active
  const callActiveRef = useRef(false)
  const announceRef = useRef(call.announce)
  callActiveRef.current = callActive
  announceRef.current = call.announce

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
          const msgs: Message[] = data.messages
            .filter((m: { role: string; content: string | null }) => m.content && ["user", "assistant", "agent"].includes(m.role))
            .map((m: { role: Message["role"]; content: string; agent_name?: string }) => ({
              role: m.role, content: m.content, agent_name: m.agent_name,
            }))
          setMessages(msgs)
          // During a call, read out staff replies that arrived since the last poll.
          const agentMsgs = msgs.filter(m => m.role === "agent")
          if (callActiveRef.current) {
            if (statusRef.current === "awaiting_human" && data.status === "human_serving") {
              announceRef.current("Nhân viên đã tiếp nhận cuộc gọi.")
            }
            for (const m of agentMsgs.slice(spokenAgentCountRef.current)) announceRef.current(m.content)
          }
          spokenAgentCountRef.current = agentMsgs.length
          if (data.status) setStatus(data.status)
        }
      } catch {}
    }
    pollRef.current = setInterval(poll, callActive ? 3000 : 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId, status, callActive])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleClose = () => {
    endCall()
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
    endCall()
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
            <div className="flex items-center gap-1">
              {status !== "closed" && !call.active && (
                <button
                  onClick={startCall}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-primary-foreground/20"
                  aria-label="Gọi trợ lý"
                  title="Gọi bằng giọng nói (dùng micro của máy)"
                >
                  <Phone className="h-4 w-4" /> Gọi
                </button>
              )}
              <button onClick={handleClose} className="rounded p-0.5 hover:bg-primary-foreground/20" aria-label="Đóng">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {call.active && (
            <div className="border-b bg-primary/5 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {call.state === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />}
                  {call.state === "thinking" || call.state === "connecting"
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Mic className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">
                    {status === "awaiting_human" && call.state === "listening"
                      ? "Đang chờ nhân viên — anh/chị vẫn có thể nói"
                      : CALL_STATE_LABEL[call.state]}
                  </div>
                  <div className="text-[11px] tabular-nums text-muted-foreground">{formatDuration(call.elapsed)}</div>
                </div>
                <button
                  onClick={endCall}
                  className="flex items-center gap-1 rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
                  aria-label="Kết thúc cuộc gọi"
                >
                  <PhoneOff className="h-4 w-4" /> Kết thúc
                </button>
              </div>
              {call.state === "speaking" && (
                <button onClick={call.skip} className="mt-1.5 text-[11px] text-primary hover:underline">
                  Bỏ qua, để tôi nói →
                </button>
              )}
              {call.state === "listening" && call.meter && (
                <div className="mt-1.5 flex items-center gap-2" aria-hidden>
                  <span className="text-[10px] text-muted-foreground">Micro</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-100" style={{ width: `${Math.round(call.level * 100)}%` }} />
                  </div>
                </div>
              )}
              {call.hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{call.hint}</p>}
              {call.interim && call.state === "listening" && (
                <p className="mt-1.5 truncate text-xs italic text-muted-foreground">“{call.interim}”</p>
              )}
              {call.noVietnameseVoice && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Máy chưa có giọng đọc tiếng Việt — câu trả lời có thể đọc sai. Dùng Microsoft Edge để có giọng Việt tự nhiên.
                </p>
              )}
            </div>
          )}
          {!call.active && (call.error || callNote) && (
            <div className="flex items-start justify-between gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
              <span>{call.error || callNote}</span>
              <button onClick={() => { call.clearError(); setCallNote(null) }} aria-label="Ẩn" className="shrink-0">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

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
