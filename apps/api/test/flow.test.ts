import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../src/store.js";
import { createDeal, createPaymentRequest } from "../src/routes.js";
import { ingestBankEvent } from "../src/ingest.js";
import { buildReferenceGroup } from "../src/references.js";
import { registerAudit } from "../src/audit.js";
import { registerNotifications } from "../src/notifications.js";
import type { BankEvent } from "../src/types.js";

registerAudit();
registerNotifications();

function resetStore() {
  store.deals.clear();
  store.paymentRequests.clear();
  store.bankEventsByTransactionId.clear();
  store.duplicateEvents.length = 0;
  store.matchedReferences.clear();
  store.auditEntries.length = 0;
  store.notifications.length = 0;
}

function request(reference: string, expectedAmount: number) {
  const deal = createDeal({ name: "Apt 4B", buyerName: "John Doe" });
  return createPaymentRequest({ dealId: deal.id, reference, expectedAmount, currency: "ILS" });
}

const transfer = (over: Partial<BankEvent> = {}): BankEvent => ({
  transactionId: "tx_1", amount: 70000, currency: "ILS",
  reference: "ABC123", senderName: "John Doe",
  occurredAt: "2026-06-03T10:00:00Z", ...over,
});

const group = (reference = "ABC123") => buildReferenceGroup(reference);

describe("reference aggregation", () => {
  beforeEach(resetStore);

  it("a deal with no transfer is Short by the full amount", () => {
    request("ABC123", 70000);
    const g = group();
    expect(g.status).toBe("Short");
    expect(g.difference).toBe(-70000);
    expect(g.totalRequested).toBe(70000);
    expect(g.totalTransferred).toBe(0);
  });

  it("exact single transfer is Matched and notifies once", () => {
    request("ABC123", 70000);
    ingestBankEvent(transfer());
    const g = group();
    expect(g.status).toBe("Matched");
    expect(store.notifications).toHaveLength(1);
  });

  it("split transfers that sum to the requested total are Matched (40000 + 30000 = 70000)", () => {
    request("ABC123", 70000);
    ingestBankEvent(transfer({ transactionId: "tx_a", amount: 40000 }));
    let g = group();
    expect(g.status).toBe("Short");
    expect(g.difference).toBe(-30000);

    ingestBankEvent(transfer({ transactionId: "tx_b", amount: 30000 }));
    g = group();
    expect(g.status).toBe("Matched");
    expect(g.totalTransferred).toBe(70000);
    expect(store.notifications).toHaveLength(1);
  });

  it("too little money is Short with the missing amount", () => {
    request("ABC123", 70000);
    ingestBankEvent(transfer({ amount: 40000 }));
    const g = group();
    expect(g.status).toBe("Short");
    expect(g.difference).toBe(-30000);
    expect(store.notifications).toHaveLength(0);
  });

  it("too much money is Overpaid with the surplus", () => {
    request("ABC123", 70000);
    ingestBankEvent(transfer({ amount: 100000 }));
    const g = group();
    expect(g.status).toBe("Overpaid");
    expect(g.difference).toBe(30000);
  });

  it("transfers with no deal are Unexpected", () => {
    ingestBankEvent(transfer({ amount: 50000 }));
    const g = group();
    expect(g.status).toBe("Unexpected");
    expect(g.totalRequested).toBe(0);
    expect(g.totalTransferred).toBe(50000);
  });

  it("multiple deals on one reference sum together", () => {
    request("ABC123", 50000);
    request("ABC123", 50000); // total requested 100000
    ingestBankEvent(transfer({ amount: 100000 }));
    const g = group();
    expect(g.totalRequested).toBe(100000);
    expect(g.status).toBe("Matched");
  });

  it("references match case-insensitively (ABC123 == abc123)", () => {
    request("ABC123", 70000);
    ingestBankEvent(transfer({ reference: "abc123" }));
    const g = buildReferenceGroup("aBc123");
    expect(g.status).toBe("Matched");
    expect(g.reference).toBe("ABC123"); // canonical (upper-cased) key
    expect(g.requests).toHaveLength(1);
    expect(g.transfers).toHaveLength(1);
    expect(store.notifications).toHaveLength(1);
  });

  it("a duplicate transactionId is recorded but not counted in totals", () => {
    request("ABC123", 70000);
    ingestBankEvent(transfer());
    const second = ingestBankEvent(transfer()); // same transactionId
    expect(second.duplicate).toBe(true);
    const g = group();
    expect(g.duplicateCount).toBe(1);
    expect(g.totalTransferred).toBe(70000); // not doubled
    expect(g.status).toBe("Matched");
  });
});
