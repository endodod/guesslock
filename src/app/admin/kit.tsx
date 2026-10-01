// Small presentational pieces shared by admin pages (server-safe, no hooks).
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, hint, children, className = "" }: { title?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-neutral-200 bg-white p-5 ${className}`}>
      {(title || hint) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-[0.95rem] font-semibold">{title}</h2>}
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  green: "bg-green-50 text-green-700 ring-green-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/25",
  slate: "bg-neutral-100 text-neutral-600 ring-neutral-400/30",
  indigo: "bg-blue-50 text-blue-700 ring-blue-600/20",
} as const;

export function Pill({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "green" | "red" | "amber" }) {
  const bar = tone === "green" ? "bg-green-600" : tone === "red" ? "bg-red-600" : tone === "amber" ? "bg-amber-600" : "bg-neutral-300";
  return (
    <div className="relative overflow-hidden rounded border border-neutral-200 bg-white p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
