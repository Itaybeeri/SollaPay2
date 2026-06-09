import React, { useState } from "react";
import { api } from "./api.js";

let txCounter = 100;
const nextTxId = () => `tx_${++txCounter}`;

export function BankPanel() {
  const [reference, setReference] = useState("ABC123");
  const [amount, setAmount] = useState(70000);
  const [senderName, setSenderName] = useState("John Doe");
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  function payload(transactionId: string, ref: string) {
    return { transactionId, amount, currency: "ILS", reference: ref,
      senderName, occurredAt: new Date().toISOString() };
  }

  async function sendMatched() {
    const id = nextTxId(); setLastTxId(id);
    await api.sendWebhook(payload(id, reference));
  }
  async function sendWrongReference() {
    const id = nextTxId(); setLastTxId(id);
    await api.sendWebhook(payload(id, "NO-MATCH-999")); // reference + amount unmatched
  }
  async function sendWrongAmount() {
    const id = nextTxId(); setLastTxId(id);
    await api.sendWebhook({ ...payload(id, reference), amount: amount + 1 }); // amount unmatched
  }
  async function sendDuplicate() {
    if (!lastTxId) return; // resend the previous id
    await api.sendWebhook(payload(lastTxId, reference));
  }

  return (
    <section className="flex-1 p-4 bg-sky-50 overflow-auto">
      <h2 className="font-bold text-sky-800 mb-2">Bank</h2>

      <div className="space-y-2 bg-white p-3 rounded shadow-sm">
        <input className="border p-1 w-full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" />
        <input className="border p-1 w-full" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} placeholder="Amount" />
        <input className="border p-1 w-full" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender" />
        <button className="bg-sky-600 text-white px-3 py-1 rounded w-full" onClick={sendMatched}>Send transfer (this reference + amount)</button>
        <button className="bg-amber-600 text-white px-3 py-1 rounded w-full" onClick={sendWrongReference}>Send with wrong reference (ref + amount unmatched)</button>
        <button className="bg-orange-600 text-white px-3 py-1 rounded w-full" onClick={sendWrongAmount}>Send with wrong amount (amount unmatched)</button>
        <button className="bg-rose-600 text-white px-3 py-1 rounded w-full disabled:opacity-40" disabled={!lastTxId} onClick={sendDuplicate}>
          Resend last transfer (duplicate)
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">Last transactionId: {lastTxId ?? "—"}</p>
    </section>
  );
}
