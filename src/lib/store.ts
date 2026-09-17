"use client"

import { create } from "zustand"
import type {
  User, PurchaseRequisition, PurchaseOrder, GoodsReceiptNote,
  Quotation, SalesOrder, SalesInvoice, InventoryItem,
  StockTransfer, WorkOrder, BillOfMaterials, Employee,
  PayrollRun, JournalEntry, Payment, Asset, ServiceTicket,
  Budget, ExceptionRecord, AuditTrailEntry, SodCheckLog,
  DocumentStatus, Branch, Department, SodRole,
} from "./types"
import { canTransition } from "./state-machines"
import { generateId } from "./utils"
import * as mock from "./mock-data"

interface ERPState {
  currentUser: User | null
  branches: Branch[]
  departments: Department[]
  users: User[]
  purchaseRequisitions: PurchaseRequisition[]
  purchaseOrders: PurchaseOrder[]
  goodsReceipts: GoodsReceiptNote[]
  quotations: Quotation[]
  salesOrders: SalesOrder[]
  salesInvoices: SalesInvoice[]
  inventoryItems: InventoryItem[]
  stockTransfers: StockTransfer[]
  workOrders: WorkOrder[]
  boms: BillOfMaterials[]
  employees: Employee[]
  payrollRuns: PayrollRun[]
  journalEntries: JournalEntry[]
  payments: Payment[]
  assets: Asset[]
  serviceTickets: ServiceTicket[]
  budgets: Budget[]
  exceptions: ExceptionRecord[]
  auditTrail: AuditTrailEntry[]
  sodCheckLog: SodCheckLog[]

  setCurrentUser: (user: User | null) => void

  transitionStatus: (
    collection: string,
    documentId: string,
    documentType: string,
    newStatus: DocumentStatus,
  ) => { success: boolean; error?: string }

  checkSoD: (
    documentId: string,
    documentType: string,
    userId: string,
    attemptedRole: SodRole,
  ) => { allowed: boolean; conflict?: string }

  addAuditEntry: (entry: Omit<AuditTrailEntry, "id" | "timestamp">) => void

  addDocument: (collection: string, document: Record<string, unknown>) => void
}

type CollectionKey = keyof Omit<ERPState, "currentUser" | "setCurrentUser" | "transitionStatus" | "checkSoD" | "addAuditEntry" | "addDocument" | "branches" | "departments" | "users" | "auditTrail" | "sodCheckLog" | "boms" | "employees" | "inventoryItems">

const COLLECTION_MAP: Record<string, CollectionKey> = {
  PR: "purchaseRequisitions",
  PO: "purchaseOrders",
  GRN: "goodsReceipts",
  QUOT: "quotations",
  SO: "salesOrders",
  INV: "salesInvoices",
  ST: "stockTransfers",
  WO: "workOrders",
  PAY_RUN: "payrollRuns",
  JV: "journalEntries",
  PMT: "payments",
  ASSET: "assets",
  TICKET: "serviceTickets",
  BUDGET: "budgets",
  EXC: "exceptions",
}

const SOD_CONFLICTS: Array<[SodRole, SodRole]> = [
  ["REQUESTER", "APPROVER"],
  ["APPROVER", "EXECUTOR"],
  ["REQUESTER", "EXECUTOR"],
  ["EXECUTOR", "AUDITOR"],
]

export const useERPStore = create<ERPState>((set, get) => ({
  currentUser: null,
  branches: mock.BRANCHES,
  departments: mock.DEPARTMENTS,
  users: mock.USERS,
  purchaseRequisitions: mock.PURCHASE_REQUISITIONS,
  purchaseOrders: mock.PURCHASE_ORDERS,
  goodsReceipts: mock.GOODS_RECEIPTS,
  quotations: mock.QUOTATIONS,
  salesOrders: mock.SALES_ORDERS,
  salesInvoices: mock.SALES_INVOICES,
  inventoryItems: mock.INVENTORY_ITEMS,
  stockTransfers: mock.STOCK_TRANSFERS,
  workOrders: mock.WORK_ORDERS,
  boms: mock.BOMS,
  employees: mock.EMPLOYEES,
  payrollRuns: mock.PAYROLL_RUNS,
  journalEntries: mock.JOURNAL_ENTRIES,
  payments: mock.PAYMENTS,
  assets: mock.ASSETS,
  serviceTickets: mock.SERVICE_TICKETS,
  budgets: mock.BUDGETS,
  exceptions: mock.EXCEPTIONS,
  auditTrail: mock.AUDIT_TRAIL,
  sodCheckLog: [],

  setCurrentUser: (user) => set({ currentUser: user }),

  transitionStatus: (collection, documentId, documentType, newStatus) => {
    const state = get()
    const collectionKey = COLLECTION_MAP[collection]
    if (!collectionKey) return { success: false, error: "Unknown collection" }

    const items = state[collectionKey] as Array<{ id: string; status: DocumentStatus }>
    const item = items.find((i) => i.id === documentId)
    if (!item) return { success: false, error: "Document not found" }

    if (!canTransition(documentType, item.status, newStatus)) {
      return { success: false, error: `Cannot transition from ${item.status} to ${newStatus}` }
    }

    const oldStatus = item.status
    const updated = items.map((i) =>
      i.id === documentId ? { ...i, status: newStatus, updatedAt: new Date().toISOString() } : i
    )

    set({ [collectionKey]: updated } as Partial<ERPState>)

    const user = state.currentUser
    if (user) {
      get().addAuditEntry({
        entityType: documentType,
        entityId: documentId,
        action: "STATUS_CHANGE",
        oldValue: oldStatus,
        newValue: newStatus,
        userId: user.id,
        userName: user.fullName,
      })
    }

    return { success: true }
  },

  checkSoD: (documentId, documentType, userId, attemptedRole) => {
    const state = get()
    const trail = state.auditTrail.filter(
      (a) => a.entityId === documentId && a.entityType === documentType
    )

    const userActions = trail.filter((a) => a.userId === userId)
    const existingRoles: SodRole[] = []

    for (const action of userActions) {
      if (action.action === "CREATE") existingRoles.push("REQUESTER")
      if (action.action === "APPROVE") existingRoles.push("APPROVER")
      if (action.action === "STATUS_CHANGE" && action.newValue === "COMPLETED") existingRoles.push("EXECUTOR")
    }

    for (const [roleA, roleB] of SOD_CONFLICTS) {
      if (
        (existingRoles.includes(roleA) && attemptedRole === roleB) ||
        (existingRoles.includes(roleB) && attemptedRole === roleA)
      ) {
        const log: SodCheckLog = {
          id: generateId(),
          transactionId: documentId,
          transactionType: documentType,
          userId,
          userName: state.users.find((u) => u.id === userId)?.fullName || "",
          attemptedRole,
          conflictingRole: existingRoles.includes(roleA) ? roleA : roleB,
          result: "BLOCKED",
          checkedAt: new Date().toISOString(),
        }
        set({ sodCheckLog: [...state.sodCheckLog, log] })

        get().addAuditEntry({
          entityType: documentType,
          entityId: documentId,
          action: "SOD_VIOLATION",
          oldValue: existingRoles.includes(roleA) ? roleA : roleB,
          newValue: attemptedRole,
          userId,
          userName: log.userName,
        })

        return {
          allowed: false,
          conflict: `Vi phạm SoD: Bạn đã có vai trò ${existingRoles.includes(roleA) ? roleA : roleB}, không thể thực hiện ${attemptedRole} trên cùng chứng từ.`,
        }
      }
    }

    const log: SodCheckLog = {
      id: generateId(),
      transactionId: documentId,
      transactionType: documentType,
      userId,
      userName: state.users.find((u) => u.id === userId)?.fullName || "",
      attemptedRole,
      conflictingRole: attemptedRole,
      result: "PASSED",
      checkedAt: new Date().toISOString(),
    }
    set({ sodCheckLog: [...state.sodCheckLog, log] })

    return { allowed: true }
  },

  addAuditEntry: (entry) => {
    const newEntry: AuditTrailEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date().toISOString(),
    }
    set((state) => ({ auditTrail: [newEntry, ...state.auditTrail] }))
  },

  addDocument: (collection, document) => {
    const collectionKey = COLLECTION_MAP[collection]
    if (!collectionKey) return

    const state = get()
    const items = state[collectionKey] as unknown as Array<Record<string, unknown>>
    set({ [collectionKey]: [...items, document] } as unknown as Partial<ERPState>)

    const user = state.currentUser
    if (user) {
      get().addAuditEntry({
        entityType: collection,
        entityId: document.id as string,
        action: "CREATE",
        newValue: (document.status as string) || "DRAFT",
        userId: user.id,
        userName: user.fullName,
      })
    }
  },
}))
