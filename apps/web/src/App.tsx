import React from "react";
import { BankPanel } from "./BankPanel.js";
import { SollaPayPanel } from "./SollaPayPanel.js";
import { LawyerPanel } from "./LawyerPanel.js";

export function App() {
  return (
    <div className="h-screen flex flex-col">
      <header className="p-3 bg-slate-800 text-white font-bold">SollaPay — Bank Event Ingest Demo</header>
      <main className="flex flex-1 overflow-hidden">
        <BankPanel />
        <SollaPayPanel />
        <LawyerPanel />
      </main>
    </div>
  );
}
