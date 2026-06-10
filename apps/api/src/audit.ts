import { store, newId, now, fmt } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { BankEvent, PaymentRequest, ReferenceGroup } from "./types.js";

function record(action: string, detail: string, reference: string) {
  store.auditEntries.push({ id: newId("aud"), at: now(), action, detail, reference });
}

// Append-only audit. Subscribes to every meaningful event; never called directly.
export function registerAudit(): void {
  eventBus.on("request.created", (p) => {
    const r = p as PaymentRequest;
    record("request.created", `Deal requests ${fmt(r.expectedAmount)} ${r.currency}`, r.reference);
  });
  eventBus.on("transfer.received", (p) => {
    const e = p as BankEvent;
    record("transfer.received", `Received ${fmt(e.amount)} ${e.currency} from ${e.senderName} (tx ${e.transactionId})`, e.reference);
  });
  eventBus.on("transfer.duplicate", (p) => {
    const e = p as BankEvent;
    record("transfer.duplicate", `Duplicate transactionId ${e.transactionId} — ignored`, e.reference);
  });
  eventBus.on("reference.matched", (p) => {
    const g = p as ReferenceGroup;
    record("reference.matched", `Fully funded — ${fmt(g.totalTransferred)} ${g.currency} received`, g.reference);
  });
}
