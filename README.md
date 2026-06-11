# SollaPay2 — Bank Event Ingest

A small, self-contained demo of SollaPay's core money-in flow: a bank reports that
funds arrived; the system **persists** the event, **associates** it to the right deal by
reference, **updates** the deal's funding status, writes an **audit trail**, and
**notifies** the lawyer — all visible live across a 3-panel UI.

In-memory only. No database, no external services. One command to run.

## Run

```bash
npm install
npm run dev      # API → :4000, Web → :5173 (open this)
```

Ports are auto-selected if taken. Run the test suite with `npm test`.

## The app

Three side-by-side panels, plus a **Design Q&A** tab that answers the exercise's
discussion questions (domain model, API & data model, reliability, scale, the scenarios).

| Panel                 | Role                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bank**              | Compose & send a bank webhook — every field editable, including `transactionId`.                                                                           |
| **SollaPay** (center) | One line **per reference**, rolling up every deal and transfer that share it. Expand a line for its deals, transfers, ignored duplicates, and audit trail. |
| **Lawyer**            | Create a Deal + Payment Request, and watch the notification feed.                                                                                          |

## How matching works — aggregation by reference

Everything is grouped by **reference**; status is derived from comparing the **total
transferred** to the **total requested** (summed across all of a reference's deals and
transfers):

- **Matched** — totals equal (a 70,000 deal funded by 40,000 + 30,000 matches).
- **Short** — missing X.
- **Overpaid** — over by X.
- **Unexpected** — transfers with no deal for the reference.

Duplicates (same `transactionId`) are shown but never counted; references match
case-insensitively. Because status is _derived from sums_, order of arrival never
matters — transfer-before-deal, split payments, and corrections all just work.

## Architecture

```
Bank ──POST /api/bank/webhook──► Ingest ──(dedup by transactionId)──► EventBus
                                   │                                      │
                       persist, then return 200      ┌───────────────────┼───────────────────┐
                                                      ▼                   ▼                   ▼
                                               evaluateReference        Audit          Notifications
                                               (re-derive totals)    (append-only)     (lawyer feed)
```

- **Reference is the unit.** `references.ts` derives status purely from summed totals —
  there is no per-event state machine to get out of sync.
- **Event bus.** Audit and Notifications _react_ to events; business logic never calls
  them directly.
- **Persist-before-acknowledge.** The webhook returns `200` only after the event is
  durably stored, so the bank never treats a transfer as delivered while it could be lost.
- **Idempotency.** `transactionId` is the dedup key; repeats are excluded from totals.

| File                                        | Responsibility                         |
| ------------------------------------------- | -------------------------------------- |
| `apps/api/src/types.ts`                     | Domain types                           |
| `apps/api/src/store.ts`                     | In-memory collections                  |
| `apps/api/src/ingest.ts`                    | Webhook entry: persist + dedup         |
| `apps/api/src/references.ts`                | Reference aggregation + derived status |
| `apps/api/src/audit.ts`, `notifications.ts` | Event subscribers                      |
| `apps/api/src/routes.ts`, `server.ts`       | Express routes + wiring                |
| `apps/web/src/*Panel.tsx`, `QandA.tsx`      | UI panels + Q&A tab (poll the API ~1s) |

Tests: `apps/api/test/flow.test.ts` covers matched, short, overpaid, unexpected,
split-funding, multi-deal, duplicate, and case-insensitive references.

## Design notes (discussion, not built — full answers in the Q&A tab)

- **Scenario 4 (a recording component is down):** the webhook is safely retryable
  because it's idempotent; durable side-effects via the **outbox pattern** (persist the
  intent in the same write, deliver async with retries).
- **Scale:** a real broker (SQS/Kafka), a DB with `UNIQUE(transaction_id)` +
  `INDEX(reference)`, stateless idempotent workers, and push (SSE/WebSocket) instead of
  polling.

## MVP boundaries

Out of scope: real bank rail, auth/RBAC, a real database, multi-currency, and the wider
escrow (payouts/releases). The goal is a clean, legible implementation of the central
money-in flow — the Design Q&A tab covers how each piece would be built for production.
