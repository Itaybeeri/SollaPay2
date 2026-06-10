import React from "react";
import { CheckCircle2, ArrowDownCircle, ArrowUpCircle, HelpCircle, type LucideIcon } from "lucide-react";

// Small, shared presentational building blocks so the panels stay readable.

export type Status = "Matched" | "Short" | "Overpaid" | "Unexpected";

const statusStyle: Record<Status, { cls: string; Icon: LucideIcon }> = {
  Matched:    { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  Short:      { cls: "bg-amber-50 text-amber-700 ring-amber-200",       Icon: ArrowDownCircle },
  Overpaid:   { cls: "bg-violet-50 text-violet-700 ring-violet-200",    Icon: ArrowUpCircle },
  Unexpected: { cls: "bg-rose-50 text-rose-700 ring-rose-200",          Icon: HelpCircle },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const { cls, Icon } = statusStyle[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      <Icon size={13} /> {label ?? status}
    </span>
  );
}

export function Field(
  { label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      />
    </label>
  );
}

type ButtonVariant = "primary" | "sky" | "emerald" | "outline";

const buttonVariant: Record<ButtonVariant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  sky:     "bg-sky-600 text-white hover:bg-sky-700",
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
  outline: "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
};

export function Button(
  { variant = "primary", className = "", ...props }:
    { variant?: ButtonVariant } & React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      {...props}
      className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariant[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// A reference code rendered as a monospace chip.
export function RefChip({ value }: { value: string }) {
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{value}</span>
  );
}

const amountFmt = new Intl.NumberFormat("en-US");
export const fmtAmount = (n: number): string => amountFmt.format(n);
