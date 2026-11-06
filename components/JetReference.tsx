"use client";

import { useEffect, useState } from "react";
import { policyApi } from "@/services/policyApi";
import { liquidPolicyApi } from "@/services/liquidPolicyApi";
import { JET_DESCRIPTIONS, LIQUID_JET_DESCRIPTIONS } from "@/services/jetDescriptions";
import { DEMO_NETWORKS, type DemoNetwork } from "@/services/demoNetworks";
import type { PolicyJetMetadata } from "@/services/policyTypes";
import { Callout, inputClass, Pill } from "./ui";

export function JetReference() {
  const [jets, setJets] = useState<PolicyJetMetadata[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [network, setNetwork] = useState<DemoNetwork>("testnet4");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const selected = new URLSearchParams(window.location.search).get("network") === "liquidtestnet" ? "liquidtestnet" : "testnet4";
        const registry = await (selected === "liquidtestnet" ? liquidPolicyApi.registry() : policyApi.registry());
        if (active) { setNetwork(selected); setJets(registry.manifest.jets); setError(""); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : String(failure)); }
    }
    void load();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    function revealJet() {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target instanceof HTMLDetailsElement) {
        target.open = true;
        target.scrollIntoView({ block: "start" });
      }
    }
    revealJet();
    window.addEventListener("hashchange", revealJet);
    return () => window.removeEventListener("hashchange", revealJet);
  }, [jets]);
  const descriptions = network === "liquidtestnet" ? LIQUID_JET_DESCRIPTIONS : JET_DESCRIPTIONS;
  const filtered = jets.filter((jet) => `${jet.name} ${descriptions[jet.name] ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-4" aria-labelledby="jet-reference">
    <div className="flex items-center gap-3"><h2 id="jet-reference" className="text-xl font-semibold">Policy jets</h2><Pill tone="brand">{jets.length} available</Pill></div>
    <p className="text-sm text-muted">A jet is a built-in function your policy can call. Select one for its exact contract and types.</p>
    <label className="block space-y-2 text-sm">Jet profile<select aria-label="Jet profile" className={inputClass} value={network} onChange={(event) => {
      const selected = event.target.value;
      if (selected !== "testnet4" && selected !== "liquidtestnet") return;
      window.location.assign(`/docs?network=${selected}#jet-reference`);
    }}>{Object.entries(DEMO_NETWORKS).map(([value, config]) => <option value={value} key={value}>{config.label}</option>)}</select></label>
    {network === "liquidtestnet" && <Callout>Amount jets use the current input asset; tx_fee always uses L-BTC. Asset-selector jets make denomination explicit. JSON asset IDs use display order; jet arguments use raw bytes (reversed). Disclosure proofs are verified before any evaluation.</Callout>}
    <input className={inputClass} aria-label="Search policy jets" placeholder="Search fees, approvals, locks..." value={query} onChange={(event) => setQuery(event.target.value)} />
    {error && <Callout tone="danger">{error}</Callout>}
    {!error && !jets.length && <p role="status" className="text-sm text-muted">Loading the local jet registry...</p>}
    {!!jets.length && !filtered.length && <p className="text-sm text-muted">No matching jets.</p>}
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
      {filtered.map((jet) => <details id={jet.name} key={jet.id} className="min-w-0 scroll-mt-4 rounded-xl border border-line bg-white p-4 [overflow-wrap:anywhere]">
        <summary className="cursor-pointer font-mono text-sm text-brand">{jet.name}</summary>
        <p className="mt-3 text-sm">{descriptions[jet.name] ?? jet.semantic_contract}</p>
        <div className="mt-3 rounded-lg bg-surface p-3 text-xs text-muted"><p className="font-medium text-ink">Exact behavior</p><p className="mt-1">{jet.semantic_contract}</p></div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
          <div><dt>Input bits</dt><dd>{jet.source_bits}</dd></div><div><dt>Output bits</dt><dd>{jet.target_bits}</dd></div>
          <div><dt>Canonical input type</dt><dd className="font-mono">{jet.source_type}</dd></div><div><dt>Canonical output type</dt><dd className="font-mono">{jet.target_type}</dd></div>
        </dl>
      </details>)}
    </div>
  </section>;
}
