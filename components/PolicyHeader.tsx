"use client";

import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { DEMO_NETWORKS, type DemoNetwork } from "@/services/demoNetworks";

export function PolicyHeader({ network, busy, status, onNetworkChange, onCheck }: {
  network: DemoNetwork;
  busy: boolean;
  status: "checking" | "online" | "offline";
  onNetworkChange: (network: DemoNetwork) => void;
  onCheck: () => void;
}) {
  const config = DEMO_NETWORKS[network];
  const oracle = {
    checking: { label: "Checking oracle", dot: "bg-subtle animate-pulse", text: "text-muted" },
    online: { label: "Policy oracle online", dot: "bg-success-dot", text: "text-ink" },
    offline: { label: "Policy oracle offline", dot: "bg-danger", text: "text-danger" },
  }[status];

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Wordmark newTab />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link href="/" target="_blank" rel="noopener noreferrer"
            title="Open the landing page in a new tab without losing your demo keys"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Back to home
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
          <button type="button" onClick={onCheck} disabled={busy || status === "checking"}
            title="Recheck the policy service profile and network"
            className={`inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium ${oracle.text}`}>
            <span className={`h-2 w-2 rounded-full ${oracle.dot}`} aria-hidden />{oracle.label}
          </button>
          <label className="flex items-center gap-2 rounded-lg bg-surface p-1 text-sm">
            <span className="sr-only">Demo network</span>
            <span className="relative">
              <select className="appearance-none rounded-md bg-brand py-1.5 pl-3 pr-9 text-sm font-medium text-white" value={network} disabled={busy}
                onChange={(event) => onNetworkChange(event.target.value as DemoNetwork)}>
                {Object.entries(DEMO_NETWORKS).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
              </select>
              <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </label>
          <details className="relative" onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface hover:text-brand focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
              Resources
              <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <nav aria-label="Demo resources" className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-line bg-white p-2 text-sm shadow-lg">
              {[
                { label: "Documentation", href: "/docs" },
                ...(config.faucet ? [{ label: `${config.label} faucet`, href: config.faucet }] : []),
                { label: "Explorer", href: config.explorer },
                { label: "GitHub", href: "https://github.com/BlockstreamResearch/simplicity-unchained" },
                { label: "About Simplicity", href: "https://simplicity-lang.org" },
              ].map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg px-3 py-2 text-muted hover:bg-surface hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">{label}</a>)}
            </nav>
          </details>
        </div>
      </div>
      <div className="sr-only">Compiler and service profile: {network === "testnet4" ? "bitcoin-policy-v1" : "liquid-policy-v1"}</div>
    </header>
  );
}
