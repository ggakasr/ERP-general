import type { ChatMessage, AgentResult, SessionContext, BotConfig, ToolCall } from "./types"
import { createProvider } from "./llm"
import { TOOL_DEFS, executeTool } from "./tools"
import { checkToolRails, checkReplyRails } from "./rails"

const MAX_ROUNDS = 3
const TIMEOUT_MS = 15_000

function buildSystemPrompt(config: BotConfig, kbArticles: Array<{ title: string; body: string }>): string {
  const kb = kbArticles.map(a => `### ${a.title}\n${a.body}`).join("\n\n")
  return [
    `Bạn là ${config.persona}, trợ lý chăm sóc khách hàng qua chat.`,
    "Trả lời ngắn gọn, lịch sự, bằng tiếng Việt.",
    "Bạn CHỈ phục vụ khách hàng. KHÔNG phải trợ lý nội bộ.",
    "",
    "QUY TẮC QUAN TRỌNG:",
    "- Dùng tool tra_cuu_don_hang để tra đơn, KHÔNG BỊA thông tin.",
    "- Nếu tool trả not_found → nói rõ không tìm thấy, KHÔNG đoán trạng thái.",
    "- Thông tin nhạy cảm (SĐT, địa chỉ, giá trị) chỉ hiển thị khi khách đã xác thực (qua xac_thuc_khach).",
    "- KHÔNG cam kết: bồi thường, hoàn tiền 100%, miễn phí toàn bộ, cam kết, đảm bảo. Nếu khách yêu cầu → chuyển người.",
    "- Khi vấn đề vượt khả năng → dùng de_xuat_handoff để chuyển nhân viên. LUÔN kèm lý do.",
    "- Bạn KHÔNG được thực hiện bất kỳ thao tác nghiệp vụ nào (submit, approve, thanh toán, v.v.).",
    "",
    "TRI THỨC NỘI BỘ:",
    kb || "(chưa có bài viết tri thức)",
  ].join("\n")
}

export async function runAgent(
  userMessage: string,
  history: ChatMessage[],
  ctx: SessionContext,
  config: BotConfig,
  kbArticles: Array<{ title: string; body: string }>,
): Promise<AgentResult> {
  const provider = createProvider(config)
  const systemPrompt = buildSystemPrompt(config, kbArticles)
  const allToolCalls: ToolCall[] = []
  let totalIn = 0
  let totalOut = 0

  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
  ]

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await Promise.race([
      provider.chat(messages, TOOL_DEFS, systemPrompt),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), TIMEOUT_MS)),
    ])

    totalIn += response.usage.tokensIn
    totalOut += response.usage.tokensOut

    if (response.toolCalls.length === 0) {
      const reply = response.content || ""
      const railCheck = checkReplyRails(reply, allToolCalls, ctx, config.forbidden_promises)
      if (railCheck.blocked) {
        if (railCheck.forceHandoff && ctx.status === "serving") {
          const handoffResult = await executeTool(
            { id: "rail_handoff", name: "de_xuat_handoff", args: { reason: railCheck.reason || "Safety rail triggered" } },
            ctx,
          )
          allToolCalls.push({ id: "rail_handoff", name: "de_xuat_handoff", args: { reason: railCheck.reason || "" }, result: handoffResult })
        }
        return {
          reply: railCheck.reply || reply,
          toolCalls: allToolCalls,
          usage: { tokensIn: totalIn, tokensOut: totalOut, provider: provider.name, model: provider.model },
          handedOff: ctx.status !== "serving",
        }
      }
      return {
        reply,
        toolCalls: allToolCalls,
        usage: { tokensIn: totalIn, tokensOut: totalOut, provider: provider.name, model: provider.model },
        handedOff: ctx.status !== "serving",
      }
    }

    // Execute tool calls
    messages.push({ role: "assistant", content: response.content, tool_calls: response.toolCalls })

    for (const tc of response.toolCalls) {
      const railCheck = checkToolRails(tc, ctx)
      if (railCheck.blocked) {
        if (railCheck.forceHandoff && ctx.status === "serving") {
          await executeTool(
            { id: "rail_handoff", name: "de_xuat_handoff", args: { reason: railCheck.reason || "Forbidden action" } },
            ctx,
          )
        }
        return {
          reply: railCheck.reply || "Em không thể thực hiện thao tác này.",
          toolCalls: allToolCalls,
          usage: { tokensIn: totalIn, tokensOut: totalOut, provider: provider.name, model: provider.model },
          handedOff: ctx.status !== "serving",
        }
      }

      const result = await executeTool(tc, ctx)
      tc.result = result
      allToolCalls.push(tc)

      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: tc.id,
      })
    }
  }

  return {
    reply: "Em xin lỗi, hệ thống đang xử lý lâu hơn bình thường. Anh/chị vui lòng thử lại hoặc liên hệ nhân viên ạ.",
    toolCalls: allToolCalls,
    usage: { tokensIn: totalIn, tokensOut: totalOut, provider: provider.name, model: provider.model },
    handedOff: false,
  }
}
