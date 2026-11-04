import type { ReactNode } from "react";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-brand-soft";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60";
export const panelClass = "rounded-2xl bg-surface p-4 sm:p-5";
export const cardClass = "rounded-xl bg-white p-4 sm:p-5";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const pillTones: Record<Tone, string> = {
  neutral: "bg-pill text-muted",
  brand: "bg-brand-tint text-brand",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
};

export function Pill({ tone = "neutral", children, pulse = false }: { tone?: Tone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pillTones[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`} aria-hidden />
      {children}
    </span>
  );
}

export function InfoIcon({ title }: { title: string }) {
  return (
    <span title={title} aria-label={title} className="inline-flex cursor-help text-subtle">
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v4.5M10 6.5v.01" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function KeyValue({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2.5 text-sm last:border-b-0">
      <dt className="flex items-center gap-1.5 text-ink">
        {label}
        {hint && <InfoIcon title={hint} />}
      </dt>
      <dd className="min-w-0 text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

export function Callout({ tone = "info", children }: { tone?: "info" | "danger" | "warning"; children: ReactNode }) {
  const tones = {
    info: "border-info text-info",
    danger: "border-danger bg-danger-tint text-danger",
    warning: "border-warning-dot bg-warning-tint text-warning",
  };
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
        <circle cx="10" cy="10" r="7.5" />
        <path d={tone === "info" ? "M10 9v4.5M10 6.5v.01" : "M10 6v5M10 13.5v.01"} strokeLinecap="round" />
      </svg>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs text-muted">{children}</p>;
}

export function shorten(value: string, head = 8, tail = 6) {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

export function formatSats(value: number) {
  return `${value.toLocaleString("en-US")} sats`;
}

export function openAdvanced() {
  const advanced = document.getElementById("advanced") as HTMLDetailsElement | null;
  if (!advanced) return;
  advanced.open = true;
  advanced.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function scrollToFunding() {
  document.getElementById("fund-heading")?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
