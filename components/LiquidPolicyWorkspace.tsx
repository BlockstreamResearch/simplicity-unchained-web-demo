"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { liquidPolicyApi } from "@/services/liquidPolicyApi";
import { approveAndCosignLiquid, assertLiquidRegistry, findLiquidFunding, prepareLiquidAddress, prepareLiquidPset, prepareLiquidSpend } from "@/services/liquidPolicyFlow";
import { policyPublicKey } from "@/services/policyFlow";
import { LIQUID_PROFILE, type LiquidAddress, type LiquidDraft, type LiquidFinalized, type LiquidFunding, type LiquidPrepared } from "@/services/liquidPolicyTypes";
import { LIQUID_POLICY_EXAMPLES } from "@/services/liquidPolicyExamples";
import { DEMO_NETWORKS, LIQUID_TESTNET_ASSET, type DemoNetwork } from "@/services/demoNetworks";
import { recoveryScriptForKey } from "@/utils/recoveryScript";
import { CodeEditor } from "./CodeEditor";
import { PolicyHeader } from "./PolicyHeader";
import { buttonPrimary, buttonSecondary, Callout, inputClass, panelClass, Pill } from "./ui";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5"><span className="block text-xs font-medium text-ink">{label}</span>{children}</label>;
}
const assetName = (asset: string) => asset === LIQUID_TESTNET_ASSET ? "L-BTC" : `${asset.slice(0, 8)}…${asset.slice(-8)}`;
const outputId = (output: LiquidFunding) => `${output.txid}:${output.vout}`;

export function LiquidPolicyWorkspace({ onNetworkChange }: { onNetworkChange: (network: DemoNetwork) => void }) {
  const [exampleId, setExampleId] = useState("approved-spend");
  const selectedExample = LIQUID_POLICY_EXAMPLES.find((example) => example.id === exampleId);
  const [draft, setDraft] = useState<LiquidDraft>({ source: LIQUID_POLICY_EXAMPLES[0].source, userSecretKey: "", recoveryScript: "",
    blindingSecretKey: "", blindingPublicKey: "", scope: "transaction", extraWitnessJson: "{}" });
  const [address, setAddress] = useState<LiquidAddress>();
  const [transaction, setTransaction] = useState<LiquidPrepared>();
  const [finalized, setFinalized] = useState<LiquidFinalized>();
  const [broadcast, setBroadcast] = useState("");
  const [recipient, setRecipient] = useState("");
  const [fee, setFee] = useState("1000");
  const [sequence, setSequence] = useState("4294967293");
  const [lockTime, setLockTime] = useState("0");
  const [pset, setPset] = useState("");
  const [funding, setFunding] = useState<LiquidFunding[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [fundingError, setFundingError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [serviceStatus, setServiceStatus] = useState<"checking" | "online" | "offline">("checking");
  const [serviceError, setServiceError] = useState("");
  const [jetNames, setJetNames] = useState<string[]>([]);
  const revision = useRef(0);
  const serviceRevision = useRef(0);
  const context = transaction?.contexts[0];
  const selectedFunding = funding.filter((input) => selected.includes(outputId(input)));

  function invalidate(contract = false) {
    revision.current++;
    setTransaction(undefined);
    setFinalized(undefined);
    setBroadcast("");
    setReviewed(false);
    setError("");
    if (contract) { setAddress(undefined); setFunding([]); setSelected([]); setFundingError(""); }
  }
  function changeContract(patch: Partial<LiquidDraft>) { invalidate(true); setDraft((current) => ({ ...current, ...patch })); }
  async function run(label: string, operation: (assertCurrent: () => void) => Promise<void>) {
    if (busy) return;
    const token = revision.current;
    const assertCurrent = () => { if (token !== revision.current) throw new Error("Inputs changed; prepare fresh Liquid evidence and approval."); };
    setBusy(label); setError("");
    try { await operation(assertCurrent); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(""); }
  }
  const checkService = useCallback(async () => {
    const token = ++serviceRevision.current;
    setServiceStatus("checking"); setServiceError("");
    try {
      const registry = await liquidPolicyApi.registry();
      if (token !== serviceRevision.current) return;
      setJetNames(registry.manifest.jets.map((jet) => jet.name));
      const capabilities = await liquidPolicyApi.capabilities();
      assertLiquidRegistry(registry, capabilities);
      if (token !== serviceRevision.current) return;
      setServiceStatus("online");
    } catch (failure) {
      if (token !== serviceRevision.current) return;
      setServiceStatus("offline"); setServiceError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);
  useEffect(() => { const checks = serviceRevision; void checkService(); return () => { checks.current++; }; }, [checkService]);
  useEffect(() => {
    if (!address || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (!address) return;
      try {
        const found = await findLiquidFunding(address, draft.blindingSecretKey, controller.signal, liquidPolicyApi);
        if (controller.signal.aborted) return;
        setFunding(found); setFundingError("");
      } catch (failure) {
        if (controller.signal.aborted) return;
        setFundingError(failure instanceof Error ? failure.message : String(failure));
      }
      timer = setTimeout(() => void check(), 20_000);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [address, busy, draft.blindingSecretKey, refresh]);

  async function generateDraft() {
    const secret = Buffer.from(secp256k1.utils.randomSecretKey()).toString("hex");
    const blinding = await liquidPolicyApi.generateBlindingKey();
    return { ...draft, userSecretKey: secret, recoveryScript: recoveryScriptForKey(policyPublicKey(secret)),
      blindingSecretKey: blinding.blinding_secret_key_hex, blindingPublicKey: blinding.blinding_public_key_hex };
  }
  return <>
    <PolicyHeader network="liquidtestnet" busy={Boolean(busy)} status={serviceStatus} onCheck={() => void checkService()} onNetworkChange={onNetworkChange} />
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><Pill tone="brand">{LIQUID_PROFILE}</Pill><Pill>Liquid Testnet</Pill><Pill>Confidential · multi-asset</Pill></div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Authorize a confidential Liquid transaction</h1>
        <p className="text-sm text-muted">Choose a policy, fund its confidential address and review every asset. <Link href="/docs?network=liquidtestnet" target="_blank" rel="noopener noreferrer" className="text-brand underline">How Liquid jets work</Link></p>
      </div>
      <Callout tone="warning">Testnet assets only. Back up both signing and receiving keys before funding; keys disappear when the tab reloads.</Callout>
      {serviceError && <Callout tone="danger">Liquid policy oracle unavailable: {serviceError} Start the updated SU service and recheck.</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}
      {busy && <p role="status" className="text-sm text-brand">{busy}…</p>}
      <ol className="grid gap-3 sm:grid-cols-4" aria-label="Liquid workflow">
        {["Choose & prepare", "Fund & select assets", "Review & approve", "Broadcast"].map((step, index) => <li key={step} className="rounded-xl border border-line p-3 text-sm"><span className="mr-2 font-semibold text-brand">{index + 1}</span>{step}</li>)}
      </ol>
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-6">
        <section className={`${panelClass} space-y-4`}>
          <h2 className="text-lg font-semibold">1. Choose your policy</h2>
          <Field label="Liquid example"><select className={inputClass} value={exampleId} onChange={(event) => {
            const example = LIQUID_POLICY_EXAMPLES.find((item) => item.id === event.target.value);
            if (!example || (address && !window.confirm("Keep both keys and contract details for any funded address before changing example."))) return;
            setExampleId(example.id); changeContract({ source: example.source, scope: example.scope }); setFee(String(example.fee)); setSequence(example.sequence); setLockTime(example.lockTime);
          }}>{!selectedExample && <option value="custom">Custom policy</option>}{LIQUID_POLICY_EXAMPLES.map((example) => <option value={example.id} key={example.id}>{example.title}</option>)}</select></Field>
          {selectedExample && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted">{selectedExample.description}</p><div className="flex flex-wrap gap-2">{selectedExample.jets.map((name) => <Link key={name} href={`/docs?network=liquidtestnet#${name}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-brand-tint px-2 py-1 font-mono text-xs text-brand">{name}</Link>)}</div></div>}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3 rounded-xl bg-white p-4">
              <Field label="Cooperative signing secret"><input type="password" autoComplete="off" className={inputClass} value={draft.userSecretKey} onChange={(event) => changeContract({ userSecretKey: event.target.value.trim() })} /></Field>
              <Field label="Receiving blinding secret (local only)"><input type="password" autoComplete="off" className={inputClass} value={draft.blindingSecretKey} onChange={(event) => {
                const secret = event.target.value.trim();
                changeContract({ blindingSecretKey: secret, blindingPublicKey: /^[0-9a-f]{64}$/i.test(secret) && BigInt(`0x${secret}`) > BigInt(0) && BigInt(`0x${secret}`) < secp256k1.Point.Fn.ORDER ? policyPublicKey(secret) : "" });
              }} /></Field>
              <button className={buttonSecondary} type="button" onClick={() => { invalidate(true); void run("Generating local keys", async (assertCurrent) => { const next = await generateDraft(); assertCurrent(); setDraft(next); }); }}>Generate both disposable keys</button>
              <p className="text-xs text-muted">Only public keys and verified disclosure proofs go to SU. Keep the receiving key to recover confidential asset amounts.</p>
            </div>
            <div className="min-w-0 space-y-3 rounded-xl bg-white p-4">
              <CodeEditor label="Liquid SimplicityHL policy" language="simplicityhl" height={380} value={draft.source} readOnly={Boolean(busy)} jetNames={jetNames} onChange={(source) => { setExampleId("custom"); changeContract({ source }); }} />
              <Link href="/docs?network=liquidtestnet#jet-reference" target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">Browse Liquid jets and asset selectors</Link>
            </div>
          </div>
          <details className="rounded-xl bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Advanced · Recovery script & witnesses</summary><div className="mt-3 space-y-3">
            <CodeEditor label="Liquid recovery script" language="bitcoin-script" height={200} value={draft.recoveryScript} readOnly={Boolean(busy)} onChange={(recoveryScript) => changeContract({ recoveryScript })} />
            <Field label="Approval scope"><select className={inputClass} value={draft.scope} onChange={(event) => changeContract({ scope: event.target.value === "input" ? "input" : "transaction" })}><option value="transaction">Transaction approval</option><option value="input">Per-input approval</option></select></Field>
            <CodeEditor label="Extra witness JSON" language="json" height={160} value={draft.extraWitnessJson} readOnly={Boolean(busy)} onChange={(extraWitnessJson) => changeContract({ extraWitnessJson })} />
          </div></details>
          <button type="button" className={buttonPrimary} disabled={serviceStatus !== "online"} onClick={() => {
            invalidate(true); void run("Verifying confidential policy address", async (assertCurrent) => {
              let next = draft;
              if (!draft.userSecretKey && !draft.blindingSecretKey) { next = await generateDraft(); assertCurrent(); setDraft(next); }
              const prepared = await prepareLiquidAddress(next, liquidPolicyApi); assertCurrent(); setAddress(prepared);
            });
          }}>Prepare example</button>
          {address && <div className="space-y-3 rounded-xl bg-white p-4">
            <Pill tone="success">Local / service commitments and keys agree</Pill><p className="text-xs text-muted">Confidential receiving address</p><p className="break-all font-mono text-sm">{address.address}</p>
            <a href={`${DEMO_NETWORKS.liquidtestnet.explorer}/address/${address.unconfidentialAddress}`} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline">Inspect funding in explorer</a>
            <details><summary className="cursor-pointer text-xs text-muted">Contract details</summary><dl className="mt-3 space-y-2 break-all font-mono text-xs">
              <div><dt>Profile fingerprint</dt><dd>{address.registry.profile_hash}</dd></div><div><dt>CMR</dt><dd>{address.binding.cmr_hex}</dd></div><div><dt>Exact recovery script hex</dt><dd>{address.binding.redeem_script_hex}</dd></div><div><dt>Signing commitment</dt><dd>{address.signingCommitment}</dd></div><div><dt>Recovery leaf hash</dt><dd>{address.recoveryLeafHash}</dd></div>
            </dl></details>
          </div>}
        </section>
        <section className={`${panelClass} space-y-4`}>
          <h2 className="text-lg font-semibold">2. Fund & review every asset</h2>
          {!address && <p className="text-sm text-muted">Prepare the confidential receiving address first.</p>}
          {address && <>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">{funding.length ? `${funding.length} locally unblinded funding output(s). Select up to eight.` : "Waiting for funding. The demo checks automatically."}</p><button type="button" className={buttonSecondary} onClick={() => setRefresh((value) => value + 1)}>Check funding</button></div>
            {fundingError && <Callout tone="danger">{fundingError}</Callout>}
            {funding.map((input) => <label key={outputId(input)} className="flex min-w-0 gap-3 rounded-xl bg-white p-3 text-sm"><input type="checkbox" checked={selected.includes(outputId(input))} onChange={(event) => { invalidate(); setSelected((current) => event.target.checked ? [...current, outputId(input)] : current.filter((id) => id !== outputId(input))); }} /><span className="min-w-0"><span className="block">{input.value.toLocaleString()} units · <span title={input.assetId}>{assetName(input.assetId)}</span> · {input.confidential ? "confidential" : "explicit"}</span><span className="block break-all font-mono text-xs text-muted">{outputId(input)}</span><span className="text-xs text-muted">{input.confirmed ? "Explorer reports confirmed" : "Explorer reports unconfirmed"} · not independently chain-verified</span></span></label>)}
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]"><Field label="Confidential recipient (blank returns every asset to your policy)"><input className={inputClass} value={recipient} onChange={(event) => { invalidate(); setRecipient(event.target.value.trim()); }} /></Field><Field label="L-BTC fee (smallest units)"><input className={inputClass} inputMode="numeric" value={fee} onChange={(event) => { invalidate(); setFee(event.target.value); }} /></Field></div>
            <button className={buttonPrimary} type="button" disabled={!funding.length || serviceStatus !== "online"} onClick={() => {
              invalidate(); void run("Verifying all parents, disclosures and asset balances", async (assertCurrent) => {
                const inputs = selected.length ? selectedFunding : funding;
                if (!/^[1-9][0-9]*$/.test(fee)) throw new Error("Enter a positive integer L-BTC fee.");
                const prepared = await prepareLiquidSpend(address, inputs, draft, { recipient, fee: Number(fee), sequence, lockTime }, liquidPolicyApi);
                assertCurrent(); setSelected(inputs.map(outputId)); setTransaction(prepared);
              });
            }}>Review this spend</button>
            <details className="rounded-xl bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Advanced · Locks or verified PSET import</summary><div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Input sequence"><input className={inputClass} value={sequence} onChange={(event) => { invalidate(); setSequence(event.target.value); }} /></Field><Field label="Locktime"><input className={inputClass} value={lockTime} onChange={(event) => { invalidate(); setLockTime(event.target.value); }} /></Field></div>
              <p className="text-xs text-muted">Imported PSETs must include full parents, valid amount/asset disclosure proofs and balanced assets. Mixed explicit/confidential commitments require external verified proofs.</p>
              <textarea aria-label="Imported Liquid PSET hex" className={`${inputClass} h-28 font-mono text-xs`} value={pset} onChange={(event) => { invalidate(); setPset(event.target.value.trim()); }} />
              <button type="button" className={buttonSecondary} disabled={!pset} onClick={() => { invalidate(); void run("Verifying imported Liquid PSET", async (assertCurrent) => { const prepared = await prepareLiquidPset(address, pset, liquidPolicyApi); assertCurrent(); setTransaction(prepared); }); }}>Review imported PSET</button>
            </div></details>
          </>}
          {context && <div className="space-y-3 rounded-xl bg-white p-4">
            <Pill tone="success">Every input: local / service proofs and context agree</Pill>
            <p className="text-sm">Verified disclosure totals · {context.input_count} inputs · {context.output_count} outputs including fee</p>
            {transaction?.recipient ? <p className="break-all text-xs"><span className="font-medium">Every non-fee output goes to: </span>{transaction.recipient}</p> : <p className="text-xs text-muted">Imported PSET: inspect every exact destination script below before approval.</p>}
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Asset</th><th>In</th><th>Out (incl. fee)</th><th>Returned</th><th>Debit</th><th>Fee</th></tr></thead><tbody>{context.assets.map((asset) => <tr key={asset.asset_id}><td className="py-2 font-mono" title={asset.asset_id}>{assetName(asset.asset_id)}</td>{[asset.total_input_value, asset.total_output_value, asset.returned_value, asset.debit, asset.fee].map((value, index) => <td key={index}>{value.toLocaleString()}</td>)}</tr>)}</tbody></table></div>
            <details open={!transaction?.recipient}><summary className="cursor-pointer text-sm text-muted">Review exact output scripts and values</summary><div className="mt-3 space-y-2">{context.outputs.map((output, index) => <div key={index} className="break-all font-mono text-xs"><p>{index}: {output.value} units of {output.asset_id} · {output.confidential_value || output.confidential_asset ? "confidential" : "explicit"}</p><p className="text-muted">{context.output_scripts_hex[index] || "(fee output)"}</p></div>)}</div></details>
            <p className="text-xs text-muted">Cryptographic disclosure verification does not prove confirmation, maturity or unspent status.</p>
          </div>}
        </section>
        <section className={`${panelClass} space-y-4`}>
          <h2 className="text-lg font-semibold">3. Approve & co-sign</h2>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={reviewed} disabled={!transaction} onChange={(event) => setReviewed(event.target.checked)} />I reviewed every asset, destination, lock and the L-BTC fee.</label>
          <button type="button" className={buttonPrimary} disabled={!address || !transaction || !reviewed || serviceStatus !== "online" || Boolean(finalized)} onClick={() => {
            if (!address || !transaction) return;
            void run("Approving, evaluating, verifying both signatures and finalizing", async (assertCurrent) => {
              const value = await approveAndCosignLiquid(address, transaction, draft, assertCurrent, liquidPolicyApi); assertCurrent(); setFinalized(value);
            });
          }}>Approve & co-sign</button>
          {finalized && <div className="space-y-3 rounded-xl bg-white p-4"><Pill tone="success">Securely finalized · not broadcast</Pill><p className="break-all font-mono text-xs">TXID: {finalized.txid}</p><button type="button" className={buttonPrimary} disabled={Boolean(broadcast)} onClick={() => {
            if (!transaction || finalized.transactionFingerprint !== transaction.fingerprint) { setError("Finalized transaction is stale; review again."); return; }
            if (!window.confirm("Broadcast this confidential Liquid Testnet transaction? This cannot be undone.")) return;
            void run("Broadcasting to Liquid Testnet", async (assertCurrent) => { const result = await liquidPolicyApi.broadcast(finalized.transactionHex); assertCurrent(); if (result.txid !== finalized.txid) throw new Error("Explorer returned a different transaction ID. Inspect before retrying."); setBroadcast(result.txid); });
          }}>Broadcast reviewed transaction</button>{broadcast && <a className="block break-all text-sm text-brand underline" target="_blank" rel="noopener noreferrer" href={`${DEMO_NETWORKS.liquidtestnet.explorer}/tx/${broadcast}`}>Broadcast · inspect transaction</a>}</div>}
        </section>
      </fieldset>
    </main>
  </>;
}
