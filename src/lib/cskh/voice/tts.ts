export interface TTSProvider {
  synthesize(text: string): Promise<{ audio: Buffer; contentType: string }>
}

export class MockTTS implements TTSProvider {
  async synthesize(text: string): Promise<{ audio: Buffer; contentType: string }> {
    const sampleRate = 16000
    const duration = 0.25
    const numSamples = Math.floor(sampleRate * duration)
    const dataSize = numSamples * 2
    const buf = Buffer.alloc(44 + dataSize)
    buf.write("RIFF", 0)
    buf.writeUInt32LE(36 + dataSize, 4)
    buf.write("WAVE", 8)
    buf.write("fmt ", 12)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(1, 22)
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(sampleRate * 2, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write("data", 36)
    buf.writeUInt32LE(dataSize, 40)
    return { audio: buf, contentType: "audio/wav" }
  }
}

export class OpenAITTS implements TTSProvider {
  private apiKey: string
  private model: string
  private voice: string

  constructor(apiKey: string, model = "gpt-4o-mini-tts", voice = "alloy") {
    this.apiKey = apiKey
    this.model = model
    this.voice = voice
  }

  async synthesize(text: string): Promise<{ audio: Buffer; contentType: string }> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: text, voice: this.voice }),
    })
    if (!res.ok) throw new Error(`OpenAI TTS error: ${res.status}`)
    const arrayBuf = await res.arrayBuffer()
    return { audio: Buffer.from(arrayBuf), contentType: "audio/mpeg" }
  }
}

export class ElevenLabsTTS implements TTSProvider {
  private apiKey: string
  private voice: string
  private model: string

  constructor(apiKey: string, voice = "Vy", model = "eleven_multilingual_v2") {
    this.apiKey = apiKey
    this.voice = voice
    this.model = model
  }

  async synthesize(text: string): Promise<{ audio: Buffer; contentType: string }> {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voice}`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: this.model }),
    })
    if (!res.ok) throw new Error(`ElevenLabs TTS error: ${res.status}`)
    const arrayBuf = await res.arrayBuffer()
    return { audio: Buffer.from(arrayBuf), contentType: "audio/mpeg" }
  }
}

export function createTTS(provider: string, env: Record<string, string | undefined> = process.env): TTSProvider {
  switch (provider) {
    case "openai":
      return new OpenAITTS(env.OPENAI_API_KEY || "")
    case "elevenlabs":
      return new ElevenLabsTTS(env.XI_API_KEY || "")
    case "mock":
    default:
      return new MockTTS()
  }
}
