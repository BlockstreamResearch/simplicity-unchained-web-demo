# Simplicity Unchained Web Demo

The policy web interface for Simplicity Unchained. **Bitcoin Testnet4** with
`bitcoin-policy-v1` is selected by default; **Liquid Testnet** uses the separate
confidential, multi-asset `liquid-policy-v1` profile. These are the only demo networks.

> [!WARNING]
> Experimental off-chain policy extensions, not Bitcoin or Liquid consensus rules. Use only
> disposable testnet keys and coins. Keys are kept in the current tab, not saved;
> losing them can lose access to funded outputs. Recovery can bypass the policy.

## Run locally or on your LAN

Requires Node.js 20.9+, pnpm, Rust and wasm-pack.

```bash
pnpm install --frozen-lockfile
pnpm build:wasm
NEXT_PUBLIC_SIMPLICITY_SERVICE_URL=http://127.0.0.1:30431 pnpm dev
```
