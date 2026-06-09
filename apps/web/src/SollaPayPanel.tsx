import React, { useState } from "react";
import { api, type Transaction } from "./api.js";
import { usePolling } from "./usePolling.js";

const statusColor: Record<Transaction["status"], string> = {
  Pending: "bg-slate-200 text-slate-700",
  Matched: "bg-emerald-100 text-emerald-800",
  Unmatched: "bg-amber-100 text-amber-800",
  Duplicate: "bg-rose-100 text-rose-800",
};

// "Unmatched" carries the reason(s); show them on the badge so the two cases
// (reference vs. amount, or both) are distinguishable at a glance.
function statusLabel(tx: Transaction): string {
  if (tx.status === "Unmatched" && tx.mismatchReasons.length > 0) {
    return `Unmatched · ${tx.mismatchReasons.join(" + ")}`;
  }
  return tx.status;
}

function Row({ tx }: { tx: Transaction }) {
  const [open, setOpen] = useState(false);
  const headline = tx.bankEvent
    ? `${tx.bankEvent.amount} ${tx.bankEvent.currency}`
    : `${tx.expectedAmount} (expected)`;
  return (
    <li className="bg-white rounded shadow-sm">
      <button className="w-full text-left p-2 flex justify-between items-center gap-2" onClick={() => setOpen(!open)}>
        <span>{headline} · ref {tx.reference}</span>
        <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${statusColor[tx.status]}`}>{statusLabel(tx)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs space-y-2">
          <p className="italic text-gray-600">{tx.matchNote}</p>
          <div>
            <p className="font-semibold">Bank payload</p>
            {tx.bankEvent
              ? <pre className="bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(tx.bankEvent, null, 2)}</pre>
              : <p className="text-gray-500">No transfer received yet — awaiting the bank.</p>}
          </div>
          <div>
            <p className="font-semibold">Audit trail</p>
            <ul>{tx.audit.map((a) => <li key={a.id}>• {a.action} — {a.detail}</li>)}</ul>
          </div>
        </div>
      )}
    </li>
  );
}

export function SollaPayPanel() {
  const transactions = usePolling(api.getTransactions) ?? [];
  return (
    <section className="flex-[1.4] p-4 bg-slate-100 overflow-auto border-x">
      <h2 className="font-bold text-slate-800 mb-2">SollaPay · Transactions ({transactions.length})</h2>
      <ul className="space-y-2">{transactions.map((t) => <Row key={t.id} tx={t} />)}</ul>
    </section>
  );
}
