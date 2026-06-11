# Design Q&A — SollaPay2

> The implemented central flow lives in the app's **Console** tab (bank event → store →
> associate to a deal → update state → audit → notify). This document answers the Part-1
> design questions and the discussion scenarios — the parts meant for conversation rather
> than code. It mirrors the in-app **Design Q&A** tab.

## MVP tradeoffs vs. a production version

| MVP (built)                       | Production (next)                                         |
| --------------------------------- | -------------------------------------------------------- |
| In-memory store                   | Real DB with unique/index constraints                    |
| Synchronous in-process event bus  | Durable broker + workers + DLQ                           |
| UI polling (~1s)                  | SSE / WebSocket push                                      |
| No auth; open webhook             | RBAC + HMAC-signed webhooks                               |
| Single currency assumed           | Multi-currency / FX handling                             |
| In-app notification feed          | Email / SMS / WhatsApp with delivery guarantees          |
| Short/Overpaid surfaced only      | Business rules: hold, alert ops, refund, partial release |

_RBAC = Role-Based Access Control (permissions limited by role: lawyer / ops / buyer).
HMAC = signed webhook — verifies the event truly came from the bank._

## Scenario 4 — the component that records the action is unavailable

The rule that anchors everything: we return `200` to the bank **only once the event is
durably persisted somewhere we can recover from**. So if the primary database write
isn't available, there are two valid responses:

**Option A — reject, let the bank retry.** Return a non-2xx. We never acknowledge what we
didn't store, so the bank's retry mechanism is the safety net — and because intake is
idempotent (dedup by `transactionId`), those retries are harmless. Simplest correct
behavior; relies on the bank actually retrying.

**Option B — fail over to a durable backup / queue.** Write the raw event to a backup
store or, better, a persistent append-only queue (Kafka / SQS). That durable append _is_
a valid "we've got it," so we can return `200` and let the rest of the pipeline (matching,
audit, notify) consume asynchronously, retrying as components recover. In production this
is the standard shape: the webhook's only job is to durably land the event; everything
downstream is decoupled behind the queue.

**Two layers, kept separate:**

- **Intake durability** gates the `200` (Options A / B).
- **Recording side-effects** (audit / notify) being down is handled by the **outbox
  pattern** + idempotent consumers with retries — a failed audit/notification is retried,
  never silently dropped.

The backup/queue has to be replicated so it doesn't become a single point of failure.

## Scale — tens to hundreds of thousands of events/day

- Replace the sync in-process bus with a **broker** (SQS / Kafka): the webhook persists +
  enqueues and returns `200` fast; processing happens off the hot path.
- Stateless, horizontally-scaled, idempotent workers.
- DB with `UNIQUE(transaction_id)` + `INDEX(reference)`; partition/shard by reference.
- Dead-letter queue for poison messages; retries with exponential backoff.
- Materialize/cache the per-reference totals instead of recomputing from scratch.
- Observability: metrics, structured logs, tracing; alert on a rising backlog of
  Short / Overpaid / Unexpected.
- UI from polling → SSE/WebSocket push.

## Domain modeling — entities & relationships

**Implemented entities:**

- **Deal** — the real-estate transaction the lawyer manages as trustee (the escrow).
- **PaymentRequest** — the lawyer's payment instruction (״הוראת תשלום״). Belongs to a
  Deal; carries a `reference`, an `expectedAmount`, and a currency. References are
  intentionally **not unique** — several deals can share one.
- **BankEvent** — the raw payload from the bank, identified by `transactionId`.
- **ReferenceGroup** — a _derived_ view that rolls up every PaymentRequest and BankEvent
  sharing a reference and computes the totals + status. Not stored; recomputed on demand.
- **AuditEntry** — append-only record of every action, keyed by reference.
- **Notification** — message to the lawyer when a reference becomes fully funded.

**Relationships:** Deal 1—\* PaymentRequest. The `reference` is the join key between
PaymentRequest(s) and BankEvent(s); the ReferenceGroup is the aggregation over that key.

**Fuller production domain (out of MVP scope):** Lawyer/Trustee, Project, Client/Buyer,
LedgerEntry (double-entry money movement), User/Role (RBAC).

## API design & the bank contract

**Implemented endpoints:**

- `POST /api/bank/webhook` — the bank notifies us a transfer arrived.
- `POST /api/deals`, `POST /api/payment-requests` — the lawyer side.
- `GET /api/references` — the rolled-up state (one group per reference).
- `GET /api/notifications`, `GET /api/audit` — feeds.

**The contract with the bank:**

```
POST /api/bank/webhook
{
  "transactionId": "tx_123",   // idempotency key
  "amount": 70000,
  "currency": "ILS",
  "reference": "ABC123",       // links the money to a deal
  "senderName": "John Doe",
  "occurredAt": "2026-06-03T10:00:00Z"
}
→ 200 OK   (only AFTER the event is durably stored)
```

**Key decisions:**

- **Persist-before-acknowledge:** return `200` only after the event is stored.
- **Idempotency key** = `transactionId` (production: also accept an `Idempotency-Key` header).
- **Authenticity (production):** verify an HMAC signature header (`X-Signature`).
- **Status codes:** `200` stored, `400` malformed, `401` bad signature, `5xx` → bank retries.

## Data model — tables & key fields

The MVP uses in-memory maps (swap-ready for a DB). In production:

```
deals(id PK, name, buyer_name, lawyer_id FK, created_at)

payment_requests(id PK, deal_id FK, reference, expected_amount,
                 currency, status, created_at)
        INDEX(reference)

bank_events(id PK, transaction_id, amount, currency, reference,
            sender_name, occurred_at, received_at)
        UNIQUE(transaction_id)   -- idempotency at the DB level
        INDEX(reference)

audit_entries(id PK, at, actor, action, detail, reference)
        INDEX(reference)

notifications(id PK, at, reference, channel, message, delivered_at)

outbox(id PK, aggregate, payload, status, attempts, next_attempt_at)
```

The two constraints that carry the design: `UNIQUE(transaction_id)` makes duplicate
detection a database guarantee, and `INDEX(reference)` makes the per-reference
aggregation fast. Totals can be computed on read, or materialized/cached at high volume.

## Processing flow — from bank event to user update

1. Bank calls `POST /api/bank/webhook`.
2. **Ingest** persists the raw event (what the `200` acknowledges) and dedups by `transactionId`.
3. An event is published on a synchronous in-process **event bus**.
4. **evaluateReference** re-derives that reference's totals → status (Matched / Short / Overpaid / Unexpected).
5. **Audit** appends an entry; **Notifications** fires when the reference first becomes fully funded.
6. The UI polls `GET /api/references` (~1s) and reflects the new state. (Production: SSE/WebSocket push.)

Audit and Notifications _react_ to events — they're never called directly by business
logic, which keeps the flow easy to follow and each piece independently testable.

## Reliability — duplicates & crashes

_(Partial failure / a recording component being down is covered in Scenario 4 above.)_

**The same event arrives twice:** dedup by `transactionId` (a `UNIQUE` constraint in
production). The duplicate is recorded for the audit trail but **excluded from the
totals** — no double-counting, no second notification. This is what makes the webhook
safe for the bank to retry.

**The system crashes mid-processing:** because status is **derived from persisted facts**
(events + requests) rather than a mutable per-event state machine, a restart simply
re-derives the correct state — there is no half-updated record to repair. Pending
side-effects resume from the outbox, and the bank can safely re-deliver.

## Scenarios 1–3

1. **A valid event for an existing deal** — the transfer is counted toward its reference;
   when the total received meets the total requested, the reference becomes **Matched**,
   the lawyer is notified, and every step is audited.
2. **An event that matches no deal** — the reference shows **Unexpected funds**; the money
   is held and surfaced (not lost), and audited. If the deal is created later, the
   reference re-derives and matches automatically (order-independent).
3. **The same event twice** — idempotent dedup by `transactionId`: recorded as a
   duplicate, excluded from totals, no second notification.

_(Scenario 4 — a recording component is unavailable — is answered at the top.)_
