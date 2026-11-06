import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { buttonPrimary } from "@/components/ui";

const repository = "https://github.com/BlockstreamResearch/simplicity-unchained";
const sectionLabel = "text-xs font-semibold uppercase tracking-[0.18em] text-muted";
const heading = "text-3xl font-semibold leading-tight tracking-tight sm:text-4xl";
const primary = `${buttonPrimary} px-6 py-3 text-base`;

function Arrow() {
  return <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>;
}

function PolicyPreview() {
  return <figure className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-5">
    <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
      <span className="text-xs font-medium text-muted">A policy, before a signature</span>
      <span className="text-[10px] uppercase tracking-widest text-muted">Illustrative example</span>
    </figcaption>
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="text-sm font-medium">Approved spend</span>
        <span className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand">SimplicityHL</span>
      </div>
      <div className="bg-code p-5 font-mono text-[11px] leading-7 text-white/80 sm:text-xs">
        <p><span className="text-brand-soft">fn</span> main() {"{"}</p>
        <div className="border-l border-white/10 pl-4">
          <p className="text-white/40">{"// Cap fees. Require fresh approval."}</p>
          <p className="break-words">assert!(jet::le_64(jet::tx_fee(), <span className="text-success-dot">1000</span>));</p>
          <p>jet::bip_0340_verify(</p>
          <p className="break-words pl-4">(jet::cooperative_user_pubkey(),</p>
          <p className="break-words pl-4"> jet::policy_transaction_approval_hash()),</p>
          <p className="pl-4 text-brand-soft">witness::APPROVAL</p>
          <p>);</p>
        </div>
        <p>{"}"}</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line text-sm">
        <div className="p-5"><p className="text-xs text-muted">Fee rule</p><p className="mt-2 font-medium">Up to 1,000 sats</p></div>
        <div className="p-5"><p className="text-xs text-muted">Approval rule</p><p className="mt-2 font-medium">This transaction only</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4 text-xs">
        <span className="text-muted">Your approval</span><Arrow /><span className="font-medium text-brand">Policy evaluation</span><Arrow /><span className="text-muted">Co-sign</span>
      </div>
    </div>
  </figure>;
}

export default function LandingPage() {
  return <div className="min-h-screen bg-white text-ink">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-7 sm:px-6 sm:py-10">
      <Wordmark large />
      <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5 text-sm sm:gap-7">
        <a href="https://simplicity-lang.org" target="_blank" rel="noopener noreferrer" className="hover:text-brand">About Simplicity</a>
        <Link href="/docs" className="hover:text-brand">Docs</Link>
        <Link href="/demo" className={buttonPrimary}>Open demo <Arrow /></Link>
      </nav>
    </header>
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="space-y-7">
          <p className={sectionLabel}>Simplicity Unchained</p>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-[3.5rem]">
            Your rules.<br />Verified before<br /><span className="text-brand">every signature.</span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted sm:text-lg">Turn spending conditions into executable Simplicity policies. Review a transaction, approve it and let the oracle evaluate your rules before it co-signs.</p>
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/demo" className={primary}>Try it on testnet <Arrow /></Link>
            <a href={repository} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium hover:text-brand">Explore the code <Arrow /></a>
          </div>
          <p className="text-xs text-muted">Bitcoin Testnet4 &amp; Liquid Testnet. Open source. Experimental.</p>
        </div>
        <PolicyPreview />
      </section>

      <section id="policies" className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl space-y-4">
            <p className={sectionLabel}>Why Simplicity Unchained</p>
            <h2 className={heading}>Make the conditions explicit.</h2>
            <p className="text-base leading-relaxed text-muted">A policy describes when the oracle may sign. The browser and service independently verify the transaction context, so your approval is tied to the exact spend.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Rules you can inspect", "Define fee limits, spending caps, recipients or time locks in readable SimplicityHL. Compile the same policy in your browser and in SU."],
              ["02", "Approval for this spend", "Fresh approvals bind the transaction and signing context. Change the transaction and it needs a new approval."],
              ["03", "Evidence before signing", "Verify full parent transactions before evaluation. On Liquid, asset and amount disclosure proofs are checked too."],
            ].map(([number, title, text]) => <div key={number} className="rounded-xl border border-line bg-white p-6">
              <span className="font-mono text-xs text-brand">{number}</span>
              <h3 className="mt-6 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
            </div>)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="space-y-4 text-center"><p className={sectionLabel}>From policy to transaction</p><h2 className={heading}>Try a complete spend in three steps.</h2></div>
        <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-12">
          {[
            ["Choose & prepare", "Start with an example or write your own policy. Compile it and derive the matching testnet address."],
            ["Fund & review", "Fund the address with testnet coins. The demo finds funding and prepares the transaction for your review."],
            ["Approve & co-sign", "Approve the exact spend. Evaluate the policy, verify both signatures and finalize, then choose when to broadcast."],
          ].map(([title, text], index) => <li key={title} className="space-y-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand">{index + 1}</span>
            <h3 className="text-lg font-semibold">{title}</h3><p className="text-sm leading-relaxed text-muted">{text}</p>
          </li>)}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="mb-9 max-w-2xl space-y-4"><p className={sectionLabel}>Two networks. One workflow.</p><h2 className={heading}>Bitcoin and Liquid,<br />with their own policy profiles.</h2></div>
        <div className="grid gap-5 md:grid-cols-2">
          {[
            { name: "Bitcoin Testnet4", label: "Default demo network", jets: "55", text: "Explore Bitcoin fee rules, debit limits, approval scopes and time locks with verified parent evidence.", href: "/docs?network=testnet4#jet-reference" },
            { name: "Liquid Testnet", label: "Confidential & multi-asset", jets: "66", text: "Review each asset independently. Verified disclosure proofs bind confidential amounts and assets to the signing context.", href: "/docs?network=liquidtestnet#jet-reference" },
          ].map((network) => <div key={network.name} className="rounded-2xl border border-line p-6 sm:p-8">
            <p className="text-xs font-medium text-brand">{network.label}</p><h3 className="mt-3 text-2xl font-semibold tracking-tight">{network.name}</h3>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{network.text}</p>
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
              <span className="text-sm text-muted"><strong className="font-semibold text-ink">{network.jets}</strong> policy jets</span>
              <Link href={network.href} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">Explore the jets <Arrow /></Link>
            </div>
          </div>)}
        </div>
      </section>

      <section id="extensions" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="grid gap-6 border-t border-line pt-10 md:grid-cols-2 md:gap-12">
          <div className="space-y-4"><p className={sectionLabel}>Extend Simplicity Unchained</p><h2 className={heading}>Your own logic.<br />Your own jets.</h2></div>
          <div className="space-y-5">
            <p className="text-base leading-relaxed text-muted">Need a function beyond the built-in jet set? Write an extension with your own jets, define their types and execution costs, and register them with the native SU host.</p>
            <p className="text-sm leading-relaxed text-muted">Custom extensions require a matching host and compiler integration. The web demo uses fixed, versioned policy profiles; it does not load native plugins.</p>
            <Link href="/docs/extensions" className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">Learn about jet extensions <Arrow /></Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="flex flex-col items-start justify-between gap-8 rounded-2xl bg-brand-tint p-7 sm:p-12 lg:flex-row lg:items-center">
          <div className="max-w-xl space-y-4"><p className={sectionLabel}>Start with an example</p><h2 className={heading}>Write a rule. See it run.</h2><p className="text-sm leading-relaxed text-muted">33 examples, an in-browser editor and a searchable jet reference. No wallet connection required. Use disposable keys and testnet assets.</p></div>
          <Link href="/demo" className={`${primary} shrink-0`}>Open demo <Arrow /></Link>
        </div>
      </section>
    </main>
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Wordmark />
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-6 text-sm text-muted">
          <Link href="/docs" className="hover:text-brand">Documentation</Link>
          <a href={repository} target="_blank" rel="noopener noreferrer" className="hover:text-brand">GitHub</a>
          <a href="https://simplicity-lang.org" target="_blank" rel="noopener noreferrer" className="hover:text-brand">Simplicity</a>
        </nav>
        <p className="text-xs text-muted">An open-source policy experiment.</p>
      </div>
    </footer>
  </div>;
}
