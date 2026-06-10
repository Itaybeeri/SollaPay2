// Typed fetch helpers. Mirrors the API's domain types.

export type ReferenceStatus = "Matched" | "Short" | "Overpaid" | "Unexpected";

export interface BankTransfer {
  transactionId: string; amount: number; currency: string;
  reference: string; senderName: string; occurredAt: string;
}

export interface ReferenceGroup {
  reference: string;
  currency: string;
  status: ReferenceStatus;
  totalRequested: number;
  totalTransferred: number;
  difference: number;       // transferred - requested
  duplicateCount: number;
  summary: string;
  requests: { id: string; dealId: string; expectedAmount: number; currency: string }[];
  transfers: BankTransfer[];
  audit: { id: string; at: string; action: string; detail: string }[];
}

export interface Deal { id: string; name: string; buyerName: string }
export interface PaymentRequest { id: string; dealId: string; reference: string; expectedAmount: number; currency: string }
export interface Notification { id: string; at: string; reference: string; message: string }

const get = <T>(path: string): Promise<T> => fetch(`/api${path}`).then((r) => r.json());
const post = <T>(path: string, body: unknown): Promise<T> =>
  fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export const api = {
  getReferences: () => get<ReferenceGroup[]>("/references"),
  getPaymentRequests: () => get<PaymentRequest[]>("/payment-requests"),
  getNotifications: () => get<Notification[]>("/notifications"),
  createDeal: (b: { name: string; buyerName: string }) => post<Deal>("/deals", b),
  createPaymentRequest: (b: { dealId: string; reference: string; expectedAmount: number; currency: string }) =>
    post<PaymentRequest>("/payment-requests", b),
  sendWebhook: (b: BankTransfer) => post<unknown>("/bank/webhook", b),
};
