export interface STTProvider {
  transcribe(input: string | Buffer): Promise<string>
}

export class MockSTT implements STTProvider {
  async transcribe(input: string | Buffer): Promise<string> {
    if (Buffer.isBuffer(input)) return "[mock audio input]"
    return input
  }
}

export class DeepgramSTT implements STTProvider {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model = "nova-3") {
    this.apiKey = apiKey
    this.model = model
  }

  async transcribe(input: string | Buffer): Promise<string> {
    if (!Buffer.isBuffer(input)) return input
    const res = await fetch("https://api.deepgram.com/v1/listen?model=" + this.model + "&language=vi", {
      method: "POST",
      headers: { Authorization: `Token ${this.apiKey}`, "Content-Type": "audio/wav" },
      body: input as unknown as BodyInit,
    })
    if (!res.ok) throw new Error(`Deepgram STT error: ${res.status}`)
    const json = await res.json()
    return json?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""
  }
}

export function createSTT(provider: string, env: Record<string, string | undefined> = process.env): STTProvider {
  switch (provider) {
    case "deepgram":
      return new DeepgramSTT(env.DEEPGRAM_API_KEY || "")
    case "mock":
    default:
      return new MockSTT()
  }
}
