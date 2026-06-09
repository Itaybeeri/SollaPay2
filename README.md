# SollaPay2 — Bank Event Ingest (Founding Engineer Exercise)

A small, self-contained demo of SollaPay's core money-in flow: a bank notifies the
system that funds arrived, the system **persists** the event, **matches** it to a
lawyer's payment request, writes an **audit trail**, and **notifies** the lawyer —
all visible live across a 3-panel UI.

In-memory only. No database, no external services. One command to run.

## Run

```bash
npm install
npm run dev
```

- API → http://localhost:4000
- Web → http://localhost:5173 (open this)

`npm run dev` starts the Express API and the Vite web app together via `concurrently`.

## The screen

Three side-by-side panels, each a window onto the same flow:

| Panel | Role |
|-------|------|
| **Bank** (left) | Compose & send a bank webhook. Buttons fire the matched / wrong-reference / duplicate cases. |
| **SollaPay** (center) | Every transaction with its status (`Matched` / `Unmatched` / `Duplicate`). Click a row to expand the raw bank payload + audit trail. |
| **Lawyer** (right) | Create a Deal + Payment Request (the reference the bank must quote) and watch the notification feed. |

## Demo script (the three implemented scenarios)

1. **Scenario 1 — Matched.** Lawyer panel → *Create deal + payment request* (ref `ABC123`).
   Bank panel → *Send transfer (this reference)*. Center shows **Matched**; expand it to
   see the payload + audit; a notification appears in the Lawyer feed.
2. **Scenario 2 — Unmatched.** Bank panel → *Send with wrong reference*. Center shows
   **Unmatched** ("No matching payment request"); no notification. The money is held,
   not lost — it awaits manual resolution.
3. **Scenario 3 — Duplicate.** Bank panel → *Resend last transfer (duplicate)*. Center
   shows a **Duplicate** row; the event is not re-processed and no second notification
   fires (idempotency on `transactionId`).

## Architecture

```
Bank panel ──POST /api/bank/webhook──► Ingest ──(dedup by transactionId)──► EventBus
                                          │                                   │
                            persist (the 200 OK              ┌────────────────┼────────────────┐
                             acknowledges this)              ▼                ▼                ▼
                                                          Matching          Audit       Notifications
                                                    (reference → PR)   (append-only)    (lawyer feed)
```

- **Synchronous in-process event bus.** Business logic publishes events; Audit and
  Notifications *react* to them — they are never called directly. This keeps the flow
  easy to follow and easy to extend.
- **Persist-before-acknowledge.** The webhook returns `200 OK` only after the event is
  durably stored, so the bank never considers a transfer delivered while it could be lost.
- **Idempotency.** `transactionId` is the dedup key; a repeat is recorded as `Duplicate`
  and short-circuits before matching.

### Where things live (API)

| File | Responsibility |
|------|----------------|
| `apps/api/src/types.ts` | Domain types (Deal, PaymentRequest, BankEvent, Transaction, AuditEntry, Notification) |
| `apps/api/src/store.ts` | In-memory collections |
| `apps/api/src/eventBus.ts` | Tiny sync pub/sub |
| `apps/api/src/ingest.ts` | Webhook entry: persist + dedup |
| `apps/api/src/matching.ts` | Reference → payment request |
| `apps/api/src/audit.ts` | Append-only audit (subscriber) |
| `apps/api/src/notifications.ts` | Lawyer notifications (subscriber) |
| `apps/api/src/routes.ts` / `server.ts` | Express routes + wiring |

Web panels live in `apps/web/src/` (`BankPanel`, `SollaPayPanel`, `LawyerPanel`),
polling the API every ~1s via `usePolling`.

## Tests

```bash
npm test
```

Covers the three scenarios end to end (matched / unmatched / duplicate) at the
service level — `apps/api/test/flow.test.ts`.

## Discussion (not implemented — design notes)

**Scenario 4 — part of the system (audit/notifier) is down mid-processing.**
The webhook is safely retryable *because* it's idempotent, so the bank can resend
without creating duplicates. To make side-effects durable I'd use the **outbox
pattern**: within the same write that persists the event, record the intent to audit/
notify, then deliver those asynchronously with retries. Processing is recorded before
side-effects, so a crash can resume from the persisted state rather than losing data.

**Scale — tens/hundreds of thousands of events/day.**
- Replace the sync in-process bus with a real broker/queue (SQS, Kafka).
- Move the store to a real database; put a **unique constraint on `transactionId`**
  (idempotency enforced by the DB) and an index on `reference` (fast matching).
- Make processing workers stateless, horizontally scalable, and idempotent.
- Decouple notifications behind the queue so a slow channel can't back-pressure ingest.
- Switch the UI from polling to **SSE / WebSocket** push (already noted in `usePolling.ts`).

## What's intentionally left out (MVP boundaries)

Real bank rail, auth/RBAC, a database, partial-amount/overpayment handling, and
fuzzy/fallback matching are all out of scope. The goal here is a clean, legible
implementation of the central flow — not a complete product.
