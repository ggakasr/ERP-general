// E-invoice provider adapters — WP-H1
// Each provider implements the EInvoiceProvider interface.
// HTTP calls are at the Next.js layer — Postgres never makes HTTP requests.

export interface EInvoiceRequest {
  invoiceSeries: string
  invoiceDate: string       // YYYY-MM-DD
  buyerName: string
  buyerTaxCode?: string
  buyerAddress?: string
  paymentMethod?: string    // TM, CK, TM/CK
  currencyCode?: string     // VND default
  items: Array<{
    name: string
    unit: string
    quantity: number
    unitPrice: number
    amount: number
    vatRate: number         // 0, 5, 8, 10 (%)
    vatAmount: number
  }>
  totalBeforeVat: number
  totalVat: number
  totalAmount: number
  note?: string
}

export interface EInvoiceResult {
  ok: boolean
  invoiceCode?: string
  lookupCode?: string
  invoiceNumber?: string
  issuedDate?: string
  pdfUrl?: string
  rawResponse?: Record<string, unknown>
  error?: string
}

export interface EInvoiceProvider {
  code: string
  name: string
  createInvoice(req: EInvoiceRequest): Promise<EInvoiceResult>
  cancelInvoice(invoiceCode: string, reason: string): Promise<EInvoiceResult>
  lookupInvoice(invoiceCode: string): Promise<EInvoiceResult>
}

// ─── VNPT Invoice ──────────────────────────────────────────────
const VNPT_BASE = process.env.VNPT_EINVOICE_URL ?? "https://demoinvoice.vnpt.vn"
const VNPT_ACCOUNT = process.env.VNPT_EINVOICE_ACCOUNT ?? ""
const VNPT_ACPASS = process.env.VNPT_EINVOICE_ACPASS ?? ""
const VNPT_USERNAME = process.env.VNPT_EINVOICE_USERNAME ?? ""
const VNPT_UPASS = process.env.VNPT_EINVOICE_UPASS ?? ""
const VNPT_PATTERN = process.env.VNPT_EINVOICE_PATTERN ?? ""

export const vnptProvider: EInvoiceProvider = {
  code: "VNPT",
  name: "VNPT Invoice",

  async createInvoice(req: EInvoiceRequest): Promise<EInvoiceResult> {
    if (!VNPT_ACCOUNT || !VNPT_ACPASS) {
      return { ok: false, error: "VNPT_EINVOICE_ACCOUNT / VNPT_EINVOICE_ACPASS chưa cấu hình" }
    }
    const body = {
      CusCode: VNPT_ACCOUNT,
      CusPasswd: VNPT_ACPASS,
      Account: VNPT_USERNAME,
      ACPass: VNPT_UPASS,
      Pattern: VNPT_PATTERN,
      Serial: req.invoiceSeries,
      Inv: {
        ArisingDate: req.invoiceDate,
        CusName: req.buyerName,
        CusTaxCode: req.buyerTaxCode ?? "",
        CusAddress: req.buyerAddress ?? "",
        PaymentMethod: req.paymentMethod ?? "CK",
        Products: req.items.map((item, i) => ({
          ProdName: item.name,
          ProdUnit: item.unit,
          ProdQuantity: item.quantity,
          ProdPrice: item.unitPrice,
          Amount: item.amount,
          VATRate: item.vatRate,
          VATAmount: item.vatAmount,
          Total: item.amount + item.vatAmount,
          Code: `SP${String(i + 1).padStart(3, "0")}`,
        })),
        Total: req.totalBeforeVat,
        VATAmount: req.totalVat,
        Amount: req.totalAmount,
        Extra: req.note ?? "",
      },
    }
    try {
      const res = await fetch(`${VNPT_BASE}/PublishService/publishservice.asmx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data?.Status === "OK" || data?.InvoiceNo) {
        return {
          ok: true,
          invoiceCode: data.InvoiceCode ?? data.Ikey,
          lookupCode: data.LookupCode ?? "",
          invoiceNumber: data.InvoiceNo ?? "",
          issuedDate: req.invoiceDate,
          rawResponse: data,
        }
      }
      return { ok: false, error: data?.Message ?? JSON.stringify(data), rawResponse: data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async cancelInvoice(invoiceCode: string, reason: string): Promise<EInvoiceResult> {
    if (!VNPT_ACCOUNT) return { ok: false, error: "VNPT chưa cấu hình" }
    try {
      const res = await fetch(`${VNPT_BASE}/PublishService/publishservice.asmx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ CusCode: VNPT_ACCOUNT, CusPasswd: VNPT_ACPASS, Ikey: invoiceCode, Reason: reason }),
      })
      const data = await res.json()
      return data?.Status === "OK"
        ? { ok: true, invoiceCode, rawResponse: data }
        : { ok: false, error: data?.Message ?? JSON.stringify(data), rawResponse: data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async lookupInvoice(invoiceCode: string): Promise<EInvoiceResult> {
    if (!VNPT_ACCOUNT) return { ok: false, error: "VNPT chưa cấu hình" }
    try {
      const res = await fetch(`${VNPT_BASE}/PublishService/publishservice.asmx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ CusCode: VNPT_ACCOUNT, CusPasswd: VNPT_ACPASS, Ikey: invoiceCode }),
      })
      const data = await res.json()
      return { ok: true, invoiceCode, rawResponse: data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
}

// ─── Viettel S-Invoice ─────────────────────────────────────────
const VTL_BASE = process.env.VIETTEL_EINVOICE_URL ?? "https://demo-sinvoice.viettel.vn"
const VTL_USERNAME = process.env.VIETTEL_EINVOICE_USERNAME ?? ""
const VTL_PASSWORD = process.env.VIETTEL_EINVOICE_PASSWORD ?? ""
const VTL_TAX_CODE = process.env.VIETTEL_EINVOICE_TAX_CODE ?? ""

async function viettelAuth(): Promise<string | null> {
  if (!VTL_USERNAME || !VTL_PASSWORD) return null
  try {
    const res = await fetch(`${VTL_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: VTL_USERNAME, password: VTL_PASSWORD }),
    })
    const data = await res.json()
    return data?.access_token ?? null
  } catch {
    return null
  }
}

export const viettelProvider: EInvoiceProvider = {
  code: "VIETTEL",
  name: "Viettel S-Invoice",

  async createInvoice(req: EInvoiceRequest): Promise<EInvoiceResult> {
    const token = await viettelAuth()
    if (!token) return { ok: false, error: "VIETTEL_EINVOICE credentials chưa cấu hình hoặc đăng nhập thất bại" }
    const body = {
      generalInvoiceInfo: {
        invoiceType: "1",
        templateCode: req.invoiceSeries,
        invoiceSeries: req.invoiceSeries,
        currencyCode: req.currencyCode ?? "VND",
        adjustmentType: "1",
        paymentStatus: true,
        cusCode: VTL_TAX_CODE,
        invoiceDate: req.invoiceDate,
        buyerFullName: req.buyerName,
        buyerLegalName: req.buyerName,
        buyerTaxCode: req.buyerTaxCode ?? "",
        buyerAddressLine: req.buyerAddress ?? "",
        paymentMethodName: req.paymentMethod ?? "CK",
      },
      buyerInfo: { buyerName: req.buyerName, buyerLegalName: req.buyerName },
      sellerInfo: { sellerTaxCode: VTL_TAX_CODE },
      payments: [{ paymentMethodName: req.paymentMethod ?? "CK" }],
      itemInfo: req.items.map((item, i) => ({
        lineNumber: i + 1,
        itemCode: `SP${String(i + 1).padStart(3, "0")}`,
        itemName: item.name,
        unitName: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemTotalAmountWithoutTax: item.amount,
        taxPercentage: item.vatRate,
        taxAmount: item.vatAmount,
        itemTotalAmountWithTax: item.amount + item.vatAmount,
      })),
      summarizeInfo: {
        sumOfTotalLineAmountWithoutTax: req.totalBeforeVat,
        totalAmountWithoutTax: req.totalBeforeVat,
        totalTaxAmount: req.totalVat,
        totalAmountWithTax: req.totalAmount,
      },
    }
    try {
      const res = await fetch(`${VTL_BASE}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${VTL_TAX_CODE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data?.errorCode === "0" || data?.result?.invoiceNo) {
        return {
          ok: true,
          invoiceCode: data.result?.transactionID ?? "",
          lookupCode: data.result?.reservationCode ?? "",
          invoiceNumber: data.result?.invoiceNo ?? "",
          issuedDate: req.invoiceDate,
          rawResponse: data,
        }
      }
      return { ok: false, error: data?.description ?? JSON.stringify(data), rawResponse: data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async cancelInvoice(invoiceCode: string, reason: string): Promise<EInvoiceResult> {
    const token = await viettelAuth()
    if (!token) return { ok: false, error: "Viettel chưa cấu hình" }
    try {
      const res = await fetch(`${VTL_BASE}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/cancelTransactionInvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ supplierTaxCode: VTL_TAX_CODE, transactionUuid: invoiceCode, cancelReason: reason }),
      })
      const data = await res.json()
      return data?.errorCode === "0"
        ? { ok: true, invoiceCode, rawResponse: data }
        : { ok: false, error: data?.description ?? JSON.stringify(data), rawResponse: data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async lookupInvoice(invoiceCode: string): Promise<EInvoiceResult> {
    const token = await viettelAuth()
    if (!token) return { ok: false, error: "Viettel chưa cấu hình" }
    try {
      const res = await fetch(`${VTL_BASE}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ supplierTaxCode: VTL_TAX_CODE, transactionUuid: invoiceCode }),
      })
      const data = await res.json()
      return { ok: true, invoiceCode, rawResponse: data }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
}

// ─── Provider registry ─────────────────────────────────────────
const providers: Record<string, EInvoiceProvider> = {
  VNPT: vnptProvider,
  VIETTEL: viettelProvider,
}

export function getProvider(code: string): EInvoiceProvider | null {
  return providers[code.toUpperCase()] ?? null
}

export function listProviders(): Array<{ code: string; name: string }> {
  return Object.values(providers).map((p) => ({ code: p.code, name: p.name }))
}
