"use client";

import { useState } from "react";
import { highlight } from "@/components/HighlightedCode";
import {
  VAULT_COIN_SATS, VAULT_MIN_BLOCKS_TO_DRAIN, VAULT_MIN_WITHDRAWALS_TO_DRAIN, VAULT_POLICY_SOURCE, VAULT_SCENARIOS, VAULT_WAIT_BLOCKS,
  evaluateVaultScenario, type VaultRule,
} from "@/services/vaultExample";

const sats = new Intl.NumberFormat("en-US");
const rules: VaultRule[] = [1, 2, 3, 4];
const ruleLabels: Record<VaultRule, string> = {
  1: "At most 50,000 sats leave",
  2: "At most one change coin",
  3: "Coin waited 144 blocks",
  4: "Your approval",
};

// Tag each source line with the numbered rule comment it belongs to.
const policyLines = (() => {
  let rule: VaultRule | undefined;
  return VAULT_POLICY_SOURCE.split("\n").map((text) => {
    const marker = /^\s*\/\/ ([1-4])\./.exec(text);
    if (marker) rule = Number(marker[1]) as VaultRule;
    else if (!text.trim() || text === "}") rule = undefined;
    return { text, rule };
  });
})();

const comparison: [string, boolean][] = [
  ["Who signed", true],
  ["How long the coin waited", true],
  ["How much leaves the vault", false],
  ["Where the change goes", false],
];

function Mark({ ok, className = "" }: { ok: boolean; className?: string }) {
  return <span className={`inline-flex shrink-0 ${ok ? "text-success" : "text-danger"} ${className}`}>
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={ok ? "m5 12.5 4.5 4.5L19 7.5" : "M7 7l10 10M17 7 7 17"} />
    </svg>
    <span className="sr-only">{ok ? "Yes" : "No"}</span>
  </span>;
}

export function VaultExample() {
  const [selected, setSelected] = useState(VAULT_SCENARIOS[0].id);
  const scenario = VAULT_SCENARIOS.find(({ id }) => id === selected) ?? VAULT_SCENARIOS[0];
  const result = evaluateVaultScenario(scenario);
  const failed = new Set(result.failed);
  const ruleDetails: Record<VaultRule, string> = {
    1: `${sats.format(result.debit)} sats leave the vault`,
    2: `${result.vaultOutputCount} ${result.vaultOutputCount === 1 ? "output returns" : "outputs return"} to the vault`,
    3: `${scenario.lockBlocks}-block relative lock`,
    4: "Signed for this exact transaction",
  };

  return <section id="beyond-script" aria-labelledby="beyond-script-heading" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-16 sm:px-6 sm:py-24">
    <div className="max-w-2xl space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Beyond Bitcoin Script</p>
      <h2 id="beyond-script-heading" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">A vault Bitcoin Script can&apos;t write.</h2>
      <p className="text-base leading-relaxed text-muted">Bitcoin Script checks who signed and when. It can&apos;t see how much a transaction spends or where the coins go. A Simplicity policy reads the whole transaction, so it can cap every withdrawal and keep the change locked in the vault.</p>
    </div>

    <div className="mt-10 grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <figure className="overflow-hidden rounded-2xl bg-code">
          <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3 text-xs">
            <span className="font-mono text-white/60">vault.simf</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-medium text-white/80">SimplicityHL</span>
          </figcaption>
          <pre tabIndex={0} aria-label="Rate-limited vault policy" className="overflow-x-auto py-4 text-xs leading-6 text-white/85 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-soft">
            <code className="block w-max min-w-full">
              {policyLines.map(({ text, rule }, index) => <span key={index} data-rule={rule}
                className={`block border-l-2 px-5 transition-colors ${!rule ? "border-transparent" : failed.has(rule) ? "border-danger bg-danger/25" : "border-success-dot/40"}`}>
                {text ? highlight(text, "simplicityhl") : " "}
              </span>)}
            </code>
          </pre>
        </figure>

        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">What Bitcoin Script and a Simplicity policy can check</caption>
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Can it check</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">Bitcoin Script</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">Simplicity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {comparison.map(([label, script]) => <tr key={label}>
                <th scope="row" className="px-4 py-3 font-normal">{label}</th>
                <td className="px-4 py-3 text-center"><Mark ok={script} /></td>
                <td className="px-4 py-3 text-center"><Mark ok /></td>
              </tr>)}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">Bitcoin Script has no opcodes that read a transaction&apos;s amounts or outputs. Adding them would take a covenant soft fork.</p>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-line bg-white">
        <div className="border-b border-line p-5 sm:p-6">
          <h3 className="text-lg font-semibold">Try to break it</h3>
          <p className="mt-1 text-sm text-muted">Each transaction spends one {sats.format(VAULT_COIN_SATS)}-sat vault coin.</p>
          <div role="group" aria-label="Vault transactions" className="mt-4 flex flex-wrap gap-2">
            {VAULT_SCENARIOS.map((option) => {
              const active = option.id === scenario.id;
              return <button key={option.id} type="button" aria-pressed={active} onClick={() => setSelected(option.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active ? "border-brand bg-brand text-white" : "border-line bg-white hover:border-brand hover:text-brand"}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${evaluateVaultScenario(option).accepted ? "bg-success-dot" : "bg-danger"}`} />
                {option.tab}
              </button>;
            })}
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <p className="font-medium">{scenario.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{scenario.text}</p>
          </div>

          <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,0.85fr)_auto_minmax(0,1.15fr)]">
            <div className="rounded-xl border border-brand/20 bg-brand-tint p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Input · sats</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm sm:block">
                <p className="font-medium">Vault coin</p>
                <p className="font-mono">{sats.format(VAULT_COIN_SATS)}</p>
              </div>
              <p className={`mt-2 text-xs ${failed.has(3) ? "font-medium text-danger" : "text-muted"}`}>{scenario.lockBlocks}-block lock</p>
            </div>
            <svg aria-hidden="true" className="mx-auto h-4 w-4 rotate-90 text-muted sm:rotate-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Outputs · sats</p>
              <ul className="space-y-1.5 text-sm">
                {scenario.outputs.map((output, index) => <li key={index}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${output.to === "vault" ? "border-brand/20 bg-brand-tint" : output.to === "elsewhere" ? "border-danger/30 bg-danger-tint" : "border-line"}`}>
                  <span>{output.label}</span><span className="font-mono">{sats.format(output.sats)}</span>
                </li>)}
                <li className="flex items-center justify-between gap-3 px-3 text-xs text-muted"><span>Fee</span><span className="font-mono">{sats.format(result.fee)}</span></li>
              </ul>
            </div>
          </div>

          <ol aria-label="Policy rules" className="divide-y divide-line rounded-xl border border-line text-sm">
            {rules.map((rule) => <li key={rule} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-3 font-mono text-xs text-muted">{rule}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{ruleLabels[rule]}</span>
                <span className={`block text-xs ${failed.has(rule) ? "font-medium text-danger" : "text-muted"}`}>{ruleDetails[rule]}</span>
              </span>
              <Mark ok={!failed.has(rule)} />
            </li>)}
          </ol>

          <p role="status" className={`flex items-start gap-2.5 rounded-xl border-l-4 px-4 py-3 text-sm leading-relaxed ${result.accepted ? "border-success bg-success-tint" : "border-danger bg-danger-tint"}`}>
            <Mark ok={result.accepted} className="mt-0.5" />
            <span>{result.accepted
              ? <><strong className="font-semibold">Co-signed.</strong> {sats.format(result.debit)} sats leave; {sats.format(VAULT_COIN_SATS - result.debit)} stay in the vault.</>
              : <><strong className="font-semibold">Refused by rule {result.failed.join(" and ")}.</strong> The co-signer won&apos;t sign, so the coins stay in the vault.</>}</span>
          </p>
        </div>
      </div>
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-3">
      {[
        ["Slow to drain", `With one vault coin, draining ${sats.format(VAULT_COIN_SATS)} sats takes at least ${VAULT_MIN_WITHDRAWALS_TO_DRAIN} withdrawals across ${sats.format(VAULT_MIN_BLOCKS_TO_DRAIN)} blocks. That's about ${VAULT_MIN_BLOCKS_TO_DRAIN / VAULT_WAIT_BLOCKS} days to spot a leaked key.`],
        ["Who enforces what", `The SU co-signer runs this policy before it signs. Bitcoin sees a standard 2-of-2 Tapscript spend and enforces the ${VAULT_WAIT_BLOCKS}-block lock the policy demands.`],
        ["Know the exits", "The recovery leaf bypasses the policy, so lock it to a separate cold key. Separate deposits each get their own allowance until merged."],
      ].map(([title, text]) => <div key={title} className="rounded-xl bg-surface p-5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
      </div>)}
    </div>
  </section>;
}
