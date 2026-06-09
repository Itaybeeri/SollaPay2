// All shared domain types live here so the model is readable in one place.

export type TransactionStatus = "Matched" | "Unmatched" | "Duplicate";

export interface Deal {
  id: string;
  name: string;          // e.g. "Apartment 4B, Tel Aviv project"
  buyerName: string;
  createdAt: string;
}

export interface PaymentRequest {
  id: string;
  dealId: string;
  reference: string;     // unique code the bank must quote
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

export interface Transaction {
  id: string;
  bankEvent: BankEvent;
  status: TransactionStatus;
  paymentRequestId: string | null;
  dealId: string | null;
  matchNote: string;     // human-readable matching decision
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;        // e.g. "bank.event.received"
  detail: string;
  transactionId: string | null;
}

export interface Notification {
  id: string;
  at: string;
  dealId: string;
  message: string;
}
