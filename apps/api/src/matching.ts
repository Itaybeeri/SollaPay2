import { store, newId, now } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { BankEvent, PaymentRequest, Transaction } from "./types.js";

// Match a bank event to a waiting payment request by reference AND amount.
// A transaction is Matched only when both agree. Otherwise it is Unmatched and
// carries the reason(s):
//   - reference wrong  -> no request to check against, so reference AND amount fail
//   - reference right, amount wrong -> only amount fails
export function matchBankEvent(bankEvent: BankEvent): Transaction {
  const pendingId = store.pendingTransactionIdByReference.get(bankEvent.reference);
  const pending = pendingId ? store.transactions.get(pendingId) : undefined;

  // No request waiting on this reference: both checks fail.
  if (!pending) {
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

  // A request is waiting (reference matched): attach the event and check amount.
  pending.bankEvent = bankEvent;

  if (bankEvent.amount === pending.expectedAmount) {
    pending.status = "Matched";
    pending.mismatchReasons = [];
    pending.matchNote = `Matched reference ${bankEvent.reference} and amount ${bankEvent.amount} ${bankEvent.currency}`;
    store.pendingTransactionIdByReference.delete(bankEvent.reference); // request fulfilled
    eventBus.emit("transaction.matched", pending);
  } else {
    pending.status = "Unmatched";
    pending.mismatchReasons = ["amount"];
    pending.matchNote = `Reference ${bankEvent.reference} matched but amount ${bankEvent.amount} != expected ${pending.expectedAmount} — amount unmatched`;
    eventBus.emit("transaction.unmatched", pending);
  }
  return pending;
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
