import { store, newId, now, fmt } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { ReferenceGroup } from "./types.js";

// Notify the lawyer when a reference is fully funded.
export function registerNotifications(): void {
  eventBus.on("reference.matched", (p) => {
    const g = p as ReferenceGroup;
    store.notifications.push({
      id: newId("ntf"), at: now(), reference: g.reference,
      message: `Reference ${g.reference} fully funded — ${fmt(g.totalTransferred)} ${g.currency} received`,
    });
  });
}
