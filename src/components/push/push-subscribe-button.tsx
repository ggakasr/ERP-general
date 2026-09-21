"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { subscribeToPush, unsubscribeFromPush, getPushPermission } from "@/lib/push-client"

export function PushSubscribeButton() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    setSupported(ok)
    if (ok) {
      getPushPermission().then(setPermission)
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((s) => setSubscribed(!!s))
      ).catch(() => {})
    }
  }, [])

  if (!supported) return null

  async function toggle() {
    setLoading(true)
    if (subscribed) {
      await unsubscribeFromPush()
      setSubscribed(false)
      setPermission(await getPushPermission())
    } else {
      const sub = await subscribeToPush()
      if (sub) { setSubscribed(true); setPermission("granted") }
      else setPermission(await getPushPermission())
    }
    setLoading(false)
  }

  const label = permission === "denied"
    ? "Thông báo bị chặn"
    : subscribed ? "Tắt thông báo" : "Bật thông báo"

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={loading || permission === "denied"}
      className="gap-1.5"
      title={label}
    >
      {subscribed ? <Bell className="h-3.5 w-3.5 text-primary" /> : <BellOff className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  )
}
