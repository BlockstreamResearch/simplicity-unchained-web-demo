import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { DEFAULT_POLICY_SOURCE } from "../services/policyDefaults";
import { POLICY_EXAMPLES } from "../services/policyExamples";
import { LIQUID_POLICY_EXAMPLES } from "../services/liquidPolicyExamples";
import { JET_DESCRIPTIONS, LIQUID_JET_DESCRIPTIONS } from "../services/jetDescriptions";
import { approvePolicyTransaction, cosignPolicyTransaction, policyPublicKey, preparePolicyAddress, preparePolicyTransaction } from "../services/policyFlow";
import { approveAndCosignLiquid, liquidSpendOutputs, prepareLiquidAddress, prepareLiquidSpend } from "../services/liquidPolicyFlow";
import { LIQUID_TESTNET_ASSET } from "../services/demoNetworks";
import type { liquidPolicyApi } from "../services/liquidPolicyApi";
import type { LiquidContextRequest, LiquidContextSummary, LiquidDraft, LiquidFunding } from "../services/liquidPolicyTypes";
import { recoveryScriptForKey } from "../utils/recoveryScript";
import { POLICY_PROFILE, type LocalContextRequest, type PolicyApi, type PolicyContextSummary, type PolicyDraft, type PolicyRegistry } from "../services/policyTypes";

type Wasm = typeof import("../simplicity-lib/pkg/simplicity_lib");
let loaded: Promise<Wasm> | undefined;
function wasm(): Promise<Wasm> {
  return loaded ??= (async () => {
    const bindings = await import("../simplicity-lib/pkg/simplicity_lib_bg.js");
    const compiledWasm = await WebAssembly.compile(readFileSync("simplicity-lib/pkg/simplicity_lib_bg.wasm"));
    const instance = await WebAssembly.instantiate(compiledWasm, { "./simplicity_lib_bg.js": bindings });
    bindings.__wbg_set_wasm(instance.exports);
    (instance.exports.__wbindgen_start as () => void)();
    return bindings as unknown as Wasm;
  })();
}

test("release WASM defaults to Bitcoin policy and exposes no legacy transaction helpers", async () => {
  const w = await wasm();
  const implicit = w.compile({ script: "fn main() {}" });
  const explicit = w.compile({ script: "fn main() {}", environment: "bitcoin", profile: "bitcoin-policy-v1" });
  assert.deepEqual(implicit, explicit);
  assert.throws(() => w.compile({ script: "fn main() {}", profile: "legacy" }));
  assert.throws(() => w.compile({ script: "fn main() {}", environment: "elements" }));
  for (const name of ["create_psbt", "create_pset", "finalize_psbt", "finalize_pset", "sighash_psbt", "sighash_pset", "bitcoin_approval_hash"]) {
    assert.equal(name in w, false, `${name} must not be a public WASM export`);
  }
});

test("all Liquid examples compile under the distinct 66-jet profile and every jet has plain-English docs", async () => {
  const w = await wasm();
  const registry: PolicyRegistry = w.liquid_policy_registry();
  assert.equal(registry.profile, "liquid-policy-v1");
  assert.equal(registry.manifest.jets.length, 66);
  assert.notEqual(registry.profile_hash, w.policy_registry().profile_hash);
  for (const example of LIQUID_POLICY_EXAMPLES) {
    const compiled = w.compile({ script: example.source, environment: "elements", profile: "liquid-policy-v1" });
    assert.match(compiled instanceof Map ? compiled.get("cmr_hex") : compiled.cmr_hex, /^[0-9a-f]{64}$/);
    for (const name of example.jets) assert.ok(registry.manifest.jets.some((jet) => jet.name === name), name);
  }
  for (const jet of registry.manifest.jets) assert.ok(LIQUID_JET_DESCRIPTIONS[jet.name], `${jet.name} needs Liquid-specific docs`);
  assert.throws(() => w.compile({ script: "fn main() {}", environment: "bitcoin", profile: "liquid-policy-v1" }), /Elements|Liquid|elements/);
});

test("bundler release WASM verifies confidential two-asset proofs, native signatures/finalization and rejects every tampered fixture", async () => {
  const w = await wasm();
  const fixture: {
    cmr_hex: string; redeem_script_hex: string; base_public_key_hex: string; user_pubkey: string; user_leaf_hash_hex: string;
    profile_hash: string; pset_hex: string; program_base64: string; witness_base64: string; service_signed_pset_hex: string;
    fully_signed_pset_hex: string; transaction_hex: string; txid: string; contexts: LiquidContextSummary[];
    service_signatures: Array<{ input_index: number; public_key_hex: string; signature_hex: string }>;
    user_signatures: Array<{ input_index: number; public_key_hex: string; signature_hex: string }>;
    negative_psets: Record<string, string>;
  } = JSON.parse(readFileSync("../simplicity-unchained/policy/tests/fixtures/liquid-policy-v1.json", "utf8"));
  const prepared: LiquidContextRequest = { network: "liquidtestnet", cmr_hex: fixture.cmr_hex, redeem_script_hex: fixture.redeem_script_hex,
    base_public_key_hex: fixture.base_public_key_hex, user_pubkey: fixture.user_pubkey, user_leaf_hash_hex: fixture.user_leaf_hash_hex, pset_hex: fixture.pset_hex, input_index: 0 };
  assert.equal(w.liquid_policy_registry().profile_hash, fixture.profile_hash);
  assert.equal(fixture.contexts[0].assets.length, 2);
  for (const [index, expected] of fixture.contexts.entries()) {
    assert.deepEqual(w.liquid_policy_context({ ...prepared, input_index: index }).context, expected);
    assert.ok(expected.inputs.every((input) => input.confidential_asset && input.confidential_value));
    const signature = fixture.service_signatures[index];
    assert.equal(w.liquid_policy_verify_signed_pset({ prepared: { ...prepared, input_index: index }, signed_pset_hex: fixture.service_signed_pset_hex,
      signature_hex: signature.signature_hex, public_key_hex: signature.public_key_hex }).verified, true);
  }
  const evaluated = w.liquid_policy_evaluate({ prepared, program_base64: fixture.program_base64, witness_base64: fixture.witness_base64 });
  assert.equal(evaluated.accepted, true);
  const finalized = w.liquid_policy_finalize_pset({ prepared, signed_pset_hex: fixture.fully_signed_pset_hex, signatures: fixture.user_signatures });
  assert.equal(finalized.transaction_hex, fixture.transaction_hex);
  assert.equal(finalized.txid, fixture.txid);
  assert.equal(Object.keys(fixture.negative_psets).length, 12);
  for (const [name, pset_hex] of Object.entries(fixture.negative_psets)) {
    assert.throws(() => w.liquid_policy_context({ ...prepared, pset_hex }), name);
  }
  assert.throws(() => w.liquid_policy_context({ ...prepared, network: "liquid" }));
  assert.throws(() => w.liquid_policy_context({ ...prepared, cmr_hex: "00".repeat(32) }));
  assert.throws(() => w.liquid_policy_verify_signed_pset({ prepared, signed_pset_hex: fixture.service_signed_pset_hex,
    signature_hex: "00".repeat(64), public_key_hex: fixture.service_signatures[0].public_key_hex }));
});

test("every selectable policy example compiles with fresh approval and every canonical jet has user docs", async () => {
  const w = await wasm();
  for (const example of POLICY_EXAMPLES) {
    const compiled = w.compile({ script: example.source, environment: "bitcoin", profile: POLICY_PROFILE });
    assert.match(compiled instanceof Map ? compiled.get("cmr_hex") : compiled.cmr_hex, /^[0-9a-f]{64}$/);
    const approvalJet = example.scope === "input" ? "policy_approval_hash" : "policy_transaction_approval_hash";
    assert.ok(example.source.includes(`jet::${approvalJet}()`), example.id);
    assert.ok(example.source.includes("witness::APPROVAL"), example.id);
  }
  const registry = w.policy_registry();
  for (const jet of registry.manifest.jets) {
    assert.ok(JET_DESCRIPTIONS[jet.name], `${jet.name} needs beginner-facing documentation`);
  }
});

const bytes = (hex: string) => Buffer.from(hex, "hex");
const hex = (value: Uint8Array) => Buffer.from(value).toString("hex");
const compact = (n: number) => {
  if (n < 253) return Buffer.from([n]);
  const out = Buffer.alloc(3); out[0] = 253; out.writeUInt16LE(n, 1); return out;
};
const kv = (key: Buffer, value: Buffer) => Buffer.concat([compact(key.length), key, compact(value.length), value]);
const txid = (tx: Uint8Array) => hex(sha256(sha256(tx)).reverse());

interface Golden {
  profile_hash: string;
  first_jet_identity: string;
  last_jet_identity: string;
  base_service_pubkey: string;
  script_data_hex: string;
  parent_tx_hex: string;
  unsigned_tx_hex: string;
  prevouts_vector_hex: string;
  cooperative_script_hex: string;
  control_block_hex: string;
  input1_sighash: string;
  input1_approval_hash: string;
  summary: PolicyContextSummary;
}

function golden() {
  const vector: Golden = JSON.parse(readFileSync("../simplicity-unchained/policy/tests/fixtures/golden.json", "utf8"));
  const prevouts = bytes(vector.prevouts_vector_hex).subarray(1);
  assert.equal(prevouts.length, 86);
  const build = (services: Buffer[] = [], missingParent = false) => {
    const global = Buffer.concat([bytes("70736274ff"), kv(bytes("00"), bytes(vector.unsigned_tx_hex)), bytes("00")]);
    const inputMaps = [0, 1].map((index) => Buffer.concat([
      ...(missingParent && index === 0 ? [] : [kv(bytes("00"), bytes(vector.parent_tx_hex))]),
      kv(bytes("01"), prevouts.subarray(index * 43, (index + 1) * 43)),
      ...(services[index] ? [
        kv(Buffer.concat([bytes("14"), bytes(vector.summary.service_pubkey), bytes(vector.summary.cooperative_leaf_hash)]), services[index]),
        kv(Buffer.concat([bytes("15"), bytes(vector.control_block_hex)]), Buffer.concat([bytes(vector.cooperative_script_hex), bytes("c0")])),
      ] : []),
      bytes("00"),
    ]));
    return hex(Buffer.concat([global, ...inputMaps, bytes("000000")]));
  };
  const request: LocalContextRequest = {
    psbt_hex: build(), input_index: 0, cmr_hex: vector.summary.cmr, redeem_script_hex: vector.script_data_hex,
    network: "testnet4", base_public_key_hex: vector.base_service_pubkey,
    user_pubkey: vector.summary.user_pubkey, user_leaf_hash_hex: vector.summary.recovery_leaf_hash,
  };
  return { vector, request, build };
}

test("tracked release WASM has the frozen 55-jet registry and matches independent context/J53/J54 golden vectors", async () => {
  const w = await wasm();
  const { vector, request, build } = golden();
  const registry = w.policy_registry();
  assert.equal(registry.profile_hash, "0890429432ce3f797ae26e43ca6d47bdea6cd9369b32a48722a8b6385addd0c7");
  assert.equal(registry.profile_hash, vector.profile_hash);
  assert.equal(registry.manifest.jets.length, 55);
  assert.equal(registry.manifest.jets[0].cmr, vector.first_jet_identity);
  assert.equal(registry.manifest.jets[54].cmr, vector.last_jet_identity);
  const local = w.policy_context(request);
  assert.deepEqual(local.context, vector.summary);
  const next = w.policy_context({ ...request, input_index: 1 });
  assert.equal(next.context.cooperative_sighash_default, vector.input1_sighash);
  assert.equal(next.context.policy_approval_hash, vector.input1_approval_hash);
  assert.equal(next.context.policy_transaction_approval_hash, vector.summary.policy_transaction_approval_hash);
  const tweak = w.policy_local_tweak(request);
  assert.equal(tweak.public_key_hex, vector.summary.service_pubkey);
  assert.equal(tweak.signing_commitment, vector.summary.signing_commitment);
  assert.throws(() => w.policy_context({ ...request, psbt_hex: build([], true) }), /non_witness_utxo/);
  assert.throws(() => w.policy_context({ ...request, network: "testnet" }), /reconstructed cooperative output/);
  assert.throws(() => w.compile({ script: DEFAULT_POLICY_SOURCE, environment: "elements", profile: POLICY_PROFILE }), /Bitcoin-only|expected `bitcoin`/);
  assert.throws(() => w.compile({ script: DEFAULT_POLICY_SOURCE, environment: "bitcoin", profile: "legacy" }));
});

test("tracked WASM compiles fresh approval witnesses, verifies actual cooperative signatures/leaf and finalizes two inputs", async () => {
  const w = await wasm();
  const { vector, request, build } = golden();
  const userSecret = bytes("02".repeat(32));
  const approval = hex(schnorr.sign(bytes(vector.summary.policy_transaction_approval_hash), userSecret));
  const compiled = w.compile({ script: DEFAULT_POLICY_SOURCE, environment: "bitcoin", profile: POLICY_PROFILE });
  const witnessed = w.compile({
    script: DEFAULT_POLICY_SOURCE, environment: "bitcoin", profile: POLICY_PROFILE,
    witness: { APPROVAL: { type: "Signature", value: `0x${approval}` } },
  });
  assert.equal(witnessed.cmr_hex, compiled.cmr_hex);
  assert.equal(witnessed.program_base64, compiled.program_base64);
  assert.ok(witnessed.witness_base64);
  const n = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
  const baseSecret = bytes("01".repeat(32));
  const basePublic = secp256k1.getPublicKey(baseSecret, true);
  let d = BigInt(`0x${hex(baseSecret)}`);
  if (basePublic[0] === 3) d = n - d;
  const tag = sha256(new TextEncoder().encode("TapTweak"));
  const tweak = sha256(Buffer.concat([tag, tag, bytes(vector.base_service_pubkey), bytes(vector.summary.signing_commitment)]));
  const serviceSecret = bytes(((d + BigInt(`0x${hex(tweak)}`)) % n).toString(16).padStart(64, "0"));
  assert.equal(policyPublicKey(hex(serviceSecret)).slice(2), vector.summary.service_pubkey);
  const sighashes = [vector.summary.cooperative_sighash_default, vector.input1_sighash];
  const services = sighashes.map((digest) => Buffer.from(schnorr.sign(bytes(digest), serviceSecret)));
  const signed = build(services);
  assert.equal(w.policy_verify_signed_psbt({
    prepared: request, signed_psbt_hex: signed, signature_hex: hex(services[0]),
    public_key_hex: vector.summary.service_pubkey,
  }).verified, true);
  const signatures = sighashes.map((digest, input_index) => ({
    input_index, signature_hex: hex(schnorr.sign(bytes(digest), userSecret)), public_key_hex: vector.summary.user_pubkey,
  }));
  const finalized = w.policy_finalize_psbt({ prepared: request, signed_psbt_hex: signed, signatures });
  assert.equal(finalized.finalized, true);
  assert.equal(finalized.inputs, 2);
  assert.equal(finalized.txid, txid(bytes(vector.unsigned_tx_hex)));
  assert.ok(finalized.transaction_hex.includes(vector.cooperative_script_hex));
  const invalid = services.map((signature) => Buffer.from(signature));
  invalid[0][0] ^= 1;
  assert.throws(() => w.policy_verify_signed_psbt({
    prepared: request, signed_psbt_hex: build(invalid), signature_hex: hex(invalid[0]),
    public_key_hex: vector.summary.service_pubkey,
  }));
  assert.throws(() => w.policy_finalize_psbt({
    prepared: request, signed_psbt_hex: signed,
    signatures: [{ ...signatures[0], signature_hex: "00".repeat(64) }, signatures[1]],
  }));
});

// This only decodes addresses produced by our own WASM, to construct synthetic parent evidence.
function p2trScript(address: string): Buffer {
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const data = address.slice(address.lastIndexOf("1") + 1, -6).split("").map((char) => alphabet.indexOf(char));
  assert.equal(data.shift(), 1);
  let acc = 0, bits = 0;
  const output = [];
  for (const word of data) {
    assert.ok(word >= 0);
    acc = (acc << 5) | word; bits += 5;
    if (bits >= 8) { bits -= 8; output.push((acc >>> bits) & 255); }
  }
  assert.equal(output.length, 32);
  return Buffer.concat([bytes("5120"), Buffer.from(output)]);
}

test("live service: real browser client + tracked WASM compile, prepare, approve, evaluate, verify and finalize (synthetic only)", {
  skip: !process.env.SIMPLICITY_TEST_SERVICE_URL,
}, async () => {
  const base = process.env.SIMPLICITY_TEST_SERVICE_URL!;
  const w = await wasm();
  const request = async (endpoint: string, body?: unknown) => {
    const response = await fetch(`${base}/simplicity-unchained/policy/bitcoin/${endpoint}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    assert.ok(response.ok, `${endpoint}: ${JSON.stringify(value)}`);
    return value;
  };
  const capabilities = await request("capabilities");
  const secret = "02".repeat(32);
  const draft: PolicyDraft = {
    chain: "bitcoin", profile: POLICY_PROFILE, network: capabilities.network, source: DEFAULT_POLICY_SOURCE,
    recoveryScript: `OP_PUSHBYTES_32 0x${policyPublicKey(secret).slice(2)} OP_CHECKSIG`,
    userSecretKey: secret, approvalSigners: [{ witnessName: "APPROVAL", secretKey: secret, scope: "transaction" }],
    extraWitnessJson: "{}",
  };
  let parent = "";
  const api: PolicyApi = {
    async registry() { return w.policy_registry(); },
    async capabilities() { return request("capabilities"); },
    async compile(input) { return w.compile(input); },
    async encodeScript(script) { return w.encode_script(script); },
    async localTweak(input) { return w.policy_local_tweak(input); },
    async tweak(body) { return request("tweak", body); },
    async convert(input) {
      const converted = w.convert_script(input);
      const script = p2trScript(converted.address);
      const amount = Buffer.alloc(8); amount.writeBigUInt64LE(BigInt(10_000));
      parent = hex(Buffer.concat([
        bytes("0200000001"), bytes("77".repeat(32)), bytes("0000000000ffffffff01"),
        amount, compact(script.length), script, bytes("00000000"),
      ]));
      return converted;
    },
    async fetchParent(_network, requestedTxid) { assert.equal(requestedTxid, txid(bytes(parent))); return parent; },
    async createPsbt(input) { return w.policy_create_psbt(input); },
    async localContext(input) { return w.policy_context(input); },
    async prepare(body) { return request("prepare", body); },
    async evaluate(body) { return request("evaluate", body); },
    async sign(body) { return request("sign", body); },
    async verifySigned(input) { return w.policy_verify_signed_psbt(input); },
    async finalize(input) { return w.policy_finalize_psbt(input); },
    async broadcast() { throw new Error("Live integration tests must never broadcast or spend funds."); },
  };
  const address = await preparePolicyAddress(draft, api);
  const transaction = await preparePolicyTransaction(address, {
    inputs: `${txid(bytes(parent))}:0`, outputs: `${address.address}:9000`, sequence: "4294967293", lockTime: "0",
  }, api);
  const approvals = await approvePolicyTransaction(address, transaction, draft, api);
  const finalized = await cosignPolicyTransaction(address, transaction, approvals, draft, api);
  assert.match(finalized.txid, /^[0-9a-f]{64}$/);
  assert.match(finalized.transactionHex, /^020000000001/);
});

test("live service: confidential two-asset Liquid browser flow verifies fresh funding, proofs, approvals and finalization (never broadcasts)", {
  skip: !process.env.SIMPLICITY_TEST_SERVICE_URL,
}, async () => {
  const base = process.env.SIMPLICITY_TEST_SERVICE_URL!;
  const w = await wasm();
  const request = async <T>(endpoint: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${base}/simplicity-unchained/policy/liquid/${endpoint}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json();
    assert.ok(response.ok, `${endpoint}: ${JSON.stringify(value)}`);
    return value;
  };
  const fixture: { source_parent_tx_hex: string; source_parent_txid: string } = JSON.parse(readFileSync("../simplicity-unchained/policy/tests/fixtures/liquid-policy-v1.json", "utf8"));
  const blinding: { blinding_secret_key_hex: string; blinding_public_key_hex: string } = w.liquid_policy_generate_blinding_key();
  const secret = "02".repeat(32);
  const draft: LiquidDraft = { source: DEFAULT_POLICY_SOURCE, userSecretKey: secret, recoveryScript: recoveryScriptForKey(policyPublicKey(secret)),
    blindingSecretKey: blinding.blinding_secret_key_hex, blindingPublicKey: blinding.blinding_public_key_hex, scope: "transaction", extraWitnessJson: "{}" };
  const api: typeof liquidPolicyApi = {
    async registry() { return w.liquid_policy_registry(); },
    async capabilities() { return request("capabilities"); },
    async compile(script, witness) { return w.compile({ script, environment: "elements", profile: "liquid-policy-v1", ...(witness ? { witness } : {}) }); },
    async recoveryScript(script) { return w.liquid_policy_recovery_script(script); },
    async localTweak(input) { return w.liquid_policy_local_tweak(input); },
    async tweak(body) { return request("tweak", body); },
    async generateBlindingKey() { return w.liquid_policy_generate_blinding_key(); },
    async address(body) { return w.liquid_policy_address(body); },
    async fetchParent() { throw new Error("Live tests use synthetic, unbroadcast parents only."); },
    async unblind(body) { return w.liquid_policy_unblind_output(body); },
    async createPset(body) { return w.liquid_policy_create_pset(body); },
    async context(body) { return w.liquid_policy_context(body); },
    async prepare(body) { return request("prepare", body); },
    async localEvaluate(body) { return w.liquid_policy_evaluate(body); },
    async evaluate(body) { return request("evaluate", body); },
    async sign(body) { return request("sign", body); },
    async verify(body) { return w.liquid_policy_verify_signed_pset(body); },
    async userSign(body) { return w.liquid_policy_user_sign(body); },
    async finalize(body) { return w.liquid_policy_finalize_pset(body); },
    async broadcast() { throw new Error("Never broadcast synthetic Liquid test parents or transactions."); },
  };
  const address = await prepareLiquidAddress(draft, api);
  const sourceFunding: LiquidFunding[] = [];
  for (const vout of [0, 1]) {
    const verified = await api.unblind({ parent_tx_hex: fixture.source_parent_tx_hex, txid: fixture.source_parent_txid, vout, blinding_secret_key_hex: draft.blindingSecretKey });
    sourceFunding.push({ txid: fixture.source_parent_txid, vout, parentTxHex: fixture.source_parent_tx_hex, confirmed: false,
      assetId: verified.disclosure.asset_id, value: verified.disclosure.value_sat, confidential: verified.disclosure.confidential });
  }
  const parent = await api.createPset({ network: "liquidtestnet", lock_time: 0,
    inputs: sourceFunding.map((input) => ({ txid: input.txid, vout: input.vout, parent_tx_hex: input.parentTxHex, blinding_secret_key_hex: draft.blindingSecretKey, sequence: 4294967293 })),
    outputs: liquidSpendOutputs(sourceFunding, 1000, address.address) });
  const funded: LiquidFunding[] = [];
  for (const vout of [0, 1]) {
    const verified = await api.unblind({ parent_tx_hex: parent.transaction_hex, txid: parent.txid, vout, blinding_secret_key_hex: draft.blindingSecretKey });
    assert.equal(verified.script_pubkey_hex, address.scriptPubkeyHex);
    assert.equal(verified.disclosure.confidential, true);
    funded.push({ txid: parent.txid, vout, parentTxHex: parent.transaction_hex, confirmed: false, assetId: verified.disclosure.asset_id,
      value: verified.disclosure.value_sat, confidential: true });
  }
  const prepared = await prepareLiquidSpend(address, funded, draft, { recipient: "", fee: 1000, sequence: "4294967293", lockTime: "0" }, api);
  assert.equal(prepared.contexts.length, 2);
  assert.equal(prepared.contexts[0].assets.length, 2);
  assert.equal(prepared.contexts[0].assets.find((asset) => asset.asset_id === LIQUID_TESTNET_ASSET)?.fee, 1000);
  const finalized = await approveAndCosignLiquid(address, prepared, draft, () => {}, api);
  assert.match(finalized.transactionHex, /^0200000001/);
  assert.match(finalized.txid, /^[0-9a-f]{64}$/);
});
