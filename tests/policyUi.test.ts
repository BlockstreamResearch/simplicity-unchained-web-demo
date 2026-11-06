import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PolicyHeader } from "../components/PolicyHeader";
import { POLICY_NETWORKS } from "../services/policyTypes";
import { recoveryScriptForKey } from "../utils/recoveryScript";
import { findPolicyFunding } from "../services/policyExplorer";
import { POLICY_EXAMPLES } from "../services/policyExamples";

test("policy header displays Testnet4, the original branding and no legacy selector", () => {
  const html = renderToStaticMarkup(createElement(PolicyHeader, {
    network: "testnet4", busy: false, status: "online",
    onNetworkChange: () => {}, onCheck: () => {},
  }));
  assert.match(html, /UNCHAINED/);
  assert.match(html, /POWERED BY SIMPLICITY/);
  assert.match(html, /value="testnet4" selected="">Bitcoin Testnet4/);
  assert.match(html, /Policy oracle online/);
  assert.ok(html.includes(POLICY_NETWORKS.testnet4.faucet!));
  assert.match(html, /value="liquidtestnet">Liquid Testnet/);
  assert.equal((html.match(/<option /g) ?? []).length, 2);
  assert.doesNotMatch(html, /Frozen legacy|href="\/legacy"/);
});

test("both demo networks provide a visible home link that preserves the demo tab", () => {
  for (const network of ["testnet4", "liquidtestnet"] as const) {
    const html = renderToStaticMarkup(createElement(PolicyHeader, {
      network, busy: false, status: "online", onNetworkChange: () => {}, onCheck: () => {},
    }));
    assert.match(html, /Back to home/);
    const homeLink = html.match(/<a\b[^>]*title="Open the landing page in a new tab without losing your demo keys"[^>]*>/)?.[0];
    assert.ok(homeLink);
    assert.match(homeLink, /href="\/"/);
    assert.match(homeLink, /target="_blank"/);
    assert.match(homeLink, /rel="noopener noreferrer"/);
  }
});

test("demo header groups secondary links in a closed resources disclosure", () => {
  const html = renderToStaticMarkup(createElement(PolicyHeader, {
    network: "liquidtestnet", busy: false, status: "online", onNetworkChange: () => {}, onCheck: () => {},
  }));
  const resources = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(resources);
  assert.doesNotMatch(resources, /<details[^>]*\bopen[=>\s]/);
  for (const label of ["Documentation", "Liquid Testnet faucet", "Explorer", "GitHub", "About Simplicity"]) {
    assert.ok(resources.includes(label));
  }
  assert.match(resources, /aria-label="Demo resources"/);
});

test("policy recovery script embeds matching compressed and x-only user keys", () => {
  const key = `02${"12".repeat(32)}`;
  assert.equal(recoveryScriptForKey(key), `OP_PUSHBYTES_33 0x${key} OP_DROP OP_PUSHBYTES_32 0x${key.slice(2)} OP_CHECKSIG`);
  for (const invalid of ["bad", "12".repeat(32), `04${"12".repeat(32)}`]) {
    assert.throws(() => recoveryScriptForKey(invalid), /33-byte compressed/);
  }
});

test("guided funding discovery validates advisory metadata and sorts confirmed outputs first", async () => {
  const txid = "ab".repeat(32);
  const found = await findPolicyFunding("testnet4", "contract", undefined, async (url, options) => {
    assert.equal(url, `${POLICY_NETWORKS.testnet4.api}/address/contract/utxo`);
    assert.equal(options?.cache, "no-store");
    return Response.json([
      { txid, vout: 1, value: 8000, status: { confirmed: false } },
      { txid, vout: 2, value: 5000, status: { confirmed: true } },
    ]);
  });
  assert.deepEqual(found.map((item) => item.vout), [2, 1]);
  assert.deepEqual(await findPolicyFunding("testnet4", "contract", undefined, async () => Response.json([])), []);
  for (const bad of [null, [{ txid, vout: -1, value: 8000, status: { confirmed: true } }], [{ txid, vout: 0, value: "8000", status: { confirmed: true } }]]) {
    await assert.rejects(findPolicyFunding("testnet4", "contract", undefined, async () => Response.json(bad)), /invalid funding/);
  }
  await assert.rejects(findPolicyFunding("testnet4", "contract", undefined, async () => new Response("Rate limited", { status: 429 })), /429/);
});

test("examples provide distinct scenarios and matching guided approval/lock settings", () => {
  assert.ok(POLICY_EXAMPLES.length >= 14);
  assert.equal(new Set(POLICY_EXAMPLES.map((example) => example.id)).size, POLICY_EXAMPLES.length);
  assert.equal(POLICY_EXAMPLES.find((example) => example.id === "per-input")?.scope, "input");
  assert.equal(POLICY_EXAMPLES.find((example) => example.id === "csv-blocks")?.sequence, "6");
  assert.equal(POLICY_EXAMPLES.find((example) => example.id === "cltv-height")?.lockTime, "200");
});
