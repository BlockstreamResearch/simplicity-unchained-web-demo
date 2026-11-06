import assert from "node:assert/strict";
import { test } from "node:test";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { DEFAULT_POLICY_SOURCE } from "../services/policyDefaults";
import {
  approvePolicyTransaction, assertPolicyRegistry, cosignPolicyTransaction, policyApprovalWitness,
  policyArtifactsReducer, policyDraftFingerprint, policyPublicKey, preparePolicyAddress,
  preparePolicyTransaction, stableJson, type PolicyArtifacts,
} from "../services/policyFlow";
import { broadcastPolicyTransaction, fetchPolicyParent } from "../services/policyExplorer";
import {
  POLICY_PROFILE, type LocalPolicyContext, type PolicyApi, type PolicyCapabilities,
  type PolicyContextSummary, type PolicyDraft, type PolicyRegistry, type PolicyTransactionDraft,
} from "../services/policyTypes";

const secret = "01".padStart(64, "0");
const key = policyPublicKey(secret);
const txid = "ab".repeat(32);
const hash = (value: string) => Buffer.from(sha256(new TextEncoder().encode(value))).toString("hex");
const hexBytes = (value: string) => Buffer.from(value, "hex");
const defaultTransaction = (): PolicyTransactionDraft => ({
  inputs: `${txid}:0`, outputs: "recipient:49000", sequence: "4294967293", lockTime: "0",
});
const defaultDraft = (): PolicyDraft => ({
  chain: "bitcoin", profile: POLICY_PROFILE, network: "testnet4", source: DEFAULT_POLICY_SOURCE,
  recoveryScript: "OP_TRUE", userSecretKey: secret,
  approvalSigners: [{ witnessName: "APPROVAL", secretKey: secret, scope: "transaction" }], extraWitnessJson: "{}",
});

function fixture() {
  const calls: string[] = [];
  const registry: PolicyRegistry = {
    profile: POLICY_PROFILE, profile_hash: "99".repeat(32),
    manifest: {
      profile: POLICY_PROFILE, profile_hash: "99".repeat(32), status: "experimental", schema_version: 1,
      limits: { max_inputs: 8, max_outputs: 8 },
      jets: Array.from({ length: 55 }, (_, id) => ({
        id, name: `jet_${id}`, source_type: "1", target_type: "h", source_bits: 0, target_bits: 256,
        encoding: `1${id.toString(2).padStart(6, "0")}`, cmr: hash(`jet${id}`),
        cost_milliweight: 10_000, semantic_contract: "test",
      })),
      legacy_jets: [],
    },
  };
  const capabilities: PolicyCapabilities = {
    ...structuredClone(registry), network: "testnet4", genesis_hash: "44".repeat(32),
    base_public_key_hex: policyPublicKey("03".padStart(64, "0")).slice(2), limits: {}, provenance: "parent-txid-verified",
  };
  const tweak = {
    profile: POLICY_PROFILE, profile_hash: registry.profile_hash, network: "testnet4" as const,
    genesis_hash: capabilities.genesis_hash, cmr: "42".repeat(32), signing_commitment: "55".repeat(32),
    public_key_hex: policyPublicKey("02".padStart(64, "0")).slice(2),
    base_public_key_hex: capabilities.base_public_key_hex,
  };
  const contexts = new Map<string, LocalPolicyContext[]>();
  const lookup = (psbt: string, index: number) => structuredClone(contexts.get(psbt)![index]);
  const api: PolicyApi = {
    async registry() { calls.push("registry"); return structuredClone(registry); },
    async capabilities() { calls.push("capabilities"); return structuredClone(capabilities); },
    async compile(request) {
      calls.push(request.witness ? "compileWitness" : "compile");
      assert.equal(request.environment, "bitcoin");
      assert.equal(request.profile, POLICY_PROFILE);
      return { program_base64: "AQ==", cmr_hex: tweak.cmr, ...(request.witness ? { witness_base64: "AA==" } : {}) };
    },
    async encodeScript(script) { calls.push("encode"); assert.equal(script, "OP_TRUE"); return "51"; },
    async localTweak(request) { calls.push("localTweak"); assert.equal(request.redeem_script_hex, "51"); return structuredClone(tweak); },
    async tweak(request) {
      calls.push("tweak");
      assert.deepEqual(request, { profile_hash: registry.profile_hash, network: "testnet4", program: "AQ==", redeem_script_hex: "51" });
      return structuredClone(tweak);
    },
    async convert(request) {
      calls.push("convert");
      assert.equal(request.service_pubkey, `02${tweak.public_key_hex}`);
      return { hex: "51", address: "contract", user_leaf_hash_hex: "66".repeat(32) };
    },
    async fetchParent(network, requestedTxid) {
      calls.push("parent"); assert.equal(network, "testnet4"); assert.equal(requestedTxid, txid);
      return "00";
    },
    async createPsbt(request) {
      calls.push("create");
      assert.ok(request.inputs.every((input) => input.parent_tx_hex === "00"));
      const psbtHex = hash(stableJson(request));
      const total = 50_000 * request.inputs.length;
      const outputValue = request.outputs.reduce((sum, output) => sum + output.value_sat, 0);
      contexts.set(psbtHex, request.inputs.map((_, index) => {
        const context: PolicyContextSummary = {
          profile: POLICY_PROFILE, profile_hash: registry.profile_hash, network: "testnet4",
          genesis_hash: tweak.genesis_hash, cmr: tweak.cmr, signing_commitment: tweak.signing_commitment,
          redeem_script_hash: hash("51"), input_index: index, input_count: request.inputs.length,
          output_count: request.outputs.length, unsigned_tx_hash: hash(psbtHex), prevouts_hash: hash(`parents${psbtHex}`),
          cooperative_leaf_hash: hash("leaf"), cooperative_sighash_default: hash(`sighash${psbtHex}${index}`),
          policy_approval_hash: hash(`J53${psbtHex}${index}`), policy_transaction_approval_hash: hash(`J54${psbtHex}`),
          service_pubkey: tweak.public_key_hex, user_pubkey: key.slice(2), recovery_leaf_hash: "66".repeat(32),
          total_input_value: total, total_output_value: outputValue, fee: total - outputValue, debit: total,
          vsize_lower_bound: 100, script_pubkey_hex: `5120${hash("script")}`,
          provenance: "parent-txid-verified", chain_status_verified: false,
          outputs: request.outputs.map((output, index) => ({ index, value: output.value_sat, script_pubkey_hex: "51", script_hash: hash("51"), script_class: 0 })),
        };
        return {
          context,
          outputs: request.outputs.map((output, index) => ({ index, value_sat: output.value_sat, script_pubkey_hex: "51", address: output.address })),
        };
      }));
      return { psbt_hex: psbtHex };
    },
    async localContext(request) { calls.push("localContext"); return lookup(request.psbt_hex, request.input_index); },
    async prepare(request) { calls.push("prepare"); return { context: lookup(request.psbt_hex, request.input_index).context }; },
    async evaluate(request) {
      calls.push("evaluate");
      assert.equal(request.witness, "AA==");
      return { accepted: true, context: lookup(request.psbt_hex, request.input_index).context, execution_cost_milliweight: 30_000 };
    },
    async sign(request) {
      calls.push("sign");
      return {
        psbt_hex: request.psbt_hex, input_index: request.input_index, signature_hex: "11".repeat(64),
        public_key_hex: tweak.public_key_hex, context: lookup(request.psbt_hex, request.input_index).context,
        execution_cost_milliweight: 30_000,
      };
    },
    async verifySigned(request) {
      calls.push("verifySigned");
      assert.equal(request.prepared.psbt_hex, request.signed_psbt_hex);
      return { verified: true, context: lookup(request.prepared.psbt_hex, request.prepared.input_index).context };
    },
    async finalize(request) {
      calls.push("finalize");
      const all = contexts.get(request.prepared.psbt_hex)!;
      for (const signature of request.signatures) {
        assert.ok(schnorr.verify(hexBytes(signature.signature_hex), hexBytes(all[signature.input_index].context.cooperative_sighash_default), hexBytes(key.slice(2))));
      }
      return { finalized: true, inputs: all.length, outputs: all[0].outputs.length, transaction_hex: "00", txid, witnesses: [] };
    },
    async broadcast() { throw new Error("Tests must never broadcast or spend funds."); },
  };
  async function prepared(transaction = defaultTransaction(), draft = defaultDraft()) {
    const address = await preparePolicyAddress(draft, api);
    const prepared = await preparePolicyTransaction(address, transaction, api);
    return { address, transaction: prepared, draft };
  }
  return { api, calls, registry, capabilities, tweak, contexts, prepared };
}

test("policy chain and profile are explicit; neither legacy nor Elements silently falls back", async () => {
  for (const patch of [{ profile: "legacy" as const }, { chain: "elements" as const }]) {
    const { api, calls } = fixture();
    await assert.rejects(preparePolicyAddress({ ...defaultDraft(), ...patch }, api), /matching Bitcoin or Liquid policy workspace/);
    assert.deepEqual(calls, []);
  }
});

test("policy address encodes exact script before tweak and checks local/service CMR and key", async () => {
  const { api, calls, registry } = fixture();
  const address = await preparePolicyAddress(defaultDraft(), api);
  assert.equal(address.address, "contract");
  assert.equal(address.registry.profile_hash, registry.profile_hash);
  assert.deepEqual(calls, ["registry", "capabilities", "compile", "encode", "localTweak", "tweak", "convert"]);
});

for (const mutation of ["fingerprint", "manifest", "network", "genesis", "base-key"] as const) {
  test(`policy funding hard-stops on capabilities ${mutation} mismatch`, async () => {
    const { api, capabilities, calls } = fixture();
    if (mutation === "fingerprint") capabilities.profile_hash = "88".repeat(32);
    if (mutation === "manifest") capabilities.manifest.jets[54].cost_milliweight = 9_999;
    if (mutation === "network") capabilities.network = "testnet";
    if (mutation === "genesis") capabilities.genesis_hash = "bad";
    if (mutation === "base-key") capabilities.base_public_key_hex = "bad";
    await assert.rejects(preparePolicyAddress(defaultDraft(), api));
    assert.ok(!calls.includes("tweak"));
    assert.ok(!calls.includes("convert"));
  });
}

for (const field of ["cmr", "public_key_hex", "signing_commitment", "genesis_hash"] as const) {
  test(`policy funding rejects remote ${field} disagreement`, async () => {
    const { api } = fixture();
    const tweak = api.tweak;
    api.tweak = async (request) => ({ ...await tweak(request), [field]: "77".repeat(32) });
    await assert.rejects(preparePolicyAddress(defaultDraft(), api), /differs from the browser/);
  });
}

test("policy registry comparison is structural but fingerprint and every jet stay authoritative", () => {
  const { registry, capabilities } = fixture();
  assertPolicyRegistry(registry, capabilities, "testnet4");
  const reordered = Object.fromEntries(Object.entries(capabilities.manifest).reverse());
  assertPolicyRegistry(registry, { ...capabilities, manifest: reordered as typeof capabilities.manifest }, "testnet4");
  assert.throws(() => assertPolicyRegistry({ ...registry, profile: "legacy" }, capabilities, "testnet4"));
});

test("policy preparation fetches full parents once per txid and compares every local/service input context", async () => {
  const f = fixture();
  const { transaction } = await f.prepared({ ...defaultTransaction(), inputs: `${txid}:0\n${txid}:1`, outputs: "recipient:99000" });
  assert.equal(transaction.local.length, 2);
  assert.equal(f.calls.filter((call) => call === "parent").length, 1);
  assert.equal(f.calls.filter((call) => call === "prepare").length, 2);
  assert.equal(transaction.local[0].context.provenance, "parent-txid-verified");
});

test("policy preparation rejects missing full evidence or a service fee/context mismatch", async () => {
  for (const failure of ["parent", "context"] as const) {
    const f = fixture();
    const address = await preparePolicyAddress(defaultDraft(), f.api);
    if (failure === "parent") f.api.fetchParent = async () => { throw new Error("Missing parent evidence"); };
    else {
      const prepare = f.api.prepare;
      f.api.prepare = async (request) => {
        const result = await prepare(request);
        result.context.fee++;
        return result;
      };
    }
    await assert.rejects(preparePolicyTransaction(address, defaultTransaction(), f.api), /parent evidence|differs from locally verified/);
    assert.ok(!f.calls.includes("compileWitness"));
    assert.ok(!f.calls.includes("sign"));
  }
});

test("policy transaction shape, amounts, duplicate inputs and raw integer controls fail closed", async () => {
  const f = fixture();
  const address = await preparePolicyAddress(defaultDraft(), f.api);
  for (const patch of [
    { inputs: `${txid}:0\n${txid}:0` }, { inputs: `${txid}:4294967296` }, { inputs: "invalid:0" },
    { inputs: Array.from({ length: 9 }, (_, i) => `${txid}:${i}`).join("\n") },
    { outputs: "recipient:0" }, { outputs: "recipient:1.5" }, { outputs: "recipient:2100000000000001" },
    { outputs: Array.from({ length: 9 }, () => "recipient:1").join("\n") },
    { sequence: "-1" }, { lockTime: "4294967296" },
  ]) await assert.rejects(preparePolicyTransaction(address, { ...defaultTransaction(), ...patch }, f.api));
  assert.ok(!f.calls.includes("parent"));
});

test("J53/J54 signatures approve raw digest bytes, not a second SHA256 or fixed message", async () => {
  const f = fixture();
  const { transaction } = await f.prepared();
  const context = transaction.local[0].context;
  for (const scope of ["input", "transaction"] as const) {
    const values = policyApprovalWitness(context, [{ witnessName: "SIG", secretKey: secret, scope }], "{}");
    const signature = hexBytes(values.SIG.value.slice(2));
    const message = hexBytes(scope === "input" ? context.policy_approval_hash : context.policy_transaction_approval_hash);
    assert.ok(schnorr.verify(signature, message, hexBytes(key.slice(2))));
    assert.equal(schnorr.verify(signature, sha256(message), hexBytes(key.slice(2))), false);
    assert.equal(schnorr.verify(signature, sha256(new TextEncoder().encode("Simplicity Unchained live demo")), hexBytes(key.slice(2))), false);
  }
});

test("fresh distinct 2-of-3 witnesses use correctly typed optional slots", async () => {
  const f = fixture();
  const { transaction } = await f.prepared();
  const values = policyApprovalWitness(transaction.local[0].context, [
    { witnessName: "APPROVALS[0]", secretKey: secret, scope: "transaction" },
    { witnessName: "APPROVALS[2]", secretKey: "02".padStart(64, "0"), scope: "transaction" },
  ], '{"SELECT":{"type":"u8","value":"1"}}');
  assert.equal(values.APPROVALS.type, "[Option<Signature>; 3]");
  assert.match(values.APPROVALS.value, /^\[Some\(0x[0-9a-f]{128}\), None, Some\(0x[0-9a-f]{128}\)\]$/);
  assert.equal(values.SELECT.value, "1");
  assert.throws(() => policyApprovalWitness(transaction.local[0].context, [
    { witnessName: "APPROVALS[0]", secretKey: secret, scope: "transaction" },
    { witnessName: "APPROVALS[1]", secretKey: secret, scope: "transaction" },
  ], "{}"), /distinct/);
  assert.throws(() => policyApprovalWitness(transaction.local[0].context, defaultDraft().approvalSigners,
    '{"SIG":{"type":"Signature","value":"0x00"}}'), /fixed signatures/);
});

test("policy prepares, freshly approves, evaluates, verifies all service signatures, and securely finalizes without broadcasting", async () => {
  const f = fixture();
  const { address, transaction, draft } = await f.prepared();
  const approvals = await approvePolicyTransaction(address, transaction, draft, f.api);
  const result = await cosignPolicyTransaction(address, transaction, approvals, draft, f.api);
  assert.equal(result.txid, txid);
  assert.ok(f.calls.indexOf("compileWitness") < f.calls.indexOf("evaluate"));
  assert.ok(f.calls.indexOf("sign") < f.calls.indexOf("verifySigned"));
  assert.ok(f.calls.indexOf("verifySigned") < f.calls.indexOf("finalize"));
  assert.equal(f.calls.at(-1), "finalize");
});

for (const mutation of ["outputs", "recipient", "lockTime", "sequence", "inputs"] as const) {
  test(`transaction ${mutation} mutation invalidates both approvals and co-signing artifacts`, async () => {
    const f = fixture();
    const { address, transaction, draft } = await f.prepared();
    const approvals = await approvePolicyTransaction(address, transaction, draft, f.api);
    const changed = defaultTransaction();
    if (mutation === "outputs") changed.outputs = "recipient:48999";
    if (mutation === "recipient") changed.outputs = "other-recipient:49000";
    if (mutation === "lockTime") changed.lockTime = "1";
    if (mutation === "sequence") changed.sequence = "16";
    if (mutation === "inputs") changed.inputs = `${txid}:1`;
    const next = await preparePolicyTransaction(address, changed, f.api);
    assert.notEqual(next.fingerprint, transaction.fingerprint);
    assert.notEqual(next.local[0].context.policy_approval_hash, transaction.local[0].context.policy_approval_hash);
    assert.notEqual(next.local[0].context.policy_transaction_approval_hash, transaction.local[0].context.policy_transaction_approval_hash);
    await assert.rejects(cosignPolicyTransaction(address, next, approvals, draft, f.api), /Fresh approval witnesses/);
    const old = hexBytes(approvals.witnesses[0].values.APPROVAL.value.slice(2));
    assert.equal(schnorr.verify(old, hexBytes(next.local[0].context.policy_transaction_approval_hash), hexBytes(key.slice(2))), false);
  });
}

test("contract edits invalidate every prepared artifact; transaction edits retain only the funding contract", async () => {
  const f = fixture();
  const { address, transaction, draft } = await f.prepared();
  const approvals = await approvePolicyTransaction(address, transaction, draft, f.api);
  const finalized = await cosignPolicyTransaction(address, transaction, approvals, draft, f.api);
  const state: PolicyArtifacts = { revision: 1, address, transaction, approvals, finalized, broadcast: { txid, explorer_url: "test-only" } };
  for (const patch of [
    { chain: "elements" as const }, { profile: "legacy" as const }, { network: "testnet" as const },
    { source: "fn main() {}" }, { recoveryScript: "OP_FALSE" }, { userSecretKey: "02".padStart(64, "0") },
    { approvalSigners: [] }, { extraWitnessJson: '{"X":{"type":"u8","value":"1"}}' },
  ]) {
    assert.notEqual(policyDraftFingerprint({ ...draft, ...patch }), address.fingerprint);
    assert.deepEqual(policyArtifactsReducer(state, { type: "contractChanged" }), { revision: 2 });
  }
  const changed = policyArtifactsReducer(state, { type: "transactionChanged" });
  assert.deepEqual(changed, { revision: 2, address });
  assert.equal(policyArtifactsReducer(changed, { type: "approvals", revision: 1, value: approvals }), changed);
  await assert.rejects(approvePolicyTransaction(address, transaction, { ...draft, network: "testnet" }, f.api), /inputs changed/);
});

test("stale asynchronous approval work is stopped before witness compilation/signing", async () => {
  const f = fixture();
  const { address, transaction, draft } = await f.prepared();
  await assert.rejects(approvePolicyTransaction(address, transaction, draft, f.api, () => { throw new Error("stale revision"); }), /stale revision/);
  assert.ok(!f.calls.includes("compileWitness"));
  assert.ok(!f.calls.includes("sign"));
});

for (const failure of ["registry", "program", "evaluation", "cost", "service-key", "signature"] as const) {
  test(`policy failure ${failure} never reaches finalization or broadcast`, async () => {
    const f = fixture();
    const { address, transaction, draft } = await f.prepared();
    if (failure === "registry") f.capabilities.profile_hash = "88".repeat(32);
    if (failure === "program") {
      const compile = f.api.compile;
      f.api.compile = async (request) => ({ ...await compile(request), cmr_hex: "77".repeat(32) });
    }
    if (failure === "evaluation") f.api.evaluate = async () => { throw new Error("Policy rejected"); };
    if (failure === "cost") {
      const evaluate = f.api.evaluate;
      f.api.evaluate = async (request) => ({ ...await evaluate(request), execution_cost_milliweight: 10_000_001 });
    }
    if (failure === "service-key") {
      const sign = f.api.sign;
      f.api.sign = async (request) => ({ ...await sign(request), public_key_hex: "77".repeat(32) });
    }
    if (failure === "signature") {
      const verify = f.api.verifySigned;
      f.api.verifySigned = async (request) => ({ ...await verify(request), verified: false });
    }
    await assert.rejects(async () => {
      const approvals = await approvePolicyTransaction(address, transaction, draft, f.api);
      await cosignPolicyTransaction(address, transaction, approvals, draft, f.api);
    });
    assert.ok(!f.calls.includes("finalize"));
  });
}

test("policy parent fetch uses the selected fixed explorer's full transaction hex endpoint", async () => {
  const requests: string[] = [];
  const parent = await fetchPolicyParent("testnet4", txid, async (input, init) => {
    requests.push(String(input));
    assert.equal(init?.cache, "no-store");
    return new Response("AABB\n");
  });
  assert.equal(parent, "aabb");
  assert.deepEqual(requests, [`https://mempool.space/testnet4/api/tx/${txid}/hex`]);
  for (const response of [new Response("missing", { status: 404 }), new Response("<html>error</html>"), new Response("abc")]) {
    await assert.rejects(fetchPolicyParent("testnet4", txid, async () => response));
  }
});

test("explicit policy broadcast posts only reviewed raw hex to a fixed testnet endpoint (mocked; never sent)", async () => {
  const result = await broadcastPolicyTransaction("testnet4", "aabb", async (input, init) => {
    assert.equal(input, "https://mempool.space/testnet4/api/tx");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, "aabb");
    assert.deepEqual(init?.headers, { "Content-Type": "text/plain" });
    return new Response(txid.toUpperCase());
  });
  assert.deepEqual(result, { txid, explorer_url: `https://mempool.space/testnet4/tx/${txid}` });
  const never: typeof fetch = async () => { throw new Error("Must not send invalid/mainnet transactions"); };
  await assert.rejects(broadcastPolicyTransaction("bitcoin", "aabb", never), /Mainnet broadcasting/);
  await assert.rejects(broadcastPolicyTransaction("testnet4", "invalid hex", never), /Invalid finalized/);
  await assert.rejects(broadcastPolicyTransaction("testnet4", "aa", async () => new Response("rejected", { status: 400 })), /Broadcast rejected/);
  await assert.rejects(broadcastPolicyTransaction("testnet4", "aa", async () => new Response("wrong txid")), /invalid broadcast txid/);
});
