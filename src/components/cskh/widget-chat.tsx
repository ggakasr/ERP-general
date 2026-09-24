"use client"

import { useEffect } from "react"

type Props = {
  apiBase: string
  token?: string
  title?: string
  welcome?: string
  accent?: string
}

export default function WidgetChat({
  apiBase,
  token = "",
  title = "Hỗ trợ khách hàng",
  welcome,
  accent,
}: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return
    if ((window as any).__AI_CSKH_LOADED__) return

    ;(window as any).AI_CSKH_CONFIG = { apiBase, token, title, welcome, accent }

    const script = document.createElement("script")
    script.src = `${apiBase.replace(/\/+$/, "")}/widget.js`
    script.defer = true
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [apiBase, token, title, welcome, accent])

  return null
}
