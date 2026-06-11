# Code Guide — how SollaPay2 is wired

A map of the codebase: where each thing lives, how the two processes talk over HTTP, and
how a request flows end to end. Read top to bottom once and the rest is easy to navigate.

## Mental model in one paragraph

It's a tiny monorepo with two processes: an **Express API** (`apps/api`) and a **React +
Vite web app** (`apps/web`). `npm run dev` starts both. The browser talks to the API over
plain HTTP (`fetch`), the API keeps everything in **in-memory maps**, and the core idea is
that a reference's status is **derived by summing** its deals and transfers — there's no
per-event state machine. Side-effects (audit, notifications) happen by **publishing events
on an in-process bus** that other modules subscribe to.

## Repo layout

```
package.json            # root: "dev" script + npm workspaces (apps/*)
scripts/dev.mjs         # dev orchestrator: pick free ports, start both apps
apps/
  api/                  # Express + TypeScript (tsx hot-reload)
    src/
      types.ts          # all domain types
      store.ts          # in-memory collections + helpers (newId, now, fmt, normalizeRef)
      eventBus.ts       # tiny synchronous pub/sub
      ingest.ts         # webhook entry: persist + dedup
      references.ts     # aggregation: build a reference group, derive status
      audit.ts          # subscriber: append-only audit log
      notifications.ts  # subscriber: lawyer notifications
      routes.ts         # Express routes + createDeal/createPaymentRequest
      server.ts         # builds the Express app, wires subscribers, listens
    test/flow.test.ts   # service-level tests (vitest)
  web/                  # React + Vite + Tailwind
    vite.config.ts      # dev server port + the /api proxy
    src/
      main.tsx          # React entry
      App.tsx           # header + tab switch (Console / Design Q&A)
      api.ts            # typed fetch helpers (the only place that calls the API)
      usePolling.ts     # hook: re-fetch every ~1s
      useStatusFlash.ts # hook: flash a row when its status changes
      ui.tsx            # shared bits: StatusBadge, Field, Button, Card, RefChip
      BankPanel.tsx     # send a webhook
      SollaPayPanel.tsx # the reference list (center)
      LawyerPanel.tsx   # create deal/request + notifications
      QandA.tsx         # static design write-up
```

## How the processes connect (HTTP)

```
npm run dev
   └─ scripts/dev.mjs                 finds free ports, then starts both with
        ├─ apps/api  (tsx)            API_PORT/WEB_PORT in the environment
        └─ apps/web  (vite)

Browser (http://localhost:5173)
   │  fetch("/api/...")               ← relative URL, see apps/web/src/api.ts
   ▼
Vite dev server (:5173)              apps/web/vite.config.ts
   │  proxy: "/api" → http://localhost:4000
   ▼
Express API (:4000)                  apps/api/src/server.ts
   app.use("/api", router)           apps/api/src/routes.ts
```

Key points to be able to explain:

- **Ports are dynamic.** `scripts/dev.mjs` scans from 4000 (API) and 5173 (web), bumping
  until free, and passes the chosen ports to both via env. `server.ts` reads
  `process.env.API_PORT`; `vite.config.ts` reads `WEB_PORT` and points its proxy at the
  API port.
- **The browser never calls `:4000` directly.** It calls relative `/api/...`; the Vite
  dev server proxies those to the API. That's why `api.ts` uses paths like `/api/references`
  with no host — one origin, no CORS issues in dev. (The API also enables `cors()` as a
  belt-and-braces.)
- **The web app's only contact with the API is `apps/web/src/api.ts`.** Every component
  goes through the `api` object; no `fetch` is scattered in components.

## The API, file by file

`server.ts` is the composition root:

```ts
registerAudit();            // subscribe audit to the event bus
registerNotifications();    // subscribe notifications to the event bus
app.use(cors());
app.use(express.json());    // parse JSON bodies
app.use("/api", router);    // mount all routes under /api
app.listen(process.env.API_PORT || 4000);
```

`routes.ts` defines the HTTP surface and two plain functions the tests also call directly:

| Route | What it does |
|-------|--------------|
| `POST /api/bank/webhook` | `ingestBankEvent(req.body)` → `200 { duplicate, group }` |
| `POST /api/deals` | `createDeal(...)` |
| `POST /api/payment-requests` | `createPaymentRequest(...)` |
| `GET /api/references` | `allReferenceGroups()` + each group's audit entries |
| `GET /api/notifications`, `GET /api/audit` | the feeds |

`store.ts` is the database stand-in — plain `Map`s and arrays:

```ts
deals, paymentRequests,                 // by id
bankEventsByTransactionId,              // the dedup index (counted transfers)
duplicateEvents, matchedReferences,     // duplicates + "already notified" set
auditEntries, notifications             // append-only logs
```

Plus helpers: `newId(prefix)`, `now()`, `fmt(n)`, and `normalizeRef(r)` (trim + uppercase
— this is what makes references case-insensitive).

`eventBus.ts` is a five-line pub/sub: `on(event, handler)` and `emit(event, payload)`,
synchronous, in-process. This is the seam that decouples business logic from side-effects.

`ingest.ts` — the webhook brain:

```ts
if (bankEventsByTransactionId.has(transactionId)) {   // seen before → duplicate
  duplicateEvents.push(event); emit("transfer.duplicate"); return { duplicate: true, ... }
}
bankEventsByTransactionId.set(transactionId, event);  // durable write (gates the 200)
emit("transfer.received", event);
return { duplicate: false, group: evaluateReference(event.reference) };
```

`references.ts` — the aggregation, the heart of the system:

- `buildReferenceGroup(ref)` filters all requests + transfers whose normalized reference
  matches, sums them, and derives the status (`Matched / Short / Overpaid / Unexpected`).
- `evaluateReference(ref)` rebuilds the group and, the first time it becomes fully funded,
  emits `reference.matched` (which drives the notification).
- `allReferenceGroups()` returns one group per distinct reference (for `GET /references`).

`audit.ts` / `notifications.ts` — subscribers. They call `eventBus.on(...)` in their
`register*()` function (invoked once in `server.ts`) and react to events. Business logic
never calls them directly — it just emits.

## The web app, file by file

- `api.ts` — `get`/`post` wrappers over `fetch` plus the `api` object (`getReferences`,
  `createDeal`, `sendWebhook`, …). The single source of API calls.
- `usePolling(fetcher, ms=1000)` — runs the fetcher on mount and every second; returns the
  latest data. This is how the panels stay live (the production note would be SSE/WebSocket).
- `App.tsx` — the header, the **Console / Design Q&A** tab switch, and the 3-panel layout.
- `BankPanel.tsx` — a form; on send calls `api.sendWebhook(...)`.
- `LawyerPanel.tsx` — `api.createDeal` then `api.createPaymentRequest`; polls
  `getPaymentRequests` and `getNotifications`.
- `SollaPayPanel.tsx` — polls `getReferences`, renders one expandable row per reference,
  uses `useStatusFlash` to flash a row when its status changes.
- `ui.tsx` — presentational helpers shared by the panels.

## End-to-end trace #1 — a bank transfer arrives

```
BankPanel  →  api.sendWebhook(payload)
           →  POST /api/bank/webhook         (Vite proxy → Express)
           →  routes.ts                        ingestBankEvent(body)
           →  ingest.ts                         store event, emit "transfer.received"
           →  references.evaluateReference      re-sum totals; if fully funded emit "reference.matched"
                                                 ├─ audit.ts        appends entries (subscribed)
                                                 └─ notifications.ts pushes a notification (subscribed)
           ←  200 { duplicate, group }
SollaPayPanel (polling GET /api/references)  →  shows the updated status a moment later
LawyerPanel  (polling GET /api/notifications) →  shows the new notification
```

## End-to-end trace #2 — the lawyer creates a deal

```
LawyerPanel  →  api.createDeal()              POST /api/deals          → routes.createDeal
             →  api.createPaymentRequest()    POST /api/payment-requests → routes.createPaymentRequest
                                              emit "request.created"; evaluateReference(reference)
                                              (if a transfer already arrived for that reference,
                                               the totals now match → "reference.matched" → notify)
SollaPayPanel (polling)  →  the reference line appears / updates
```

## Design decisions you can speak to

- **Persist-before-acknowledge.** `ingest.ts` stores the event before the route returns
  `200`, so the bank never thinks a transfer landed while it could be lost.
- **Idempotency by `transactionId`.** The `bankEventsByTransactionId` map (a `UNIQUE`
  column in production) makes the webhook safe to retry; duplicates are logged, not counted.
- **Status is derived, not stored.** `references.ts` re-sums on demand, so order of arrival,
  split payments, and corrections all "just work" — no half-updated state to repair.
- **Event bus decoupling.** Audit and notifications subscribe to events; the core flow
  doesn't know they exist, which keeps each piece small and independently testable.
- **Case-insensitive references.** `normalizeRef` (trim + uppercase) is the grouping key;
  the raw payload keeps its original casing.

## "Where is …?" quick index

- The bank contract / webhook handler → `apps/api/src/routes.ts` (`POST /bank/webhook`) →
  `apps/api/src/ingest.ts`.
- How status is computed → `apps/api/src/references.ts` (`buildReferenceGroup`).
- The data "tables" → `apps/api/src/store.ts`.
- Dedup / idempotency → `apps/api/src/ingest.ts` (the `has(transactionId)` check).
- Audit / notifications → `apps/api/src/audit.ts`, `notifications.ts` (subscribers).
- Every API call from the UI → `apps/web/src/api.ts`.
- Live updates → `apps/web/src/usePolling.ts`.
- The HTTP proxy (browser → API) → `apps/web/vite.config.ts`.
- Port selection → `scripts/dev.mjs`.
```
