export interface TelephonyProvider {
  startCall(callerId: string): Promise<{ callId: string }>
  endCall(callId: string): Promise<void>
}

export class MockTelephony implements TelephonyProvider {
  async startCall(_callerId: string): Promise<{ callId: string }> {
    const callId = Math.random().toString(16).slice(2, 12)
    return { callId }
  }

  async endCall(_callId: string): Promise<void> {}
}

export class VapiTelephony implements TelephonyProvider {
  async startCall(_callerId: string): Promise<{ callId: string }> {
    throw new Error("Vapi calls are inbound-only via webhook; use /api/cskh/vapi route")
  }

  async endCall(_callId: string): Promise<void> {}
}

export class TwilioTelephony implements TelephonyProvider {
  async startCall(_callerId: string): Promise<{ callId: string }> {
    throw new Error("Twilio integration not yet configured")
  }

  async endCall(_callId: string): Promise<void> {}
}

export function createTelephony(provider: string): TelephonyProvider {
  switch (provider) {
    case "vapi":
      return new VapiTelephony()
    case "twilio":
      return new TwilioTelephony()
    case "mock":
    default:
      return new MockTelephony()
  }
}
