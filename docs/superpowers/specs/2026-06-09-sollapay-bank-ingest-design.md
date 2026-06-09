# SollaPay — Bank Event Ingest (Founding Engineer Exercise) — Design

**Date:** 2026-06-09
**Status:** Approved design → ready for implementation plan

## 1. Purpose

Implement the central flow of the SollaPay exercise: a bank notifies the system that
money arrived, the system stores it, decides which deal it belongs to, updates the
deal, records an audit trail, and notifies the lawyer.

This is an **interview deliverable**, not a product. Priorities, in order:
1. The central flow is **clean and easy to follow**.
2. The 3-panel UI makes the flow **visible end to end**.
3. Reliability scenarios (duplicate / unmatched) are demonstrably handled.

Non-goals: real DB, real bank, auth, real estate/banking domain depth, scenario-4 code.

**Code-clarity requirement (hard):** the author must be able to *find and explain any
piece of code live during the interview*. Therefore: small single-purpose files,
descriptive names, the central flow obvious at a glance, no clever abstractions, no
premature generalization. Readability beats brevity. A reviewer should trace
webhook → match → audit → notify by reading file names alone.

## 2. Constraints / Decisions

- **All TypeScript.** Backend Express + TS (`tsx` hot reload); frontend React + Vite + TS + Tailwind.
- **In-memory store only** — plain modules holding Maps/arrays. No JSON files, no DB.
- **Single `npm run dev`** runs api + web together via `concurrently`.
- **Live UI updates via polling (~1s).** SSE is the more elegant option and will be
  noted as a comment in the polling code, but not implemented.
- **Scope built:** scenario 1 (matched), scenario 2 (unmatched), scenario 3 (duplicate/idempotent).
- **Scope discussed only:** scenario 4 (partial failure of audit/notifier).

## 3. Domain Model

| Entity | Description |
|--------|-------------|
| **Deal** | A real-estate transaction the lawyer manages (escrow). Name/buyer. |
| **PaymentRequest** | Lawyer's payment instruction. Belongs to a Deal. Unique **reference** + expected amount + currency. This is what the bank quotes. |
| **BankEvent** | Raw incoming payload from the bank (the brief's JSON). Stored verbatim. |
| **Transaction** | Created from a BankEvent after processing. `status`: `Matched` / `Unmatched` / `Duplicate`. Links to a PaymentRequest when matched. |
| **AuditEntry** | Append-only record of every processing step. |
| **Notification** | Message to the lawyer ("₪70,000 received for Deal X"). |

Relationships:
- `Deal 1—* PaymentRequest`
- `PaymentRequest 1—* Transaction`
- `BankEvent 1—1 Transaction`

## 4. API Contracts

### Bank → SollaPay (the contract under test)
`POST /api/bank/webhook`

Request body (exactly the brief):
```json
{
  "transactionId": "tx_123",
  "amount": 70000,
  "currency": "ILS",
  "reference": "ABC123",
  "senderName": "John Doe",
  "occurredAt": "2026-06-03T10:00:00Z"
}
```
- Returns `200 OK` **only after the bank event has been durably written to the store**
  (not `202` — we acknowledge receipt only once the data is safely persisted, so the
  bank never considers it delivered while it could still be lost).
- **`transactionId` is the idempotency key** (scenario 3): a repeated id is recorded as `Duplicate` and does not re-process.

### UI-supporting APIs
- `POST /api/deals` — create a Deal.
- `POST /api/payment-requests` — create a PaymentRequest (generates/accepts a reference).
- `GET /api/transactions` — central panel list (polled ~1s); each item embeds its raw BankEvent + matching decision + audit entries for expand.
- `GET /api/notifications` — lawyer feed (polled).
- `GET /api/audit` — full audit trail.

## 5. Data Model (in-memory)

Single in-memory store module exposing typed collections:
- `deals: Map<id, Deal>`
- `paymentRequests: Map<id, PaymentRequest>` (also indexed by `reference`)
- `bankEvents: Map<transactionId, BankEvent>` (the dedup index)
- `transactions: Map<id, Transaction>`
- `auditEntries: AuditEntry[]`
- `notifications: Notification[]`

## 6. Architecture

Small single-purpose backend modules around a **synchronous in-process event bus**
(publish/subscribe). Business logic publishes events; Audit, Notifications, and the
matching result all react to events rather than being called directly. This is the
key structure that makes the scenarios easy to reason about and easy to demo.

```
Bank panel ──POST /api/bank/webhook──► Ingest ──(dedup by transactionId)──► EventBus
                                                                              │
              ┌───────────────────────────────────┬─────────────────────────┤
              ▼                                     ▼                         ▼
         Matching                                 Audit                 Notifications
   (reference → PaymentRequest)             (append-only log)          (lawyer feed)
              │
              ▼ Transaction.status = Matched | Unmatched
```

Modules: `store`, `eventBus`, `ingest`, `matching`, `audit`, `notifications`, plus the Express `routes`.

## 7. Processing Flow

On `POST /api/bank/webhook`:
1. **Ingest** stores the raw BankEvent (durable write — this is what the `200 OK`
   acknowledges). If `transactionId` already seen → create Transaction `Duplicate`,
   audit it, stop (scenario 3).
2. Publish `bank.event.received` on the event bus.
3. **Matching** subscriber looks up PaymentRequest by `reference`:
   - Found → Transaction `Matched`, link to PaymentRequest/Deal, publish `transaction.matched`.
   - Not found → Transaction `Unmatched`, publish `transaction.unmatched` (scenario 2).
4. **Audit** subscriber appends an AuditEntry for every step.
5. **Notifications** subscriber, on `transaction.matched`, pushes a lawyer notification.

The three UI panels are windows onto this single flow:
- **Bank panel** triggers step 0 (a form/buttons to fire matched / unmatched / duplicate cases).
- **Central panel** shows steps 1–4: transaction list with status, each row expandable
  to reveal raw payload + matching decision + audit entries.
- **Lawyer panel** creates Deals/PaymentRequests and shows step 5 (notification feed).

## 8. UI

Three side-by-side panels on one screen:
- **Bank (left):** compose & send webhook form; quick buttons for matched / wrong-ref / duplicate.
- **SollaPay (center):** transaction list + statuses; every detail/log collapsed by
  default and **expandable**; audit trail visible.
- **Lawyer (right):** create Deal + PaymentRequest form (shows generated reference);
  live notification feed.

All data/logs are present in the UI — hidden behind expand/collapse, never dropped.

## 9. Reliability

- **Scenario 1 (matched):** happy path above.
- **Scenario 2 (unmatched):** no PaymentRequest for the reference → Transaction
  `Unmatched`, surfaced in central panel as "No matching payment request", audited.
  Money is held, not lost; awaits manual resolution (discussed).
- **Scenario 3 (duplicate):** `transactionId` dedup → `Duplicate`, no re-processing.
- **Scenario 4 (partial failure — DISCUSSION ONLY, not built):** if Audit/Notifier is
  unavailable mid-process. Talking points: outbox pattern (persist intent, deliver
  async with retry), idempotent webhook makes bank retries safe, processing is
  recorded before side effects so a crash can resume. No code.

## 10. Scale (discussion only)

For tens/hundreds of thousands of events/day: replace the sync in-process bus with a
real queue/broker (e.g. SQS/Kafka), move the store to a real DB with the `reference`
and `transactionId` indexed/unique-constrained, make processing workers horizontally
scalable and idempotent, and decouple notifications behind the queue.

## 11. Run

`npm run dev` at repo root → `concurrently` starts the Express API and the Vite dev
server. No external services, no DB setup.
