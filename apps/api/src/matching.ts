import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { BankEvent, PaymentRequest, Transaction } from "./types.js";

// All still-Pending requests for a reference, oldest first. References are not
// unique, so several deals can be waiting on the same one; we consume them FIFO.
function pendingForReference(reference: string): Transaction[] {
  return [...store.transactions.values()].filter(
    (t) => t.status === "Pending" && t.reference === reference,
  );
}

// Match a bank event to a waiting payment request by reference AND amount.
// A transaction is Matched only when both agree. Otherwise it is Unmatched and
// carries the reason(s):
//   - reference wrong  -> no request to check against, so reference AND amount fail
//   - reference right, amount wrong -> only amount fails
export function matchBankEvent(bankEvent: BankEvent): Transaction {
  const pendings = pendingForReference(bankEvent.reference);

  // Prefer a pending request whose amount also matches; consume the oldest.
  const exact = pendings.find((t) => t.expectedAmount === bankEvent.amount);
  if (exact) {
    exact.bankEvent = bankEvent;
    exact.status = "Matched";
    exact.mismatchReasons = [];
    exact.matchNote = `Matched reference ${bankEvent.reference} and amount ${bankEvent.amount} ${bankEvent.currency}`;
    eventBus.emit("transaction.matched", exact);
    return exact;
  }

  // Reference matches a waiting request but no amount fits: amount unmatched.
  if (pendings.length > 0) {
    const pending = pendings[0];
    pending.bankEvent = bankEvent;
    pending.status = "Unmatched";
    pending.mismatchReasons = ["amount"];
    pending.matchNote = `Reference ${bankEvent.reference} matched but amount ${bankEvent.amount} != expected ${pending.expectedAmount} — amount unmatched`;
    eventBus.emit("transaction.unmatched", pending);
    return pending;
  }

  // No request waiting on this reference: both checks fail.
  const tx: Transaction = {
    id: newId("txn"), reference: bankEvent.reference, expectedAmount: null,
    bankEvent, status: "Unmatched", mismatchReasons: ["reference", "amount"],
    paymentRequestId: null, dealId: null,
    matchNote: `No payment request for reference ${bankEvent.reference} — reference and amount unmatched`,
    createdAt: now(),
  };
  store.transactions.set(tx.id, tx);
  eventBus.emit("transaction.unmatched", tx);
  return tx;
}

// The other direction: a transfer may arrive BEFORE its payment request exists.
// When the lawyer later creates a request, adopt a waiting Unmatched transfer
// whose reference AND amount agree, turning it into a Matched transaction.
// Returns the adopted transaction, or null if none was waiting.
export function matchPaymentRequest(pr: PaymentRequest): Transaction | null {
  for (const tx of store.transactions.values()) {
    if (
      tx.status === "Unmatched" &&
      tx.bankEvent !== null &&
      tx.bankEvent.reference === pr.reference &&
      tx.bankEvent.amount === pr.expectedAmount
    ) {
      tx.status = "Matched";
      tx.mismatchReasons = [];
      tx.paymentRequestId = pr.id;
      tx.dealId = pr.dealId;
      tx.expectedAmount = pr.expectedAmount;
      tx.matchNote = `Matched reference ${pr.reference} and amount ${pr.expectedAmount} ${pr.currency} (transfer had arrived before the request)`;
      eventBus.emit("transaction.matched", tx);
      return tx;
    }
  }
  return null;
}
