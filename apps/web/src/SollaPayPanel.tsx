import React, { useState } from "react";
import { Landmark, ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { api, type Transaction } from "./api.js";
import { usePolling } from "./usePolling.js";
import { useStatusFlash } from "./useStatusFlash.js";
import { StatusBadge, RefChip, fmtAmount, type Status } from "./ui.js";

const ALL_STATUSES: Status[] = ["Pending", "Matched", "Unmatched", "Duplicate"];

// "Unmatched" shows its reason(s) so the two cases are distinguishable at a glance.
function statusLabel(tx: Transaction): string {
  if (tx.status === "Unmatched" && tx.mismatchReasons.length > 0) {
    return `Unmatched · ${tx.mismatchReasons.join(" + ")}`;
  }
  return tx.status;
}

function PayloadGrid({ bankEvent }: { bankEvent: NonNullable<Transaction["bankEvent"]> }) {
  const rows: [string, string][] = [
    ["Transaction id", bankEvent.transactionId],
    ["Amount", `${fmtAmount(bankEvent.amount)} ${bankEvent.currency}`],
    ["Reference", bankEvent.reference],
    ["Sender", bankEvent.senderName],
    ["Occurred at", new Date(bankEvent.occurredAt).toLocaleString()],
  ];
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-slate-400">{k}</dt>
          <dd className="text-slate-700">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function Row({ tx, flash }: { tx: Transaction; flash: boolean }) {
  const [open, setOpen] = useState(false);
  const headline = tx.bankEvent
    ? `${fmtAmount(tx.bankEvent.amount)} ${tx.bankEvent.currency}`
    : `${fmtAmount(tx.expectedAmount ?? 0)} ILS expected`;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className={`animate-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow ${flash ? "animate-flash" : ""}`}>
      <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(!open)}>
        <Chevron size={16} className="flex-shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800">{headline}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <RefChip value={tx.reference} />
            {tx.bankEvent && <span>from {tx.bankEvent.senderName}</span>}
          </p>
        </div>
        <StatusBadge status={tx.status as Status} label={statusLabel(tx)} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="text-xs italic text-slate-500">{tx.matchNote}</p>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">Bank payload</p>
            {tx.bankEvent
              ? <PayloadGrid bankEvent={tx.bankEvent} />
              : <p className="text-xs text-slate-400">No transfer received yet — awaiting the bank.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">Audit trail</p>
            <ol className="space-y-1.5">
              {tx.audit.map((a) => (
                <li key={a.id} className="flex gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300" />
                  <span>
                    <span className="font-mono text-slate-500">{a.action}</span>
                    <span className="text-slate-600"> — {a.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}

// Clickable summary: one chip per status (with count) plus an "All" chip.
function FilterBar({
  transactions, filter, setFilter,
}: {
  transactions: Transaction[];
  filter: Status | "all";
  setFilter: (f: Status | "all") => void;
}) {
  const count = (s: Status) => transactions.filter((t) => t.status === s).length;
  const chip = (active: boolean, extra = "") =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
    } ${extra}`;

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      <button className={chip(filter === "all")} onClick={() => setFilter("all")}>
        All {transactions.length}
      </button>
      {ALL_STATUSES.map((s) => (
        <button key={s} className={chip(filter === s)} onClick={() => setFilter(filter === s ? "all" : s)}>
          {s} {count(s)}
        </button>
      ))}
    </div>
  );
}

export function SollaPayPanel() {
  const transactions = usePolling(api.getTransactions) ?? [];
  const flashing = useStatusFlash(transactions);
  const [filter, setFilter] = useState<Status | "all">("all");

  const visible = filter === "all" ? transactions : transactions.filter((t) => t.status === filter);

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Landmark size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-slate-700">Transactions</h2>
      </div>

      <FilterBar transactions={transactions} filter={filter} setFilter={setFilter} />

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
          <Inbox size={32} />
          <p className="mt-2 text-sm">
            {transactions.length === 0
              ? "No transactions yet. Create a request or send a transfer."
              : `No ${filter} transactions.`}
          </p>
        </div>
      ) : (
        <ul className="flex-1 space-y-2 overflow-auto pr-1">
          {visible.map((t) => <Row key={t.id} tx={t} flash={flashing.has(t.id)} />)}
        </ul>
      )}
    </section>
  );
}
