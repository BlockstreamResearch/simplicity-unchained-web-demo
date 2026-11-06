import assert from "node:assert/strict";
import { test } from "node:test";
import { schnorr } from "@noble/curves/secp256k1.js";
import { approveAndCosignLiquid, findLiquidFunding, liquidSpendOutputs, prepareLiquidAddress, prepareLiquidSpend } from "../services/liquidPolicyFlow";
import { policyPublicKey } from "../services/policyFlow";
import { LIQUID_TESTNET_ASSET } from "../services/demoNetworks";
import { LIQUID_PROFILE, type LiquidCapabilities, type LiquidContextSummary, type LiquidDraft, type LiquidFunding } from "../services/liquidPolicyTypes";
import type { liquidPolicyApi } from "../services/liquidPolicyApi";
import type { PolicyRegistry } from "../services/policyTypes";

const secret = "01".padStart(64, "0");
const blindingSecret = "02".padStart(64, "0");
const serviceSecret = "03".padStart(64, "0");
const h = (byte: string) => byte.repeat(32);
const funding: LiquidFunding[] = [
  { txid: h("ab"), vout: 0, parentTxHex: "aabb", confirmed: true, assetId: LIQUID_TESTNET_ASSET, value: 50000, confidential: true },
  { txid: h("ab"), vout: 1, parentTxHex: "aabb", confirmed: true, assetId: h("cd"), value: 7000, confidential: true },
];
const draft = (): LiquidDraft => ({ source: "policy", userSecretKey: secret, recoveryScript: "OP_TRUE", blindingSecretKey: blindingSecret,
  blindingPublicKey: policyPublicKey(blindingSecret), scope: "transaction", extraWitnessJson: "{}" });

function fixture() {
  const calls: string[] = [];
  const registry: PolicyRegistry = { profile: LIQUID_PROFILE, profile_hash: h("99"), manifest: { profile: LIQUID_PROFILE, profile_hash: h("99"),
    status: "experimental", schema_version: 1, limits: { max_inputs: 8, max_outputs: 8 }, jets: [], legacy_jets: [] } };
  const capabilities: LiquidCapabilities = { ...registry, profile: LIQUID_PROFILE, network: "liquidtestnet", genesis_hash: h("44"), base_public_key_hex: policyPublicKey(serviceSecret).slice(2),
    limits: {}, provenance: "verified" };
  const tweak = { profile: LIQUID_PROFILE, profile_hash: registry.profile_hash, network: "liquidtestnet" as const, genesis_hash: capabilities.genesis_hash,
    cmr: h("42"), signing_commitment: h("55"), public_key_hex: policyPublicKey(serviceSecret).slice(2), base_public_key_hex: capabilities.base_public_key_hex };
  const contexts: LiquidContextSummary[] = funding.map((input, index) => ({ profile: LIQUID_PROFILE, profile_hash: registry.profile_hash,
    network: "liquidtestnet", genesis_hash: capabilities.genesis_hash, cmr: tweak.cmr, signing_commitment: tweak.signing_commitment,
    redeem_script_hash: h("22"), input_index: index, input_count: 2, output_count: 3,
    unsigned_tx_hash: h("11"), prevouts_hash: h("12"), disclosures_hash: h("13"), cooperative_leaf_hash: h("14"),
    cooperative_sighash_default: h(index ? "16" : "15"), policy_approval_hash: h(index ? "18" : "17"), policy_transaction_approval_hash: h("19"),
    service_pubkey: tweak.public_key_hex, user_pubkey: policyPublicKey(secret).slice(2), recovery_leaf_hash: h("33"),
    current_asset_id: input.assetId, fee_asset_id: LIQUID_TESTNET_ASSET, assets: [
      { asset_id: LIQUID_TESTNET_ASSET, total_input_value: 50000, total_output_value: 50000, fee: 1000, returned_value: 49000, debit: 1000 },
      { asset_id: h("cd"), total_input_value: 7000, total_output_value: 7000, fee: 0, returned_value: 7000, debit: 0 },
    ], inputs: funding.map((item) => ({ asset_id: item.assetId, value: item.value, confidential_asset: true, confidential_value: true })),
    outputs: [{ asset_id: LIQUID_TESTNET_ASSET, value: 49000, confidential_asset: true, confidential_value: true },
      { asset_id: h("cd"), value: 7000, confidential_asset: true, confidential_value: true },
      { asset_id: LIQUID_TESTNET_ASSET, value: 1000, confidential_asset: false, confidential_value: false }],
    output_scripts_hex: ["51", "51", ""], script_pubkey_hex: "51", vsize_lower_bound: 300, provenance: "verified", chain_status_verified: false }));
  const copy = (index: number) => structuredClone(contexts[index]);
  function serviceBody(body: unknown) {
    const encoded = JSON.stringify(body);
    assert.ok(!encoded.includes("secret_key") && !encoded.includes("blinding_secret"));
    assert.ok(!encoded.includes(`"${secret}"`) && !encoded.includes(`"${blindingSecret}"`));
  }
  const api: typeof liquidPolicyApi = {
    async registry() { return structuredClone(registry); },
    async capabilities() { calls.push("capabilities"); return structuredClone(capabilities); },
    async compile(_source, witness) {
      calls.push(witness ? "compileWitness" : "compile");
      if (witness) assert.ok(schnorr.verify(Buffer.from(witness.APPROVAL.value.slice(2), "hex"), Buffer.from(contexts[0].policy_transaction_approval_hash, "hex"), Buffer.from(policyPublicKey(secret).slice(2), "hex")));
      return { program_base64: "AQ==", cmr_hex: tweak.cmr, ...(witness ? { witness_base64: "AA==" } : {}) };
    },
    async recoveryScript() { return { redeem_script_hex: "51", user_leaf_hash_hex: h("33") }; },
    async localTweak() { return structuredClone(tweak); },
    async tweak(body) { serviceBody(body); return structuredClone(tweak); },
    async generateBlindingKey() { return { blinding_secret_key_hex: blindingSecret, blinding_public_key_hex: policyPublicKey(blindingSecret) }; },
    async address() { return { address: "confidential", unconfidential_address: "unconfidential", script_pubkey_hex: "51", service_pubkey: tweak.public_key_hex, profile: LIQUID_PROFILE, profile_hash: registry.profile_hash, network: "liquidtestnet" }; },
    async fetchParent() { calls.push("fetchParent"); return "aabb"; },
    async unblind(body) { calls.push("unblind"); const input = funding[body.vout]; return { txid: input.txid, vout: input.vout, script_pubkey_hex: "51",
      chain_status_verified: false, disclosure: { asset_id: input.assetId, value_sat: input.value, confidential: true, blind_asset_proof_hex: "aa", blind_value_proof_hex: "bb" } }; },
    async createPset(body) { calls.push("createPset"); assert.equal(body.outputs.length, 3); assert.equal(body.outputs[2].address, "fee"); return { pset_hex: "70736574ff", transaction_hex: "aabb", txid: h("ab"), inputs: 2, outputs: 3, network: "liquidtestnet" }; },
    async context(body) { calls.push(`context:${body.input_index}`); return { context: copy(body.input_index) }; },
    async prepare(body) { serviceBody(body); calls.push(`prepare:${body.input_index}`); return { context: copy(body.input_index) }; },
    async localEvaluate(body) { calls.push("localEvaluate"); return { accepted: true, context: copy(body.prepared.input_index), execution_cost_milliweight: 2000 }; },
    async evaluate(body) { serviceBody(body); calls.push("evaluate"); return { accepted: true, context: copy(body.input_index), execution_cost_milliweight: 2000 }; },
    async sign(body) { serviceBody(body); calls.push("sign"); return { pset_hex: "aabb", signature_hex: "11".repeat(64), public_key_hex: tweak.public_key_hex,
      input_index: body.input_index, context: copy(body.input_index), execution_cost_milliweight: 2000 }; },
    async verify(body) { calls.push("verify"); return { verified: true, context: copy(body.prepared.input_index) }; },
    async userSign(body) { calls.push("userSign"); return { pset_hex: "aabb", public_key_hex: policyPublicKey(secret).slice(2), input_index: body.prepared.input_index,
      signature_hex: Buffer.from(schnorr.sign(Buffer.from(contexts[body.prepared.input_index].cooperative_sighash_default, "hex"), Buffer.from(secret, "hex"))).toString("hex"),
      context: copy(body.prepared.input_index) }; },
    async finalize(body) { calls.push("finalize"); assert.equal(body.signatures.length, 2); return { transaction_hex: "aabb", txid: h("ee"), finalized: true, inputs: 2, outputs: 3 }; },
    async broadcast() { calls.push("broadcast"); throw new Error("Tests must never broadcast"); },
  };
  return { api, calls, contexts, capabilities };
}

test("Liquid spend planning preserves every asset, returns confidential change and adds one explicit L-BTC fee", () => {
  assert.deepEqual(liquidSpendOutputs(funding, 1000, "confidential"), [
    { address: "confidential", asset_id: LIQUID_TESTNET_ASSET, value_sat: 49000 },
    { address: "confidential", asset_id: h("cd"), value_sat: 7000 },
    { address: "fee", asset_id: LIQUID_TESTNET_ASSET, value_sat: 1000 },
  ]);
  for (const inputs of [[], [funding[1]], [...funding, funding[0]], Array(9).fill(funding[0]), [{ ...funding[0], value: Number.MAX_SAFE_INTEGER }, { ...funding[0], vout: 2 }]]) {
    assert.throws(() => liquidSpendOutputs(inputs, 1000, "confidential"));
  }
  for (const fee of [0, -1, 1.5, 50000, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => liquidSpendOutputs(funding, fee, "confidential"));
});

test("Liquid guided flow compares every input, approves raw digests, verifies both signatures and never broadcasts", async () => {
  const f = fixture();
  const address = await prepareLiquidAddress(draft(), f.api);
  const prepared = await prepareLiquidSpend(address, funding, draft(), { recipient: "", fee: 1000, sequence: "4294967293", lockTime: "0" }, f.api);
  assert.equal(prepared.contexts.length, 2);
  assert.equal(prepared.recipient, address.address);
  const finalized = await approveAndCosignLiquid(address, prepared, draft(), () => {}, f.api);
  assert.equal(finalized.transactionFingerprint, prepared.fingerprint);
  assert.equal(f.calls.filter((call) => call === "verify").length, 2);
  assert.equal(f.calls.filter((call) => call === "userSign").length, 2);
  assert.ok(f.calls.indexOf("evaluate") < f.calls.indexOf("sign"));
  assert.ok(f.calls.includes("prepare:0") && f.calls.includes("prepare:1"));
  assert.equal(f.calls.includes("broadcast"), false);
});

test("Liquid discovery fetches each full parent once, unblinds locally and rejects mismatched scripts", async () => {
  const f = fixture();
  const address = await prepareLiquidAddress(draft(), f.api);
  const fetcher: typeof fetch = async (url) => {
    assert.ok(String(url).endsWith("/address/unconfidential/utxo"));
    return Response.json(funding.map((input) => ({ txid: input.txid, vout: input.vout, status: { confirmed: true } })));
  };
  assert.equal((await findLiquidFunding(address, blindingSecret, undefined, f.api, fetcher)).length, 2);
  assert.equal(f.calls.filter((call) => call === "fetchParent").length, 1);
  const unblind = f.api.unblind;
  f.api.unblind = async (body) => ({ ...await unblind(body), script_pubkey_hex: "00" });
  await assert.rejects(findLiquidFunding(address, blindingSecret, undefined, f.api, fetcher), /does not match/);
});

for (const failure of ["registry", "network", "context", "evaluation", "signature", "stale", "changed-key"] as const) {
  test(`Liquid ${failure} failure stops before finalization and never falls back`, async () => {
    const f = fixture();
    if (failure === "registry") f.capabilities.profile_hash = h("00");
    if (failure === "network") f.capabilities.genesis_hash = "bad";
    if (failure === "registry" || failure === "network") {
      await assert.rejects(prepareLiquidAddress(draft(), f.api));
    } else {
      const address = await prepareLiquidAddress(draft(), f.api);
      if (failure === "context") {
        const prepare = f.api.prepare;
        f.api.prepare = async (body) => ({ context: { ...(await prepare(body)).context, disclosures_hash: h("00") } });
        await assert.rejects(prepareLiquidSpend(address, funding, draft(), { recipient: "", fee: 1000, sequence: "0", lockTime: "0" }, f.api), /differs/);
      } else {
        const prepared = await prepareLiquidSpend(address, funding, draft(), { recipient: "", fee: 1000, sequence: "0", lockTime: "0" }, f.api);
        if (failure === "evaluation") {
          const evaluate = f.api.evaluate;
          f.api.evaluate = async (body) => ({ ...await evaluate(body), execution_cost_milliweight: 10_000_001 });
        }
        if (failure === "signature") {
          const sign = f.api.sign;
          f.api.sign = async (body) => ({ ...await sign(body), signature_hex: "00" });
        }
        if (failure === "changed-key") f.capabilities.base_public_key_hex = h("66");
        await assert.rejects(approveAndCosignLiquid(address, prepared, draft(), () => { if (failure === "stale") throw new Error("Stale inputs"); }, f.api));
      }
    }
    assert.equal(f.calls.includes("finalize"), false);
    assert.equal(f.calls.includes("broadcast"), false);
  });
}
