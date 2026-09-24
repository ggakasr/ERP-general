import { createClient } from "@supabase/supabase-js"
import type { ToolDef, ToolCall, SessionContext } from "./types"

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "tra_cuu_don_hang",
    description: "Tra cứu đơn hàng theo mã (SO/SHIPMENT/DN/INV). Trả về trạng thái, ngày tạo, ngày giao dự kiến. Thông tin nhạy cảm (SĐT, địa chỉ, giá trị) chỉ hiện khi đã xác thực.",
    parameters: {
      type: "object",
      properties: {
        ma_don: { type: "string", description: "Mã đơn hàng, ví dụ: SO-202601-00001" },
      },
      required: ["ma_don"],
    },
  },
  {
    name: "xac_thuc_khach",
    description: "Xác thực khách hàng bằng mã đơn hàng + số điện thoại. Nếu khớp, đơn hàng sẽ được mở khóa thông tin nhạy cảm.",
    parameters: {
      type: "object",
      properties: {
        ma_don: { type: "string", description: "Mã đơn hàng" },
        sdt: { type: "string", description: "Số điện thoại đặt hàng" },
      },
      required: ["ma_don", "sdt"],
    },
  },
  {
    name: "tra_cuu_faq",
    description: "Tìm kiếm bài viết tri thức (FAQ, chính sách, kịch bản) theo từ khóa.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Từ khóa tìm kiếm" },
      },
      required: ["query"],
    },
  },
  {
    name: "de_xuat_handoff",
    description: "Chuyển cuộc hội thoại cho nhân viên CSKH. Tạo ticket hỗ trợ và thông báo nhân viên.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Lý do chuyển người" },
      },
      required: ["reason"],
    },
  },
]

export async function executeTool(
  toolCall: ToolCall,
  ctx: SessionContext,
): Promise<Record<string, unknown>> {
  const db = admin()

  switch (toolCall.name) {
    case "tra_cuu_don_hang": {
      const params: Record<string, unknown> = {
        p_tenant_id: ctx.tenantId,
        p_ma_don: String(toolCall.args.ma_don || ""),
        p_verified_orders: ctx.verifiedOrders,
      }
      if (ctx.customerId) params.p_customer_id = ctx.customerId
      const { data } = await db.rpc("api_cskh_tra_don", params)
      return (data as Record<string, unknown>) || { ok: false, error: "rpc_error" }
    }

    case "xac_thuc_khach": {
      const { data } = await db.rpc("api_cskh_xac_thuc", {
        p_tenant_id: ctx.tenantId,
        p_ma_don: String(toolCall.args.ma_don || ""),
        p_sdt: String(toolCall.args.sdt || ""),
      })
      const result = (data as Record<string, unknown>) || { ok: false, error: "rpc_error" }

      if (result.ok && result.order_id) {
        ctx.verifiedOrders = [...ctx.verifiedOrders, String(result.order_id)]
        await db.rpc("api_cskh_update_session", {
          p_tenant_id: ctx.tenantId,
          p_session_id: ctx.sessionId,
          p_verified_order: result.order_id,
        })
      }
      return result
    }

    case "tra_cuu_faq": {
      const { data } = await db.rpc("api_cskh_tra_faq", {
        p_tenant_id: ctx.tenantId,
        p_query: String(toolCall.args.query || ""),
      })
      return (data as Record<string, unknown>) || { ok: false, error: "rpc_error" }
    }

    case "de_xuat_handoff": {
      const { data } = await db.rpc("api_cskh_handoff", {
        p_tenant_id: ctx.tenantId,
        p_session_id: ctx.sessionId,
        p_reason: String(toolCall.args.reason || "Khách yêu cầu"),
      })
      const result = (data as Record<string, unknown>) || { ok: false, error: "rpc_error" }
      if (result.ok) ctx.status = "awaiting_human"
      return result
    }

    default:
      return { ok: false, error: "unknown_tool", tool: toolCall.name }
  }
}
