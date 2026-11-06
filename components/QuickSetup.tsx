export const setupCommands = {
  provision: `IMAGE=ghcr.io/blockstreamresearch/simplicity-unchained:v0.1.0-alpha.0
docker pull --platform linux/amd64 "$IMAGE"
docker volume create su-config

docker run --rm --platform linux/amd64 --user 0:0 \\
  --entrypoint /bin/sh \\
  --mount type=volume,src=su-config,dst=/config \\
  "$IMAGE" -euc '
    set -C
    umask 077
    if [ -e /config/config.toml ]; then
      echo "Configuration exists; reuse it." >&2
      exit 1
    fi
    key=$(od -vAn -N32 -tx1 /dev/urandom | tr -d " \\n")
    [ "\${#key}" -eq 64 ]
    printf "%s\\n" \\
      "[service]" \\
      "port = 30431" \\
      "private_key = \\"$key\\"" \\
      "bitcoin_network = \\"testnet4\\"" \\
      "liquid_network = \\"liquidtestnet\\"" \\
      > /config/config.toml
    chown 1000:1000 /config/config.toml
  '`,
  run: `docker run -d --name simplicity-unchained \\
  --platform linux/amd64 \\
  --restart unless-stopped \\
  --publish 127.0.0.1:30431:30431 \\
  --mount type=volume,src=su-config,dst=/app/config,readonly \\
  "$IMAGE" start --config /app/config/config.toml`,
  verify: `curl -fsS http://127.0.0.1:30431/simplicity-unchained/version
curl -fsS http://127.0.0.1:30431/simplicity-unchained/policy/bitcoin/capabilities
curl -fsS http://127.0.0.1:30431/simplicity-unchained/policy/liquid/capabilities`,
};

const steps = [
  {
    title: "Provision once",
    description: "Generate a private signing key in a persistent volume. Existing configs are never overwritten.",
    code: setupCommands.provision,
  },
  {
    title: "Start the co-signer",
    description: "In the same shell, start the service with a read-only config and a localhost-only API.",
    code: setupCommands.run,
  },
  {
    title: "Verify the API",
    description: "Check both networks. Pin base_public_key_hex in your client before funding.",
    code: setupCommands.verify,
  },
];

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
        <summary className="cursor-pointer rounded-xl px-5 py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Docker setup commands <span className="ml-2 font-normal text-muted">Provision, run, verify</span></summary>
        <div className="space-y-6 border-t border-line p-5">
          <p className="text-sm leading-relaxed text-muted">Requires Docker, a POSIX shell and curl. Image: <code>linux/amd64</code> (ARM hosts need emulation). Testnet keys and coins only; not a Bitcoin or Liquid full node.</p>
          <ol className="space-y-6">
            {steps.map((step, index) => <li key={step.title} className="grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold"><span className="mr-2 font-mono text-xs text-brand">0{index + 1}</span>{step.title}</h3>
                <p className="break-words text-sm leading-relaxed text-muted">{step.description}</p>
              </div>
              <pre tabIndex={0} aria-label={`${step.title} commands`} className="min-w-0 overflow-x-auto rounded-xl bg-code p-4 text-xs leading-6 text-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><code>{step.code}</code></pre>
            </li>)}
          </ol>
          <p className="text-sm leading-relaxed text-muted">Back up the config in <code>su-config</code>. Inspect startup with <code>docker logs simplicity-unchained</code>; stop / resume with <code>docker stop simplicity-unchained</code> / <code>docker start simplicity-unchained</code>. Use an HTTPS reverse proxy for remote clients.</p>
        </div>
      </details>
      <p className="mt-4 text-xs text-muted">Already running SU? Keep your existing signing key.</p>
      <a href="https://github.com/BlockstreamResearch/simplicity-unchained#run-your-own-su-service" target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex text-sm font-medium text-brand hover:underline">Full setup guide &rarr;</a>
    </div>
  </section>;
}
