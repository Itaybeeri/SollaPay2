// All shared domain types live here so the model is readable in one place.

export type TransactionStatus =
  | "Pending"    // payment request created, awaiting the bank transfer
  | "Matched"    // bank event reference AND amount match the request
  | "Unmatched"  // reference and/or amount did not match (see mismatchReasons)
  | "Duplicate"; // this transactionId was already processed

// Why a bank event was not matched. Both can be present at once: a wrong
// reference means there is no request to verify the amount against, so both fail.
export type MismatchReason = "reference" | "amount";

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
  reference: string;             // the code shared by the request and the bank event
  expectedAmount: number | null; // from the payment request; null for orphan bank events
  bankEvent: BankEvent | null;   // null while Pending (no transfer received yet)
  status: TransactionStatus;
  mismatchReasons: MismatchReason[]; // populated only when status is "Unmatched"
  paymentRequestId: string | null;
  dealId: string | null;
  matchNote: string;             // human-readable matching decision
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
