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
| **Bank** (left) | Compose & send a bank webhook. Buttons fire transfers and the duplicate case. |
| **SollaPay** (center) | One line **per reference**, rolling up every deal and every transfer that share it. Status is derived from the totals; click a line to expand its deals, transfers, ignored duplicates, and audit trail. |
| **Lawyer** (right) | Create a Deal + Payment Request (the reference the bank must quote) and watch the notification feed. |

## Matching rule — aggregation by reference

Everything is grouped by **reference**. A reference's status comes from comparing the
**total transferred** against the **total requested** (summed across all of its deals
and all of its transfers):

- **Matched** — totals are equal (e.g. a 70,000 deal funded by 40,000 + 30,000).
- **Short** — transferred < requested → *Missing X*.
- **Overpaid** — transferred > requested → *Over by X*.
- **Unexpected** — transfers arrived but no deal exists for the reference.
- **Duplicates** (same `transactionId`) are shown in the breakdown but never counted.
- **References match case-insensitively** (`ABC123` == `abc123`); the raw bank payload keeps its original casing.

Because status is *derived from sums*, order of arrival never matters — a transfer that
arrives before its deal, split payments, and corrections all just work.

## Demo script

1. **Short.** Lawyer panel → create a deal (ref `ABC123`, amount `70000`). The center
   shows reference `ABC123` as **Missing 70,000**.
2. **Split → Matched.** Bank panel → send `40000`, then `30000` (same ref). The line
   goes Short → **Matched**; a notification appears in the Lawyer feed. Expand to see
   both transfers under the one reference.
3. **Overpaid.** New deal `XYZ`/`70000`, then a `100000` transfer → **Over by 30,000**.
4. **Unexpected.** Send a transfer with a reference that has no deal → **Unexpected funds**.
5. **Duplicate.** *Resend last transfer* → the breakdown shows "1 duplicate ignored" and
   the total is unchanged (idempotency on `transactionId`).

## Architecture

```
Bank panel ──POST /api/bank/webhook──► Ingest ──(dedup by transactionId)──► EventBus
                                          │                                   │
                            persist (the 200 OK              ┌────────────────┼────────────────┐
                             acknowledges this)              ▼                ▼                ▼
                                                       evaluateReference     Audit       Notifications
                                                     (re-derive totals)  (append-only)    (lawyer feed)
```

- **Reference is the unit.** `references.ts` derives each reference's status purely from
  the summed totals of its deals and transfers (`buildReferenceGroup`), so there is no
  per-event state machine to get out of sync.
- **Synchronous in-process event bus.** Business logic publishes events; Audit and
  Notifications *react* to them — they are never called directly.
- **Persist-before-acknowledge.** The webhook returns `200 OK` only after the event is
  durably stored, so the bank never considers a transfer delivered while it could be lost.
- **Idempotency.** `transactionId` is the dedup key; a repeat is recorded as a duplicate
  and excluded from the totals.

### Where things live (API)

| File | Responsibility |
|------|----------------|
| `apps/api/src/types.ts` | Domain types (Deal, PaymentRequest, BankEvent, ReferenceGroup, AuditEntry, Notification) |
| `apps/api/src/store.ts` | In-memory collections |
| `apps/api/src/references.ts` | Reference aggregation — build a group, derive status, fire fully-funded |
| `apps/api/src/eventBus.ts` | Tiny sync pub/sub |
| `apps/api/src/ingest.ts` | Webhook entry: persist + dedup, then re-evaluate the reference |
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
