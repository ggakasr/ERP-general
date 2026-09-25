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

  const activeRef = useRef(false)
  const queueRef = useRef<string[]>([])
  const recognitionRef = useRef<Recognition | null>(null)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const startedAtRef = useRef(0)
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
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") fatal = e.error
    }
    rec.onend = () => {
      recognitionRef.current = null
      if (fatal) reject(new Error(fatal))
      else resolve(finalText.trim())
    }
    recognitionRef.current = rec
    try { rec.start() } catch { recognitionRef.current = null; resolve("") }
  }), [])

  const stopAudio = () => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    window.speechSynthesis.cancel()
  }

  const end = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    queueRef.current = []
    stopAudio()
    setInterim("")
    setState("idle")
  }, [])

  const loop = useCallback(async () => {
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
        const code = e instanceof Error ? e.message : ""
        setError(code === "audio-capture"
          ? "Không tìm thấy micro. Hãy cắm micro/tai nghe rồi gọi lại."
          : "Trình duyệt chưa được cấp quyền micro. Bấm biểu tượng ổ khóa cạnh địa chỉ web → cho phép Micro, rồi gọi lại.")
        end()
        return
      }
      if (!activeRef.current) return
      if (!heard) continue // silence or interrupted by announce() — listen again / speak queued text
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
    setState("connecting")
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
  }, [])

  return { state, active: state !== "idle", interim, elapsed, error, noVietnameseVoice, start, end, announce, clearError: () => setError(null) }
}
