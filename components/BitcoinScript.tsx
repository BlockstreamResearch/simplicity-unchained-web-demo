"use client";

import { useMemo, useRef, useState } from "react";
import { highlightBitcoinScript } from "@/utils/bitcoinScriptHighlighter";
import { useApp } from "@/contexts/AppContext";
import { PresetDropdown } from "./PresetDropdown";
import { proxyApi } from "@/services/proxyApi";
import { prepareAddress } from "@/services/demoFlow";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sendGAEvent } from "@next/third-parties/google";
import { recoveryScriptForKey } from "@/utils/demo";
import { derivePublicKey } from "./SendTransaction";
import { buttonPrimary, buttonSecondary, scrollToFunding } from "./ui";

const PRESETS = [{
  fileName: "signature-recovery.bs",
  label: "Signature Recovery",
  description: "A Schnorr recovery leaf with compressed-key metadata for the script-inspection jets. Replace both keys with your recovery key.",
}];

export function BitcoinScript() {
  const { state, updateBitcoinScript, saveBitcoinScript, addLog, showNotification, setOperation } = useApp();
  const displayRef = useRef<HTMLDivElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const script = state.bitcoinScript;
  const highlightedScript = useMemo(() => highlightBitcoinScript(script), [script]);

  const handleSaveScript = async () => {
    if (state.operation) return;
    if (!script.trim() || !state.savedSimplicityProgram || !state.cosignSecretKey) {
      showNotification("Compile the Simplicity program and enter or generate a cosign key first", true);
      return;
    }
    setIsCompiling(true);
    setOperation("preparing", "Building the Advanced Taproot address");
    try {
      if (!/^[0-9a-fA-F]{64}$/.test(state.cosignSecretKey)) {
        throw new Error("Cosign secret key must be 32 bytes of hexadecimal");
      }
      const userPubkey = Buffer.from(secp256k1.getPublicKey(
        Buffer.from(state.cosignSecretKey, "hex"), true,
      )).toString("hex");
      const response = await prepareAddress(
        state.network,
        { program_base64: state.compiledProgramBase64, cmr_hex: state.compiledCmr },
        script,
        userPubkey,
        proxyApi,
      );
      saveBitcoinScript(response.compiledHex, response.compiledAddress, response.userLeafHash, userPubkey, response.tweakedPublicKey);
      sendGAEvent("event", "success_action", { location: "bitcoin_script_compile" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Failed to generate Taproot address: ${message}`);
      showNotification(`Failed to generate Taproot address: ${message}`, true);
      sendGAEvent("event", "error_action", { location: "bitcoin_script_compile" });
    } finally {
      setIsCompiling(false);
      setOperation(null);
    }
  };

  const publicKey = derivePublicKey(state.cosignSecretKey);
  const missing = !publicKey ? "Add a key in step A first." : !state.savedSimplicityProgram ? "Compile the program in step B first." : !state.compiledWithWitnessForTransaction ? "Compile step B with \"Include witness\" on." : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          A Bitcoin Script you could use on your own to recover funds. Programs can inspect it with <code>get_opcode_from_script</code> and <code>get_pubkey_from_script</code>.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => publicKey && updateBitcoinScript(recoveryScriptForKey(publicKey))}
            disabled={!publicKey}
            title={publicKey ? "Recovery script with your public key" : "Add a key in step A first"}
            className={buttonSecondary}
          >
            Use my key
          </button>
          <PresetDropdown presets={PRESETS} onSelect={updateBitcoinScript} presetPath="/presets/bitcoin_script" />
        </div>
      </div>
      <div className="flex overflow-hidden rounded-lg bg-code">
        <div className="flex items-center border-r border-white/10 px-3 font-mono text-xs text-zinc-500">1</div>
        <div className="relative h-14 flex-1 overflow-hidden">
          <div ref={displayRef} className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-nowrap px-4 font-mono text-sm">
            {script ? <span className="whitespace-pre">{highlightedScript}</span> : <span className="text-zinc-500">Click “Use my key”, pick a preset, or type a script</span>}
          </div>
          <input
            aria-label="Recovery Bitcoin script"
            type="text"
            value={script}
            onChange={(event) => updateBitcoinScript(event.target.value)}
            onScroll={(event) => {
              if (displayRef.current) displayRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
            spellCheck={false}
            className="absolute inset-0 w-full bg-transparent px-4 font-mono text-sm text-transparent caret-amber-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSaveScript}
          disabled={isCompiling || !script.trim() || Boolean(missing)}
          className={buttonPrimary}
        >
          {isCompiling ? "Building…" : "Build Taproot address"}
        </button>
        {missing && <p className="text-xs text-muted">{missing}</p>}
      </div>
      {state.savedBitcoinScript && (
        <div className="space-y-2 rounded-lg bg-success-tint p-3">
          <p className="text-xs font-medium text-success">Address ready: oracle + user cooperative leaf and this recovery leaf.</p>
          <p className="break-all font-mono text-xs text-ink">Script-bound service key: {state.tweakedPublicKey}</p>
          <p className="break-all font-mono text-xs text-ink">{state.compiledAddress}</p>
          <button type="button" onClick={scrollToFunding} className={buttonPrimary}>Fund it in Step 2 ↑</button>
        </div>
      )}
    </div>
  );
}
