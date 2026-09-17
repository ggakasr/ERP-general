"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useERPStore } from "@/lib/store"
import { LoginPage } from "@/components/login-page"

export default function Home() {
  const currentUser = useERPStore((s) => s.currentUser)
  const router = useRouter()

  useEffect(() => {
    if (currentUser) {
      router.push("/dashboard")
    }
  }, [currentUser, router])

  if (currentUser) return null
  return <LoginPage />
}
