"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { highlightBitcoinScript } from "@/utils/bitcoinScriptHighlighter";
import { useApp } from "@/contexts/AppContext";
import { PresetDropdown } from "./PresetDropdown";
import { proxyApi } from "@/services/proxyApi";
import { API_CONFIG } from "@/config/api.config";
import { sendGAEvent } from '@next/third-parties/google';

const PRESETS = [
  {
    fileName: '2-of-2-multisig.bs',
    label: '2-of-2 Multisig',
    description: 'Standard m-of-n multisig. https://github.com/bitcoin/bips/blob/master/bip-0011.mediawiki'
  },
];

type ScriptViewMode = 'raw' | 'simplified';

function buildMultisigScript(suTweakedPubkey: string, userPubkey: string): string {
  const suHex = suTweakedPubkey.startsWith('0x') ? suTweakedPubkey : `0x${suTweakedPubkey}`;
  const userHex = userPubkey.startsWith('0x') ? userPubkey : `0x${userPubkey}`;
  return `OP_PUSHNUM_2 OP_PUSHBYTES_33 ${suHex} OP_PUSHBYTES_33 ${userHex} OP_PUSHNUM_2 OP_CHECKMULTISIG`;
}

export function BitcoinScript() {
  const { state, updateBitcoinScript, saveBitcoinScript, addLog, showNotification } = useApp();
  const script = state.bitcoinScript;
  const displayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [scriptViewMode, setScriptViewMode] = useState<ScriptViewMode>('raw');
  const [suTweakedPubkey, setSuTweakedPubkey] = useState('');
  const [userPubkey, setUserPubkey] = useState('');

  const isMultisigPreset = selectedPreset === '2-of-2 Multisig';

  useEffect(() => {
    if (scriptViewMode === 'simplified' && isMultisigPreset && suTweakedPubkey && userPubkey) {
      const newScript = buildMultisigScript(suTweakedPubkey, userPubkey);
      // Only update if the script actually changed
      if (newScript !== script) {
        updateBitcoinScript(newScript);
      }
    }
  }, [suTweakedPubkey, userPubkey, scriptViewMode, isMultisigPreset, script, updateBitcoinScript]);

  const handlePresetSelect = (content: string, presetLabel?: string) => {
    setSelectedPreset(presetLabel || null);
    setScriptViewMode('raw');
    setSuTweakedPubkey('');
    setUserPubkey('');
    updateBitcoinScript(content);
  };

  const highlightedScript = useMemo(() => {
    return highlightBitcoinScript(script);
  }, [script]);

  const handleScroll = (e: React.UIEvent<HTMLInputElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    if (displayRef.current) {
      displayRef.current.scrollLeft = scrollLeft;
    }
  };

  const handleSaveScript = async () => {
    if (!script.trim()) {
      showNotification("Please enter a Bitcoin script");
      return;
    }

    setIsCompiling(true);
    try {
      const response = await proxyApi.convert({ 
        script,
        network: state.network === "elements" ? API_CONFIG.NETWORK : API_CONFIG.BITCOIN_NETWORK
      });
      
      // Save the compiled hex and address in context
      saveBitcoinScript(response.hex, response.address);
      
      // Log the address
      console.log("Generated Address:", response.address);
      console.log("Compiled Hex:", response.hex);
      
      // Track successful compilation
      sendGAEvent('event', 'success_action', {
        location: 'bitcoin_script_compile',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to compile Bitcoin script: ${errorMessage}`);
      showNotification("Failed to compile Bitcoin script", true);
      console.error("Bitcoin script compilation error:", error);
      
      // Track compilation failure
      sendGAEvent('event', 'error_action', {
        location: 'bitcoin_script_compile',
      });
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <section className="border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Bitcoin Script
        </h2>
        <PresetDropdown
          presets={PRESETS}
          onSelect={handlePresetSelect}
          presetPath="/presets/bitcoin_script"
        />
      </div>
      <div className="space-y-4">
        {isMultisigPreset && (
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-zinc-400">View mode:</span>
            <div className="flex border border-zinc-700 rounded overflow-hidden">
              <button
                onClick={() => setScriptViewMode('raw')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  scriptViewMode === 'raw'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Bitcoin Script Raw
              </button>
              <button
                onClick={() => setScriptViewMode('simplified')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  scriptViewMode === 'simplified'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Bitcoin Script Simplified
              </button>
            </div>
          </div>
        )}

        {scriptViewMode === 'simplified' && isMultisigPreset ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-zinc-400">
                SU Tweaked Oracle Pubkey
              </label>
              <input
                type="text"
                value={suTweakedPubkey}
                onChange={(e) => setSuTweakedPubkey(e.target.value)}
                placeholder="033523982d58e94be3b735731593f8225043880d53727235b566c515d24a0f7baf"
                className="w-full border border-zinc-700 bg-zinc-950 px-4 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-zinc-400">
                User Pubkey
              </label>
              <input
                type="text"
                value={userPubkey}
                onChange={(e) => setUserPubkey(e.target.value)}
                placeholder="025eb4655feae15a304653e27441ca8e8ced2bef89c22ab6b20424b4c07b3d14cc"
                className="w-full border border-zinc-700 bg-zinc-950 px-4 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        ) : (
          <div className="flex border border-zinc-700 bg-zinc-950">
            <div className="flex items-center border-r border-zinc-800 bg-zinc-900/50 px-3 font-mono text-xs text-zinc-500 select-none">
              1
            </div>
            <div className="flex-1 relative overflow-hidden h-16">
              <div
                ref={displayRef}
                className="absolute inset-0 px-4 py-4 font-mono text-sm overflow-hidden pointer-events-none whitespace-nowrap flex items-center"
              >
                {script ? (
                  <span className="whitespace-nowrap">{highlightedScript}</span>
                ) : (
                  <span className="text-zinc-600">
                    // Enter your Bitcoin script code here
                  </span>
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={script}
                onChange={(e) => updateBitcoinScript(e.target.value)}
                onScroll={handleScroll}
                className="absolute inset-0 w-full bg-transparent px-4 py-4 font-mono text-sm text-transparent caret-amber-400 placeholder-transparent focus:outline-none border-0 overflow-x-auto scrollbar-hide"
                placeholder="// Enter your Bitcoin script code here"
                spellCheck={false}
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSaveScript}
            disabled={isCompiling || !script.trim()}
            className="bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCompiling ? "Compiling..." : "Compile and generate P2WSH address"}
          </button>
          {state.savedBitcoinScript && (
            <svg
              className="w-5 h-5 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}
