# SollaPay Bank-Event Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, demo-able TypeScript app where a bank webhook is ingested, matched to a lawyer's payment request, audited, and surfaced as a notification — shown live across a 3-panel UI.

**Architecture:** Express + TS API with an in-memory store and a synchronous in-process event bus. Business logic publishes events; matching, audit, and notifications react to them. React + Vite + Tailwind frontend with three panels (Bank / SollaPay / Lawyer) that poll the API ~1s.

**Tech Stack:** Node, Express, TypeScript, tsx, Vitest (api). React 18, Vite, TypeScript, Tailwind (web). `concurrently` at root for one `npm run dev`.

**Code-clarity rule (from spec):** small single-purpose files, descriptive names, the flow `webhook → match → audit → notify` traceable by file names. No clever abstractions.

---

## File Structure

```
SollaPay2/
  package.json                      # root: concurrently dev script, workspaces
  apps/
    api/
      package.json
      tsconfig.json
      vitest.config.ts
      src/
        types.ts                    # all shared domain types
        store.ts                    # in-memory collections + accessors
        eventBus.ts                 # tiny sync pub/sub
        ingest.ts                   # webhook entry: persist + dedup, then publish
        matching.ts                 # reference -> PaymentRequest, sets status
        audit.ts                    # subscribes, appends AuditEntry
        notifications.ts            # subscribes, pushes lawyer Notification
        routes.ts                   # express routes (deals, payment-requests, webhook, reads)
        server.ts                   # wires subscribers + starts express
      test/
        flow.test.ts                # matched / unmatched / duplicate
    web/
      package.json
      tsconfig.json
      vite.config.ts
      index.html
      tailwind.config.js
      postcss.config.js
      src/
        main.tsx
        index.css
        api.ts                      # typed fetch helpers
        usePolling.ts               # generic 1s polling hook (SSE note in comment)
        App.tsx                     # 3-column layout
        BankPanel.tsx               # compose & send webhook; matched/unmatched/dup buttons
        SollaPayPanel.tsx           # transaction list, expandable detail + audit
        LawyerPanel.tsx             # create deal+payment request; notification feed
```

---

## Task 0: Repo init + root scripts

**Files:**
- Create: `package.json`, `.gitignore`

- [ ] **Step 1: Initialize git**

Run: `cd /f/Development/SollaPay2 && git init`
Expected: "Initialized empty Git repository"

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "sollapay2",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "concurrently --names \"api,web\" --prefix-colors \"cyan,magenta\" \"npm run dev --workspace=apps/api\" \"npm run dev --workspace=apps/web\"",
    "test": "npm run test --workspace=apps/api"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "chore: repo scaffold and root dev script"
```

---

## Task 1: API package scaffold

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@sollapay2/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

- [ ] **Step 4: Install deps**

Run: `cd /f/Development/SollaPay2 && npm install`
Expected: installs without errors.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "chore: api package scaffold"
```

---

## Task 2: Domain types

**Files:**
- Create: `apps/api/src/types.ts`

- [ ] **Step 1: Write `apps/api/src/types.ts`**

```ts
// All shared domain types live here so the model is readable in one place.

export type TransactionStatus = "Matched" | "Unmatched" | "Duplicate";

export interface Deal {
  id: string;
  name: string;          // e.g. "Apartment 4B, Tel Aviv project"
  buyerName: string;
  createdAt: string;
}

export interface PaymentRequest {
  id: string;
  dealId: string;
  reference: string;     // unique code the bank must quote
  expectedAmount: number;
  currency: string;
  createdAt: string;
}

// Raw payload exactly as the bank sends it.
export interface BankEvent {
  transactionId: string; // idempotency key
  amount: number;
  currency: string;
  reference: string;
  senderName: string;
  occurredAt: string;
}

export interface Transaction {
  id: string;
  bankEvent: BankEvent;
  status: TransactionStatus;
  paymentRequestId: string | null;
  dealId: string | null;
  matchNote: string;     // human-readable matching decision
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;        // e.g. "bank.event.received"
  detail: string;
  transactionId: string | null;
}

export interface Notification {
  id: string;
  at: string;
  dealId: string;
  message: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/types.ts && git commit -m "feat: domain types"
```

---

## Task 3: In-memory store

**Files:**
- Create: `apps/api/src/store.ts`

- [ ] **Step 1: Write `apps/api/src/store.ts`**

```ts
import type {
  Deal, PaymentRequest, BankEvent, Transaction, AuditEntry, Notification,
} from "./types.js";

// Single in-memory store. No DB — collections reset on restart.
export const store = {
  deals: new Map<string, Deal>(),
  paymentRequestsByReference: new Map<string, PaymentRequest>(),
  bankEventsByTransactionId: new Map<string, BankEvent>(), // dedup index
  transactions: new Map<string, Transaction>(),
  auditEntries: [] as AuditEntry[],
  notifications: [] as Notification[],
};

let counter = 0;
export const newId = (prefix: string): string => `${prefix}_${++counter}`;
export const now = (): string => new Date().toISOString();
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/store.ts && git commit -m "feat: in-memory store"
```

---

## Task 4: Event bus

**Files:**
- Create: `apps/api/src/eventBus.ts`

- [ ] **Step 1: Write `apps/api/src/eventBus.ts`**

```ts
// Tiny synchronous pub/sub. Handlers run in registration order, in-process.
// All side-effects (audit, notifications) react to events instead of being
// called directly by business logic.
type Handler = (payload: unknown) => void;

const handlers = new Map<string, Handler[]>();

export const eventBus = {
  on(event: string, handler: Handler): void {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  },
  emit(event: string, payload: unknown): void {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/eventBus.ts && git commit -m "feat: sync event bus"
```

---

## Task 5: Matching (core decision) — TDD

**Files:**
- Create: `apps/api/src/matching.ts`
- Test: `apps/api/test/flow.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/test/flow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../src/store.js";
import { createDeal, createPaymentRequest } from "../src/routes.js";
import { ingestBankEvent } from "../src/ingest.js";
import type { BankEvent } from "../src/types.js";

function resetStore() {
  store.deals.clear();
  store.paymentRequestsByReference.clear();
  store.bankEventsByTransactionId.clear();
  store.transactions.clear();
  store.auditEntries.length = 0;
  store.notifications.length = 0;
}

function seedPaymentRequest(reference: string) {
  const deal = createDeal({ name: "Apt 4B", buyerName: "John Doe" });
  return createPaymentRequest({
    dealId: deal.id, reference, expectedAmount: 70000, currency: "ILS",
  });
}

const event = (over: Partial<BankEvent> = {}): BankEvent => ({
  transactionId: "tx_123", amount: 70000, currency: "ILS",
  reference: "ABC123", senderName: "John Doe",
  occurredAt: "2026-06-03T10:00:00Z", ...over,
});

describe("bank event ingest flow", () => {
  beforeEach(resetStore);

  it("scenario 1: matches an event to a payment request", () => {
    seedPaymentRequest("ABC123");
    const tx = ingestBankEvent(event());
    expect(tx.status).toBe("Matched");
    expect(tx.dealId).not.toBeNull();
    expect(store.notifications).toHaveLength(1);
  });

  it("scenario 2: marks event with no matching reference as Unmatched", () => {
    const tx = ingestBankEvent(event({ reference: "NOPE" }));
    expect(tx.status).toBe("Unmatched");
    expect(tx.dealId).toBeNull();
    expect(store.notifications).toHaveLength(0);
  });

  it("scenario 3: a repeated transactionId is recorded as Duplicate", () => {
    seedPaymentRequest("ABC123");
    ingestBankEvent(event());
    const second = ingestBankEvent(event());
    expect(second.status).toBe("Duplicate");
    expect(store.transactions.size).toBe(2); // original + duplicate record
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/api`
Expected: FAIL — modules `routes`, `ingest`, `matching` not yet implemented.

- [ ] **Step 3: Write `apps/api/src/matching.ts`**

```ts
import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { BankEvent, Transaction } from "./types.js";

// Match by exact reference. Found -> Matched; not found -> Unmatched.
export function matchBankEvent(bankEvent: BankEvent): Transaction {
  const pr = store.paymentRequestsByReference.get(bankEvent.reference);

  const base = {
    id: newId("txn"),
    bankEvent,
    createdAt: now(),
  };

  const tx: Transaction = pr
    ? { ...base, status: "Matched", paymentRequestId: pr.id, dealId: pr.dealId,
        matchNote: `Matched reference ${bankEvent.reference} to payment request ${pr.id}` }
    : { ...base, status: "Unmatched", paymentRequestId: null, dealId: null,
        matchNote: `No matching payment request for reference ${bankEvent.reference}` };

  store.transactions.set(tx.id, tx);
  eventBus.emit(tx.status === "Matched" ? "transaction.matched" : "transaction.unmatched", tx);
  return tx;
}
```

- [ ] **Step 4: (Tests still red until Task 6–7 — proceed.)**

Run: `npm run test --workspace=apps/api`
Expected: still FAIL (ingest/routes missing). That's expected; continue.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/matching.ts apps/api/test/flow.test.ts && git commit -m "feat: reference matching + flow tests"
```

---

## Task 6: Ingest (persist + dedup)

**Files:**
- Create: `apps/api/src/ingest.ts`

- [ ] **Step 1: Write `apps/api/src/ingest.ts`**

```ts
import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import { matchBankEvent } from "./matching.js";
import type { BankEvent, Transaction } from "./types.js";

// Webhook entry point. Persist first (this is what the 200 OK acknowledges),
// dedup by transactionId, then run matching.
export function ingestBankEvent(bankEvent: BankEvent): Transaction {
  const seen = store.bankEventsByTransactionId.has(bankEvent.transactionId);

  if (seen) {
    const dup: Transaction = {
      id: newId("txn"), bankEvent, status: "Duplicate",
      paymentRequestId: null, dealId: null,
      matchNote: `Duplicate transactionId ${bankEvent.transactionId} — ignored`,
      createdAt: now(),
    };
    store.transactions.set(dup.id, dup);
    eventBus.emit("transaction.duplicate", dup);
    return dup;
  }

  store.bankEventsByTransactionId.set(bankEvent.transactionId, bankEvent); // durable write
  eventBus.emit("bank.event.received", bankEvent);
  return matchBankEvent(bankEvent);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/ingest.ts && git commit -m "feat: ingest with idempotent dedup"
```

---

## Task 7: Audit + Notifications subscribers

**Files:**
- Create: `apps/api/src/audit.ts`, `apps/api/src/notifications.ts`

- [ ] **Step 1: Write `apps/api/src/audit.ts`**

```ts
import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { BankEvent, Transaction } from "./types.js";

function record(action: string, detail: string, transactionId: string | null) {
  store.auditEntries.push({ id: newId("aud"), at: now(), action, detail, transactionId });
}

// Append-only audit. Subscribes to every meaningful event.
export function registerAudit(): void {
  eventBus.on("bank.event.received", (p) => {
    const e = p as BankEvent;
    record("bank.event.received", `Received ${e.amount} ${e.currency} ref ${e.reference}`, null);
  });
  for (const evt of ["transaction.matched", "transaction.unmatched", "transaction.duplicate"]) {
    eventBus.on(evt, (p) => {
      const t = p as Transaction;
      record(evt, t.matchNote, t.id);
    });
  }
}
```

- [ ] **Step 2: Write `apps/api/src/notifications.ts`**

```ts
import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { Transaction } from "./types.js";

// Notify the lawyer only when funds are matched to their deal.
export function registerNotifications(): void {
  eventBus.on("transaction.matched", (p) => {
    const t = p as Transaction;
    store.notifications.push({
      id: newId("ntf"), at: now(), dealId: t.dealId!,
      message: `${t.bankEvent.amount} ${t.bankEvent.currency} received from ${t.bankEvent.senderName}`,
    });
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/audit.ts apps/api/src/notifications.ts && git commit -m "feat: audit and notification subscribers"
```

---

## Task 8: Routes + server (makes tests pass)

**Files:**
- Create: `apps/api/src/routes.ts`, `apps/api/src/server.ts`

- [ ] **Step 1: Write `apps/api/src/routes.ts`**

```ts
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
```

- [ ] **Step 2: Write `apps/api/src/server.ts`**

```ts
import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { registerAudit } from "./audit.js";
import { registerNotifications } from "./notifications.js";

registerAudit();
registerNotifications();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

const PORT = 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
```

- [ ] **Step 3: Register subscribers for tests**

The flow test imports `routes`/`ingest` but not `server`, so subscribers aren't wired.
Add a top-of-file hook in `test/flow.test.ts` after imports:

```ts
import { registerAudit } from "../src/audit.js";
import { registerNotifications } from "../src/notifications.js";
registerAudit();
registerNotifications();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/api`
Expected: PASS — all 3 scenarios green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes.ts apps/api/src/server.ts apps/api/test/flow.test.ts && git commit -m "feat: express routes + server wiring; flow tests pass"
```

---

## Task 9: Web scaffold (Vite + Tailwind)

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/main.tsx`, `src/index.css`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@sollapay2/web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create config files**

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
});
```

`apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "bundler", "jsx": "react-jsx",
    "strict": true, "skipLibCheck": true, "esModuleInterop": true
  },
  "include": ["src"]
}
```

`apps/web/tailwind.config.js`:
```js
export default { content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] };
```

`apps/web/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>SollaPay — Bank Ingest Demo</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`apps/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/src/main.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 3: Install + commit**

Run: `cd /f/Development/SollaPay2 && npm install`
```bash
git add . && git commit -m "chore: web scaffold (vite + tailwind)"
```

---

## Task 10: API client + polling hook

**Files:**
- Create: `apps/web/src/api.ts`, `apps/web/src/usePolling.ts`

- [ ] **Step 1: Write `apps/web/src/api.ts`**

```ts
// Typed fetch helpers. Mirrors the API's domain types.
export interface Transaction {
  id: string; status: "Matched" | "Unmatched" | "Duplicate";
  matchNote: string; dealId: string | null; createdAt: string;
  bankEvent: { transactionId: string; amount: number; currency: string;
    reference: string; senderName: string; occurredAt: string };
  audit: { id: string; at: string; action: string; detail: string }[];
}
export interface Deal { id: string; name: string; buyerName: string }
export interface PaymentRequest { id: string; dealId: string; reference: string; expectedAmount: number; currency: string }
export interface Notification { id: string; at: string; dealId: string; message: string }

const get = <T>(path: string): Promise<T> => fetch(`/api${path}`).then((r) => r.json());
const post = <T>(path: string, body: unknown): Promise<T> =>
  fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

export const api = {
  getTransactions: () => get<Transaction[]>("/transactions"),
  getDeals: () => get<Deal[]>("/deals"),
  getPaymentRequests: () => get<PaymentRequest[]>("/payment-requests"),
  getNotifications: () => get<Notification[]>("/notifications"),
  createDeal: (b: { name: string; buyerName: string }) => post<Deal>("/deals", b),
  createPaymentRequest: (b: { dealId: string; reference: string; expectedAmount: number; currency: string }) =>
    post<PaymentRequest>("/payment-requests", b),
  sendWebhook: (b: Transaction["bankEvent"]) => post<Transaction>("/bank/webhook", b),
};
```

- [ ] **Step 2: Write `apps/web/src/usePolling.ts`**

```tsx
import { useEffect, useState } from "react";

// Poll an async fetcher every `ms`. Simple and good enough for a demo.
// NOTE: a nicer approach is Server-Sent Events (SSE): the API exposes a
// GET /api/stream EventSource and pushes on every bus event, removing the
// 1s lag. Left as polling here to keep the moving parts minimal.
export function usePolling<T>(fetcher: () => Promise<T>, ms = 1000): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let active = true;
    const tick = () => fetcher().then((d) => active && setData(d));
    tick();
    const id = setInterval(tick, ms);
    return () => { active = false; clearInterval(id); };
  }, []);
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/usePolling.ts && git commit -m "feat: web api client + polling hook"
```

---

## Task 11: Lawyer panel

**Files:**
- Create: `apps/web/src/LawyerPanel.tsx`

- [ ] **Step 1: Write `apps/web/src/LawyerPanel.tsx`**

```tsx
import React, { useState } from "react";
import { api } from "./api.js";
import { usePolling } from "./usePolling.js";

export function LawyerPanel() {
  const deals = usePolling(api.getDeals) ?? [];
  const requests = usePolling(api.getPaymentRequests) ?? [];
  const notifications = usePolling(api.getNotifications) ?? [];

  const [name, setName] = useState("Apartment 4B");
  const [buyerName, setBuyerName] = useState("John Doe");
  const [reference, setReference] = useState("ABC123");
  const [amount, setAmount] = useState(70000);

  async function createRequest() {
    const deal = await api.createDeal({ name, buyerName });
    await api.createPaymentRequest({ dealId: deal.id, reference, expectedAmount: amount, currency: "ILS" });
  }

  return (
    <section className="flex-1 p-4 bg-emerald-50 overflow-auto">
      <h2 className="font-bold text-emerald-800 mb-2">Lawyer</h2>

      <div className="space-y-2 bg-white p-3 rounded shadow-sm">
        <input className="border p-1 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deal name" />
        <input className="border p-1 w-full" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Buyer" />
        <input className="border p-1 w-full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" />
        <input className="border p-1 w-full" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} placeholder="Amount" />
        <button className="bg-emerald-600 text-white px-3 py-1 rounded w-full" onClick={createRequest}>
          Create deal + payment request
        </button>
      </div>

      <h3 className="font-semibold mt-4">Payment requests ({requests.length})</h3>
      <ul className="text-sm">
        {requests.map((r) => <li key={r.id}>ref <b>{r.reference}</b> · {r.expectedAmount} {r.currency}</li>)}
      </ul>

      <h3 className="font-semibold mt-4">Notifications ({notifications.length})</h3>
      <ul className="text-sm space-y-1">
        {notifications.map((n) => (
          <li key={n.id} className="bg-emerald-100 p-2 rounded">💰 {n.message}</li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-2">Deals: {deals.length}</p>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/LawyerPanel.tsx && git commit -m "feat: lawyer panel"
```

---

## Task 12: Bank panel

**Files:**
- Create: `apps/web/src/BankPanel.tsx`

- [ ] **Step 1: Write `apps/web/src/BankPanel.tsx`**

```tsx
import React, { useState } from "react";
import { api } from "./api.js";

let txCounter = 100;
const nextTxId = () => `tx_${++txCounter}`;

export function BankPanel() {
  const [reference, setReference] = useState("ABC123");
  const [amount, setAmount] = useState(70000);
  const [senderName, setSenderName] = useState("John Doe");
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  function payload(transactionId: string, ref: string) {
    return { transactionId, amount, currency: "ILS", reference: ref,
      senderName, occurredAt: new Date().toISOString() };
  }

  async function sendMatched() {
    const id = nextTxId(); setLastTxId(id);
    await api.sendWebhook(payload(id, reference));
  }
  async function sendUnmatched() {
    const id = nextTxId(); setLastTxId(id);
    await api.sendWebhook(payload(id, "NO-MATCH-999"));
  }
  async function sendDuplicate() {
    if (!lastTxId) return; // resend the previous id
    await api.sendWebhook(payload(lastTxId, reference));
  }

  return (
    <section className="flex-1 p-4 bg-sky-50 overflow-auto">
      <h2 className="font-bold text-sky-800 mb-2">Bank</h2>

      <div className="space-y-2 bg-white p-3 rounded shadow-sm">
        <input className="border p-1 w-full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" />
        <input className="border p-1 w-full" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} placeholder="Amount" />
        <input className="border p-1 w-full" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender" />
        <button className="bg-sky-600 text-white px-3 py-1 rounded w-full" onClick={sendMatched}>Send transfer (this reference)</button>
        <button className="bg-amber-600 text-white px-3 py-1 rounded w-full" onClick={sendUnmatched}>Send with wrong reference</button>
        <button className="bg-rose-600 text-white px-3 py-1 rounded w-full disabled:opacity-40" disabled={!lastTxId} onClick={sendDuplicate}>
          Resend last transfer (duplicate)
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">Last transactionId: {lastTxId ?? "—"}</p>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/BankPanel.tsx && git commit -m "feat: bank panel with matched/unmatched/duplicate actions"
```

---

## Task 13: SollaPay central panel (expandable detail + audit)

**Files:**
- Create: `apps/web/src/SollaPayPanel.tsx`

- [ ] **Step 1: Write `apps/web/src/SollaPayPanel.tsx`**

```tsx
import React, { useState } from "react";
import { api, type Transaction } from "./api.js";
import { usePolling } from "./usePolling.js";

const statusColor: Record<Transaction["status"], string> = {
  Matched: "bg-emerald-100 text-emerald-800",
  Unmatched: "bg-amber-100 text-amber-800",
  Duplicate: "bg-rose-100 text-rose-800",
};

function Row({ tx }: { tx: Transaction }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="bg-white rounded shadow-sm">
      <button className="w-full text-left p-2 flex justify-between items-center" onClick={() => setOpen(!open)}>
        <span>{tx.bankEvent.amount} {tx.bankEvent.currency} · ref {tx.bankEvent.reference}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColor[tx.status]}`}>{tx.status}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs space-y-2">
          <p className="italic text-gray-600">{tx.matchNote}</p>
          <div>
            <p className="font-semibold">Raw bank payload</p>
            <pre className="bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(tx.bankEvent, null, 2)}</pre>
          </div>
          <div>
            <p className="font-semibold">Audit trail</p>
            <ul>{tx.audit.map((a) => <li key={a.id}>• {a.action} — {a.detail}</li>)}</ul>
          </div>
        </div>
      )}
    </li>
  );
}

export function SollaPayPanel() {
  const transactions = usePolling(api.getTransactions) ?? [];
  return (
    <section className="flex-[1.4] p-4 bg-slate-100 overflow-auto border-x">
      <h2 className="font-bold text-slate-800 mb-2">SollaPay · Transactions ({transactions.length})</h2>
      <ul className="space-y-2">{transactions.map((t) => <Row key={t.id} tx={t} />)}</ul>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/SollaPayPanel.tsx && git commit -m "feat: central panel with expandable detail + audit"
```

---

## Task 14: App layout + full manual verification

**Files:**
- Create: `apps/web/src/App.tsx`

- [ ] **Step 1: Write `apps/web/src/App.tsx`**

```tsx
import React from "react";
import { BankPanel } from "./BankPanel.js";
import { SollaPayPanel } from "./SollaPayPanel.js";
import { LawyerPanel } from "./LawyerPanel.js";

export function App() {
  return (
    <div className="h-screen flex flex-col">
      <header className="p-3 bg-slate-800 text-white font-bold">SollaPay — Bank Event Ingest Demo</header>
      <main className="flex flex-1 overflow-hidden">
        <BankPanel />
        <SollaPayPanel />
        <LawyerPanel />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run the whole app**

Run: `cd /f/Development/SollaPay2 && npm run dev`
Expected: api on :4000, web on :5173.

- [ ] **Step 3: Manual verification (the demo script)**

Open http://localhost:5173 and verify:
1. **Scenario 1:** Lawyer → "Create deal + payment request" (ref ABC123). Bank → "Send transfer (this reference)". Center shows **Matched**; expand to see payload + audit; Lawyer notification appears.
2. **Scenario 2:** Bank → "Send with wrong reference". Center shows **Unmatched** with "No matching payment request"; no notification.
3. **Scenario 3:** Bank → "Resend last transfer (duplicate)". Center shows a **Duplicate** row; no re-processing, no extra notification.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx && git commit -m "feat: 3-panel app layout"
```

---

## Task 15: README with run + demo + design notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

Include: one-command run (`npm install && npm run dev`), the demo script (3 scenarios
above), a short architecture diagram (webhook → ingest/dedup → event bus → matching →
audit/notifications), and a "Discussion" section covering scenario 4 (outbox + retry +
idempotent webhook) and scale (queue + real DB with unique constraints on
`transactionId` and `reference`). Mirror the spec's sections 9–10.

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: readme with run, demo script, and design notes"
```

---

## Self-Review Notes

- **Spec coverage:** Domain model → Task 2; store → Task 3; event bus → Task 4;
  matching/scenarios 1–2 → Task 5; dedup/scenario 3 → Task 6; audit + notifications →
  Task 7; bank contract + read APIs → Task 8; UI panels → Tasks 11–14; scenario 4 +
  scale discussion → README Task 15. All covered.
- **200-after-persist invariant:** `ingestBankEvent` persists before the route returns
  200 (Task 6 + Task 8 comment).
- **Type consistency:** `Transaction`, `BankEvent`, statuses identical across api
  `types.ts` and web `api.ts`. `createDeal`/`createPaymentRequest` signatures match
  between routes and tests.
- **Polling + SSE comment:** Task 10 `usePolling.ts`.
```
