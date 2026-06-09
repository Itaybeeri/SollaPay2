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
