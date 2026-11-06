"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import Link from "next/link";
import { policyApi } from "@/services/policyApi";
import { DEFAULT_POLICY_SOURCE } from "@/services/policyDefaults";
import {
  approvePolicyTransaction, assertPolicyRegistry, checkPolicyCapabilities, cosignPolicyTransaction, policyArtifactsReducer,
  policyPublicKey, preparePolicyAddress, preparePolicyTransaction,
} from "@/services/policyFlow";
import {
  POLICY_NETWORKS, POLICY_PROFILE, type ApprovalSigner, type PolicyDraft,
  type PolicyTransactionDraft,
} from "@/services/policyTypes";
import { recoveryScriptForKey } from "@/utils/recoveryScript";
import { buttonPrimary, buttonSecondary, Callout, formatSats, inputClass, panelClass, Pill } from "./ui";
import { CodeEditor } from "./CodeEditor";
import { PolicyHeader } from "./PolicyHeader";
import { POLICY_EXAMPLES } from "@/services/policyExamples";
import { findPolicyFunding, type PolicyFundingOutput } from "@/services/policyExplorer";
import type { DemoNetwork } from "@/services/demoNetworks";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5"><span className="block text-xs font-medium text-ink">{label}</span>{children}</label>;
}

function shownKey(secret: string) {
  try { return policyPublicKey(secret); } catch { return "No valid test key yet"; }
}

export function PolicyWorkspace({ onNetworkChange }: { onNetworkChange: (network: DemoNetwork) => void }) {
  const [draft, setDraft] = useState<PolicyDraft>({
    chain: "bitcoin", profile: POLICY_PROFILE, network: "testnet4", source: DEFAULT_POLICY_SOURCE,
    recoveryScript: "", userSecretKey: "", approvalSigners: [{ witnessName: "APPROVAL", secretKey: "", scope: "transaction" }],
    extraWitnessJson: "{}",
  });
  const [transactionDraft, setTransactionDraft] = useState<PolicyTransactionDraft>({
    inputs: "", outputs: "", sequence: "4294967293", lockTime: "0",
  });
  const [artifacts, dispatch] = useReducer(policyArtifactsReducer, { revision: 0 });
  const revision = useRef(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [exampleId, setExampleId] = useState("approved-spend");
  const [funding, setFunding] = useState<PolicyFundingOutput[]>([]);
  const [fundingError, setFundingError] = useState("");
  const [refreshFunding, setRefreshFunding] = useState(0);
  const [recipient, setRecipient] = useState("");
  const [serviceStatus, setServiceStatus] = useState<"checking" | "online" | "offline">("checking");
  const [serviceError, setServiceError] = useState("");
  const [jetNames, setJetNames] = useState<string[]>([]);
  const serviceRevision = useRef(0);
  const { address, transaction, approvals, finalized, broadcast } = artifacts;
  const context = transaction?.local[0].context;
  const selectedExample = POLICY_EXAMPLES.find((example) => example.id === exampleId);

  useEffect(() => {
    if (!address || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (!address) return;
      try {
        const found = await findPolicyFunding(address.network, address.address, controller.signal);
        if (controller.signal.aborted) return;
        setFunding(found);
        setFundingError("");
      } catch (failure) {
        if (controller.signal.aborted) return;
        setFundingError(failure instanceof Error ? failure.message : String(failure));
      }
      timer = setTimeout(() => { if (!document.hidden) void check(); else timer = setTimeout(() => void check(), 20_000); }, 20_000);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [address, busy, refreshFunding]);

  const checkService = useCallback(async () => {
    const token = ++serviceRevision.current;
    setServiceStatus("checking");
    setServiceError("");
    try {
      const registry = await policyApi.registry();
      if (token !== serviceRevision.current) return;
      setJetNames([...registry.manifest.jets, ...registry.manifest.legacy_jets].map((jet) => jet.name));
      const capabilities = await policyApi.capabilities();
      assertPolicyRegistry(registry, capabilities, draft.network);
      if (token !== serviceRevision.current) return;
      setServiceStatus("online");
    } catch (failure) {
      if (token !== serviceRevision.current) return;
      setServiceStatus("offline");
      setServiceError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [draft.network]);

  useEffect(() => {
    const checks = serviceRevision;
    void checkService();
    return () => { checks.current++; };
  }, [checkService]);

  function invalidate(kind: "contractChanged" | "transactionChanged") {
    revision.current++;
    dispatch({ type: kind });
    if (kind === "contractChanged") {
      setFunding([]);
      setFundingError("");
    }
    setReviewed(false);
    setError("");
  }
  function changeContract(patch: Partial<PolicyDraft>) {
    invalidate("contractChanged");
    setDraft((current) => ({ ...current, ...patch }));
  }
  function changeTransaction(patch: Partial<PolicyTransactionDraft>) {
    invalidate("transactionChanged");
    setTransactionDraft((current) => ({ ...current, ...patch }));
  }
  function changeSigner(index: number, patch: Partial<ApprovalSigner>) {
    changeContract({ approvalSigners: draft.approvalSigners.map((signer, i) => i === index ? { ...signer, ...patch } : signer) });
  }
  async function run(label: string, operation: (token: number, assertCurrent: () => void) => Promise<void>) {
    if (busy) return;
    const token = revision.current;
    const assertCurrent = () => {
      if (revision.current !== token) throw new Error("Inputs changed during preparation. Start again with fresh transaction approvals.");
    };
    setBusy(label);
    setError("");
    try {
      await operation(token, assertCurrent);
    } catch (failure) {
      invalidate("contractChanged");
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy("");
    }
  }
  function generateKey() {
    try {
      const secret = Buffer.from(secp256k1.utils.randomSecretKey()).toString("hex");
      changeContract({
        userSecretKey: secret, recoveryScript: recoveryScriptForKey(policyPublicKey(secret)),
        approvalSigners: [{ witnessName: "APPROVAL", secretKey: secret, scope: selectedExample?.scope ?? "transaction" }],
      });
    } catch (failure) {
      setError(`Key generation failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  }

  return (
    <>
    <PolicyHeader network="testnet4" busy={Boolean(busy)} status={serviceStatus} onCheck={() => void checkService()} onNetworkChange={onNetworkChange} />
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Pill tone="brand">{POLICY_PROFILE}</Pill><Pill>{POLICY_NETWORKS[draft.network].label}</Pill></div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Authorize a Bitcoin transaction with Simplicity</h1>
        <p className="max-w-3xl text-sm text-muted">Choose an example, fund it and approve a testnet spend. <Link href="/docs" target="_blank" rel="noopener noreferrer" className="text-brand underline">How it works</Link></p>
      </div>
      <Callout tone="warning">
        Testnet coins and disposable keys only. Back up your key before funding. <Link href="/docs" target="_blank" rel="noopener noreferrer" className="underline">Policy guide</Link>
      </Callout>
      {serviceError && <Callout tone="danger">Policy oracle unavailable: {serviceError} Start the matching SU service and recheck from the header.</Callout>}
      {error && <Callout tone="danger">{error}</Callout>}
      {busy && <p role="status" className="text-sm text-brand">{busy}…</p>}
      <ol className="grid gap-3 sm:grid-cols-4" aria-label="Workflow progress">
        {[
          { title: "Prepare address", detail: "Compile and verify your policy", done: Boolean(address) },
          { title: "Review transaction", detail: "Verify funding and recipients", done: Boolean(transaction) },
          { title: "Approve & co-sign", detail: "Evaluate and verify signatures", done: Boolean(finalized) },
          { title: "Broadcast", detail: "Explicitly send on testnet", done: Boolean(broadcast) },
        ].map((step, index) => <li key={step.title} className="flex items-center gap-3 rounded-xl bg-surface p-4">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.done ? "bg-success-tint text-success" : "bg-brand-tint text-brand"}`}>{step.done ? "✓" : index + 1}</span>
          <span><span className="block text-sm font-medium">{step.title}</span><span className="text-xs text-muted">{step.detail}</span></span>
        </li>)}
      </ol>
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-6">
        <legend className="sr-only">Experimental policy workflow</legend>
        <section className={`${panelClass} space-y-4`} aria-labelledby="policy-contract">
          <h2 id="policy-contract" className="font-semibold">1. Choose & prepare</h2>
          <Field label="Example policy">
            <select className={inputClass} value={exampleId} onChange={(event) => {
              const example = POLICY_EXAMPLES.find((item) => item.id === event.target.value);
              if (!example) return;
              if (address && !window.confirm("Change example? This resets prepared artifacts. Keep the key and contract details for any funded address.")) return;
              setExampleId(example.id);
              changeContract({ source: example.source, approvalSigners: draft.approvalSigners.map((signer) => ({ ...signer, scope: example.scope })) });
              setTransactionDraft((current) => ({ ...current, sequence: example.sequence, lockTime: example.lockTime }));
            }}>
              {!selectedExample && <option value="custom">Custom policy</option>}
              {POLICY_EXAMPLES.map((example) => <option value={example.id} key={example.id}>{example.title}</option>)}
            </select>
          </Field>
          {selectedExample && <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted">{selectedExample.description}</p>
            <div className="flex flex-wrap gap-2">{selectedExample.jets.map((name) => <Link href={`/docs#${name}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-brand-tint px-2 py-1 font-mono text-xs text-brand" key={name}>{name}</Link>)}</div>
          </div>}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3 rounded-xl bg-white p-4 sm:p-5">
              <Field label="Your cooperative signing secret (disposable 32-byte test key)">
                <input className={inputClass} type="password" autoComplete="off" spellCheck={false} value={draft.userSecretKey} onChange={(event) => changeContract({ userSecretKey: event.target.value.trim() })} />
              </Field>
              <button type="button" className={buttonSecondary} onClick={generateKey}>Generate disposable key + matching recovery script</button>
              <p className="break-all font-mono text-xs text-muted">Cooperative user public key: {shownKey(draft.userSecretKey)}</p>
              <p className="text-xs text-muted">A matching recovery script is generated with your key. Keep the key safe; recovery bypasses the policy.</p>
            </div>
            <div className="min-w-0 space-y-3 rounded-xl bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Your Simplicity policy</h3><Pill tone="brand">55 policy jets</Pill></div>
              <CodeEditor label="SimplicityHL policy program" language="simplicityhl" height={380} value={draft.source}
                readOnly={Boolean(busy)} jetNames={jetNames} onChange={(source) => { setExampleId("custom"); changeContract({ source }); }} />
              <Link href="/docs#jet-reference" target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">Explore the policy jets</Link>
            </div>
          </div>
          <details className="space-y-3 rounded-xl bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">Advanced · Recovery script</summary>
            <p className="mt-3 text-xs text-muted">Editing resets the address and approvals. Recovery bypasses the policy.</p>
            <CodeEditor label="Recovery script" language="bitcoin-script" height={200} value={draft.recoveryScript}
              readOnly={Boolean(busy)} onChange={(recoveryScript) => changeContract({ recoveryScript })} />
          </details>
          <details className="space-y-3 rounded-xl bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">Approval signers and extra witnesses</summary>
            <p className="mt-3 text-xs text-muted">Advanced witnesses for custom policies. <Link href="/docs#policy_approval_hash" target="_blank" rel="noopener noreferrer" className="text-brand underline">Approval digests explained</Link></p>
            {draft.approvalSigners.map((signer, index) => (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]" key={index}>
                <Field label={`Signer ${index + 1} witness name`}><input className={inputClass} value={signer.witnessName} onChange={(event) => changeSigner(index, { witnessName: event.target.value })} /></Field>
                <Field label="Disposable approval secret"><input className={inputClass} type="password" autoComplete="off" value={signer.secretKey} onChange={(event) => changeSigner(index, { secretKey: event.target.value.trim() })} /></Field>
                <Field label="Digest scope"><select className={inputClass} value={signer.scope} onChange={(event) => changeSigner(index, { scope: event.target.value as ApprovalSigner["scope"] })}><option value="transaction">J54 transaction</option><option value="input">J53 input</option></select></Field>
                <button type="button" className={`${buttonSecondary} self-end`} disabled={draft.approvalSigners.length <= 1} onClick={() => changeContract({ approvalSigners: draft.approvalSigners.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
            <button type="button" className={`${buttonSecondary} mt-3`} disabled={draft.approvalSigners.length >= 3} onClick={() => changeContract({ approvalSigners: [...draft.approvalSigners, { witnessName: `APPROVALS[${draft.approvalSigners.length}]`, secretKey: "", scope: "transaction" }] })}>Add distinct signer</button>
            <div className="mt-3"><CodeEditor label="Extra witness JSON (non-signature values only)" language="json" height={180} value={draft.extraWitnessJson}
              readOnly={Boolean(busy)} onChange={(extraWitnessJson) => changeContract({ extraWitnessJson })} /></div>
          </details>
          <button type="button" className={buttonPrimary} disabled={serviceStatus !== "online"} onClick={() => {
            invalidate("contractChanged");
            void run("Checking registry, compiling, encoding script and deriving both policy keys", async (token, assertCurrent) => {
              let preparedDraft = draft;
              if (!draft.userSecretKey) {
                const secret = Buffer.from(secp256k1.utils.randomSecretKey()).toString("hex");
                preparedDraft = { ...draft, userSecretKey: secret, recoveryScript: recoveryScriptForKey(policyPublicKey(secret)),
                  approvalSigners: [{ witnessName: "APPROVAL", secretKey: secret, scope: selectedExample?.scope ?? "transaction" }] };
                setDraft(preparedDraft);
              }
              const value = await preparePolicyAddress(preparedDraft, policyApi);
              assertCurrent();
              dispatch({ type: "address", revision: token, value });
            });
          }}>Prepare example</button>
          {address && (
            <div className="space-y-3 rounded-xl bg-white p-4">
              <Pill tone="success">Local / service registry, CMR, script and key agree</Pill>
              <p className="break-all font-mono text-sm">{address.address}</p>
              <p className="text-xs text-muted">Fund on {POLICY_NETWORKS[address.network].label}.</p>
              <a className="text-sm text-brand underline" target="_blank" rel="noopener noreferrer" href={`${POLICY_NETWORKS[address.network].explorer}/address/${address.address}`}>Inspect funding outputs in explorer</a>
              <details><summary className="cursor-pointer text-xs text-muted">Contract details</summary><dl className="mt-3 space-y-2 break-all font-mono text-xs">
                <div><dt>Profile fingerprint</dt><dd>{address.registry.profile_hash}</dd></div>
                <div><dt>Program CMR</dt><dd>{address.cmr}</dd></div>
                <div><dt>Exact recovery script hex</dt><dd>{address.scriptHex || "(empty)"}</dd></div>
                <div><dt>Profile-bound signing commitment</dt><dd>{address.signingCommitment}</dd></div>
                <div><dt>Actual service x-only key in cooperative leaf</dt><dd>{address.servicePubkey}</dd></div>
                <div><dt>Recovery leaf hash</dt><dd>{address.recoveryLeafHash}</dd></div>
              </dl></details>
              <details><summary className="cursor-pointer text-xs">Canonical 55-jet manifest / limits / service provenance</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(address.capabilities, null, 2)}</pre></details>
            </div>
          )}
        </section>

        <section className={`${panelClass} space-y-4`} aria-labelledby="policy-transaction">
          <h2 id="policy-transaction" className="font-semibold">2. Fund & review</h2>
          {address && <div className="space-y-3 rounded-xl bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">{funding.length ? "Funding detected" : "Waiting for testnet funding..."}</p>
              <button type="button" className={buttonSecondary} onClick={() => setRefreshFunding((current) => current + 1)}>Check funding</button>
            </div>
            {fundingError && <Callout tone="danger">{fundingError}</Callout>}
            <Field label="Recipient (optional; leave empty to return to this policy address)">
              <input className={inputClass} placeholder="Bitcoin testnet address" value={recipient} onChange={(event) => { invalidate("transactionChanged"); setRecipient(event.target.value.trim()); }} />
            </Field>
            {funding.map((output) => <div key={`${output.txid}:${output.vout}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
              <span className="text-sm">{formatSats(output.value)} <span className="text-xs text-muted">{output.confirmed ? "Confirmed" : "Unconfirmed"}</span></span>
              <button type="button" className={buttonPrimary} disabled={output.value < (selectedExample?.fee ?? 1000) + 546} onClick={() => {
                if (!address) return;
                const next = { ...transactionDraft, inputs: `${output.txid}:${output.vout}`, outputs: `${recipient || address.address}:${output.value - (selectedExample?.fee ?? 1000)}` };
                invalidate("transactionChanged");
                setTransactionDraft(next);
                void run("Verifying funding and preparing the exact spend", async (token, assertCurrent) => {
                  const value = await preparePolicyTransaction(address, next, policyApi);
                  assertCurrent();
                  dispatch({ type: "transaction", revision: token, value });
                });
              }}>Review this spend</button>
            </div>)}
            <p className="text-xs text-muted">Explorer amounts are advisory until full parent evidence is verified.</p>
          </div>}
          <details className="space-y-3 rounded-xl bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Advanced · Manual transaction</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Funding inputs, one txid:vout per line"><textarea rows={4} className={inputClass} spellCheck={false} value={transactionDraft.inputs} onChange={(event) => changeTransaction({ inputs: event.target.value })} /></Field>
            <Field label="Recipients, one address:integer_satoshis per line"><textarea rows={4} className={inputClass} spellCheck={false} value={transactionDraft.outputs} onChange={(event) => changeTransaction({ outputs: event.target.value })} /></Field>
            <Field label="Raw sequence for every input (decimal u32)"><input className={inputClass} value={transactionDraft.sequence} onChange={(event) => changeTransaction({ sequence: event.target.value })} /></Field>
            <Field label="Raw transaction locktime (decimal u32)"><input className={inputClass} value={transactionDraft.lockTime} onChange={(event) => changeTransaction({ lockTime: event.target.value })} /></Field>
          </div>
          <button type="button" className={buttonPrimary} disabled={!address} onClick={() => {
            if (!address) return;
            invalidate("transactionChanged");
            void run("Fetching parent evidence and comparing immutable local/service contexts", async (token, assertCurrent) => {
              const value = await preparePolicyTransaction(address, transactionDraft, policyApi);
              assertCurrent();
              dispatch({ type: "transaction", revision: token, value });
            });
          }}>Prepare & verify transaction (no approval yet)</button>
          </details>
          {context && transaction && (
            <div className="space-y-4 rounded-xl bg-white p-4">
              <Callout>Parent bytes verified. Check confirmation and unspentness independently.</Callout>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt>Verified inputs ({context.input_count})</dt><dd className="font-semibold">{formatSats(context.total_input_value)}</dd></div>
                <div><dt>Exact outputs ({context.output_count})</dt><dd className="font-semibold">{formatSats(context.total_output_value)}</dd></div>
                <div><dt>Absolute fee</dt><dd className="font-semibold">{formatSats(context.fee)}</dd></div>
                <div><dt>Same-contract debit, including fee</dt><dd className="font-semibold">{formatSats(context.debit)}</dd></div>
              </dl>
              <p className="text-xs text-muted">Stripped-size lower bound: {context.vsize_lower_bound} bytes. This is not a final fee-rate estimate.</p>
              <ol className="space-y-3">
                {transaction.local[0].outputs.map((output) => <li className="rounded-lg border border-line p-3" key={output.index}>
                  <p className="text-sm font-semibold">Recipient {output.index}: {formatSats(output.value_sat)}</p>
                  <p className="break-all font-mono text-xs">{output.address ?? "Non-address script (review exact bytes)"}</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">scriptPubKey: {output.script_pubkey_hex || "(empty)"}</p>
                </li>)}
              </ol>
              <p className="break-all font-mono text-xs">J54 · {context.policy_transaction_approval_hash}</p>
              {transaction.local.map(({ context }) => <p key={context.input_index} className="break-all font-mono text-xs">Input {context.input_index} J53 · {context.policy_approval_hash}</p>)}
              <details><summary className="cursor-pointer text-xs">All locally verified context fields and signing digests</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(transaction.local, null, 2)}</pre></details>
            </div>
          )}
        </section>

        <section className={`${panelClass} space-y-4`} aria-labelledby="policy-approve">
          <h2 id="policy-approve" className="font-semibold">3. Approve & co-sign</h2>
          <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={reviewed} disabled={!transaction} onChange={(event) => setReviewed(event.target.checked)} /><span>I approve these recipients, amounts and fee.</span></label>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={buttonPrimary} disabled={!address || !transaction || !reviewed} onClick={() => {
              if (!address || !transaction) return;
              void run("Approving, evaluating and verifying both signatures", async (token, assertCurrent) => {
                const value = await approvePolicyTransaction(address, transaction, draft, policyApi, assertCurrent);
                assertCurrent();
                dispatch({ type: "approvals", revision: token, value });
                const signed = await cosignPolicyTransaction(address, transaction, value, draft, policyApi, assertCurrent);
                assertCurrent();
                dispatch({ type: "finalized", revision: token, value: signed });
              });
            }}>Approve & co-sign</button>
          </div>
          {approvals && <p className="text-sm text-success">Policy accepted for every input. Execution costs (milliweight): {approvals.costs.join(", ")}.</p>}
          {finalized && <div className="space-y-2">
            <Pill tone="success">Both signatures and the actual leaf verified locally · not broadcast</Pill>
            <p className="break-all font-mono text-xs">Final transaction ID: {finalized.txid}</p>
            <details><summary className="cursor-pointer text-xs">Finalized raw transaction</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{finalized.transactionHex}</pre></details>
          </div>}
        </section>

        <section className={`${panelClass} space-y-3`} aria-labelledby="policy-broadcast">
          <h2 id="policy-broadcast" className="font-semibold">4. Explicit testnet broadcast</h2>
          <button type="button" className={buttonPrimary} disabled={!address || !transaction || !finalized || !reviewed || draft.network === "bitcoin" || Boolean(broadcast)} onClick={() => {
            if (!address || !transaction || !finalized || finalized.transactionFingerprint !== transaction.fingerprint) return;
            if (!window.confirm("Broadcast this exact reviewed transaction to the selected Bitcoin test network?")) return;
            void run("Broadcasting the verified testnet transaction", async (token, assertCurrent) => {
              await checkPolicyCapabilities(address, policyApi);
              assertCurrent();
              try {
                const value = await policyApi.broadcast(address.network, finalized.transactionHex);
                if (value.txid !== finalized.txid) throw new Error("Broadcast response returned a different transaction ID.");
                assertCurrent();
                dispatch({ type: "broadcast", revision: token, value });
              } catch (failure) {
                assertCurrent();
                setError(`${failure instanceof Error ? failure.message : String(failure)}. Keep the finalized transaction and inspect ${finalized.txid} before retrying; a network failure does not prove it was not broadcast.`);
              }
            });
          }}>Broadcast reviewed testnet transaction</button>
          {broadcast && <a className="block break-all text-sm text-brand underline" href={broadcast.explorer_url} target="_blank" rel="noopener noreferrer">Inspect broadcast transaction {broadcast.txid}</a>}
        </section>
      </fieldset>
    </main>
    </>
  );
}
