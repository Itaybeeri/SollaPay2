import React, { useState } from "react";
import { api } from "./api.js";
import { usePolling } from "./usePolling.js";

export function LawyerPanel() {
  const deals = usePolling(api.getDeals) ?? [];
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
    <section className="flex-1 p-4 bg-emerald-50 overflow-auto">
      <h2 className="font-bold text-emerald-800 mb-2">Lawyer</h2>

      <div className="space-y-2 bg-white p-3 rounded shadow-sm">
        <input className="border p-1 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deal name" />
        <input className="border p-1 w-full" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Buyer" />
        <input className="border p-1 w-full" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" />
        <input className="border p-1 w-full" type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} placeholder="Amount" />
        <button className="bg-emerald-600 text-white px-3 py-1 rounded w-full" onClick={createRequest}>
          Create deal + payment request
        </button>
      </div>

      <h3 className="font-semibold mt-4">Payment requests ({requests.length})</h3>
      <ul className="text-sm">
        {requests.map((r) => <li key={r.id}>ref <b>{r.reference}</b> · {r.expectedAmount} {r.currency}</li>)}
      </ul>

      <h3 className="font-semibold mt-4">Notifications ({notifications.length})</h3>
      <ul className="text-sm space-y-1">
        {notifications.map((n) => (
          <li key={n.id} className="bg-emerald-100 p-2 rounded">💰 {n.message}</li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-2">Deals: {deals.length}</p>
    </section>
  );
}
