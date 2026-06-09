// Typed fetch helpers. Mirrors the API's domain types.
export interface Transaction {
  id: string;
  status: "Pending" | "Matched" | "Unmatched" | "Duplicate";
  reference: string;
  expectedAmount: number | null;
  mismatchReasons: ("reference" | "amount")[];
  matchNote: string; dealId: string | null; createdAt: string;
  bankEvent: { transactionId: string; amount: number; currency: string;
    reference: string; senderName: string; occurredAt: string } | null;
  audit: { id: string; at: string; action: string; detail: string }[];
}
export interface Deal { id: string; name: string; buyerName: string }
export interface PaymentRequest { id: string; dealId: string; reference: string; expectedAmount: number; currency: string }
export interface Notification { id: string; at: string; dealId: string; message: string }

const get = <T>(path: string): Promise<T> => fetch(`/api${path}`).then((r) => r.json());
const post = <T>(path: string, body: unknown): Promise<T> =>
  fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export const api = {
  getTransactions: () => get<Transaction[]>("/transactions"),
  getDeals: () => get<Deal[]>("/deals"),
  getPaymentRequests: () => get<PaymentRequest[]>("/payment-requests"),
  getNotifications: () => get<Notification[]>("/notifications"),
  createDeal: (b: { name: string; buyerName: string }) => post<Deal>("/deals", b),
  createPaymentRequest: (b: { dealId: string; reference: string; expectedAmount: number; currency: string }) =>
    post<PaymentRequest>("/payment-requests", b),
  sendWebhook: (b: Transaction["bankEvent"]) => post<Transaction>("/bank/webhook", b),
};
