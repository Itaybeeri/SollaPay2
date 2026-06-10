import React, { useState } from "react";
import { Building2, Send } from "lucide-react";
import { api } from "./api.js";
import { Card, Field, Button } from "./ui.js";

// "tx_101" -> "tx_102". Falls back to appending if there's no trailing number.
function bumpTxId(id: string): string {
  const m = id.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${id}_1`;
}

export function BankPanel() {
  const [transactionId, setTransactionId] = useState("tx_101");
  const [reference, setReference] = useState("ABC123");
  const [amount, setAmount] = useState(70000);
  const [senderName, setSenderName] = useState("John Doe");
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  function payload(ref: string) {
    return { transactionId, amount, currency: "ILS", reference: ref,
      senderName, occurredAt: new Date().toISOString() };
  }

  // Send with the current transactionId, then bump it so the next send is unique
  // by default. Re-type a previous id to deliberately produce a duplicate.
  async function send(ref: string) {
    setLastTxId(transactionId);
    await api.sendWebhook(payload(ref));
    setTransactionId((id) => bumpTxId(id));
  }

  async function sendDuplicate() {
    if (!lastTxId) return; // resend the previous transactionId as-is
    await api.sendWebhook({ ...payload(reference), transactionId: lastTxId });
  }

  return (
    <section className="flex w-72 flex-shrink-0 flex-col gap-3 overflow-auto">
      <div className="flex items-center gap-2 px-1">
        <Building2 size={16} className="text-sky-600" />
        <h2 className="text-sm font-semibold text-slate-700">Bank</h2>
      </div>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">New transfer</p>
        <Field label="Transaction id" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
        <Field label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Field label="Amount (ILS)" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        <Field label="Sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
        <Button variant="sky" onClick={() => send(reference)}>
          <span className="inline-flex items-center justify-center gap-2"><Send size={15} /> Send transfer</span>
        </Button>
        <p className="text-xs text-slate-400">Tip: send part of the amount, then the rest — the reference fills up. Reuse a transaction id to make a duplicate.</p>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Try a scenario</p>
        <Button variant="outline" onClick={() => send("NO-MATCH-999")}>Send to unknown reference → unexpected</Button>
        <Button variant="outline" disabled={!lastTxId} onClick={sendDuplicate}>Resend last → duplicate (ignored)</Button>
        <p className="pt-1 text-xs text-slate-400">Last sent: {lastTxId ?? "—"}</p>
      </Card>
    </section>
  );
}
