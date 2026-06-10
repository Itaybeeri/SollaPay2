import React, { useState } from "react";
import { Building2, Send } from "lucide-react";
import { api } from "./api.js";
import { Card, Field, Button } from "./ui.js";

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
  async function sendUnknownReference() {
    const id = nextTxId(); setLastTxId(id);
    await api.sendWebhook(payload(id, "NO-MATCH-999")); // a reference with no deal -> Unexpected
  }
  async function sendDuplicate() {
    if (!lastTxId) return; // resend the previous transactionId
    await api.sendWebhook(payload(lastTxId, reference));
  }

  return (
    <section className="flex w-72 flex-shrink-0 flex-col gap-3 overflow-auto">
      <PanelHeader />

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">New transfer</p>
        <Field label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Field label="Amount (ILS)" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        <Field label="Sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
        <Button variant="sky" onClick={sendMatched}>
          <span className="inline-flex items-center justify-center gap-2"><Send size={15} /> Send transfer</span>
        </Button>
        <p className="text-xs text-slate-400">Tip: send part of the amount, then the rest — the reference fills up.</p>
      </Card>

      <Card className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Try a scenario</p>
        <Button variant="outline" onClick={sendUnknownReference}>Send to unknown reference → unexpected</Button>
        <Button variant="outline" disabled={!lastTxId} onClick={sendDuplicate}>Resend last → duplicate (ignored)</Button>
        <p className="pt-1 text-xs text-slate-400">Last transactionId: {lastTxId ?? "—"}</p>
      </Card>
    </section>
  );
}

function PanelHeader() {
  return (
    <div className="flex items-center gap-2 px-1">
      <Building2 size={16} className="text-sky-600" />
      <h2 className="text-sm font-semibold text-slate-700">Bank</h2>
    </div>
  );
}
