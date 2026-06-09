import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../src/store.js";
import { createDeal, createPaymentRequest } from "../src/routes.js";
import { ingestBankEvent } from "../src/ingest.js";
import { registerAudit } from "../src/audit.js";
import { registerNotifications } from "../src/notifications.js";
import type { BankEvent } from "../src/types.js";

registerAudit();
registerNotifications();

function resetStore() {
  store.deals.clear();
  store.paymentRequestsByReference.clear();
  store.bankEventsByTransactionId.clear();
  store.transactions.clear();
  store.auditEntries.length = 0;
  store.notifications.length = 0;
}

function seedPaymentRequest(reference: string) {
  const deal = createDeal({ name: "Apt 4B", buyerName: "John Doe" });
  return createPaymentRequest({
    dealId: deal.id, reference, expectedAmount: 70000, currency: "ILS",
  });
}

const event = (over: Partial<BankEvent> = {}): BankEvent => ({
  transactionId: "tx_123", amount: 70000, currency: "ILS",
  reference: "ABC123", senderName: "John Doe",
  occurredAt: "2026-06-03T10:00:00Z", ...over,
});

describe("bank event ingest flow", () => {
  beforeEach(resetStore);

  it("scenario 1: matches an event to a payment request", () => {
    seedPaymentRequest("ABC123");
    const tx = ingestBankEvent(event());
    expect(tx.status).toBe("Matched");
    expect(tx.dealId).not.toBeNull();
    expect(store.notifications).toHaveLength(1);
  });

  it("scenario 2: marks event with no matching reference as Unmatched", () => {
    const tx = ingestBankEvent(event({ reference: "NOPE" }));
    expect(tx.status).toBe("Unmatched");
    expect(tx.dealId).toBeNull();
    expect(store.notifications).toHaveLength(0);
  });

  it("scenario 3: a repeated transactionId is recorded as Duplicate", () => {
    seedPaymentRequest("ABC123");
    ingestBankEvent(event());
    const second = ingestBankEvent(event());
    expect(second.status).toBe("Duplicate");
    expect(store.transactions.size).toBe(2);
  });
});
