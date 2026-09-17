import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin", "vietnamese"] })

export const metadata: Metadata = {
  title: "ERP General — Hệ thống ERP phổ quát",
  description: "Hệ thống ERP phổ quát cho mục đích giáo dục: 11 luồng nghiệp vụ, SoD, truy vết 3 chiều",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
