import React from "react";
import { Landmark } from "lucide-react";
import { BankPanel } from "./BankPanel.js";
import { SollaPayPanel } from "./SollaPayPanel.js";
import { LawyerPanel } from "./LawyerPanel.js";

export function App() {
  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-800">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
          <Landmark size={18} />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">SollaPay</h1>
          <p className="text-xs text-slate-400">Escrow money-in console</p>
        </div>
      </header>

      <main className="flex flex-1 gap-4 overflow-hidden p-4">
        <BankPanel />
        <SollaPayPanel />
        <LawyerPanel />
      </main>
    </div>
  );
}
