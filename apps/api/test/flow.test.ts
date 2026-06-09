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
  store.paymentRequests.clear();
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

  it("a new payment request appears immediately as a Pending transaction", () => {
    seedPaymentRequest("ABC123");
    const pendings = [...store.transactions.values()].filter((t) => t.status === "Pending");
    expect(pendings).toHaveLength(1);
    expect(pendings[0].reference).toBe("ABC123");
    expect(pendings[0].bankEvent).toBeNull();
  });

  it("scenario 1: matches when reference AND amount agree", () => {
    seedPaymentRequest("ABC123");
    const tx = ingestBankEvent(event());
    expect(tx.status).toBe("Matched");
    expect(tx.mismatchReasons).toEqual([]);
    expect(tx.dealId).not.toBeNull();
    expect(store.notifications).toHaveLength(1);
  });

  it("reference matches but amount differs -> Unmatched (amount only)", () => {
    seedPaymentRequest("ABC123");
    const tx = ingestBankEvent(event({ amount: 50000 }));
    expect(tx.status).toBe("Unmatched");
    expect(tx.mismatchReasons).toEqual(["amount"]);
    expect(store.notifications).toHaveLength(0);
  });

  it("scenario 2: no payment request for the reference -> Unmatched (reference + amount)", () => {
    const tx = ingestBankEvent(event({ reference: "NOPE" }));
    expect(tx.status).toBe("Unmatched");
    expect(tx.mismatchReasons).toEqual(["reference", "amount"]);
    expect(tx.dealId).toBeNull();
    expect(store.notifications).toHaveLength(0);
  });

  it("retroactive match: a transfer that arrives before its request is matched when the request is created", () => {
    const orphan = ingestBankEvent(event()); // ref ABC123, amount 70000, no request yet
    expect(orphan.status).toBe("Unmatched");
    expect(orphan.mismatchReasons).toEqual(["reference", "amount"]);

    seedPaymentRequest("ABC123"); // expected 70000 — matches the waiting transfer

    const adopted = store.transactions.get(orphan.id)!;
    expect(adopted.status).toBe("Matched");
    expect(adopted.dealId).not.toBeNull();
    expect(store.notifications).toHaveLength(1);
    // No separate Pending row is opened.
    expect([...store.transactions.values()].filter((t) => t.status === "Pending")).toHaveLength(0);
  });

  it("multiple requests with the same reference are matched one-per-transfer (FIFO)", () => {
    seedPaymentRequest("ABC123"); // three deals, same reference + amount
    seedPaymentRequest("ABC123");
    seedPaymentRequest("ABC123");

    ingestBankEvent(event({ transactionId: "tx_a" })); // first transfer
    ingestBankEvent(event({ transactionId: "tx_b" })); // second transfer

    const byStatus = (s: string) =>
      [...store.transactions.values()].filter((t) => t.status === s).length;
    expect(byStatus("Matched")).toBe(2);   // two transfers consumed two pendings
    expect(byStatus("Pending")).toBe(1);   // one request still waiting
    expect(store.notifications).toHaveLength(2);
  });

  it("scenario 3: a repeated transactionId is recorded as Duplicate", () => {
    seedPaymentRequest("ABC123");
    ingestBankEvent(event());
    const second = ingestBankEvent(event());
    expect(second.status).toBe("Duplicate");
  });
});
