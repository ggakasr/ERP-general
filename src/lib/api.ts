import { createClient } from "@/lib/supabase/client"

export interface ApiResult {
  ok: boolean
  code?: string
  error?: string
  message?: string
  [key: string]: unknown
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** Calls a Postgres api_* function. Returns the JSON payload; business failures come back with ok=false. */
export async function rpc<T = ApiResult>(fn: string, args: Record<string, unknown> = {}): Promise<T & ApiResult> {
  const { data, error } = await createClient().rpc(fn, args)
  if (error) {
    return { ok: false, code: error.code || "RPC_ERROR", error: error.message } as T & ApiResult
  }
  return data as T & ApiResult
}

/** Same as rpc() but throws ApiError when ok=false — convenient for loaders. */
export async function rpcOrThrow<T = ApiResult>(fn: string, args: Record<string, unknown> = {}): Promise<T & ApiResult> {
  const res = await rpc<T>(fn, args)
  if (!res.ok) throw new ApiError(res.code || "ERROR", res.error || "Lỗi không xác định")
  return res
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
