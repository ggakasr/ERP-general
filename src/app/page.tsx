import Link from "next/link"
import {
  ArrowRight, BarChart3, CheckCircle2, FileSearch, Globe, Headphones, Lock,
  Package, Shield, ShieldCheck, Ship, Users, Zap,
} from "lucide-react"

const FEATURES = [
  {
    icon: Shield,
    title: "Tách biệt nhiệm vụ (SoD)",
    desc: "4 vai trò tài chính không trùng nhau — enforce ở mức database, không thể bypass",
  },
  {
    icon: FileSearch,
    title: "Audit Trail bất biến",
    desc: "Mọi thay đổi được ghi nhận: ai, khi nào, trước/sau — không thể xóa hoặc sửa",
  },
  {
    icon: BarChart3,
    title: "Truy vết 3 chiều",
    desc: "Trace theo tiền, theo hàng, theo trách nhiệm — từ thanh toán ngược về kế hoạch",
  },
  {
    icon: Lock,
    title: "Phân quyền 3 tầng",
    desc: "Vai trò × Phạm vi dữ liệu × Trường — không có god mode",
  },
  {
    icon: Users,
    title: "Bàn giao có SLA",
    desc: "Mỗi chuyển giao giữa bộ phận có bản ghi, thời hạn, và cảnh báo trễ hạn",
  },
  {
    icon: Zap,
    title: "Phát hiện bất thường",
    desc: "Cảnh báo tự động: SoD near-miss, ngoại lệ tăng đột biến, hoạt động ngoài giờ",
  },
]

const PLANS = [
  {
    name: "Starter",
    price: "Liên hệ",
    features: ["5 người dùng", "Kiểm soát cơ bản", "SoD + Audit trail", "5 loại chứng từ"],
  },
  {
    name: "Professional",
    price: "Liên hệ",
    highlight: true,
    features: ["20 người dùng", "Tất cả tính năng", "Audit Pack", "Bàn giao SLA", "Cổng khách hàng", "Cảnh báo rủi ro"],
  },
  {
    name: "Enterprise",
    price: "Liên hệ",
    features: ["Không giới hạn user", "Tất cả tính năng Pro", "Custom branding", "SoD nâng cao", "Hỗ trợ ưu tiên"],
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-indigo-600">
            <ShieldCheck className="h-5 w-5" />
            ERP General
          </Link>
          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <a href="#features" className="text-gray-600 hover:text-gray-900">Tính năng</a>
            <a href="#pricing" className="text-gray-600 hover:text-gray-900">Bảng giá</a>
            <Link href="/help" className="text-gray-600 hover:text-gray-900">Hỗ trợ</Link>
            <Link href="/demo" className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              Dùng thử
            </Link>
          </nav>
          <Link href="/demo" className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white sm:hidden">
            Dùng thử
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pb-16 pt-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Kiểm soát nội bộ
            <br />
            <span className="text-indigo-600">có bằng chứng</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            Bạn chứng minh được với kiểm toán viên rằng không ai vừa tạo vừa duyệt cùng một chứng từ không?
            ERP General cho bạn câu trả lời có bằng chứng.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white shadow-md hover:bg-indigo-700"
            >
              Đăng ký dùng thử <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-gray-50 px-4 py-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 text-center sm:gap-16">
          {[
            { n: "11", label: "Luồng nghiệp vụ" },
            { n: "23+", label: "Loại chứng từ" },
            { n: "4", label: "Vai trò SoD" },
            { n: "3", label: "Chiều truy vết" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-indigo-600">{s.n}</div>
              <div className="mt-1 text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Kiểm soát ở mức kiến trúc, không phải quy ước</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
            Mọi quy tắc kiểm soát nằm trong PostgreSQL — không thể bypass qua devtools hay truy cập trực tiếp database.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border p-5">
                <f.icon className="h-6 w-6 text-indigo-600" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="border-y bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Phù hợp với mọi ngành</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Ship, label: "Logistics", desc: "Shipment, booking, vận đơn, debit/credit note" },
              { icon: Package, label: "Sản xuất", desc: "BOM, work order, QC, nguyên vật liệu" },
              { icon: Globe, label: "Thương mại", desc: "Mua bán, kho, tài chính, tài sản" },
              { icon: Headphones, label: "Dịch vụ", desc: "Ticket, SLA, nhân sự, tuyển dụng" },
            ].map((i) => (
              <div key={i.label} className="rounded-lg border bg-white p-4 text-center">
                <i.icon className="mx-auto h-8 w-8 text-indigo-500" />
                <h3 className="mt-2 font-medium">{i.label}</h3>
                <p className="mt-1 text-xs text-gray-500">{i.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Bảng giá</h2>
          <p className="mt-2 text-center text-gray-600">Bắt đầu miễn phí, nâng gói khi cần</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`rounded-xl border p-6 ${p.highlight ? "border-indigo-600 ring-2 ring-indigo-100" : ""}`}
              >
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-2 text-2xl font-bold text-gray-900">{p.price}</div>
                <ul className="mt-4 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/demo"
                  className={`mt-6 block rounded-md px-4 py-2 text-center text-sm font-medium ${
                    p.highlight ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Dùng thử
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-indigo-600 px-4 py-16 text-center text-white">
        <h2 className="text-2xl font-bold sm:text-3xl">Sẵn sàng kiểm soát có bằng chứng?</h2>
        <p className="mt-2 text-indigo-100">Đăng ký dùng thử miễn phí — thiết lập trong 5 phút</p>
        <Link
          href="/demo"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-medium text-indigo-600 shadow hover:bg-indigo-50"
        >
          Bắt đầu ngay <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-8 text-center text-xs text-gray-500">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/help" className="hover:text-gray-700">Hỗ trợ</Link>
            <Link href="/login" className="hover:text-gray-700">Đăng nhập</Link>
            <Link href="/demo" className="hover:text-gray-700">Dùng thử</Link>
          </div>
          <p className="mt-4">ERP General — Hệ thống kiểm soát nội bộ có bằng chứng</p>
        </div>
      </footer>
    </div>
  )
}
