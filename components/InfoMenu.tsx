'use client';

import { useState, useRef } from 'react';
import { highlightSimplicitySyntax } from '@/utils/syntaxHighlighter';

interface JetInfo {
  signature: string;
  description: string;
}

const JET_FUNCTIONS: JetInfo[] = [
  {
    signature: 'jet::get_opcode_from_script(U8) -> U8',
    description: 'Given an index, return the opcode at that index.',
  },
  {
    signature: 'jet::get_pubkey_from_script(U8) -> Pubkey',
    description: 'Each pubkey is encoded as: [OP_PUSHBYTES_33][0x02 or 0x03][32 bytes X coordinate]. Returns X only pubkeys from a script at the given index. Index should point to OP_PUSHBYTES_33 opcode in the script.',
  },
];

export function InfoMenu() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!isOpen) {
    return (
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(true)}
        className="text-zinc-400 hover:text-blue-400 transition-colors"
        title="Open Jet Functions"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(false)}
        className="text-blue-400 hover:text-blue-300 transition-colors"
        title="Close Jet Functions"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </button>
      <aside className="absolute left-0 top-12 z-50 w-80 border border-zinc-800 bg-zinc-900 shadow-xl max-h-[calc(100vh-12rem)] overflow-y-auto">
        <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">
            Jet Functions
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-zinc-800 transition-colors rounded"
            title="Close Jet Functions"
          >
            <svg className="w-5 h-5 text-zinc-400 hover:text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
        {JET_FUNCTIONS.map((jet, index) => (
          <div
            key={index}
            className="border border-zinc-700 bg-zinc-950"
          >
            <div className="px-4 py-3 flex items-start justify-between gap-2">
              <button
                onClick={() => toggleExpand(index)}
                className="flex-1 text-left hover:opacity-80 transition-opacity"
              >
                <code className="text-xs font-mono break-all">
                  {highlightSimplicitySyntax(jet.signature)}
                </code>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => copyToClipboard(jet.signature, index)}
                  className="p-1 hover:bg-zinc-800 transition-colors rounded"
                  title="Copy function signature"
                >
                  {copiedIndex === index ? (
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => toggleExpand(index)}
                  className="p-1 hover:bg-zinc-800 transition-colors rounded"
                >
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform ${
                      expandedIndex === index ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
            {expandedIndex === index && (
              <div className="px-4 pb-3 pt-1 border-t border-zinc-700">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {jet.description}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
      </aside>
    </>
  );
}
