import React, { useState } from "react";
import { Scale, FilePlus2, Bell, Coins } from "lucide-react";
import { api } from "./api.js";
import { usePolling } from "./usePolling.js";
import { Card, Field, Button, RefChip, fmtAmount } from "./ui.js";

export function LawyerPanel() {
  const requests = usePolling(api.getPaymentRequests) ?? [];
  const notifications = usePolling(api.getNotifications) ?? [];

  const [name, setName] = useState("Apartment 4B");
  const [buyerName, setBuyerName] = useState("John Doe");
  const [reference, setReference] = useState("ABC123");
  const [amount, setAmount] = useState(70000);

  async function createRequest() {
    const deal = await api.createDeal({ name, buyerName });
    await api.createPaymentRequest({ dealId: deal.id, reference, expectedAmount: amount, currency: "ILS" });
  }

  return (
    <section className="flex w-80 flex-shrink-0 flex-col gap-3 overflow-auto">
      <div className="flex items-center gap-2 px-1">
        <Scale size={16} className="text-emerald-600" />
        <h2 className="text-sm font-semibold text-slate-700">Lawyer</h2>
      </div>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">New payment request</p>
        <Field label="Deal name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Buyer" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
        <Field label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Field label="Expected amount (ILS)" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        <Button variant="emerald" onClick={createRequest}>
          <span className="inline-flex items-center justify-center gap-2"><FilePlus2 size={15} /> Create request</span>
        </Button>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-slate-700">Payment requests ({requests.length})</p>
        {requests.length === 0 ? (
          <p className="text-xs text-slate-400">None yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <RefChip value={r.reference} />
                <span className="text-slate-600">{fmtAmount(r.expectedAmount)} {r.currency}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Bell size={14} /> Notifications ({notifications.length})
        </p>
        {notifications.length === 0 ? (
          <p className="text-xs text-slate-400">No funds received yet.</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 ring-1 ring-emerald-100">
                <Coins size={16} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm text-emerald-900">{n.message}</p>
                  <p className="text-[11px] text-emerald-600/70">{new Date(n.at).toLocaleTimeString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
