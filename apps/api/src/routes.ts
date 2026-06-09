import { Router } from "express";
import { store, newId, now } from "./store.js";
import { ingestBankEvent } from "./ingest.js";
import type { Deal, PaymentRequest, AuditEntry } from "./types.js";

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
