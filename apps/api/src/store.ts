import type {
  Deal, PaymentRequest, BankEvent, AuditEntry, Notification,
} from "./types.js";

// Single in-memory store. No DB — collections reset on restart.
export const store = {
  deals: new Map<string, Deal>(),
  paymentRequests: new Map<string, PaymentRequest>(),     // by id; references are NOT unique
  bankEventsByTransactionId: new Map<string, BankEvent>(), // counted transfers (dedup index)
  duplicateEvents: [] as BankEvent[],                      // duplicate transactionId attempts
  matchedReferences: new Set<string>(),                    // references already notified as Matched
  auditEntries: [] as AuditEntry[],
  notifications: [] as Notification[],
};

let counter = 0;
export const newId = (prefix: string): string => `${prefix}_${++counter}`;
export const now = (): string => new Date().toISOString();

const numberFmt = new Intl.NumberFormat("en-US");
export const fmt = (n: number): string => numberFmt.format(n);
