import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { BankEvent, MismatchReason, PaymentRequest, Transaction } from "./types.js";

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

  // No open request fits this transfer. Record it as its OWN Unmatched row and
  // leave any same-reference requests Pending, so a later correct-amount transfer
  // can still match them (a wrong amount must not poison a good payment).
  const referenceKnown = pendings.length > 0;
  const reasons: MismatchReason[] = referenceKnown ? ["amount"] : ["reference", "amount"];
  const matchNote = referenceKnown
    ? `Reference ${bankEvent.reference} matched an open request but amount ${bankEvent.amount} fits no expected amount — amount unmatched`
    : `No payment request for reference ${bankEvent.reference} — reference and amount unmatched`;

  const tx: Transaction = {
    id: newId("txn"), reference: bankEvent.reference, expectedAmount: null,
    bankEvent, status: "Unmatched", mismatchReasons: reasons,
    paymentRequestId: null, dealId: null,
    matchNote, createdAt: now(),
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
