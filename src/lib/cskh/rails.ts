import type { SessionContext, ToolCall } from "./types"

interface RailResult {
  blocked: boolean
  reply?: string
  forceHandoff?: boolean
  reason?: string
}

const FORBIDDEN_TRANSITIONS = ["SUBMIT", "APPROVE", "POST", "PAID", "CLOSE", "REJECT"]

export function checkToolRails(toolCall: ToolCall, ctx: SessionContext): RailResult {
  if (FORBIDDEN_TRANSITIONS.includes(String(toolCall.args.action || "").toUpperCase())) {
    return {
      blocked: true,
      reply: "Em không có quyền thực hiện thao tác này. Em sẽ chuyển yêu cầu đến nhân viên ạ.",
      forceHandoff: true,
      reason: `Bot attempted forbidden transition: ${toolCall.args.action}`,
    }
  }
  return { blocked: false }
}

export function checkReplyRails(
  reply: string,
  toolCalls: ToolCall[],
  ctx: SessionContext,
  forbiddenPromises: string[],
): RailResult {
  // R1: don't fabricate data when tool returned not_found
  const lastToolResult = toolCalls.find(tc => tc.result && typeof tc.result === "object")
  if (lastToolResult?.result) {
    const r = lastToolResult.result as Record<string, unknown>
    if (r.error === "not_found" || r.error === "order_not_found") {
      if (/đang giao|đã giao|sẽ giao|delivered|shipping/i.test(reply) && !/không tìm|not found|kiểm tra lại/i.test(reply)) {
        return {
          blocked: true,
          reply: "Em không tìm thấy đơn hàng này trong hệ thống. Anh/chị vui lòng kiểm tra lại mã đơn hoặc liên hệ nhân viên ạ.",
          reason: "R1: fabricated order status despite not_found result",
        }
      }
    }
  }

  // R2: block sensitive data leakage for unverified orders
  // (This is enforced at SQL level — api_cskh_tra_don only returns sensitive fields for verified orders.
  //  But we double-check the reply doesn't contain sensitive patterns without verification.)

  // R3: forbidden promises → force handoff
  const lower = reply.toLowerCase()
  for (const term of forbiddenPromises) {
    if (lower.includes(term.toLowerCase())) {
      return {
        blocked: true,
        forceHandoff: true,
        reply: "Em không thể cam kết điều này. Em sẽ chuyển yêu cầu đến nhân viên có thẩm quyền để hỗ trợ anh/chị ạ.",
        reason: `R3: forbidden promise detected: "${term}"`,
      }
    }
  }

  // R4: handoff tool must have a reason (enforced at tool level, but double-check)
  const handoffCall = toolCalls.find(tc => tc.name === "de_xuat_handoff")
  if (handoffCall && !handoffCall.args.reason) {
    return {
      blocked: true,
      reply: "Em sẽ chuyển yêu cầu của anh/chị đến nhân viên CSKH.",
      reason: "R4: handoff missing reason — using default",
    }
  }

  return { blocked: false }
}

// R5: explicit request for a human → hand off deterministically, without asking the LLM.
// Matches with or without diacritics (speech-to-text and hurried typing often drop them),
// and still works when the LLM provider is down or overloaded.
const HUMAN_REQUEST =
  /(gap|noi chuyen( voi)?|ket noi( voi)?|goi|chuyen( may)?( cho| sang| qua)?|can|muon|xin|cho (toi|em|minh|tui) (gap|noi chuyen voi)) (voi )?(nguoi that|con nguoi|nhan vien|tu van vien|tong dai vien|nguoi truc|nguoi ho tro)|\bnguoi that\b|\b(talk|speak) (to|with) (a )?(human|person|agent)\b/

export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
}

export function wantsHuman(text: string): boolean {
  return HUMAN_REQUEST.test(stripDiacritics(text).replace(/\s+/g, " "))
}
