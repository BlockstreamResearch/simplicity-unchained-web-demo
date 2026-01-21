"use client";

import { useMemo, useRef, useState } from "react";
import { highlightBitcoinScript } from "@/utils/bitcoinScriptHighlighter";
import { useApp } from "@/contexts/AppContext";
import { PresetDropdown } from "./PresetDropdown";
import { proxyApi } from "@/services/proxyApi";
import { API_CONFIG } from "@/config/api.config";

const PRESETS = [
  { 
    fileName: '2-of-2-multisig.bs', 
    label: '2-of-2 Multisig',
    description: 'Standard m-of-n multisig. https://github.com/bitcoin/bips/blob/master/bip-0011.mediawiki'
  },
];

export function BitcoinScript() {
  const { state, updateBitcoinScript, saveBitcoinScript, addLog, showNotification } = useApp();
  const script = state.bitcoinScript;
  const displayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);

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
        network: API_CONFIG.NETWORK 
      });
      
      // Save the compiled hex and address in context
      saveBitcoinScript(response.hex, response.address);
      
      // Log the address
      console.log("Generated Address:", response.address);
      console.log("Compiled Hex:", response.hex);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to compile Bitcoin script: ${errorMessage}`);
      showNotification("Failed to compile Bitcoin script", true);
      console.error("Bitcoin script compilation error:", error);
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
          onSelect={(content) => updateBitcoinScript(content)}
          presetPath="/presets/bitcoin_script"
        />
      </div>
      <div className="space-y-4">
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
