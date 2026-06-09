import { Router } from "express";
import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import { ingestBankEvent } from "./ingest.js";
import { matchPaymentRequest } from "./matching.js";
import type { Deal, PaymentRequest, Transaction, AuditEntry } from "./types.js";

// Plain functions so tests can call them directly without HTTP.
export function createDeal(input: { name: string; buyerName: string }): Deal {
  const deal: Deal = { id: newId("deal"), name: input.name, buyerName: input.buyerName, createdAt: now() };
  store.deals.set(deal.id, deal);
  return deal;
}

export function createPaymentRequest(input: {
  dealId: string; reference: string; expectedAmount: number; currency: string;
}): PaymentRequest {
  const pr: PaymentRequest = { id: newId("pr"), ...input, createdAt: now() };
  store.paymentRequestsByReference.set(pr.reference, pr);

  // The transfer may have arrived first: if a waiting Unmatched transfer fits,
  // adopt it now (it becomes Matched) instead of opening a new Pending row.
  if (matchPaymentRequest(pr)) return pr;

  // Otherwise the request shows up immediately as Pending, awaiting the transfer.
  const tx: Transaction = {
    id: newId("txn"), reference: pr.reference, expectedAmount: pr.expectedAmount,
    bankEvent: null, status: "Pending", mismatchReasons: [],
    paymentRequestId: pr.id, dealId: pr.dealId,
    matchNote: `Awaiting payment of ${pr.expectedAmount} ${pr.currency} (ref ${pr.reference})`,
    createdAt: now(),
  };
  store.transactions.set(tx.id, tx);
  store.pendingTransactionIdByReference.set(pr.reference, tx.id);
  eventBus.emit("transaction.pending", tx);
  return pr;
}

function auditFor(transactionId: string): AuditEntry[] {
  return store.auditEntries.filter((a) => a.transactionId === transactionId);
}

export const router = Router();

router.post("/bank/webhook", (req, res) => {
  const tx = ingestBankEvent(req.body); // 200 returned only after persistence + processing
  res.status(200).json(tx);
});

router.post("/deals", (req, res) => res.status(201).json(createDeal(req.body)));
router.post("/payment-requests", (req, res) => res.status(201).json(createPaymentRequest(req.body)));

router.get("/deals", (_req, res) => res.json([...store.deals.values()]));
router.get("/payment-requests", (_req, res) => res.json([...store.paymentRequestsByReference.values()]));
router.get("/transactions", (_req, res) =>
  res.json([...store.transactions.values()].reverse().map((t) => ({ ...t, audit: auditFor(t.id) }))));
router.get("/notifications", (_req, res) => res.json([...store.notifications].reverse()));
router.get("/audit", (_req, res) => res.json([...store.auditEntries].reverse()));
