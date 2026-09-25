"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Browser voice call for the CSKH bubble: Web Speech API (speech recognition + speech
// synthesis) in the visitor's browser, the same /api/cskh/chat turn as typed chat.
// Free, no extra API key. Chrome/Edge (desktop + Android) support vi-VN recognition;
// Firefox has no SpeechRecognition.

export type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking"

type RecognitionResultEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function voiceCallSupported(): boolean {
  return !!recognitionCtor() && typeof window !== "undefined" && "speechSynthesis" in window
}

async function loadVietnameseVoice(): Promise<SpeechSynthesisVoice | null> {
  const pick = () => {
    const voices = window.speechSynthesis.getVoices()
    const vi = voices.filter(v => v.lang.toLowerCase().startsWith("vi"))
    // Prefer natural/online voices (Edge "Microsoft HoaiMy Online (Natural)", Chrome "Google").
    return vi.find(v => /natural|online|google/i.test(v.name)) || vi[0] || null
  }
  if (window.speechSynthesis.getVoices().length) return pick()
  await new Promise<void>(resolve => {
    const done = () => { window.speechSynthesis.removeEventListener("voiceschanged", done); resolve() }
    window.speechSynthesis.addEventListener("voiceschanged", done)
    setTimeout(done, 1500)
  })
  return pick()
}

// Chrome stops long utterances after ~15s — speak sentence-sized chunks.
function chunks(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?。\n]+[.!?。]*/g) || [text]
  const out: string[] = []
  for (const p of parts) {
    const s = p.trim()
    if (!s) continue
    if (out.length && (out[out.length - 1] + " " + s).length <= 180) out[out.length - 1] += " " + s
    else out.push(s)
  }
  return out
}

const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed": "Trình duyệt chưa được cấp quyền micro. Bấm biểu tượng ổ khóa cạnh địa chỉ web → cho phép Micro, rồi gọi lại.",
  "service-not-allowed": "Trình duyệt chặn dịch vụ nhận giọng nói. Vui lòng dùng Google Chrome hoặc Microsoft Edge bản chính thức.",
  "audio-capture": "Không tìm thấy micro. Hãy cắm micro/tai nghe rồi gọi lại.",
  "network": "Trình duyệt không kết nối được dịch vụ nhận giọng nói. Chỉ Google Chrome / Microsoft Edge bản chính thức hỗ trợ (Brave, Cốc Cốc, Opera thường không). Kiểm tra mạng rồi gọi lại.",
  "language-not-supported": "Trình duyệt không hỗ trợ nhận giọng tiếng Việt. Vui lòng dùng Google Chrome hoặc Microsoft Edge.",
}

type Options = {
  /** Sends one utterance through the chat API; resolves to the bot reply (null = no bot reply, e.g. waiting for staff). */
  send: (text: string) => Promise<string | null>
  greeting: string
}

export function useVoiceCall({ send, greeting }: Options) {
  const [state, setState] = useState<CallState>("idle")
  const [interim, setInterim] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [noVietnameseVoice, setNoVietnameseVoice] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [level, setLevel] = useState(0)

  const activeRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const recognitionRef = useRef<Recognition | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const startedAtRef = useRef(0)
  const micRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  useEffect(() => {
    if (state === "idle") return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [state])

  const speak = useCallback(async (text: string) => {
    for (const part of chunks(text)) {
      if (!activeRef.current) return
      await new Promise<void>(resolve => {
        const u = new SpeechSynthesisUtterance(part)
        u.lang = "vi-VN"
        if (voiceRef.current) u.voice = voiceRef.current
        u.rate = 1.05
        u.onend = () => resolve()
        u.onerror = () => resolve()
        window.speechSynthesis.speak(u)
      })
    }
  }, [])

  // One recognition turn: resolves with the final transcript, or "" on silence / interruption.
  const listenOnce = useCallback(() => new Promise<string>((resolve, reject) => {
    const Ctor = recognitionCtor()
    if (!Ctor) { reject(new Error("unsupported")); return }
    const rec = new Ctor()
    rec.lang = "vi-VN"
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    let finalText = ""
    let fatal: string | null = null
    rec.onresult = (e) => {
      let live = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else live += r[0].transcript
      }
      setInterim((finalText + " " + live).trim())
    }
    rec.onerror = (e) => {
      if (["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(e.error)) fatal = e.error
    }
    rec.onend = () => {
      recognitionRef.current = null
      if (fatal) reject(new Error(fatal))
      else resolve(finalText.trim())
    }
    recognitionRef.current = rec
    try { rec.start() } catch { recognitionRef.current = null; resolve("") }
  }), [])

  // Mic level meter — lets the caller see the browser actually receives sound.
  const openMic = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    let last = 0
    const tick = (t: number) => {
      if (!micRef.current) return
      if (t - last > 100) {
        last = t
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += (buf[i] - 128) * (buf[i] - 128)
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) / 40))
      }
      micRef.current.raf = requestAnimationFrame(tick)
    }
    micRef.current = { stream, ctx, raf: requestAnimationFrame(tick) }
  }

  const closeMic = useCallback(() => {
    const m = micRef.current
    micRef.current = null
    if (!m) return
    cancelAnimationFrame(m.raf)
    m.stream.getTracks().forEach(t => t.stop())
    void m.ctx.close().catch(() => {})
    setLevel(0)
  }, [])

  const stopAudio = useCallback(() => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    window.speechSynthesis.cancel()
    closeMic()
  }, [closeMic])

  const end = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    queueRef.current = []
    stopAudio()
    setInterim("")
    setHint(null)
    setState("idle")
  },[stopAudio])

  const loop = useCallback(async () => {
    let silentRounds = 0
    while (activeRef.current) {
      const next = queueRef.current.shift()
      if (next) {
        setState("speaking")
        await speak(next)
        continue
      }
      setState("listening")
      setInterim("")
      let heard = ""
      try {
        heard = await listenOnce()
      } catch (e) {
        setError(RECOGNITION_ERRORS[e instanceof Error ? e.message : ""] || RECOGNITION_ERRORS["not-allowed"])
        end()
        return
      }
      if (!activeRef.current) return
      if (!heard) {
        // Silence or interrupted by announce() — listen again / speak queued text.
        if (!queueRef.current.length && ++silentRounds >= 2) {
          setHint("Chưa nghe rõ tiếng anh/chị. Nếu thanh âm lượng không nhảy khi nói, hãy kiểm tra micro đang chọn của máy — hoặc gõ câu hỏi vào ô chat, em vẫn đọc câu trả lời.")
        }
        continue
      }
      silentRounds = 0
      setHint(null)
      setState("thinking")
      const reply = await sendRef.current(heard).catch(() => "Xin lỗi, em không kết nối được. Anh/chị nói lại giúp em ạ.")
      if (reply) queueRef.current.push(reply)
    }
  }, [speak, listenOnce, end])

  const start = useCallback(async () => {
    if (activeRef.current) return
    setError(null)
    if (!voiceCallSupported()) {
      setError("Trình duyệt này chưa hỗ trợ gọi. Vui lòng dùng Google Chrome hoặc Microsoft Edge.")
      return
    }
    activeRef.current = true
    startedAtRef.current = Date.now()
    setElapsed(0)
    setHint(null)
    setState("connecting")
    try {
      await openMic() // asks for mic permission right on the click, and drives the level meter
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ""
      setError(name === "NotFoundError" ? RECOGNITION_ERRORS["audio-capture"] : RECOGNITION_ERRORS["not-allowed"])
      activeRef.current = false
      setState("idle")
      return
    }
    voiceRef.current = await loadVietnameseVoice()
    setNoVietnameseVoice(!voiceRef.current)
    queueRef.current = [greeting]
    void loop()
  }, [greeting, loop])

  /** Speak text as soon as possible (e.g. a staff reply that arrived by polling). */
  const announce = useCallback((text: string) => {
    if (!activeRef.current || !text.trim()) return
    queueRef.current.push(text)
    recognitionRef.current?.abort() // listenOnce resolves "" → loop speaks the queue
  }, [])

  useEffect(() => () => {
    activeRef.current = false
    if (typeof window !== "undefined" && "speechSynthesis" in window) stopAudio()
  },[stopAudio])

  return { state, active: state !== "idle", interim, elapsed, error, hint, level, noVietnameseVoice, start, end, announce, clearError: () => setError(null) }
}
