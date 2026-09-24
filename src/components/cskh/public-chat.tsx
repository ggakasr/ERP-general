"use client"

import { useEffect, useState } from "react"
import { ChatBubble } from "./chat-bubble"

export function PublicChat() {
  const [widgetKey, setWidgetKey] = useState<string>("")

  useEffect(() => {
    fetch("/api/cskh/widget-key-public")
      .then(r => r.json())
      .then(d => { if (d.ok && d.widget_key) setWidgetKey(d.widget_key) })
      .catch(() => {})
  }, [])

  if (!widgetKey) return null
  return <ChatBubble widgetKey={widgetKey} />
}
