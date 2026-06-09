import React, { useState } from "react";
import { api, type Transaction } from "./api.js";
import { usePolling } from "./usePolling.js";

const statusColor: Record<Transaction["status"], string> = {
  Matched: "bg-emerald-100 text-emerald-800",
  Unmatched: "bg-amber-100 text-amber-800",
  Duplicate: "bg-rose-100 text-rose-800",
};

function Row({ tx }: { tx: Transaction }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="bg-white rounded shadow-sm">
      <button className="w-full text-left p-2 flex justify-between items-center" onClick={() => setOpen(!open)}>
        <span>{tx.bankEvent.amount} {tx.bankEvent.currency} · ref {tx.bankEvent.reference}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${statusColor[tx.status]}`}>{tx.status}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs space-y-2">
          <p className="italic text-gray-600">{tx.matchNote}</p>
          <div>
            <p className="font-semibold">Raw bank payload</p>
            <pre className="bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(tx.bankEvent, null, 2)}</pre>
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
