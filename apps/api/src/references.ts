import { store, fmt, normalizeRef } from "./store.js";
import { eventBus } from "./eventBus.js";
import type { ReferenceGroup, ReferenceStatus } from "./types.js";

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

// Build the rolled-up view of a single reference from raw deals + transfers.
// Status is purely derived from the totals, so order of arrival never matters.
export function buildReferenceGroup(reference: string): ReferenceGroup {
  const key = normalizeRef(reference); // references match case-insensitively
  const requests = [...store.paymentRequests.values()].filter((r) => normalizeRef(r.reference) === key);
  const transfers = [...store.bankEventsByTransactionId.values()].filter((t) => normalizeRef(t.reference) === key);
  const duplicateCount = store.duplicateEvents.filter((d) => normalizeRef(d.reference) === key).length;

  const totalRequested = sum(requests.map((r) => r.expectedAmount));
  const totalTransferred = sum(transfers.map((t) => t.amount));
  const difference = totalTransferred - totalRequested;
  const currency = requests[0]?.currency ?? transfers[0]?.currency ?? "ILS";

  let status: ReferenceStatus;
  if (requests.length === 0) status = "Unexpected";
  else if (difference === 0) status = "Matched";
  else if (difference < 0) status = "Short";
  else status = "Overpaid";

  return {
    reference: key, currency, requests, transfers, duplicateCount,
    totalRequested, totalTransferred, difference, status,
    summary: describe(transfers.length, requests.length, status, difference, currency),
  };
}

function describe(
  transfers: number, deals: number, status: ReferenceStatus, difference: number, currency: string,
): string {
  const t = `${transfers} transfer${transfers === 1 ? "" : "s"}`;
  const d = `${deals} deal${deals === 1 ? "" : "s"}`;
  switch (status) {
    case "Matched":    return `${t} · ${d} — fully funded`;
    case "Short":      return `${t} · ${d} — missing ${fmt(-difference)} ${currency}`;
    case "Overpaid":   return `${t} · ${d} — ${fmt(difference)} ${currency} too much`;
    case "Unexpected": return `${t} · no deal — unexpected funds`;
  }
}

// Every reference seen across deals, transfers, and duplicates.
export function allReferenceGroups(): ReferenceGroup[] {
  const references = new Set<string>();
  for (const r of store.paymentRequests.values()) references.add(normalizeRef(r.reference));
  for (const t of store.bankEventsByTransactionId.values()) references.add(normalizeRef(t.reference));
  for (const d of store.duplicateEvents) references.add(normalizeRef(d.reference));
  return [...references].map(buildReferenceGroup);
}

// Recompute a reference after a change and fire a single notification the first
// time it becomes fully funded.
export function evaluateReference(reference: string): ReferenceGroup {
  const key = normalizeRef(reference);
  const group = buildReferenceGroup(key);
  const wasMatched = store.matchedReferences.has(key);

  if (group.status === "Matched" && !wasMatched) {
    store.matchedReferences.add(key);
    eventBus.emit("reference.matched", group);
  } else if (group.status !== "Matched" && wasMatched) {
    store.matchedReferences.delete(key); // left matched (e.g. a new larger deal) — can re-notify later
  }
  return group;
}
