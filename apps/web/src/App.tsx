import React, { useState } from "react";
import { Landmark, LayoutGrid, FileQuestion } from "lucide-react";
import { BankPanel } from "./BankPanel.js";
import { SollaPayPanel } from "./SollaPayPanel.js";
import { LawyerPanel } from "./LawyerPanel.js";
import { QandA } from "./QandA.js";

type Tab = "console" | "qa";

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: typeof LayoutGrid; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("console");

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
        <nav className="ml-auto flex gap-1">
          <TabButton active={tab === "console"} onClick={() => setTab("console")} icon={LayoutGrid}>Console</TabButton>
          <TabButton active={tab === "qa"} onClick={() => setTab("qa")} icon={FileQuestion}>Design Q&amp;A</TabButton>
        </nav>
      </header>

      {tab === "console" ? (
        <main className="flex flex-1 gap-4 overflow-hidden p-4">
          <BankPanel />
          <SollaPayPanel />
          <LawyerPanel />
        </main>
      ) : (
        <main className="flex-1 overflow-auto">
          <QandA />
        </main>
      )}
    </div>
  );
}
