"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { highlightSimplicitySyntax } from "@/utils/syntaxHighlighter";
import { highlightBitcoinScript } from "@/utils/bitcoinScriptHighlighter";
import { buttonSecondary } from "./ui";

export interface CodeTab {
  id: string;
  label: string;
  code: string;
  kind: "simplicity" | "script" | "json";
}

function displayLines(tab: CodeTab) {
  return (tab.kind === "script" ? tab.code.trim().replaceAll(" OP_", "\nOP_") : tab.code).split("\n");
}

function highlightLine(kind: CodeTab["kind"], line: string): ReactNode {
  if (!line) return " ";
  if (kind === "simplicity") return highlightSimplicitySyntax(line);
  if (kind === "script") return highlightBitcoinScript(line);
  return <span className="text-zinc-200">{line}</span>;
}

export function ProgramDialog({
  open, onClose, title, subtitle, notes, tabs, footnote,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  notes?: string[];
  tabs: CodeTab[];
  footnote?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const [copied, setCopied] = useState("");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const lines = active ? displayLines(active) : [];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.code);
    setCopied(active.id);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
      aria-labelledby="program-dialog-title"
      className="m-auto w-[min(64rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50 backdrop:backdrop-blur-sm"
    >
      {open && active && (
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div>
              <h2 id="program-dialog-title" className="text-xl font-semibold">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            <button onClick={onClose} autoFocus className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Close">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_18rem]">
            <div className="min-w-0 p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {tabs.length > 1 ? (
                  <div role="tablist" aria-label="Code" className="flex rounded-lg bg-surface p-1">
                    {tabs.map((tab) => (
                      <button key={tab.id} role="tab" aria-selected={tab.id === active.id} onClick={() => setActiveId(tab.id)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab.id === active.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : <p className="text-sm font-medium text-muted">{active.label}</p>}
                <button onClick={() => void copy()} className={buttonSecondary}>{copied === active.id ? "Copied" : "Copy"}</button>
              </div>
              <pre className="overflow-hidden rounded-xl bg-code py-4 font-mono text-[15px] leading-7">
                {lines.map((line, index) => (
                  <div key={index} className="flex">
                    <span aria-hidden className="w-12 shrink-0 select-none border-r border-white/10 pr-3 text-right text-sm text-zinc-500">{index + 1}</span>
                    <code className="min-w-0 flex-1 whitespace-pre-wrap break-all pl-5 pr-5">{highlightLine(active.kind, line)}</code>
                  </div>
                ))}
              </pre>
              {footnote && <p className="mt-3 text-xs text-muted">{footnote}</p>}
            </div>

            {notes && notes.length > 0 && (
              <aside className="border-t border-line bg-surface p-6 lg:border-l lg:border-t-0">
                <h3 className="mb-3 text-sm font-semibold">What the oracle checks</h3>
                <ol className="space-y-3">
                  {notes.map((note, index) => (
                    <li key={note} className="flex gap-3 text-sm leading-6 text-ink">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand">{index + 1}</span>
                      {note}
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
