import { Router } from "express";
import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import { ingestBankEvent } from "./ingest.js";
import { allReferenceGroups, evaluateReference } from "./references.js";
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
  store.paymentRequests.set(pr.id, pr);
  eventBus.emit("request.created", pr);
  evaluateReference(pr.reference); // a transfer may already be waiting on this reference
  return pr;
}

function auditFor(reference: string): AuditEntry[] {
  return store.auditEntries.filter((a) => a.reference === reference);
}

export const router = Router();

router.post("/bank/webhook", (req, res) => {
  const result = ingestBankEvent(req.body); // 200 only after persistence + evaluation
  res.status(200).json(result);
});

router.post("/deals", (req, res) => res.status(201).json(createDeal(req.body)));
router.post("/payment-requests", (req, res) => res.status(201).json(createPaymentRequest(req.body)));

router.get("/deals", (_req, res) => res.json([...store.deals.values()]));
router.get("/payment-requests", (_req, res) => res.json([...store.paymentRequests.values()]));
router.get("/references", (_req, res) =>
  res.json(allReferenceGroups().map((g) => ({ ...g, audit: auditFor(g.reference) }))));
router.get("/notifications", (_req, res) => res.json([...store.notifications].reverse()));
router.get("/audit", (_req, res) => res.json([...store.auditEntries].reverse()));
