'use client';

import { useMemo, useRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { highlightSimplicitySyntax } from '@/utils/syntaxHighlighter';
import { useApp } from '@/contexts/AppContext';
import { PresetDropdown } from './PresetDropdown';
import { InfoMenu } from './InfoMenu';
import { proxyApi } from '@/services/proxyApi';

const PRESETS = [
  { fileName: 'check_opcode.simf', label: 'Check Opcode' },
  { fileName: 'sig_verify_with_pubkey_from_script.simf', label: 'Sig Verify With Pubkey From Script' },
];

export function SimplicityProgram() {
  const { state, updateSimplicityProgram, updateWitProgram, saveSimplicityProgram, addLog, showNotification } = useApp();
  const [activeTab, setActiveTab] = useState<'simf' | 'wit'>('simf');
  const code = state.simplicityProgram;
  const wit = state.witProgram;
  const displayRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [includeWitness, setIncludeWitness] = useState(true);

  const activeContent = activeTab === 'simf' ? code : wit;
  const lineCount = Math.max(12, activeContent.split('\n').length);
  
  const highlightedCode = useMemo(() => {
    if (activeTab === 'wit') {
      // For wit (JSON), use basic JSON formatting
      try {
        const parsed = JSON.parse(wit);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return wit;
      }
    }
    return highlightSimplicitySyntax(code);
  }, [code, wit, activeTab]);

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
    if (!code.trim()) {
      showNotification("Please enter a Simplicity program (simf is required)");
      return;
    }

    setIsCompiling(true);
    try {
      // Parse witness JSON if provided, and include it only if switch is enabled
      let witnessData: Record<string, { value: string; type: string }> | undefined;
      if (includeWitness && wit.trim()) {
        try {
          witnessData = JSON.parse(wit);
        } catch (parseError) {
          showNotification("Invalid witness JSON format", true);
          setIsCompiling(false);
          return;
        }
      }

      const response = await proxyApi.compile({
        script: code,
        include_debug: false,
        witness: witnessData,
      });
      
      console.log("Compiled Program (base64):", response.program_base64);
      console.log("Compiled Witness (base64):", response.witness_base64);

      // Call tweak endpoint with the compiled program
      let tweakedPublicKey = '';
      try {
        const tweakResponse = await proxyApi.tweak({
          program: response.program_base64,
        });
        
        console.log("Tweaked Public Key:", tweakResponse.tweaked_public_key_hex);
        console.log("CMR (Commitment Merkle Root):", tweakResponse.cmr_hex);
        tweakedPublicKey = tweakResponse.tweaked_public_key_hex;
      } catch (tweakError) {
        const tweakErrorMessage = tweakError instanceof Error ? tweakError.message : "Unknown error";
        console.error("Tweak computation error:", tweakError);
        addLog(`Failed to compute tweaked public key: ${tweakErrorMessage}`);
      }

      // Save the compiled program and witness in context (this will add the success log)
      saveSimplicityProgram(response.program_base64, response.witness_base64 || '', tweakedPublicKey, includeWitness);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to compile Simplicity program: ${errorMessage}`);
      showNotification("Failed to compile Simplicity program", true);
      console.error("Simplicity program compilation error:", error);
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <section className="border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 relative">
          <h2 className="text-lg font-semibold text-zinc-100">
            Simplicity Program
          </h2>
          {/* OPTION 2: InfoMenu in SimplicityProgram (CURRENTLY ACTIVE) */}
          <InfoMenu />
        </div>
        <PresetDropdown
          presets={PRESETS}
          onSelect={(simfContent: string, witContent?: string) => {
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
      <div className="mb-4 flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('simf')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'simf'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Simplicity
        </button>
        <button
          onClick={() => setActiveTab('wit')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'wit'
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Witness
        </button>
      </div>
      
      <div className="space-y-4">
        <div className="relative flex border border-zinc-700 bg-zinc-950 max-h-[400px]">
          <div
            ref={lineNumbersRef}
            className="border-r border-zinc-800 bg-zinc-900/50 px-4 py-3 font-mono text-xs text-zinc-500 select-none overflow-y-hidden"
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
              {activeContent ? (
                activeTab === 'wit' ? (
                  <SyntaxHighlighter
                    language="json"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: 0,
                      background: 'transparent',
                      fontSize: '14px',
                      lineHeight: '24px',
                    }}
                    codeTagProps={{
                      style: {
                        fontFamily: 'inherit',
                      }
                    }}
                  >
                    {wit}
                  </SyntaxHighlighter>
                ) : (
                  <pre className="leading-[24px] whitespace-pre">
                    {highlightedCode}
                  </pre>
                )
              ) : (
                <span className="text-zinc-600">
                  {activeTab === 'simf'
                    ? '// Enter your Simplicity program code here'
                    : '// Enter witness JSON here (optional)'}
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
              value={activeContent}
              onChange={(e) => {
                if (activeTab === 'simf') {
                  updateSimplicityProgram(e.target.value);
                } else {
                  updateWitProgram(e.target.value);
                }
              }}
              onScroll={handleScroll}
              spellCheck={false}
              wrap="off"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleCompileProgram}
            disabled={isCompiling || !code.trim()}
            className="bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCompiling ? "Compiling..." : "Compile and request tweaked pubkey"}
          </button>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-400 cursor-pointer hover:text-zinc-300 transition-colors">
            <span>Include witness</span>
            <button
              type="button"
              role="switch"
              aria-checked={includeWitness}
              onClick={() => setIncludeWitness(!includeWitness)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:ring-offset-zinc-950 ${
                includeWitness ? 'bg-emerald-600' : 'bg-zinc-700'
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
