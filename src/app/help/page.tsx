import Link from "next/link"
import {
  ArrowLeft, BarChart3, BookOpen, ClipboardCheck, FileSearch, HelpCircle, Landmark,
  Package, Settings, Shield, ShieldCheck, ShoppingBag, ShoppingCart, Users,
} from "lucide-react"

const MODULES = [
  {
    icon: ShoppingCart,
    title: "Bán hàng",
    desc: "Báo giá → Đơn hàng → Giao hàng → Hóa đơn → Thu tiền",
    flows: "QUOT → SO → DN → INV → RCPT",
  },
  {
    icon: ShoppingBag,
    title: "Mua hàng",
    desc: "Yêu cầu → Đặt mua → Nhận hàng → Đối chiếu 3 bên → Thanh toán",
    flows: "PR → PO → GRN → SINV → PMT",
  },
  {
    icon: Package,
    title: "Kho vận",
    desc: "Nhập kho, xuất kho, chuyển kho, kiểm kê — FIFO tự động",
    flows: "GRN · DN · ST · ADJ",
  },
  {
    icon: Landmark,
    title: "Tài chính",
    desc: "Phiếu kế toán, sổ cái, đối chiếu ngân hàng, khóa kỳ",
    flows: "JV · PMT · RCPT · BANKREC",
  },
  {
    icon: Users,
    title: "Nhân sự & Lương",
    desc: "Tuyển dụng, nhân viên, bảng lương, thanh toán lương",
    flows: "HIRE → EMPLOYEE → PAYROLL → PMT",
  },
  {
    icon: Shield,
    title: "Kiểm soát nội bộ",
    desc: "Tách biệt nhiệm vụ, audit trail, ngoại lệ, SLA bàn giao",
    flows: "SoD · Audit · EXC · Handoff",
  },
  {
    icon: BarChart3,
    title: "Báo cáo & KPI",
    desc: "Bảng cân đối, lãi lỗ, dòng tiền, KPI, truy vết 3 chiều",
    flows: "Trial Balance · P&L · Cash Flow",
  },
  {
    icon: Settings,
    title: "Quản trị",
    desc: "Quản lý người dùng, phân quyền, dữ liệu chủ, rà soát truy cập",
    flows: "Users · Roles · MDC · Access Review",
  },
]

const FAQS = [
  {
    q: "Tách biệt nhiệm vụ (SoD) hoạt động thế nào?",
    a: "Hệ thống enforce 4 vai trò — Người tạo, Người duyệt, Người thực hiện, Người kiểm tra — không ai được giữ 2 vai trò trên cùng chứng từ. Kiểm tra SoD nằm trong PostgreSQL, không thể bypass từ frontend.",
  },
  {
    q: "Audit trail có thể sửa hoặc xóa không?",
    a: "Không. Bảng audit_trail chỉ cho INSERT, không có UPDATE hoặc DELETE. Mọi thay đổi đều ghi giá trị cũ/mới, user, thời gian, IP.",
  },
  {
    q: "3-way matching là gì?",
    a: "So khớp 3 bên: Đơn mua (PO) ↔ Phiếu nhận hàng (GRN) ↔ Hóa đơn nhà cung cấp (SINV). Số lượng phải khớp chính xác, giá chênh lệch tối đa ±2%. Nếu lệch → tự động tạo ngoại lệ.",
  },
  {
    q: "Phân quyền 3 tầng nghĩa là gì?",
    a: "Tầng 1: Vai trò (role) — ai được làm gì. Tầng 2: Phạm vi dữ liệu — chỉ record của mình, phòng ban, chi nhánh, hoặc toàn công ty. Tầng 3: Trường — field nào được xem/sửa.",
  },
  {
    q: "Tôi muốn dùng thử — bắt đầu từ đâu?",
    a: 'Vào trang "Dùng thử" để đăng ký tài khoản demo. Hệ thống sẽ tạo sẵn dữ liệu mẫu với nhiều vai trò khác nhau để bạn trải nghiệm.',
  },
]

export default function HelpPage() {
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
            <Link href="/" className="text-gray-600 hover:text-gray-900">Trang chủ</Link>
            <Link href="/demo" className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              Dùng thử
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pb-10 pt-16 text-center">
        <HelpCircle className="mx-auto h-10 w-10 text-indigo-600" />
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Trung tâm hỗ trợ</h1>
        <p className="mx-auto mt-2 max-w-md text-gray-600">
          Tìm hiểu cách sử dụng từng module, quy trình nghiệp vụ, và kiểm soát nội bộ
        </p>
      </section>

      {/* Modules */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            Các module nghiệp vụ
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m) => (
              <div key={m.title} className="rounded-xl border p-4">
                <m.icon className="h-6 w-6 text-indigo-600" />
                <h3 className="mt-2 font-semibold">{m.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{m.desc}</p>
                <p className="mt-2 rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-500">
                  {m.flows}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <ClipboardCheck className="h-5 w-5 text-indigo-600" />
            Cách hệ thống hoạt động
          </h2>
          <div className="mt-6 space-y-6">
            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">1. Chứng từ là sự thật</h3>
              <p className="mt-1 text-sm text-gray-600">
                Mọi giao dịch phải có chứng từ gốc. Chuỗi chứng từ liên kết từ kế hoạch đến thanh toán — không có giao dịch nào không được ghi nhận.
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">2. Trạng thái là hợp đồng</h3>
              <p className="mt-1 text-sm text-gray-600">
                Mỗi loại chứng từ có state machine riêng. Chuyển trạng thái không hợp lệ sẽ bị từ chối — không phải cảnh báo, mà là lỗi cứng.
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">3. Kiểm soát ở mức kiến trúc</h3>
              <p className="mt-1 text-sm text-gray-600">
                SoD, audit trail, phân quyền — tất cả nằm trong PostgreSQL (SECURITY DEFINER functions). Frontend chỉ gọi RPC, không truy cập trực tiếp bảng nghiệp vụ.
              </p>
            </div>
            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">4. Truy vết 3 chiều</h3>
              <p className="mt-1 text-sm text-gray-600">
                <strong>Theo tiền:</strong> Thanh toán → Hóa đơn → PO → PR → Ngân sách.{" "}
                <strong>Theo hàng:</strong> Giao hàng → Kho → Nhận hàng → PO.{" "}
                <strong>Theo trách nhiệm:</strong> Hành động → Người dùng → Vai trò → Phòng ban.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FileSearch className="h-5 w-5 text-indigo-600" />
            Câu hỏi thường gặp
          </h2>
          <div className="mt-6 divide-y rounded-xl border">
            {FAQS.map((f) => (
              <div key={f.q} className="p-5">
                <h3 className="font-medium">{f.q}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-indigo-600 px-4 py-12 text-center text-white">
        <h2 className="text-xl font-bold sm:text-2xl">Muốn trải nghiệm trực tiếp?</h2>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Đăng ký dùng thử
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-indigo-100 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Về trang chủ
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-6 text-center text-xs text-gray-500">
        ERP General — Hệ thống kiểm soát nội bộ có bằng chứng
      </footer>
    </div>
  )
}
