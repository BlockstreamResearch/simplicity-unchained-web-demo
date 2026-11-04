"use client";

import { useApp } from "@/contexts/AppContext";
import { proxyApi } from "@/services/proxyApi";
import { useState } from "react";
import { fetchExplorerOutput } from "@/services/explorer";
import { sendDemoTransaction } from "@/services/demoFlow";
import { createSpendPlan, DEMO_NETWORKS, type DemoNetwork } from "@/utils/demo";
import { secp256k1, schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { sendGAEvent } from "@next/third-parties/google";
import { buttonPrimary, buttonSecondary, Callout, formatSats, inputClass, KeyValue } from "./ui";

export function derivePublicKey(secretKey: string) {
  if (!/^[0-9a-fA-F]{64}$/.test(secretKey)) return null;
  try {
    return Buffer.from(secp256k1.getPublicKey(Buffer.from(secretKey, "hex"), true)).toString("hex");
  } catch {
    return null;
  }
}

export function CosignKey() {
  const { state, updateTransactionForm, addLog, showNotification } = useApp();
  const [showSign, setShowSign] = useState(false);
  const [message, setMessage] = useState("");
  const [isHex, setIsHex] = useState(false);
  const [signature, setSignature] = useState<{ hash: string; signature: string } | null>(null);
  const publicKey = derivePublicKey(state.cosignSecretKey);
  const setKey = (key: string) => updateTransactionForm(state.inputTransactionHash, state.inputIndex, key);

  const generate = () => {
    const key = Buffer.from(secp256k1.utils.randomSecretKey()).toString("hex");
    setKey(key);
    addLog(`Keypair generated - Public Key: ${derivePublicKey(key)}`);
    showNotification("New key generated");
  };

  const sign = () => {
    try {
      if (!publicKey) throw new Error("Enter or generate a valid key first.");
      if (!message.trim()) throw new Error("Enter a message to sign.");
      if (isHex && !/^(?:[0-9a-fA-F]{2})+$/.test(message.trim())) throw new Error("Hex messages need an even number of hex digits.");
      const bytes = isHex ? Buffer.from(message.trim(), "hex") : new TextEncoder().encode(message);
      const hash = sha256(bytes);
      const sig = schnorr.sign(hash, Buffer.from(state.cosignSecretKey, "hex"));
      const result = { hash: Buffer.from(hash).toString("hex"), signature: Buffer.from(sig).toString("hex") };
      setSignature(result);
      addLog(`Message signed · hash ${result.hash} · signature ${result.signature}`);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : String(error), true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          aria-label="Secret key"
          type="text"
          value={state.cosignSecretKey}
          onChange={(event) => setKey(event.target.value.trim())}
          placeholder="64 hex characters, or generate one"
          className={inputClass}
          spellCheck={false}
        />
        <button type="button" onClick={generate} className={`${buttonSecondary} shrink-0`}>Generate</button>
      </div>
      {state.cosignSecretKey && !publicKey && <p className="text-xs text-danger">Not a valid secp256k1 secret key (64 hex characters).</p>}
      {publicKey && (
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-muted">Public key</p>
          <p className="mt-1 break-all font-mono text-xs text-ink">{publicKey}</p>
        </div>
      )}
      <button type="button" onClick={() => setShowSign((value) => !value)} disabled={!publicKey} className="text-xs font-medium text-brand hover:underline disabled:text-subtle disabled:no-underline">
        {showSign ? "Hide message signing" : "Sign a message for a witness…"}
      </button>
      {showSign && publicKey && (
        <div className="space-y-2 rounded-lg bg-surface p-3">
          <p className="text-xs text-muted">Produces a BIP-340 signature over SHA-256(message). Paste it into a <code>Signature</code> witness.</p>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} placeholder={isHex ? "Hex bytes" : "Message text"} className={inputClass} />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={isHex} onChange={(event) => setIsHex(event.target.checked)} className="accent-brand" />
              Message is hex
            </label>
            <button type="button" onClick={sign} className={buttonSecondary}>Sign</button>
          </div>
          {signature && (
            <dl className="rounded-md bg-white px-3">
              <KeyValue label="Message hash"><span className="break-all font-mono text-[11px]">0x{signature.hash}</span></KeyValue>
              <KeyValue label="Signature"><span className="break-all font-mono text-[11px]">0x{signature.signature}</span></KeyValue>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

export function ManualSpend() {
  const { state, updateTransactionForm, canSendTransaction, addLog, showNotification, setOperation, completeTransaction } = useApp();
  const [isSending, setIsSending] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const [review, setReview] = useState<{
    funding: { txid: string; vout: number; value: number; asset?: string };
    address: string;
    publicKey: string;
    network: DemoNetwork;
  } | null>(null);
  const currentReview = review && review.address === state.compiledAddress
    && review.publicKey === state.compiledUserPubkey && review.network === state.network
    && review.funding.txid === state.inputTransactionHash.trim()
    && review.funding.vout === Number(state.inputIndex) ? review : null;
  const ready = canSendTransaction();
  const disabled = !ready || Boolean(state.operation) || isSending || !state.inputTransactionHash.trim() || state.inputIndex === "";

  const handleSend = async () => {
    setTransactionError("");
    setIsSending(true);
    setOperation("sending", currentReview ? "Creating the transaction" : "Reading the funding output");
    try {
      if (!currentReview) {
        const txid = state.inputTransactionHash.trim();
        const vout = Number(state.inputIndex);
        const output = await fetchExplorerOutput(DEMO_NETWORKS[state.network].api, txid, vout);
        createSpendPlan(output.value);
        if (state.network === "elements" && output.asset !== DEMO_NETWORKS.elements.asset) {
          throw new Error("Use an explicit Liquid Testnet L-BTC output.");
        }
        setReview({
          funding: { ...output, txid, vout }, address: state.compiledAddress,
          publicKey: state.compiledUserPubkey, network: state.network,
        });
        return;
      }
      const result = await sendDemoTransaction(state, currentReview.funding, proxyApi, (message) => {
        setOperation("sending", message);
        addLog(message);
      });
      completeTransaction(result);
      setReview(null);
      addLog(`Transaction broadcast: ${result.explorer_url}`);
      showNotification("Transaction broadcast. Open it in the explorer.");
      sendGAEvent("event", "success_action", { location: "transaction_send" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setTransactionError(errorMessage);
      addLog(`Transaction failed: ${errorMessage}`);
      showNotification("Transaction failed", true);
      sendGAEvent("event", "error_action", { location: "transaction_send" });
    } finally {
      setIsSending(false);
      setOperation(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Only needed when automatic funding detection cannot see your output. Uses the same co-sign and broadcast flow as Step 3.
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
        <input
          aria-label="Funding transaction ID"
          type="text"
          value={state.inputTransactionHash}
          onChange={(event) => updateTransactionForm(event.target.value, state.inputIndex, state.cosignSecretKey)}
          placeholder="Funding transaction ID"
          className={inputClass}
        />
        <input
          aria-label="Output index"
          type="number"
          min={0}
          value={state.inputIndex}
          onChange={(event) => updateTransactionForm(state.inputTransactionHash, event.target.value, state.cosignSecretKey)}
          placeholder="Output #"
          className={`${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        />
      </div>
      {currentReview && (
        <dl className="rounded-lg bg-surface px-3">
          <KeyValue label="Funding input">{formatSats(currentReview.funding.value)}</KeyValue>
          <KeyValue label="Returned to address">{formatSats(createSpendPlan(currentReview.funding.value).outputValue)}</KeyValue>
          <KeyValue label="Network fee">{formatSats(createSpendPlan(currentReview.funding.value).fee)}</KeyValue>
        </dl>
      )}
      <button type="button" onClick={() => void handleSend()} disabled={disabled} className={buttonPrimary}>
        {isSending ? "Working…" : currentReview ? "Co-sign and broadcast" : "Review output"}
      </button>
      {!ready && <p className="text-xs text-muted">Finish steps A–C first.</p>}
      {transactionError && <Callout tone="danger">{transactionError}</Callout>}
    </div>
  );
}
