'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { highlightSimplicitySyntax } from '@/utils/syntaxHighlighter';
import { useApp } from '@/contexts/AppContext';
import { PresetDropdown } from './PresetDropdown';
import { InfoMenu } from './InfoMenu';
import { proxyApi } from '@/services/proxyApi';
import { assertSameProgram } from '@/services/demoFlow';
import { sendGAEvent } from '@next/third-parties/google';

const PRESETS = [
  { fileName: 'check_opcode.simf', label: 'Check Opcode' },
  { fileName: 'sig_verify_with_pubkey_from_script.simf', label: 'Sig Verify With Pubkey From Script' },
  { fileName: 'p2ms.simf', label: 'Pay to Multisig (2-of-3)', elementsOnly: true },
  { fileName: 'transfer_with_timeout.simf', label: 'Transfer With Timeout', elementsOnly: true },
  { fileName: 'escrow_with_delay.simf', label: 'Escrow With Delay', elementsOnly: true },
  { fileName: 'last_will.simf', label: 'Last Will', elementsOnly: true },
  { fileName: 'hodl_vault.simf', label: 'HODL Vault', elementsOnly: true },
  { fileName: 'non_interactive_fee_bump.simf', label: 'Non-Interactive Fee Bump', elementsOnly: true },
];

interface WitnessEntry {
  id: string;
  name: string;
  value: string;
  type: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function witnessEntriesToJson(entries: WitnessEntry[]): string {
  const obj: Record<string, { value: string; type: string }> = {};
  for (const entry of entries) {
    if (entry.name.trim()) {
      obj[entry.name] = { value: entry.value, type: entry.type };
    }
  }
  return JSON.stringify(obj, null, 2);
}

function jsonToWitnessEntries(json: string): WitnessEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Object.entries(parsed).map(([name, data]) => ({
      id: generateId(),
      name,
      value: (data as { value: string; type: string }).value || '',
      type: (data as { value: string; type: string }).type || 'Signature',
    }));
  } catch {
    return [];
  }
}

function normalizeJson(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
}

export function SimplicityProgram() {
  const { state, updateSimplicityProgram, updateWitProgram, saveSimplicityProgram, addLog, showNotification, setOperation } = useApp();
  const [activeTab, setActiveTab] = useState<'simf' | 'wit'>('simf');
  const code = state.simplicityProgram;
  const wit = state.witProgram;
  const displayRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [includeWitness, setIncludeWitness] = useState(true);
  const [witnessEntries, setWitnessEntries] = useState<WitnessEntry[]>(() => jsonToWitnessEntries(wit));
  const isInternalUpdate = useRef(false);
  const lastExternalWit = useRef(wit);

  // Sync witness entries from context only when wit changes externally (e.g., preset loaded)
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    // Only update if wit actually changed from external source
    if (wit !== lastExternalWit.current) {
      lastExternalWit.current = wit;
      const entriesFromJson = jsonToWitnessEntries(wit);
      setWitnessEntries(entriesFromJson);
    }
  }, [wit]);

  // Update context when witness entries change
  const updateWitnessEntry = (id: string, field: keyof WitnessEntry, value: string) => {
    setWitnessEntries(prev => {
      const updated = prev.map(entry =>
        entry.id === id ? { ...entry, [field]: value } : entry
      );
      const json = witnessEntriesToJson(updated);
      // Only update context if JSON content actually changed (ignoring formatting)
      if (normalizeJson(json) !== normalizeJson(lastExternalWit.current)) {
        isInternalUpdate.current = true;
        lastExternalWit.current = json;
        updateWitProgram(json);
      }
      return updated;
    });
  };

  const addWitnessEntry = () => {
    setWitnessEntries(prev => {
      const updated = [...prev, { id: generateId(), name: '', value: '', type: 'Signature' }];
      const json = witnessEntriesToJson(updated);
      if (normalizeJson(json) !== normalizeJson(lastExternalWit.current)) {
        isInternalUpdate.current = true;
        lastExternalWit.current = json;
        updateWitProgram(json);
      }
      return updated;
    });
  };

  const removeWitnessEntry = (id: string) => {
    setWitnessEntries(prev => {
      const updated = prev.filter(entry => entry.id !== id);
      const json = witnessEntriesToJson(updated);
      if (normalizeJson(json) !== normalizeJson(lastExternalWit.current)) {
        isInternalUpdate.current = true;
        lastExternalWit.current = json;
        updateWitProgram(json);
      }
      return updated;
    });
  };

  const lineCount = Math.max(12, code.split('\n').length);

  const highlightedCode = useMemo(() => {
    return highlightSimplicitySyntax(code);
  }, [code]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;
    
    if (displayRef.current) {
      displayRef.current.scrollTop = scrollTop;
      displayRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      const inner = lineNumbersRef.current.firstChild as HTMLElement;
      if (inner) {
        inner.style.transform = `translateY(-${scrollTop}px)`;
      }
    }
  };

  const handleCompileProgram = async () => {
    if (state.operation) return;
    if (!code.trim()) {
      showNotification("Please enter a Simplicity program (simf is required)");
      return;
    }

    setIsCompiling(true);
    setOperation("preparing", "Compiling the Advanced program and requesting its Simplicity Unchained key");
    try {
      // Parse witness JSON if provided, and include it only if switch is enabled
      let witnessData: Record<string, { value: string; type: string }> | undefined = includeWitness ? {} : undefined;
      if (includeWitness && wit.trim()) {
        try {
          witnessData = JSON.parse(wit);
        } catch {
          showNotification("Invalid witness JSON format", true);
          setIsCompiling(false);
          return;
        }
      }

      const response = await proxyApi.compile({
        script: code,
        include_debug: false,
        witness: witnessData,
        environment: state.network,
      });
      
      console.log("Compiled Program (base64):", response.program_base64);
      console.log("Compiled Witness (base64):", response.witness_base64);

      // Call tweak endpoint with the compiled program
      let tweakedPublicKey = '';
      try {
        const tweakResponse = await proxyApi.tweak({
          program: response.program_base64,
          jet_env: state.network,
        });
        
        console.log("Simplicity Unchained key:", tweakResponse.tweaked_public_key_hex);
        console.log("CMR (Commitment Merkle Root):", tweakResponse.cmr_hex);
        assertSameProgram(response.cmr_hex, tweakResponse.cmr_hex);
        tweakedPublicKey = tweakResponse.tweaked_public_key_hex;
      } catch (tweakError) {
        const tweakErrorMessage = tweakError instanceof Error ? tweakError.message : "Unknown error";
        console.error("Tweak computation error:", tweakError);
        addLog(`Failed to compute the Simplicity Unchained key: ${tweakErrorMessage}`);
        showNotification(`Failed to compute the Simplicity Unchained key: ${tweakErrorMessage}`, true);
        
        // Track tweak failure
        sendGAEvent('event', 'error_action', {
          location: 'simplicity_tweak',
        });
        return;
      }

      // Save the compiled program and witness in context (this will add the success log)
      saveSimplicityProgram(response.program_base64, response.witness_base64 || '', tweakedPublicKey, includeWitness);
      
      // Track successful compilation
      sendGAEvent('event', 'success_action', {
        location: 'simplicity_compile',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to compile Simplicity program: ${errorMessage}`);
      showNotification(`Failed to compile Simplicity program: ${errorMessage}`, true);
      console.error("Simplicity program compilation error:", error);
      
      // Track compilation failure
      sendGAEvent('event', 'error_action', {
        location: 'simplicity_compile',
      });
    } finally {
      setIsCompiling(false);
      setOperation(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex items-center gap-1 text-xs text-muted">
          <InfoMenu />
          <span>Jet reference</span>
        </div>
        <PresetDropdown
          presets={PRESETS.filter((preset) => state.network === 'elements' || !preset.elementsOnly)}
          onSelect={(simfContent: string, _presetLabel?: string, witContent?: string) => {
            updateSimplicityProgram(simfContent);
            if (witContent !== undefined) {
              updateWitProgram(witContent);
            } else {
              updateWitProgram('');
            }
          }}
          presetPath="/presets/simplicity"
        />
      </div>
      
      {/* Tab Switcher */}
      <div className="mb-4 flex border-b border-line">
        <button
          onClick={() => setActiveTab('simf')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'simf'
              ? 'text-brand border-b-2 border-brand'
              : 'text-muted hover:text-ink'
          }`}
        >
          Simplicity
        </button>
        <button
          onClick={() => setActiveTab('wit')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'wit'
              ? 'text-brand border-b-2 border-brand'
              : 'text-muted hover:text-ink'
          }`}
        >
          Witness
        </button>
      </div>
      
      <div className="space-y-4">
        {activeTab === 'simf' ? (
          <div className="relative flex max-h-[400px] overflow-hidden rounded-lg bg-code">
            <div
              ref={lineNumbersRef}
              className="border-r border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-zinc-500 select-none overflow-y-hidden"
              style={{ maxHeight: '400px' }}
            >
              <div>
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="h-[24px] leading-[24px] text-right flex-shrink-0">
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div
                ref={displayRef}
                className="absolute inset-0 px-4 py-3 font-mono text-sm leading-[24px] overflow-hidden pointer-events-none"
              >
                {code ? (
                  <pre className="leading-[24px] whitespace-pre">
                    {highlightedCode}
                  </pre>
                ) : (
                  <span className="text-zinc-500">
                    // Enter your Simplicity program code here
                  </span>
                )}
              </div>
              <textarea
                ref={textareaRef}
                className="absolute inset-0 w-full h-full border-0 bg-transparent px-4 py-3 font-mono text-sm text-transparent leading-[24px] caret-[#aae1ff] focus:outline-none resize-none whitespace-pre overflow-auto scrollbar-hide"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
                value={code}
                onChange={(e) => updateSimplicityProgram(e.target.value)}
                onScroll={handleScroll}
                spellCheck={false}
                wrap="off"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {witnessEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(e) => updateWitnessEntry(entry.id, 'name', e.target.value)}
                    placeholder="Name (e.g., SIGNATURE)"
                    className="rounded-md border border-line bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-brand"
                  />
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => updateWitnessEntry(entry.id, 'value', e.target.value)}
                    placeholder="Value (e.g., 0x...)"
                    className="rounded-md border border-line bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-brand"
                  />
                  <input
                    type="text"
                    value={entry.type}
                    onChange={(e) => updateWitnessEntry(entry.id, 'type', e.target.value)}
                    placeholder="Type (e.g., Signature)"
                    className="rounded-md border border-line bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-brand"
                  />
                </div>
                <button
                  onClick={() => removeWitnessEntry(entry.id)}
                  className="p-2 text-muted hover:text-danger transition-colors"
                  title="Remove entry"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={addWitnessEntry}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted hover:text-brand border border-dashed border-line hover:border-brand transition-colors w-full justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add witness entry
            </button>
          </div>
        )}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleCompileProgram}
            disabled={isCompiling || !code.trim()}
            className="bg-brand rounded-md px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCompiling ? "Compiling…" : "Compile and derive Simplicity Unchained key"}
          </button>
          <label className="flex items-center gap-2 text-xs font-medium text-muted cursor-pointer hover:text-ink transition-colors">
            <span>Include witness</span>
            <button
              type="button"
              role="switch"
              aria-checked={includeWitness}
              onClick={() => setIncludeWitness(!includeWitness)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 focus:ring-offset-white ${
                includeWitness ? 'bg-brand' : 'bg-pill'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  includeWitness ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
          {state.savedSimplicityProgram && (
            <svg
              className="w-5 h-5 text-success"
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
        {state.savedSimplicityProgram && state.tweakedPublicKey && (
          <p className="break-all rounded-lg bg-success-tint p-3 font-mono text-xs text-ink">
            <span className="mr-2 font-sans font-medium text-success">Simplicity Unchained key for this program</span>{state.tweakedPublicKey}
          </p>
        )}
      </div>
    </div>
  );
}
