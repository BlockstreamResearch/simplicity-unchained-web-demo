'use client';

import { FaucetIcon } from "./FaucetIcon";
import { useApp } from "@/contexts/AppContext";
import { DEMO_NETWORKS, type DemoNetwork } from "@/utils/demo";

const iconLink = "rounded-md p-2 text-muted transition-colors hover:bg-surface hover:text-brand";

export function Header() {
  const { state, setNetwork, serviceStatus, checkService } = useApp();
  const config = DEMO_NETWORKS[state.network];
  const changeNetwork = (network: DemoNetwork) => {
    if (state.network === network || state.operation) return;
    if (state.compiledAddress && !window.confirm("Switch networks? The displayed address will reset. Your demo key stays in this tab; switch back and prepare the same demo to recover its address.")) return;
    setNetwork(network);
  };
  const oracle = {
    checking: { label: "Checking oracle", dot: "bg-subtle animate-pulse", text: "text-muted" },
    online: { label: "Oracle online", dot: "bg-success-dot", text: "text-ink" },
    offline: { label: "Oracle offline", dot: "bg-danger", text: "text-danger" },
  }[serviceStatus];

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div>
            <p className="text-2xl font-black leading-none tracking-tight text-ink">UNCHAINED</p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.2em] text-ink">POWERED BY SIMPLICITY</p>
          </div>
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">Testnet</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <a href="https://simplicity-lang.org" target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1 text-sm text-ink hover:text-brand sm:inline-flex">
            About Simplicity
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M8 4H4v12h12v-4M11 4h5v5M16 4l-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>

          <button
            type="button"
            onClick={() => void checkService()}
            title={serviceStatus === "offline" ? "Start the Simplicity Unchained backend, then click to recheck." : "Simplicity Unchained oracle service"}
            className={`inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium ${oracle.text}`}
          >
            <span className={`h-2 w-2 rounded-full ${oracle.dot}`} aria-hidden />
            {oracle.label}
          </button>

          <div role="group" aria-label="Network" className="flex rounded-lg bg-surface p-1">
            {(Object.keys(DEMO_NETWORKS) as DemoNetwork[]).map((network) => (
              <button
                key={network}
                onClick={() => changeNetwork(network)}
                disabled={Boolean(state.operation)}
                aria-pressed={state.network === network}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  state.network === network ? "bg-brand text-white" : "text-muted hover:text-ink"
                }`}
              >
                {DEMO_NETWORKS[network].label}
              </button>
            ))}
          </div>

          <div className="flex items-center">
            <a href="mailto:ivan.lele@distributedlab.com" className={iconLink} title="Contact: ivan.lele@distributedlab.com">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </a>
            <a href={config.faucet} target="_blank" rel="noopener noreferrer" className={iconLink} title={`${config.label} faucet`}>
              <FaucetIcon className="h-5 w-5" />
            </a>
            <a href={config.explorer} target="_blank" rel="noopener noreferrer" className={iconLink} title={`${config.label} explorer`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </a>
            <a href="https://github.com/BlockstreamResearch/simplicity-unchained" target="_blank" rel="noopener noreferrer" className={iconLink} title="GitHub: BlockstreamResearch/simplicity-unchained">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
