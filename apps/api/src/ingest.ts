import { store } from "./store.js";
import { eventBus } from "./eventBus.js";
import { evaluateReference } from "./references.js";
import type { BankEvent, ReferenceGroup } from "./types.js";

// Webhook entry point. Persist first (this is what the 200 OK acknowledges),
// dedup by transactionId, then re-evaluate the reference's rolled-up status.
export function ingestBankEvent(bankEvent: BankEvent): { duplicate: boolean; group: ReferenceGroup } {
  if (store.bankEventsByTransactionId.has(bankEvent.transactionId)) {
    store.duplicateEvents.push(bankEvent); // recorded for the breakdown, not counted in totals
    eventBus.emit("transfer.duplicate", bankEvent);
    return { duplicate: true, group: evaluateReference(bankEvent.reference) };
  }

  store.bankEventsByTransactionId.set(bankEvent.transactionId, bankEvent); // durable write
  eventBus.emit("transfer.received", bankEvent);
  return { duplicate: false, group: evaluateReference(bankEvent.reference) };
}
