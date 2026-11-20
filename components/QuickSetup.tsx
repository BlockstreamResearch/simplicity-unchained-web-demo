import { HighlightedCode } from "@/components/HighlightedCode";

const image = "ghcr.io/blockstreamresearch/simplicity-unchained:v0.1.0-alpha.0";

export const pullCommand = `docker pull --platform linux/amd64 ${image}`;

export const setupCommand = `docker run --rm --platform linux/amd64 \\
  --publish 127.0.0.1:30431:30431 \\
  --mount type=bind,src="$PWD/config.toml",dst=/app/config.toml,readonly \\
  ${image} \\
  start --config /app/config.toml`;

export const exampleConfig = `[service]
port = 30431
# Unique 32-byte secp256k1 key, 64 hex characters
private_key = "<64-hex-private-key>"

# Bitcoin Testnet4
bitcoin_network = "testnet4"
liquid_network = "liquidtestnet"

# Bitcoin mainnet (real funds)
# bitcoin_network = "bitcoin"
# liquid_network = "liquid"`;

export function QuickSetup() {
  return <section id="quick-setup" aria-labelledby="quick-setup-heading" className="scroll-mt-6 border-y border-line bg-surface">
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Self-host the co-signer</p>
          <h2 id="quick-setup-heading" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Quick SU setup</h2>
          <p className="text-sm text-muted">Run your own policy co-signer with Docker. Bitcoin Testnet4 &amp; Liquid Testnet.</p>
        </div>
        <a href="https://github.com/BlockstreamResearch/simplicity-unchained/releases/tag/v0.1.0-alpha.0" target="_blank" rel="noopener noreferrer"
          className="rounded-full border border-line bg-white px-3 py-1.5 font-mono text-xs text-brand hover:border-brand">v0.1.0-alpha.0</a>
      </div>
      <details className="group mt-6 rounded-xl border border-line bg-white">
        <summary className="cursor-pointer rounded-xl px-5 py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Docker commands</summary>
        <div className="min-w-0 space-y-4 border-t border-line p-5">
          <p className="text-sm leading-relaxed text-muted">Pull the image (optional; Docker pulls it automatically if missing):</p>
          <pre tabIndex={0} aria-label="Docker pull command" className="min-w-0 overflow-x-auto rounded-xl bg-code p-4 text-xs leading-6 text-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><HighlightedCode code={pullCommand} language="docker" /></pre>
          <p className="text-sm leading-relaxed text-muted">Prepare your own <code>config.toml</code>, readable by container UID <code>1000</code>, and run from its directory:</p>
          <pre tabIndex={0} aria-label="Docker run command" className="min-w-0 overflow-x-auto rounded-xl bg-code p-4 text-xs leading-6 text-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><HighlightedCode code={setupCommand} language="docker" /></pre>
          <p className="text-sm leading-relaxed text-muted">Example <code>config.toml</code>:</p>
          <pre tabIndex={0} aria-label="Example config.toml" className="min-w-0 overflow-x-auto rounded-xl bg-code p-4 text-xs leading-6 text-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><HighlightedCode code={exampleConfig} language="toml" /></pre>
          <p className="text-sm leading-relaxed text-muted">Requires Docker with <code>linux/amd64</code> support (ARM hosts need emulation). The demo uses testnets.</p>
        </div>
      </details>
      <a href="https://github.com/BlockstreamResearch/simplicity-unchained#run-your-own-su-service" target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex text-sm font-medium text-brand hover:underline">Full setup guide &rarr;</a>
    </div>
  </section>;
}
