import type {
  Deal, PaymentRequest, BankEvent, Transaction, AuditEntry, Notification,
} from "./types.js";

// Single in-memory store. No DB — collections reset on restart.
export const store = {
  deals: new Map<string, Deal>(),
  paymentRequests: new Map<string, PaymentRequest>(), // by id (references are NOT unique)
  bankEventsByTransactionId: new Map<string, BankEvent>(), // dedup index
  transactions: new Map<string, Transaction>(),

  auditEntries: [] as AuditEntry[],
  notifications: [] as Notification[],
};

let counter = 0;
export const newId = (prefix: string): string => `${prefix}_${++counter}`;
export const now = (): string => new Date().toISOString();
