import React, { useState } from "react";
import { Landmark, ChevronDown, ChevronRight, Inbox, FileText, ArrowDownLeft, CopyX } from "lucide-react";
import { api, type ReferenceGroup, type ReferenceStatus } from "./api.js";
import { usePolling } from "./usePolling.js";
import { useStatusFlash } from "./useStatusFlash.js";
import { StatusBadge, RefChip, fmtAmount } from "./ui.js";

const ALL_STATUSES: ReferenceStatus[] = ["Matched", "Short", "Overpaid", "Unexpected"];

// The badge spells out the gap so "Short"/"Overpaid" are self-explanatory.
function statusLabel(g: ReferenceGroup): string {
  switch (g.status) {
    case "Matched":    return "Matched";
    case "Short":      return `Missing ${fmtAmount(-g.difference)} ${g.currency}`;
    case "Overpaid":   return `Over by ${fmtAmount(g.difference)} ${g.currency}`;
    case "Unexpected": return "Unexpected funds";
  }
}

function Breakdown({ g }: { g: ReferenceGroup }) {
  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs">
      <p className="text-slate-500">
        Requested <b className="text-slate-700">{fmtAmount(g.totalRequested)}</b> ·
        Received <b className="text-slate-700">{fmtAmount(g.totalTransferred)}</b> {g.currency}
      </p>

      <div>
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-600"><FileText size={13} /> Deals ({g.requests.length})</p>
        {g.requests.length === 0
          ? <p className="text-slate-400">No deal for this reference.</p>
          : <ul className="space-y-0.5">
              {g.requests.map((r) => <li key={r.id} className="text-slate-600">expects {fmtAmount(r.expectedAmount)} {r.currency}</li>)}
            </ul>}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-600"><ArrowDownLeft size={13} /> Transfers ({g.transfers.length})</p>
        {g.transfers.length === 0
          ? <p className="text-slate-400">No transfer received yet.</p>
          : <ul className="space-y-0.5">
              {g.transfers.map((t) => (
                <li key={t.transactionId} className="text-slate-600">
                  {fmtAmount(t.amount)} {t.currency} from {t.senderName} <span className="font-mono text-slate-400">({t.transactionId})</span>
                </li>
              ))}
            </ul>}
      </div>

      {g.duplicateCount > 0 && (
        <p className="flex items-center gap-1.5 text-rose-600"><CopyX size={13} /> {g.duplicateCount} duplicate transfer{g.duplicateCount === 1 ? "" : "s"} ignored</p>
      )}

      <div>
        <p className="mb-1 font-semibold text-slate-600">Audit trail</p>
        <ol className="space-y-1.5">
          {g.audit.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300" />
              <span><span className="font-mono text-slate-500">{a.action}</span><span className="text-slate-600"> — {a.detail}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Row({ g, flash }: { g: ReferenceGroup; flash: boolean }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={`animate-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow ${flash ? "animate-flash" : ""}`}>
      <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpen(!open)}>
        <Chevron size={16} className="flex-shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-slate-800">
            <RefChip value={g.reference} />
            <span className="text-sm text-slate-500">{fmtAmount(g.totalTransferred)} / {fmtAmount(g.totalRequested)} {g.currency}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{g.summary}</p>
        </div>
        <StatusBadge status={g.status} label={statusLabel(g)} />
      </button>
      {open && <Breakdown g={g} />}
    </li>
  );
}

export function SollaPayPanel() {
  const groups = usePolling(api.getReferences) ?? [];
  const flashing = useStatusFlash(groups.map((g) => ({ id: g.reference, status: g.status })));
  const [filter, setFilter] = useState<ReferenceStatus | "all">("all");

  const visible = filter === "all" ? groups : groups.filter((g) => g.status === filter);
  const count = (s: ReferenceStatus) => groups.filter((g) => g.status === s).length;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
    }`;

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Landmark size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold text-slate-700">References</h2>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button className={chip(filter === "all")} onClick={() => setFilter("all")}>All {groups.length}</button>
        {ALL_STATUSES.map((s) => (
          <button key={s} className={chip(filter === s)} onClick={() => setFilter(filter === s ? "all" : s)}>{s} {count(s)}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
          <Inbox size={32} />
          <p className="mt-2 text-sm">
            {groups.length === 0 ? "No references yet. Create a request or send a transfer." : `No ${filter} references.`}
          </p>
        </div>
      ) : (
        <ul className="flex-1 space-y-2 overflow-auto pr-1">
          {visible.map((g) => <Row key={g.reference} g={g} flash={flashing.has(g.reference)} />)}
        </ul>
      )}
    </section>
  );
}
