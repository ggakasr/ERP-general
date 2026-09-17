"use client"

import { useRouter } from "next/navigation"
import { useERPStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { User } from "@/lib/types"
import { Shield, Users, ShoppingBag, Landmark, Package, Factory, Headphones, Settings } from "lucide-react"

const ROLE_ICONS: Record<string, React.ElementType> = {
  ADMIN: Settings,
  SALES_MANAGER: ShoppingBag,
  PROCUREMENT: ShoppingBag,
  FINANCE_MANAGER: Landmark,
  WAREHOUSE: Package,
  HR_MANAGER: Users,
  PRODUCTION: Factory,
  ACCOUNTANT: Landmark,
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700 border-purple-200",
  SALES_MANAGER: "bg-blue-100 text-blue-700 border-blue-200",
  PROCUREMENT: "bg-orange-100 text-orange-700 border-orange-200",
  FINANCE_MANAGER: "bg-green-100 text-green-700 border-green-200",
  WAREHOUSE: "bg-yellow-100 text-yellow-700 border-yellow-200",
  HR_MANAGER: "bg-pink-100 text-pink-700 border-pink-200",
  PRODUCTION: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ACCOUNTANT: "bg-teal-100 text-teal-700 border-teal-200",
}

export function LoginPage() {
  const router = useRouter()
  const users = useERPStore((s) => s.users)
  const setCurrentUser = useERPStore((s) => s.setCurrentUser)

  function handleLogin(user: User) {
    setCurrentUser(user)
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4">
            E
          </div>
          <h1 className="text-3xl font-bold">ERP General</h1>
          <p className="text-muted-foreground mt-2">
            He thong ERP pho quat — Chon nguoi dung de dang nhap demo
          </p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm text-amber-800">
            <Shield className="h-4 w-4" />
            Demo Mode — Du lieu mau, khong can Supabase
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {users.map((user) => {
            const mainRole = user.roles[0]
            const Icon = ROLE_ICONS[mainRole] || Users
            const colorClass = ROLE_COLORS[mainRole] || "bg-gray-100 text-gray-700 border-gray-200"

            return (
              <Card
                key={user.id}
                className="cursor-pointer hover:shadow-md transition-all hover:scale-[1.02] border-2 hover:border-primary/30"
                onClick={() => handleLogin(user)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${colorClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.position}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {user.roles.slice(0, 2).map((role) => (
                          <span
                            key={role}
                            className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                          >
                            {role}
                          </span>
                        ))}
                        {user.roles.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{user.roles.length - 2}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-8 text-center">
          <Card className="inline-block">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong>SoD Demo:</strong> Dang nhap bang user khac nhau de thay kiem soat tach biet nhiem vu.
                <br />
                VD: User tao PO khong the tu phe duyet PO do.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
