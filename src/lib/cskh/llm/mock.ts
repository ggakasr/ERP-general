import type { ChatMessage, LLMProvider, LLMResponse, ToolCall, ToolDef } from "../types"

const INTENTS: [string, RegExp[]][] = [
  ["tra_don", [/tra.?c[ứu]u|ki[ểe]m tra|đ[ơo]n h[àa]ng|status|tracking|đơn/i, /DH[-\s]?\d+/i]],
  ["xac_thuc", [/x[áa]c th[ựu]c|verify|m[ãa] đ[ơo]n.*s[ốo]|phone/i]],
  ["faq_doi_tra", [/đ[ổo]i tr[ảa]|return|ho[àa]n|refund/i]],
  ["faq_giao_hang", [/giao h[àa]ng|delivery|shipping|v[ậa]n chuy[ểe]n/i]],
  ["khieu_nai", [/khi[ếe]u n[ạa]i|complain|ph[àa]n [àa]nh|b[ồo]i th[ươ][ơo]ng/i]],
  ["handoff", [/g[ặa]p nh[âa]n vi[êe]n|talk.*human|agent|chuy[ểe]n ng[ươ][ơo]i/i]],
  ["chao", [/^(xin ch[àa]o|hello|hi|ch[àa]o|hey)\s*[!.?]?\s*$/i]],
  ["ket_thuc", [/^(c[ảa]m [ơo]n|thanks|bye|t[ạa]m bi[ệe]t|ok xong)\s*[!.?]?\s*$/i]],
]

function detect(text: string): string {
  for (const [intent, patterns] of INTENTS) {
    if (patterns.some(p => p.test(text))) return intent
  }
  return "fallback"
}

function extractOrderCode(text: string): string | null {
  const m = text.match(/(?:DH|SO|SHIPMENT|DN|INV)[-\s]?\d[\d-]*/i)
  return m ? m[0].replace(/\s/g, "").toUpperCase() : null
}

function extractPhone(text: string): string | null {
  const m = text.match(/0\d{9,10}/)
  return m ? m[0] : null
}

export class MockProvider implements LLMProvider {
  name = "mock"
  model = "mock"

  async chat(messages: ChatMessage[], tools: ToolDef[], _systemPrompt: string): Promise<LLMResponse> {
    const lastUser = [...messages].reverse().find(m => m.role === "user")
    const text = lastUser?.content || ""
    const intent = detect(text)

    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant")
    const prevToolResults = messages.filter(m => m.role === "tool")
    const hasToolResult = prevToolResults.length > 0 && messages[messages.length - 1]?.role === "tool"

    if (hasToolResult) {
      return this.handleToolResult(messages, intent)
    }

    const response = this.generateResponse(intent, text, tools)
    return { ...response, usage: { tokensIn: 0, tokensOut: 0 } }
  }

  private generateResponse(intent: string, text: string, tools: ToolDef[]): Omit<LLMResponse, "usage"> {
    const orderCode = extractOrderCode(text)
    const phone = extractPhone(text)

    switch (intent) {
      case "chao":
        return { content: "Xin chào! Em có thể giúp gì cho anh/chị ạ? Em hỗ trợ tra cứu đơn hàng, chính sách đổi trả, và các thắc mắc khác.", toolCalls: [] }

      case "ket_thuc":
        return { content: "Cảm ơn anh/chị đã liên hệ! Chúc anh/chị một ngày tốt lành ạ. 😊", toolCalls: [] }

      case "tra_don":
        if (orderCode) {
          return { content: null, toolCalls: [{ id: "tc_1", name: "tra_cuu_don_hang", args: { ma_don: orderCode } }] }
        }
        return { content: "Anh/chị vui lòng cho em mã đơn hàng (ví dụ: SO-202601-00001) để em tra cứu ạ.", toolCalls: [] }

      case "xac_thuc":
        if (orderCode && phone) {
          return { content: null, toolCalls: [{ id: "tc_1", name: "xac_thuc_khach", args: { ma_don: orderCode, sdt: phone } }] }
        }
        return { content: "Để xác thực, anh/chị vui lòng cung cấp mã đơn hàng và số điện thoại đặt hàng ạ.", toolCalls: [] }

      case "faq_doi_tra":
        return { content: null, toolCalls: [{ id: "tc_1", name: "tra_cuu_faq", args: { query: "đổi trả" } }] }

      case "faq_giao_hang":
        return { content: null, toolCalls: [{ id: "tc_1", name: "tra_cuu_faq", args: { query: "giao hàng" } }] }

      case "khieu_nai":
        return { content: null, toolCalls: [{ id: "tc_1", name: "de_xuat_handoff", args: { reason: "Khách hàng khiếu nại — cần nhân viên xử lý" } }] }

      case "handoff":
        return { content: null, toolCalls: [{ id: "tc_1", name: "de_xuat_handoff", args: { reason: "Khách yêu cầu gặp nhân viên" } }] }

      default:
        return { content: "Em chưa hiểu rõ yêu cầu của anh/chị. Anh/chị có thể cho em biết mã đơn hàng cần tra cứu, hoặc hỏi về chính sách đổi trả/giao hàng ạ?", toolCalls: [] }
    }
  }

  private handleToolResult(messages: ChatMessage[], _intent: string): LLMResponse {
    const toolMsg = [...messages].reverse().find(m => m.role === "tool")
    if (!toolMsg?.content) {
      return { content: "Xin lỗi, em không tìm thấy thông tin. Anh/chị vui lòng thử lại hoặc liên hệ nhân viên ạ.", toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    let result: Record<string, unknown> = {}
    try { result = JSON.parse(toolMsg.content) } catch { /* empty */ }

    if (result.error === "not_found" || result.error === "order_not_found") {
      return { content: "Em không tìm thấy đơn hàng này trong hệ thống. Anh/chị vui lòng kiểm tra lại mã đơn ạ.", toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    if (result.articles && Array.isArray(result.articles)) {
      const articles = result.articles as Array<{ title: string; body: string }>
      if (articles.length === 0) {
        return { content: "Em chưa tìm thấy bài viết phù hợp. Anh/chị có thể hỏi cụ thể hơn hoặc liên hệ nhân viên ạ.", toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
      }
      const a = articles[0]
      return { content: `**${a.title}**\n\n${a.body}`, toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    if (result.ticket_number) {
      return { content: `Em đã chuyển yêu cầu đến nhân viên CSKH (mã ticket: ${result.ticket_number}). Nhân viên sẽ liên hệ anh/chị sớm nhất ạ.`, toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    if (result.customer_name && result.order_id) {
      return { content: `Xác thực thành công! Xin chào ${result.customer_name}. Em sẽ hiển thị đầy đủ thông tin đơn hàng cho anh/chị.`, toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    if (result.error === "phone_mismatch") {
      return { content: "Số điện thoại không khớp với thông tin đơn hàng. Anh/chị vui lòng kiểm tra lại ạ.", toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    if (result.number && result.status) {
      let msg = `Đơn **${result.number}** hiện ở trạng thái: **${result.status}**.`
      if (result.delivery_date) msg += ` Dự kiến giao: ${result.delivery_date}.`
      if (result.amount) msg += ` Giá trị: ${Number(result.amount).toLocaleString("vi-VN")}đ.`
      return { content: msg, toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
    }

    return { content: "Cảm ơn anh/chị. Em đã ghi nhận thông tin.", toolCalls: [], usage: { tokensIn: 0, tokensOut: 0 } }
  }
}
