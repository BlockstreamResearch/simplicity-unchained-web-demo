"use client";

import type { ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
import { GuidedDemo } from "./GuidedDemo";
import { SimplicityProgram } from "./SimplicityProgram";
import { BitcoinScript } from "./BitcoinScript";
import { CosignKey, derivePublicKey, ManualSpend } from "./SendTransaction";
import { Logs } from "./Logs";
import { panelClass, Pill } from "./ui";

function Chevron() {
  return (
    <svg className="h-4 w-4 text-muted transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BuilderStep({ letter, title, description, done, children }: {
  letter: string; title: string; description: string; done: boolean; children: ReactNode;
}) {
  return (
    <section aria-label={`Step ${letter}: ${title}`} className="rounded-xl bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-success-tint text-success" : "bg-brand-tint text-brand"}`}>
          {done ? "✓" : letter}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink">{title}</h3>
            {done ? <Pill tone="success">Done</Pill> : <Pill>To do</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function DemoWorkspace() {
  const { state } = useApp();
  const keyDone = Boolean(derivePublicKey(state.cosignSecretKey));
  const programDone = state.savedSimplicityProgram && state.compiledWithWitnessForTransaction;
  const addressDone = state.savedBitcoinScript;
  const doneCount = [keyDone, programDone, addressDone].filter(Boolean).length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <GuidedDemo />

      <details id="advanced" className={`group scroll-mt-4 ${panelClass}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              Advanced · Build your own program
              {state.programOrigin === "custom" && <Pill tone="brand">{doneCount} of 3 done</Pill>}
            </span>
            <span className="mt-0.5 block text-xs text-muted">Write a Simplicity program and recovery script, then fund and send it with Steps 2 and 3 above.</span>
          </span>
          <Chevron />
        </summary>

        <fieldset disabled={Boolean(state.operation)} className="mt-4 min-w-0 space-y-4">
          <legend className="sr-only">Custom program builder</legend>
          <ol className="grid gap-2 rounded-xl bg-white p-4 text-xs text-muted sm:grid-cols-4 sm:p-5">
            {[
              ["A", "Key", "your signing key", keyDone],
              ["B", "Program", "compiled with witness", programDone],
              ["C", "Address", "recovery script + Taproot", addressDone],
              ["→", "Fund & send", "Steps 2 and 3 above", false],
            ].map(([letter, title, detail, done]) => (
              <li key={String(letter)} className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-success-tint text-success" : "bg-surface text-muted"}`}>{done ? "✓" : letter}</span>
                <span><span className="block font-medium text-ink">{title}</span>{detail}</span>
              </li>
            ))}
          </ol>

          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <BuilderStep letter="A" title="Your key" description="Signs your half of the cooperative spend. Kept only in this tab." done={keyDone}>
              <CosignKey />
            </BuilderStep>
            <BuilderStep letter="B" title="Program and witness" description="Pick a preset or write your own, then compile it with its witness." done={programDone}>
              <SimplicityProgram />
            </BuilderStep>
          </div>

          <BuilderStep letter="C" title="Recovery script and address" description="Binds the service key to the compiled program and exact recovery script, then builds the Taproot address." done={addressDone}>
            <BitcoinScript />
          </BuilderStep>

          <details className="group/manual rounded-xl bg-white p-4 sm:p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              Spend a specific output manually
              <svg className="h-4 w-4 text-muted transition-transform group-open/manual:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </summary>
            <div className="mt-3"><ManualSpend /></div>
          </details>
        </fieldset>
      </details>

      <details className={`group ${panelClass}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-medium text-ink">Execution log</span>
          <Chevron />
        </summary>
        <div className="mt-4"><Logs /></div>
      </details>
    </main>
  );
}
