import React from "react";

// Written answers to the Part-1 design questions and the four discussion
// scenarios. These are the parts of the exercise meant for discussion rather
// than implementation; the Console tab is the implemented central flow.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-800">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function Sub({ title }: { title: string }) {
  return <h3 className="mt-4 text-sm font-semibold text-slate-700">{title}</h3>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{children}</code>;
}

function Pre({ children }: { children: string }) {
  return <pre className="overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{children}</pre>;
}

function Tradeoff({ mvp, prod }: { mvp: string; prod: string }) {
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-1.5 pr-4 text-slate-700">{mvp}</td>
      <td className="py-1.5 text-slate-700">{prod}</td>
    </tr>
  );
}

export function QandA() {
  return (
    <div className="mx-auto max-w-3xl overflow-auto p-6">
      <p className="mb-6 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900 ring-1 ring-indigo-100">
        The <b>Console</b> tab is the implemented central flow (bank event → store → associate to a
        deal → update state → audit → notify). This tab answers the Part-1 design questions and the
        discussion scenarios — the parts meant for conversation, not code.
      </p>

      <Section title="MVP tradeoffs vs. a production version">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-1.5 pr-4 font-medium">MVP (built)</th>
              <th className="py-1.5 font-medium">Production (next)</th>
            </tr>
          </thead>
          <tbody>
            <Tradeoff mvp="In-memory store" prod="Real DB with unique/index constraints" />
            <Tradeoff mvp="Synchronous in-process event bus" prod="Durable broker + workers + DLQ" />
            <Tradeoff mvp="UI polling (~1s)" prod="SSE / WebSocket push" />
            <Tradeoff mvp="No auth; open webhook" prod="RBAC + HMAC-signed webhooks" />
            <Tradeoff mvp="Single currency assumed" prod="Multi-currency / FX handling" />
            <Tradeoff mvp="Totals recomputed on read" prod="Materialized / cached totals" />
            <Tradeoff mvp="In-app notification feed" prod="Email / SMS / WhatsApp with delivery guarantees" />
            <Tradeoff mvp="Short/Overpaid surfaced only" prod="Business rules: hold, alert ops, refund, partial release" />
          </tbody>
        </table>
      </Section>

      <Section title="Scenario 4 — the component that records the action is unavailable">
        <p>
          The rule that anchors everything: we return <Code>200</Code> to the bank <b>only once the
          event is durably persisted somewhere we can recover from</b>. So if the primary database
          write isn't available, there are two valid responses:
        </p>
        <Sub title="Option A — reject, let the bank retry" />
        <p>
          Return a non-2xx. We never acknowledge what we didn't store, so the bank's retry mechanism
          is the safety net — and because our intake is idempotent (dedup by <Code>transactionId</Code>),
          those retries are harmless. Simplest correct behavior; it relies on the bank actually retrying.
        </p>
        <Sub title="Option B — fail over to a durable backup / queue" />
        <p>
          Write the raw event to a backup store or, better, a persistent append-only queue
          (Kafka / SQS). That durable append <b>is</b> a valid "we've got it," so we can return
          <Code>200</Code> and let the rest of the pipeline (matching, audit, notify) consume from the
          queue asynchronously, retrying as components recover. In production this is the standard
          shape: the webhook's only job is to durably land the event; everything downstream is
          decoupled behind the queue and can be down without affecting the <Code>200</Code>. The intake
          becomes "bulletproof" because the only thing between the bank and a <Code>200</Code> is one
          durable append.
        </p>
        <Sub title="Two layers, kept separate" />
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Intake durability</b> gates the <Code>200</Code> (Options A / B above).</li>
          <li><b>Recording side-effects</b> (audit / notify) being down is a different concern, handled by the <b>outbox pattern</b> + idempotent consumers with retries — so a failed audit/notification is retried, never silently dropped.</li>
        </ul>
        <p className="text-slate-500">
          The backup/queue has to be replicated so it doesn't become a single point of failure.
        </p>
      </Section>

      <Section title="Scale — tens to hundreds of thousands of events/day">
        <ul className="list-disc space-y-1 pl-5">
          <li>Replace the sync in-process bus with a <b>broker</b> (SQS / Kafka): the webhook persists + enqueues and returns <Code>200</Code> fast; processing happens off the hot path.</li>
          <li><b>Stateless, horizontally-scaled, idempotent workers.</b></li>
          <li>DB with <Code>UNIQUE(transaction_id)</Code> + <Code>INDEX(reference)</Code>; <b>partition/shard by reference</b>.</li>
          <li><b>Dead-letter queue</b> for poison messages; retries with exponential backoff.</li>
          <li><b>Materialize/cache the per-reference totals</b> instead of recomputing from scratch.</li>
          <li><b>Observability:</b> metrics, structured logs, tracing; alert on a rising backlog of Short / Overpaid / Unexpected.</li>
          <li>UI from polling → <b>SSE/WebSocket</b> push.</li>
        </ul>
      </Section>

      <Section title="Domain modeling — entities & relationships">
        <p><b>Implemented entities:</b></p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Deal</b> — the real-estate transaction the lawyer manages as trustee (the escrow).</li>
          <li><b>PaymentRequest</b> — the lawyer's payment instruction (״הוראת תשלום״). Belongs to a Deal; carries a <Code>reference</Code>, an <Code>expectedAmount</Code> and a currency. References are intentionally <b>not unique</b> — several deals can share one.</li>
          <li><b>BankEvent</b> — the raw payload from the bank, identified by <Code>transactionId</Code>.</li>
          <li><b>ReferenceGroup</b> — a <i>derived</i> view that rolls up every PaymentRequest and BankEvent sharing a reference, and computes the totals and status. Not stored; recomputed on demand.</li>
          <li><b>AuditEntry</b> — append-only record of every action, keyed by reference.</li>
          <li><b>Notification</b> — message to the lawyer when a reference becomes fully funded.</li>
        </ul>
        <p><b>Relationships:</b> Deal 1—* PaymentRequest. The <Code>reference</Code> is the join key between PaymentRequest(s) and BankEvent(s); the ReferenceGroup is the aggregation over that key.</p>
        <Sub title="Fuller production domain (out of MVP scope)" />
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Lawyer / Trustee</b> — the user who owns deals and the escrow account.</li>
          <li><b>Project</b> — a real-estate project containing many deals.</li>
          <li><b>Client / Buyer</b> — a real party (here simplified to a name string).</li>
          <li><b>LedgerEntry</b> — double-entry money movement, for real balances and payouts.</li>
          <li><b>User / Role</b> — auth and RBAC (lawyer / ops / buyer).</li>
        </ul>
      </Section>

      <Section title="API design & the bank contract">
        <p><b>Implemented endpoints:</b></p>
        <ul className="list-disc space-y-1 pl-5">
          <li><Code>POST /api/bank/webhook</Code> — the bank notifies us a transfer arrived.</li>
          <li><Code>POST /api/deals</Code>, <Code>POST /api/payment-requests</Code> — the lawyer side.</li>
          <li><Code>GET /api/references</Code> — the rolled-up state (one group per reference).</li>
          <li><Code>GET /api/notifications</Code>, <Code>GET /api/audit</Code> — feeds.</li>
        </ul>
        <Sub title="The contract with the bank" />
        <Pre>{`POST /api/bank/webhook
{
  "transactionId": "tx_123",   // idempotency key
  "amount": 70000,
  "currency": "ILS",
  "reference": "ABC123",       // links the money to a deal
  "senderName": "John Doe",
  "occurredAt": "2026-06-03T10:00:00Z"
}
→ 200 OK   (only AFTER the event is durably stored)`}</Pre>
        <p><b>Key contract decisions:</b></p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Persist-before-acknowledge:</b> we return <Code>200</Code> only after the event is stored, so the bank never considers a transfer delivered while it could be lost.</li>
          <li><b>Idempotency key</b> = <Code>transactionId</Code> (in production, also accept an <Code>Idempotency-Key</Code> header). The bank may safely retry on any non-2xx.</li>
          <li><b>Authenticity (production):</b> verify an HMAC signature header (<Code>X-Signature</Code>) so we only accept events the bank actually sent.</li>
          <li><b>Status codes:</b> <Code>200</Code> stored/processed, <Code>400</Code> malformed, <Code>401</Code> bad signature, <Code>5xx</Code> → bank retries.</li>
        </ul>
      </Section>

      <Section title="Data model — tables & key fields">
        <p>The MVP uses in-memory maps (swap-ready for a DB). In production I'd use:</p>
        <Pre>{`deals(id PK, name, buyer_name, lawyer_id FK, created_at)

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

outbox(id PK, aggregate, payload, status, attempts, next_attempt_at)`}</Pre>
        <p><b>The two constraints that carry the design:</b> <Code>UNIQUE(transaction_id)</Code> makes duplicate detection a database guarantee, and <Code>INDEX(reference)</Code> makes the per-reference aggregation fast. Totals can be computed on read, or materialized/cached at high volume.</p>
      </Section>

      <Section title="Processing flow — from bank event to user update">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Bank calls <Code>POST /api/bank/webhook</Code>.</li>
          <li><b>Ingest</b> persists the raw event (this is what the <Code>200</Code> acknowledges) and dedups by <Code>transactionId</Code>.</li>
          <li>An event is published on a synchronous in-process <b>event bus</b>.</li>
          <li><b>evaluateReference</b> re-derives that reference's totals → status (Matched / Short / Overpaid / Unexpected).</li>
          <li><b>Audit</b> appends an entry; <b>Notifications</b> fires when the reference first becomes fully funded.</li>
          <li>The UI polls <Code>GET /api/references</Code> (every ~1s) and reflects the new state. (Production: SSE/WebSocket push.)</li>
        </ol>
        <p>Audit and Notifications <i>react</i> to events — they're never called directly by business logic, which keeps the flow easy to follow and each piece independently testable.</p>
      </Section>

      <Section title="Reliability — duplicates & crashes">
        <p className="text-slate-500">(Partial failure / a recording component being down is covered in the Scenario 4 section above.)</p>
        <Sub title="The same event arrives twice" />
        <p>Dedup by <Code>transactionId</Code> (a <Code>UNIQUE</Code> constraint in production). The duplicate is recorded for the audit trail but <b>excluded from the totals</b>, so no double-counting and no second notification. This is what makes the webhook safe for the bank to retry.</p>
        <Sub title="The system crashes mid-processing" />
        <p>Because status is <b>derived from persisted facts</b> (events + requests) rather than a mutable per-event state machine, a restart simply re-derives the correct state — there is no half-updated record to repair. Pending side-effects resume from the outbox, and the bank can safely re-deliver.</p>
      </Section>

      <Section title="Scenarios 1–3">
        <Sub title="1 · A valid event for an existing deal" />
        <p>The transfer is counted toward its reference. When the total received meets the total requested, the reference becomes <b>Matched</b>, a notification is sent to the lawyer, and every step is audited.</p>
        <Sub title="2 · An event that matches no deal" />
        <p>The reference shows <b>Unexpected funds</b> — the money is held and surfaced (not lost), and it's audited. If the deal is created later, the reference re-derives and matches automatically (order-independent).</p>
        <Sub title="3 · The same event twice" />
        <p>Idempotent dedup by <Code>transactionId</Code>: recorded as a duplicate, excluded from totals, no second notification.</p>
        <p className="text-slate-500">(Scenario 4 — a recording component is unavailable — is answered at the top.)</p>
      </Section>
    </div>
  );
}
