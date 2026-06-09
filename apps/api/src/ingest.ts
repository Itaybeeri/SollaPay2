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
