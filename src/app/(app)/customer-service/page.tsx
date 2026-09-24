"use client"

import Link from "next/link"
import { Bot } from "lucide-react"
import { ModulePage } from "@/components/docs/module-page"
import { useSession } from "@/lib/session"
import { Button } from "@/components/ui/button"

export default function CustomerServicePage() {
  const { hasRole } = useSession()
  const showBot = hasRole("CS_AGENT") || hasRole("CS_MANAGER")

  return (
    <div className="space-y-4">
      {showBot && (
        <Link href="/customer-service/bot">
          <Button variant="outline" className="h-9 gap-2">
            <Bot className="h-4 w-4" /> Điều hành Bot CSKH
          </Button>
        </Link>
      )}
      <ModulePage moduleKey="customer-service" />
    </div>
  )
}
