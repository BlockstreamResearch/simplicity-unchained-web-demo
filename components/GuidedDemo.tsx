"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import {
  ExplorerUnavailableError, fetchTransactionStatus, findFundingOutputs, type FundingOutput, type TransactionStatus,
} from "@/services/explorer";
import { prepareDemo, sendDemoTransaction } from "@/services/demoFlow";
import { proxyApi } from "@/services/proxyApi";
import {
  createSpendPlan, DEMO_FEE_SATS, DEMO_NETWORKS, DEMO_PROGRAM_NOTES, DEMO_SCENARIOS,
  demoProgram, MIN_DEMO_OUTPUT_SATS, type DemoNetwork, type DemoScenario,
} from "@/utils/demo";
import { sendGAEvent } from "@next/third-parties/google";
import {
  buttonPrimary, buttonSecondary, Callout, cardClass, formatSats, KeyValue, openAdvanced, panelClass, Pill, SectionLabel, shorten,
} from "./ui";
import { DemoHistory, type HistoryItem } from "./DemoHistory";
import { ProgramDialog, type CodeTab } from "./ProgramDialog";

const PREPARE_STAGES = ["Creating the demo key", "Compiling", "Requesting", "Building"];

// Public explorers allow ~700 requests/hour per IP, shared by every open tab.
const FUNDING_POLL_MS = 15_000;
const FUNDED_POLL_MS = 30_000;
const CONFIRMATION_POLL_MS: Record<DemoNetwork, number> = { elements: 20_000, bitcoin: 30_000 };
const MAX_BACKOFF_MS = 120_000;

function nextBackoff(current: number) {
  return Math.min(MAX_BACKOFF_MS, current ? current * 2 : 30_000);
}

function describeExplorerOutage(error: ExplorerUnavailableError, delay: number) {
  const cause = error.rateLimited
    ? "The block explorer is rate-limiting this network (about 700 requests/hour per IP, shared by all open tabs)."
    : "The block explorer isn't responding (it may be rate-limiting this network).";
  return `${cause} Retrying in ${delay / 1000}s; close other demo tabs to recover sooner.`;
}

function prepareIndex(progress: string) {
  const stage = PREPARE_STAGES.findIndex((prefix) => progress.startsWith(prefix));
  return stage <= 0 ? 0 : stage === 3 ? 2 : 1;
}

export function GuidedDemo() {
  const {
    state, serviceStatus, canSendTransaction, resetToGuided, loadPreparedDemo,
    setOperation, completeTransaction, clearTransaction, addLog, showNotification,
  } = useApp();
  const [scenario, setScenario] = useState<DemoScenario>("opcode");
  const [actionError, setActionError] = useState<{ phase: "prepare" | "send"; index: number; message: string } | null>(null);
  const [copiedAddress, setCopiedAddress] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectedKey, setSelectedKey] = useState("");
  const [sendStage, setSendStage] = useState(0);
  const [funding, setFunding] = useState<{ address: string; network: DemoNetwork; outputs: FundingOutput[] } | null>(null);
  const [fundingError, setFundingError] = useState<{ address: string; network: DemoNetwork; message: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ txid: string; status: TransactionStatus } | null>(null);
  const [explorerNotice, setExplorerNotice] = useState<string | null>(null);
  const config = DEMO_NETWORKS[state.network];
  const scenarioInfo = DEMO_SCENARIOS.find((item) => item.id === scenario)!;
  const custom = state.programOrigin === "custom";
  const programTitle = custom ? "Custom program" : scenarioInfo.title;
  const [dialog, setDialog] = useState<DemoScenario | "current" | null>(null);
  const ready = canSendTransaction();
  const busy = Boolean(state.operation);
  const offline = serviceStatus === "offline";
  const result = state.transactionResult;
  const outputs = funding?.address === state.compiledAddress && funding.network === state.network ? funding.outputs : [];
  const eligible = outputs.filter((output) => output.value >= DEMO_FEE_SATS + MIN_DEMO_OUTPUT_SATS);
  const selected = eligible.find((output) => `${output.txid}:${output.vout}` === selectedKey) || eligible[0];
  const lookupError = fundingError?.address === state.compiledAddress && fundingError.network === state.network ? fundingError.message : "";
  const txStatus = result && confirmation?.txid === result.txid ? confirmation.status : null;
  const plan = selected ? createSpendPlan(selected.value) : null;

  useEffect(() => {
    if (!ready || !state.compiledAddress || state.operation || result) return;
    const controller = new AbortController();
    const address = state.compiledAddress;
    const network = state.network;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let backoff = 0;
    let detected = false;
    let running = false;
    // The first check runs even in a background tab: it follows Prepare, Repeat, or Check now.
    const check = async (force = false) => {
      if (running) return;
      running = true;
      clearTimeout(timer);
      if (force || document.visibilityState === "visible") {
        try {
          const found = await findFundingOutputs(network, address, controller.signal);
          if (controller.signal.aborted) return;
          setFunding({ address, network, outputs: found });
          setFundingError(null);
          setExplorerNotice(null);
          backoff = 0;
          detected = found.length > 0;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ExplorerUnavailableError) {
            backoff = nextBackoff(backoff);
            setExplorerNotice(describeExplorerOutage(error, backoff));
          } else {
            setFundingError({ address, network, message: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      running = false;
      timer = setTimeout(() => void check(), backoff || (detected ? FUNDED_POLL_MS : FUNDING_POLL_MS));
    };
    // Returning from the faucet tab should show new funding right away.
    const onVisible = () => { if (document.visibilityState === "visible" && !backoff) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    void check(true);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [ready, state.compiledAddress, state.network, state.operation, result, refresh]);

  useEffect(() => {
    if (!result) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let backoff = 0;
    let running = false;
    let done = false;
    const check = async (force = false) => {
      if (running || done) return;
      running = true;
      clearTimeout(timer);
      if (force || document.visibilityState === "visible") {
        try {
          const status = await fetchTransactionStatus(result.network, result.txid, controller.signal);
          if (controller.signal.aborted) return;
          setConfirmation({ txid: result.txid, status });
          setExplorerNotice(null);
          backoff = 0;
          if (status.confirmed) {
            done = true;
            return;
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ExplorerUnavailableError) {
            backoff = nextBackoff(backoff);
            setExplorerNotice(describeExplorerOutage(error, backoff));
          }
          // Other errors: explorer indexing can lag; keep polling.
        }
      }
      running = false;
      timer = setTimeout(() => void check(), backoff || CONFIRMATION_POLL_MS[result.network]);
    };
    const onVisible = () => { if (document.visibilityState === "visible" && !backoff) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    void check(true);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [result]);

  const reportError = (phase: "prepare" | "send", index: number, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setActionError({ phase, index, message });
    addLog(`Demo failed: ${message}`);
    showNotification(message, true);
  };

  const handlePrepare = async () => {
    if (busy || offline) return;
    setActionError(null);
    setSendStage(0);
    let index = 0;
    setOperation("preparing", PREPARE_STAGES[0]);
    try {
      const demo = await prepareDemo(state.network, scenario, state.cosignSecretKey, proxyApi, (message) => {
        index = prepareIndex(message);
        setOperation("preparing", message);
      });
      loadPreparedDemo(demo);
      addLog(`${config.label}: ${programTitle} demo prepared`);
      addLog(`Fund this P2TR address: ${demo.compiledAddress}`);
      sendGAEvent("event", "success_action", { location: "guided_prepare" });
    } catch (error) {
      reportError("prepare", index, error);
    } finally {
      setOperation(null);
    }
  };

  const handleSend = async () => {
    if (!ready || !selected || busy || result || lookupError || offline) return;
    setActionError(null);
    let stage = 1;
    setSendStage(1);
    setOperation("sending", "Creating the transaction");
    try {
      const sent = await sendDemoTransaction(state, selected, proxyApi, (message) => {
        const match = /^(\d)\/4/.exec(message);
        if (match) {
          stage = Number(match[1]);
          setSendStage(stage);
        }
        setOperation("sending", message);
        addLog(message);
      });
      completeTransaction(sent);
      setSendStage(5);
      addLog(`Transaction broadcast: ${sent.explorer_url}`);
      showNotification("Transaction broadcast. Open it in the explorer.");
      sendGAEvent("event", "success_action", { location: "transaction_send" });
    } catch (error) {
      reportError("send", stage, error);
      setSendStage(0);
      setRefresh((value) => value + 1);
    } finally {
      setOperation(null);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(state.compiledAddress);
      setCopiedAddress(state.compiledAddress);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : String(error), true);
    }
  };

  const repeat = () => {
    setFunding(null);
    setSelectedKey("");
    setSendStage(0);
    setConfirmation(null);
    clearTransaction();
    setRefresh((value) => value + 1);
  };

  const status = (() => {
    if (state.operation === "preparing") return <Pill tone="brand" pulse>Preparing</Pill>;
    if (state.operation === "sending") return <Pill tone="brand" pulse>Co-signing</Pill>;
    if (txStatus?.confirmed) return <Pill tone="success">Confirmed</Pill>;
    if (result) return <Pill tone="brand" pulse>Broadcast · awaiting block</Pill>;
    if (actionError) return <Pill tone="danger">Needs attention</Pill>;
    if (ready && selected) return <Pill tone="success">Ready to send</Pill>;
    if (ready) return <Pill tone="warning" pulse>Awaiting funding</Pill>;
    return <Pill>Not prepared</Pill>;
  })();

  const preparingAt = state.operation === "preparing" ? prepareIndex(state.progress) : -1;
  const prepareFailedAt = actionError?.phase === "prepare" ? actionError.index : -1;
  const sendFailedAt = actionError?.phase === "send" ? actionError.index : -1;
  const sendIndex = (stage: number) => (stage <= 2 ? 4 : stage === 3 ? 5 : 6);
  const historyState = (index: number): HistoryItem["state"] => {
    if (index <= 2) {
      if (prepareFailedAt === index) return "failed";
      if (ready) return "done";
      if (preparingAt === index) return "active";
      return preparingAt > index ? "done" : "pending";
    }
    if (index === 3) {
      if (result || selected) return "done";
      return ready ? "active" : "pending";
    }
    if (index <= 6) {
      if (sendFailedAt > 0 && sendIndex(sendFailedAt) === index) return "failed";
      if (result) return "done";
      if (state.operation === "sending") {
        const current = sendIndex(sendStage);
        return current === index ? "active" : current > index ? "done" : "pending";
      }
      return "pending";
    }
    if (txStatus?.confirmed) return "done";
    return result ? "active" : "pending";
  };

  const items: HistoryItem[] = [
    {
      title: "Demo key and program created",
      meta: ready ? `key ${shorten(state.compiledUserPubkey)}` : undefined,
      detail: custom ? "Custom program, witness, and recovery script built in Advanced." : `${scenarioInfo.title}: ${scenarioInfo.description}`,
    },
    {
      title: "Simplicity Unchained key committed to the program",
      meta: ready ? shorten(state.tweakedPublicKey) : undefined,
      detail: "The Simplicity Unchained key is tweaked by the program's commitment root, so it can only co-sign for this program.",
    },
    {
      title: "Taproot address created",
      meta: ready ? shorten(state.compiledAddress, 10, 8) : undefined,
      detail: "Two leaves: an oracle + user cooperative leaf and your recovery leaf.",
    },
    {
      title: selected || result ? "Funding detected" : "Waiting for funding",
      meta: selected ? `${shorten(selected.txid)}:${selected.vout}` : undefined,
      detail: selected ? `${formatSats(selected.value)} · ${selected.confirmed ? "confirmed" : "unconfirmed"}` : "Send test coins from the faucet. The address is checked every 15 seconds.",
    },
    {
      title: "Oracle executed Simplicity and co-signed",
      detail: "The service ran the program against this exact transaction before signing.",
    },
    {
      title: "Signed locally and verified",
      detail: "Your browser key signed, then both Schnorr signatures and the leaf were checked.",
    },
    {
      title: "Broadcast to the network",
      meta: result ? shorten(result.txid) : undefined,
      href: result?.explorer_url,
      detail: result ? `${formatSats(result.outputValue)} returned · ${formatSats(result.fee)} fee` : "Sent to the public test network explorer.",
    },
    {
      title: txStatus?.confirmed ? "Confirmed" : "Confirmation",
      meta: txStatus?.confirmed && txStatus.blockHeight ? `block ${txStatus.blockHeight.toLocaleString("en-US")}` : undefined,
      detail: txStatus?.confirmed ? "Included in a block." : result ? (txStatus?.indexed ? "In the mempool, waiting for the next block." : "Waiting for the explorer to index the transaction.") : "Tracked automatically after broadcast.",
    },
  ].map((item, index) => ({
    ...item,
    state: historyState(index),
    error: (index <= 2 ? prepareFailedAt === index : sendFailedAt > 0 && sendIndex(sendFailedAt) === index) ? actionError?.message : undefined,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Live demo</h1>
            {status}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            A Simplicity program decides whether the oracle co-signs a real {config.label} transaction.
          </p>
        </div>
      </div>

      {explorerNotice && <Callout tone="warning">{explorerNotice}</Callout>}

      {offline && (
        <Callout tone="danger">
          <strong>Oracle offline.</strong> Start the Simplicity Unchained service, then click the oracle status in the header to recheck.
          Preparing and signing need it.
        </Callout>
      )}

      <section aria-label="Demo" className={panelClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M16 7a6 6 0 00-11-2M4 3v3h3M4 13a6 6 0 0011 2M16 17v-3h-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Cooperative spend
          </p>
          <p className="text-xs text-muted">Keys stay in this browser tab</p>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-4 rounded-xl bg-white p-4 sm:p-5 md:grid-cols-4">
          {[
            ["Network", config.label],
            ["Program", programTitle],
            ["Funding input", result ? "Spent" : selected ? formatSats(selected.value) : "—"],
            ["Network fee", formatSats(DEMO_FEE_SATS)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-ink sm:text-xl">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-3">
          <section aria-labelledby="program-heading" className={cardClass}>
            <SectionLabel>Step 1</SectionLabel>
            <h2 id="program-heading" className="mb-4 font-semibold text-ink">Choose a program</h2>
            <fieldset disabled={busy} className="space-y-2">
              <legend className="sr-only">Demo program</legend>
              {DEMO_SCENARIOS.map((demo) => {
                const selected = !custom && scenario === demo.id;
                return (
                  <div key={demo.id} className={`rounded-lg border transition-colors ${selected ? "border-brand bg-brand-tint" : "border-line hover:border-brand-soft"}`}>
                    <label className="flex cursor-pointer items-start gap-3 p-3 pb-1.5">
                      <input type="radio" name="demo-scenario" value={demo.id} checked={selected} onChange={() => {
                        if (state.compiledAddress && !window.confirm("Changing the program creates a different address. Spend any current funding first. Your key stays in this tab; prepare the original program again to recover its address.")) return;
                        resetToGuided();
                        setScenario(demo.id);
                        setActionError(null);
                      }} className="mt-0.5 accent-brand" />
                      <span>
                        <span className="block text-sm font-medium text-ink">{demo.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted">{demo.description}</span>
                      </span>
                    </label>
                    <button type="button" onClick={() => setDialog(demo.id)} className="mb-2 ml-9 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><path d="M7 6l-4 4 4 4M13 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      View code
                    </button>
                  </div>
                );
              })}
              {custom && (
                <div className="rounded-lg border border-brand bg-brand-tint p-3">
                  <p className="text-sm font-medium text-ink">Custom program</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">Your own program from Advanced. Pick a scenario above to go back.</p>
                  <button type="button" onClick={() => setDialog("current")} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">View code</button>
                </div>
              )}
            </fieldset>
            {custom && !ready ? (
              <button onClick={openAdvanced} disabled={busy} className={`${buttonPrimary} mt-4 w-full`}>Finish in Advanced ↓</button>
            ) : (
              <button onClick={handlePrepare} disabled={busy || ready || offline} className={`${buttonPrimary} mt-4 w-full`}>
                {state.operation === "preparing" ? "Preparing…" : ready ? (custom ? "Custom program ready" : "Demo prepared") : "Prepare live demo"}
              </button>
            )}
            {state.operation === "preparing" && <p role="status" aria-live="polite" className="mt-2 text-xs text-brand">{state.progress}</p>}
            {ready && (
              <button type="button" onClick={() => setDialog("current")} className={`${buttonSecondary} mt-2 w-full`}>
                View program, witness, and script
              </button>
            )}
          </section>

          <section aria-labelledby="fund-heading" className={cardClass}>
            <SectionLabel>Step 2</SectionLabel>
            <h2 id="fund-heading" className="mb-4 font-semibold text-ink">Fund the address</h2>
            {!ready ? (
              <p className="text-sm text-muted">Prepare the demo to get a funding address.</p>
            ) : (
              <div className="space-y-4">
                <code aria-label="Demo funding address" className="block break-all rounded-lg bg-surface p-3 font-mono text-xs leading-5 text-ink">{state.compiledAddress}</code>
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyAddress} className={buttonSecondary}>{copiedAddress === state.compiledAddress ? "Copied" : "Copy address"}</button>
                  <a href={config.faucet} target="_blank" rel="noopener noreferrer" className={buttonSecondary}>Open faucet ↗</a>
                  <a href={`${config.explorer}/address/${state.compiledAddress}`} target="_blank" rel="noopener noreferrer" className={buttonSecondary}>View address ↗</a>
                </div>
                <dl>
                  <KeyValue label="Suggested amount" hint={state.network === "elements" ? "Unconfidential test L-BTC" : "Test BTC on Testnet4"}>{formatSats(config.suggestedFunding)}</KeyValue>
                  <KeyValue label="Minimum output" hint="A single output must cover the 1,000-sat fee and a 1,000-sat return.">{formatSats(DEMO_FEE_SATS + MIN_DEMO_OUTPUT_SATS)}</KeyValue>
                  {!result && (
                    <KeyValue label="Status">
                      <span className="inline-flex items-center gap-2">
                        {lookupError ? <Pill tone="danger">Lookup failed</Pill> : selected ? <Pill tone="success">Detected</Pill> : <Pill tone="warning" pulse>Waiting</Pill>}
                        <button onClick={() => setRefresh((value) => value + 1)} disabled={busy} className="text-xs font-medium text-brand disabled:opacity-40">Check now</button>
                      </span>
                    </KeyValue>
                  )}
                </dl>
                {!result && eligible.length > 1 && (
                  <label className="block text-xs text-muted">
                    Funding output
                    <select value={selected ? `${selected.txid}:${selected.vout}` : ""} onChange={(event) => setSelectedKey(event.target.value)} disabled={busy}
                      className="mt-1.5 w-full rounded-md border border-line bg-white p-2.5 text-sm text-ink">
                      {eligible.map((output) => <option key={`${output.txid}:${output.vout}`} value={`${output.txid}:${output.vout}`}>
                        {formatSats(output.value)} · {shorten(output.txid)}:{output.vout} ({output.confirmed ? "confirmed" : "unconfirmed"})
                      </option>)}
                    </select>
                  </label>
                )}
                {!result && !selected && !lookupError && outputs.length > 0 && (
                  <p className="text-xs text-warning">Found outputs, but each is below the minimum amount.</p>
                )}
                {!result && lookupError && <Callout tone="danger">{lookupError}</Callout>}
              </div>
            )}
          </section>

          <section aria-labelledby="send-heading" className={`${cardClass} ${result ? "ring-1 ring-success-dot" : ""}`}>
            <SectionLabel>{result ? "Step 4" : "Step 3"}</SectionLabel>
            <h2 id="send-heading" className="mb-4 font-semibold text-ink">{result ? "Inspect the transaction" : "Co-sign and broadcast"}</h2>
            {result ? (
              <div className="space-y-4">
                <dl>
                  <KeyValue label="Network">{DEMO_NETWORKS[result.network].label}</KeyValue>
                  <KeyValue label="Transaction"><span className="font-mono text-xs">{shorten(result.txid)}</span></KeyValue>
                  <KeyValue label="Returned">{formatSats(result.outputValue)}</KeyValue>
                  <KeyValue label="Status">
                    {txStatus?.confirmed
                      ? <Pill tone="success">Block {txStatus.blockHeight?.toLocaleString("en-US")}</Pill>
                      : <Pill tone="brand" pulse>Awaiting block</Pill>}
                  </KeyValue>
                </dl>
                <a href={result.explorer_url} target="_blank" rel="noopener noreferrer" className={`${buttonPrimary} w-full`}>
                  View transaction in explorer ↗
                </a>
                <button onClick={repeat} className={`${buttonSecondary} w-full`}>Repeat with the returned coins</button>
              </div>
            ) : (
              <div className="space-y-4">
                <dl>
                  <KeyValue label="Funding input">{selected ? formatSats(selected.value) : "—"}</KeyValue>
                  <KeyValue label="Returned to address" hint="All value except the fee goes back to the same demo address.">{plan ? formatSats(plan.outputValue) : "—"}</KeyValue>
                  <KeyValue label="Network fee">{formatSats(DEMO_FEE_SATS)}</KeyValue>
                </dl>
                <button onClick={handleSend} disabled={!ready || !selected || busy || Boolean(lookupError) || offline} className={`${buttonPrimary} w-full`}>
                  {state.operation === "sending" ? "Co-signing…" : "Co-sign and broadcast"}
                </button>
                {state.operation === "sending"
                  ? <p role="status" aria-live="polite" className="text-xs text-brand">{state.progress}</p>
                  : <p className="text-xs text-muted">Sends a real {config.label} transaction, not a simulation.</p>}
              </div>
            )}
          </section>
        </div>

        <div className="mt-4">
          <Callout>Demo keys live only in this tab. Keep it open while the address holds funds; reloading loses the key.</Callout>
        </div>
      </section>

      <DemoHistory items={items} />

      {dialog && (() => {
        const showCurrent = dialog === "current" || (!custom && ready && dialog === scenario);
        const info = DEMO_SCENARIOS.find((item) => item.id === (dialog === "current" ? scenario : dialog))!;
        const tabs: CodeTab[] = showCurrent
          ? [
            { id: "program", label: "Simplicity program", code: state.simplicityProgram, kind: "simplicity" },
            ...(state.witProgram.trim() ? [{ id: "witness", label: "Witness", code: state.witProgram, kind: "json" as const }] : []),
            ...(state.bitcoinScript.trim() ? [{ id: "script", label: "Recovery script", code: state.bitcoinScript, kind: "script" as const }] : []),
          ]
          : [{ id: "program", label: "Simplicity program", code: demoProgram(info.id), kind: "simplicity" }];
        return (
          <ProgramDialog
            open
            onClose={() => setDialog(null)}
            title={dialog === "current" && custom ? "Custom program" : info.title}
            subtitle={dialog === "current" && custom ? `Built in Advanced · ${config.label}` : `${info.description} · ${config.label}`}
            notes={dialog === "current" && custom ? undefined : DEMO_PROGRAM_NOTES[info.id]}
            tabs={tabs}
            footnote={showCurrent ? "These exact values are committed to the Simplicity Unchained key and the Taproot address." : "The witness and recovery script are generated from your demo key when you prepare."}
          />
        );
      })()}
    </div>
  );
}
