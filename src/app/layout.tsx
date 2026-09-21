import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ERP General — Hệ thống ERP phổ quát",
  description: "Hệ thống ERP phổ quát cho mục đích giáo dục: 11 luồng nghiệp vụ, SoD, truy vết 3 chiều",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
