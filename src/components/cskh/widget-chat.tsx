"use client"

import { useEffect } from "react"

type Props = {
  apiBase?: string
  token?: string
  title?: string
  welcome?: string
  accent?: string
}

// Loads the AI CSKH widget.js (separate FastAPI app, see "AI CSKH/docs/TICH-HOP-NEXTJS.md").
// Renders nothing when apiBase is unset, so a deploy without NEXT_PUBLIC_CSKH_API
// never tries to fetch http://localhost:8000 from an HTTPS page.
export default function WidgetChat({
  apiBase,
  token = "",
  title = "Hỗ trợ khách hàng",
  welcome,
  accent,
}: Props) {
  useEffect(() => {
    if (!apiBase) return
    if ((window as any).__AI_CSKH_LOADED__) return
    if (document.getElementById("ai-cskh-script")) return

    const base = apiBase.replace(/\/+$/, "")
    ;(window as any).AI_CSKH_CONFIG = { apiBase: base, token, title, welcome, accent }

    // Mobile: lift the bubble/panel above the fixed BottomNav (h-16) so they don't overlap.
    const style = document.createElement("style")
    style.id = "ai-cskh-erp-offset"
    style.textContent =
      "@media (max-width:1023px){#ai-cskh-bubble{bottom:80px!important}#ai-cskh-panel{bottom:146px!important;height:min(560px,calc(100vh - 170px))!important}}"
    document.head.appendChild(style)

    const script = document.createElement("script")
    script.id = "ai-cskh-script"
    script.src = `${base}/widget.js`
    script.defer = true
    script.onerror = () => console.warn(`[AI CSKH] Không tải được ${base}/widget.js — kiểm tra NEXT_PUBLIC_CSKH_API`)
    document.body.appendChild(script)
  }, [apiBase, token, title, welcome, accent])

  return null
}
