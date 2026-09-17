import { type DocumentStatus } from "./types"

export interface Transition {
  from: DocumentStatus
  to: DocumentStatus
  label: string
  requiredRole?: string
  color?: string
}

export interface StateMachine {
  documentType: string
  initialState: DocumentStatus
  transitions: Transition[]
}

export const STATE_MACHINES: Record<string, StateMachine> = {
  PR: {
    documentType: "Purchase Requisition",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SUBMITTED", label: "Submit", requiredRole: "REQUESTER", color: "blue" },
      { from: "SUBMITTED", to: "APPROVED", label: "Approve", requiredRole: "APPROVER", color: "green" },
      { from: "SUBMITTED", to: "REJECTED", label: "Reject", requiredRole: "APPROVER", color: "red" },
      { from: "APPROVED", to: "CLOSED", label: "Close", requiredRole: "REQUESTER", color: "gray" },
      { from: "REJECTED", to: "DRAFT", label: "Revise", requiredRole: "REQUESTER", color: "yellow" },
      { from: "DRAFT", to: "CANCELLED", label: "Cancel", requiredRole: "REQUESTER", color: "red" },
    ],
  },
  PO: {
    documentType: "Purchase Order",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SUBMITTED", label: "Submit", requiredRole: "REQUESTER", color: "blue" },
      { from: "SUBMITTED", to: "APPROVED", label: "Approve", requiredRole: "APPROVER", color: "green" },
      { from: "SUBMITTED", to: "REJECTED", label: "Reject", requiredRole: "APPROVER", color: "red" },
      { from: "APPROVED", to: "SENT", label: "Send to Supplier", requiredRole: "EXECUTOR", color: "blue" },
      { from: "SENT", to: "CONFIRMED", label: "Supplier Confirmed", color: "green" },
      { from: "CONFIRMED", to: "PARTIALLY_RECEIVED", label: "Partial Receipt", color: "yellow" },
      { from: "CONFIRMED", to: "RECEIVED", label: "Full Receipt", color: "green" },
      { from: "PARTIALLY_RECEIVED", to: "RECEIVED", label: "Complete Receipt", color: "green" },
      { from: "RECEIVED", to: "INVOICED", label: "Invoice Matched", color: "blue" },
      { from: "INVOICED", to: "PAID", label: "Payment Done", requiredRole: "EXECUTOR", color: "green" },
      { from: "REJECTED", to: "DRAFT", label: "Revise", requiredRole: "REQUESTER", color: "yellow" },
      { from: "DRAFT", to: "CANCELLED", label: "Cancel", requiredRole: "REQUESTER", color: "red" },
    ],
  },
  GRN: {
    documentType: "Goods Receipt Note",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "INSPECTED", label: "Inspect", color: "blue" },
      { from: "INSPECTED", to: "ACCEPTED", label: "Accept", color: "green" },
      { from: "INSPECTED", to: "REJECTED", label: "Reject", color: "red" },
      { from: "ACCEPTED", to: "STORED", label: "Put Away", color: "green" },
    ],
  },
  QUOT: {
    documentType: "Quotation",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SENT", label: "Send", color: "blue" },
      { from: "SENT", to: "APPROVED", label: "Customer Accepted", color: "green" },
      { from: "SENT", to: "REJECTED", label: "Customer Rejected", color: "red" },
      { from: "DRAFT", to: "CANCELLED", label: "Cancel", color: "red" },
    ],
  },
  SO: {
    documentType: "Sales Order",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "CONFIRMED", label: "Confirm", color: "blue" },
      { from: "CONFIRMED", to: "PARTIALLY_SHIPPED", label: "Partial Ship", color: "yellow" },
      { from: "CONFIRMED", to: "SHIPPED", label: "Ship All", color: "green" },
      { from: "PARTIALLY_SHIPPED", to: "SHIPPED", label: "Ship Remaining", color: "green" },
      { from: "SHIPPED", to: "INVOICED", label: "Invoice", color: "blue" },
      { from: "INVOICED", to: "CLOSED", label: "Close", color: "gray" },
      { from: "DRAFT", to: "CANCELLED", label: "Cancel", color: "red" },
    ],
  },
  INV: {
    documentType: "Sales Invoice",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SENT", label: "Send", color: "blue" },
      { from: "SENT", to: "PARTIALLY_PAID", label: "Partial Payment", color: "yellow" },
      { from: "SENT", to: "PAID", label: "Full Payment", color: "green" },
      { from: "PARTIALLY_PAID", to: "PAID", label: "Complete Payment", color: "green" },
      { from: "SENT", to: "OVERDUE", label: "Mark Overdue", color: "red" },
      { from: "OVERDUE", to: "PAID", label: "Payment Received", color: "green" },
    ],
  },
  ST: {
    documentType: "Stock Transfer",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SUBMITTED", label: "Submit", color: "blue" },
      { from: "SUBMITTED", to: "APPROVED", label: "Approve", requiredRole: "APPROVER", color: "green" },
      { from: "APPROVED", to: "IN_PROGRESS", label: "Start Transfer", color: "blue" },
      { from: "IN_PROGRESS", to: "COMPLETED", label: "Complete", color: "green" },
    ],
  },
  WO: {
    documentType: "Work Order",
    initialState: "PLANNED",
    transitions: [
      { from: "PLANNED", to: "MATERIAL_READY", label: "Materials Ready", color: "blue" },
      { from: "MATERIAL_READY", to: "IN_PRODUCTION", label: "Start Production", color: "blue" },
      { from: "IN_PRODUCTION", to: "QC", label: "Send to QC", color: "yellow" },
      { from: "QC", to: "COMPLETED", label: "QC Passed", color: "green" },
      { from: "QC", to: "IN_PRODUCTION", label: "QC Failed - Rework", color: "red" },
      { from: "COMPLETED", to: "CLOSED", label: "Close", color: "gray" },
    ],
  },
  PAY_RUN: {
    documentType: "Payroll Run",
    initialState: "CALCULATED",
    transitions: [
      { from: "CALCULATED", to: "REVIEWED", label: "Review", color: "blue" },
      { from: "REVIEWED", to: "APPROVED", label: "Approve", requiredRole: "APPROVER", color: "green" },
      { from: "REVIEWED", to: "REJECTED", label: "Reject", color: "red" },
      { from: "APPROVED", to: "PAID", label: "Process Payment", requiredRole: "EXECUTOR", color: "green" },
      { from: "PAID", to: "POSTED", label: "Post to GL", color: "blue" },
      { from: "REJECTED", to: "CALCULATED", label: "Recalculate", color: "yellow" },
    ],
  },
  JV: {
    documentType: "Journal Entry",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SUBMITTED", label: "Submit", requiredRole: "REQUESTER", color: "blue" },
      { from: "SUBMITTED", to: "POSTED", label: "Post", requiredRole: "APPROVER", color: "green" },
      { from: "SUBMITTED", to: "REJECTED", label: "Reject", requiredRole: "APPROVER", color: "red" },
      { from: "POSTED", to: "REVERSED", label: "Reverse", requiredRole: "APPROVER", color: "red" },
      { from: "REJECTED", to: "DRAFT", label: "Revise", requiredRole: "REQUESTER", color: "yellow" },
    ],
  },
  PMT: {
    documentType: "Payment",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SUBMITTED", label: "Submit", requiredRole: "REQUESTER", color: "blue" },
      { from: "SUBMITTED", to: "APPROVED", label: "Approve", requiredRole: "APPROVER", color: "green" },
      { from: "SUBMITTED", to: "REJECTED", label: "Reject", requiredRole: "APPROVER", color: "red" },
      { from: "APPROVED", to: "COMPLETED", label: "Execute", requiredRole: "EXECUTOR", color: "green" },
      { from: "REJECTED", to: "DRAFT", label: "Revise", requiredRole: "REQUESTER", color: "yellow" },
    ],
  },
  ASSET: {
    documentType: "Asset",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "APPROVED", label: "Approve", color: "green" },
      { from: "APPROVED", to: "ACTIVE", label: "Activate", color: "blue" },
      { from: "ACTIVE", to: "UNDER_MAINTENANCE", label: "Maintenance", color: "yellow" },
      { from: "UNDER_MAINTENANCE", to: "ACTIVE", label: "Return to Service", color: "green" },
      { from: "ACTIVE", to: "DISPOSED", label: "Dispose", color: "red" },
    ],
  },
  TICKET: {
    documentType: "Service Ticket",
    initialState: "OPEN",
    transitions: [
      { from: "OPEN", to: "ASSIGNED", label: "Assign", color: "blue" },
      { from: "ASSIGNED", to: "IN_PROGRESS", label: "Start Work", color: "blue" },
      { from: "IN_PROGRESS", to: "WAITING_CUSTOMER", label: "Waiting Customer", color: "yellow" },
      { from: "WAITING_CUSTOMER", to: "IN_PROGRESS", label: "Customer Replied", color: "blue" },
      { from: "IN_PROGRESS", to: "RESOLVED", label: "Resolve", color: "green" },
      { from: "RESOLVED", to: "CLOSED", label: "Close", color: "gray" },
      { from: "RESOLVED", to: "IN_PROGRESS", label: "Reopen", color: "yellow" },
    ],
  },
  BUDGET: {
    documentType: "Budget",
    initialState: "DRAFT",
    transitions: [
      { from: "DRAFT", to: "SUBMITTED", label: "Submit", color: "blue" },
      { from: "SUBMITTED", to: "APPROVED", label: "Approve", requiredRole: "APPROVER", color: "green" },
      { from: "SUBMITTED", to: "REJECTED", label: "Reject", requiredRole: "APPROVER", color: "red" },
      { from: "APPROVED", to: "ACTIVE", label: "Activate", color: "blue" },
      { from: "ACTIVE", to: "CLOSED", label: "Close Period", color: "gray" },
      { from: "REJECTED", to: "DRAFT", label: "Revise", color: "yellow" },
    ],
  },
  EXC: {
    documentType: "Exception",
    initialState: "RAISED",
    transitions: [
      { from: "RAISED", to: "UNDER_REVIEW", label: "Review", color: "blue" },
      { from: "UNDER_REVIEW", to: "APPROVED", label: "Approve", color: "green" },
      { from: "UNDER_REVIEW", to: "REJECTED", label: "Reject", color: "red" },
      { from: "APPROVED", to: "RESOLVED", label: "Resolve", color: "green" },
      { from: "RESOLVED", to: "CLOSED", label: "Close", color: "gray" },
    ],
  },
}

export function getAvailableTransitions(
  documentType: string,
  currentStatus: DocumentStatus
): Transition[] {
  const machine = STATE_MACHINES[documentType]
  if (!machine) return []
  return machine.transitions.filter((t) => t.from === currentStatus)
}

export function canTransition(
  documentType: string,
  from: DocumentStatus,
  to: DocumentStatus
): boolean {
  const machine = STATE_MACHINES[documentType]
  if (!machine) return false
  return machine.transitions.some((t) => t.from === from && t.to === to)
}

export function getStatusColor(status: DocumentStatus): string {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    SUBMITTED: "bg-blue-100 text-blue-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    IN_PROGRESS: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    CLOSED: "bg-gray-100 text-gray-600",
    CANCELLED: "bg-red-100 text-red-600",
    SENT: "bg-indigo-100 text-indigo-800",
    CONFIRMED: "bg-teal-100 text-teal-800",
    PARTIALLY_RECEIVED: "bg-yellow-100 text-yellow-800",
    RECEIVED: "bg-green-100 text-green-800",
    INVOICED: "bg-purple-100 text-purple-800",
    PAID: "bg-emerald-100 text-emerald-800",
    OVERDUE: "bg-red-100 text-red-800",
    PARTIALLY_PAID: "bg-amber-100 text-amber-800",
    PARTIALLY_SHIPPED: "bg-yellow-100 text-yellow-800",
    SHIPPED: "bg-green-100 text-green-800",
    INSPECTED: "bg-blue-100 text-blue-800",
    ACCEPTED: "bg-green-100 text-green-800",
    STORED: "bg-teal-100 text-teal-800",
    MATERIAL_READY: "bg-blue-100 text-blue-800",
    IN_PRODUCTION: "bg-indigo-100 text-indigo-800",
    QC: "bg-yellow-100 text-yellow-800",
    CALCULATED: "bg-blue-100 text-blue-800",
    REVIEWED: "bg-purple-100 text-purple-800",
    POSTED: "bg-green-100 text-green-800",
    REVERSED: "bg-red-100 text-red-800",
    OPEN: "bg-blue-100 text-blue-800",
    ASSIGNED: "bg-indigo-100 text-indigo-800",
    WAITING_CUSTOMER: "bg-yellow-100 text-yellow-800",
    RESOLVED: "bg-green-100 text-green-800",
    ACTIVE: "bg-green-100 text-green-800",
    UNDER_MAINTENANCE: "bg-yellow-100 text-yellow-800",
    DISPOSED: "bg-gray-100 text-gray-600",
    PLANNED: "bg-blue-100 text-blue-800",
    RAISED: "bg-orange-100 text-orange-800",
    UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
    SOFT_CLOSE: "bg-amber-100 text-amber-800",
    HARD_CLOSE: "bg-gray-100 text-gray-600",
    ARCHIVED: "bg-gray-100 text-gray-500",
  }
  return colors[status] || "bg-gray-100 text-gray-800"
}
