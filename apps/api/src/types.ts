// All shared domain types live here so the model is readable in one place.

export interface Deal {
  id: string;
  name: string;          // e.g. "Apartment 4B, Tel Aviv project"
  buyerName: string;
  createdAt: string;
}

export interface PaymentRequest {
  id: string;
  dealId: string;
  reference: string;     // the code the bank must quote (NOT unique — deals can share one)
  expectedAmount: number;
  currency: string;
  createdAt: string;
}

// Raw payload exactly as the bank sends it.
export interface BankEvent {
  transactionId: string; // idempotency key
  amount: number;
  currency: string;
  reference: string;
  senderName: string;
  occurredAt: string;
}

// Everything is grouped by reference. A group rolls up every deal and every
// transfer sharing a reference and compares totals.
//   Matched    – total transferred == total requested
//   Short      – total transferred  < total requested (missing the difference)
//   Overpaid   – total transferred  > total requested (too much)
//   Unexpected – transfers arrived but no deal exists for the reference
export type ReferenceStatus = "Matched" | "Short" | "Overpaid" | "Unexpected";

export interface ReferenceGroup {
  reference: string;
  currency: string;
  requests: PaymentRequest[];
  transfers: BankEvent[];     // counted transfers (duplicates excluded)
  duplicateCount: number;     // duplicate transactionId attempts, ignored in totals
  totalRequested: number;
  totalTransferred: number;
  difference: number;         // transferred - requested (negative = short)
  status: ReferenceStatus;
  summary: string;            // e.g. "2 transfers · 1 deal — missing 30,000 ILS"
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;             // e.g. "transfer.received"
  detail: string;
  reference: string | null;
}

export interface Notification {
  id: string;
  at: string;
  reference: string;
  message: string;
}
