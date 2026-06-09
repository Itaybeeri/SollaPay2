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
  for (const evt of [
    "transaction.pending", "transaction.matched",
    "transaction.unmatched", "transaction.duplicate",
  ]) {
    eventBus.on(evt, (p) => {
      const t = p as Transaction;
      record(evt, t.matchNote, t.id);
    });
  }
}
