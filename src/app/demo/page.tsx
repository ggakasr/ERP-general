"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight, CheckCircle2, Loader2, ShieldCheck, Users, FileText, Lock, BarChart3,
} from "lucide-react"

type Status = "idle" | "submitting" | "success" | "error"

export default function DemoPage() {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ email: string; password: string; tenant: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("submitting")
    setError("")

    const fd = new FormData(e.currentTarget)
    const body = {
      name: fd.get("name"),
      email: fd.get("email"),
      company: fd.get("company"),
    }

    try {
      const res = await fetch("/api/demo-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || "Có lỗi xảy ra")
        setStatus("error")
        return
      }
      setResult({ email: data.email, password: data.password, tenant: data.tenant })
      setStatus("success")
    } catch {
      setError("Không thể kết nối đến server")
      setStatus("error")
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      {/* Nav */}
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-indigo-600">
            <ShieldCheck className="h-5 w-5" />
            ERP General
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/help" className="text-gray-600 hover:text-gray-900">Hỗ trợ</Link>
            <Link href="/login" className="text-gray-600 hover:text-gray-900">Đăng nhập</Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-4xl">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Left: Benefits */}
            <div className="flex flex-col justify-center">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Dùng thử <span className="text-indigo-600">miễn phí</span>
              </h1>
              <p className="mt-3 text-gray-600">
                Tạo tài khoản demo trong 30 giây — dữ liệu riêng, đầy đủ tính năng kiểm soát nội bộ.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  { icon: Lock, text: "Tách biệt nhiệm vụ (SoD) — enforce ở database" },
                  { icon: FileText, text: "Audit trail bất biến — mọi thay đổi được ghi nhận" },
                  { icon: BarChart3, text: "Truy vết 3 chiều — tiền, hàng, trách nhiệm" },
                  { icon: Users, text: "5 người dùng miễn phí — 14 ngày dùng thử" },
                ].map((b) => (
                  <li key={b.text} className="flex items-start gap-3 text-sm text-gray-700">
                    <b.icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                    {b.text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: Form / Success */}
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              {status === "success" && result ? (
                <div className="space-y-4 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                  <h2 className="text-lg font-semibold">Tài khoản đã tạo!</h2>
                  <div className="rounded-lg bg-gray-50 p-4 text-left text-sm">
                    <div className="space-y-2">
                      <div>
                        <span className="text-gray-500">Email:</span>{" "}
                        <span className="font-medium">{result.email}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Mật khẩu:</span>{" "}
                        <span className="font-mono font-medium">{result.password}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Tenant:</span>{" "}
                        <span className="font-mono text-xs">{result.tenant}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu.
                  </p>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Đăng nhập ngay <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">Đăng ký dùng thử</h2>
                  <p className="mt-1 text-sm text-gray-500">Miễn phí, không cần thẻ tín dụng</p>
                  <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Họ và tên</span>
                      <input
                        name="name"
                        required
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-indigo-300 focus:ring-2"
                        placeholder="Nguyễn Văn A"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Email</span>
                      <input
                        name="email"
                        type="email"
                        required
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-indigo-300 focus:ring-2"
                        placeholder="email@congty.vn"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">Tên công ty</span>
                      <input
                        name="company"
                        required
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-indigo-300 focus:ring-2"
                        placeholder="Công ty ABC"
                      />
                    </label>
                    {status === "error" && error && (
                      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={status === "submitting"}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {status === "submitting" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {status === "submitting" ? "Đang tạo..." : "Tạo tài khoản demo"}
                    </button>
                  </form>
                  <p className="mt-4 text-center text-xs text-gray-400">
                    Đã có tài khoản?{" "}
                    <Link href="/login" className="text-indigo-600 hover:underline">
                      Đăng nhập
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
