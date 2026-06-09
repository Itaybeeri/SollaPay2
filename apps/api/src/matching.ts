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
