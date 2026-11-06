import Link from "next/link";
import { JetReference } from "@/components/JetReference";

export default function DocsPage() {
  return <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
    <header className="space-y-3">
      <Link href="/demo" className="text-sm text-brand hover:underline">Back to the demo</Link>
      <h1 className="text-3xl font-semibold tracking-tight">Simplicity policies, explained</h1>
      <p className="max-w-2xl text-sm text-muted">Your policy decides whether the oracle may add its signature. You still review and sign the exact transaction.</p>
    </header>
    <section className="grid gap-4 rounded-2xl bg-surface p-5 sm:grid-cols-3">
      <div><h2 className="font-semibold">1. Choose & prepare</h2><p className="mt-2 text-sm text-muted">Choose an example or edit it. Prepare creates a disposable key and verifies the policy address with the oracle.</p></div>
      <div><h2 className="font-semibold">2. Fund & review</h2><p className="mt-2 text-sm text-muted">Use testnet coins. The demo finds funding; review the recipient, amount and fee before approval.</p></div>
      <div><h2 className="font-semibold">3. Approve & send</h2><p className="mt-2 text-sm text-muted">Fresh approvals authorize only the transaction you reviewed. The oracle evaluates it; both signatures are verified before you broadcast.</p></div>
    </section>
    <section id="liquid" className="space-y-3">
      <h2 className="text-xl font-semibold">Liquid: confidential and multi-asset</h2>
      <p className="text-sm text-muted">Liquid uses a separate policy profile. Receiving keys stay local; SU verifies full parent transactions and exact-value / asset disclosure proofs before evaluating or signing every input.</p>
      <p className="text-sm text-muted">The guided flow returns each asset to a confidential recipient and pays one explicit L-BTC fee. Mixed explicit/confidential commitments require a PSET with external valid disclosure proofs. Issuance, peg-ins and unsupported PSET shapes are rejected, not silently converted.</p>
      <p className="text-sm text-muted">Scalar budgets select the current input asset; fees always use the network asset. Use asset-selector jets for independent budgets. Output counts include the fee output.</p>
    </section>
    <section id="custom-jets" className="scroll-mt-4 space-y-3">
      <h2 className="text-xl font-semibold">Custom jet extensions</h2>
      <Link href="/docs/extensions" className="inline-block text-sm text-brand underline">Read the jet extension developer guide</Link>
    </section>
    <JetReference />
  </main>;
}
