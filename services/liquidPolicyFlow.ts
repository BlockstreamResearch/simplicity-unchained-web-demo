import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { policyPublicKey, stableJson } from "./policyFlow";
import { DEMO_NETWORKS, LIQUID_TESTNET_ASSET } from "./demoNetworks";
import type { liquidPolicyApi } from "./liquidPolicyApi";
import { LIQUID_PROFILE, type LiquidAddress, type LiquidCapabilities, type LiquidContextRequest,
  type LiquidContextSummary, type LiquidDraft, type LiquidEvaluation, type LiquidFinalized,
  type LiquidFunding, type LiquidPrepared, type LiquidServiceRequest } from "./liquidPolicyTypes";
import type { PolicyRegistry, WitnessValue } from "./policyTypes";

type Api = typeof liquidPolicyApi;
const hash = /^[0-9a-f]{64}$/i;
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
const fingerprint = (value: unknown) => Buffer.from(sha256(new TextEncoder().encode(stableJson(value)))).toString("hex");
const key = (value: string) => {
  if (hash.test(value)) return value.toLowerCase();
  if (/^0[23][0-9a-f]{64}$/i.test(value)) return value.slice(2).toLowerCase();
  throw new Error("Invalid Liquid cooperative key.");
};

export function assertLiquidRegistry(local: PolicyRegistry, remote: LiquidCapabilities) {
  if (local.profile !== LIQUID_PROFILE || local.manifest.profile !== LIQUID_PROFILE
    || !hash.test(local.profile_hash) || local.manifest.profile_hash !== local.profile_hash
    || remote.profile !== LIQUID_PROFILE || remote.profile_hash !== local.profile_hash
    || stableJson(local.manifest) !== stableJson(remote.manifest)) {
    throw new Error("Liquid policy registry mismatch. Rebuild matching browser and service versions; do not fund.");
  }
  if (remote.network !== "liquidtestnet" || !hash.test(remote.genesis_hash) || !hash.test(remote.base_public_key_hex)) {
    throw new Error("Liquid policy service must use Liquid Testnet and a valid signing identity.");
  }
}

export async function checkLiquidCapabilities(address: LiquidAddress, api: Api) {
  const capabilities = await api.capabilities();
  assertLiquidRegistry(address.registry, capabilities);
  if (capabilities.base_public_key_hex !== address.capabilities.base_public_key_hex || capabilities.genesis_hash !== address.capabilities.genesis_hash) {
    throw new Error("The Liquid oracle identity changed. Keep funded contract details and prepare again.");
  }
}

export async function prepareLiquidAddress(draft: LiquidDraft, api: Api): Promise<LiquidAddress> {
  const userPubkey = policyPublicKey(draft.userSecretKey);
  if (!hash.test(draft.blindingSecretKey) || !/^0[23][0-9a-f]{64}$/i.test(draft.blindingPublicKey)) throw new Error("A valid local receiving blinding key is required.");
  if (policyPublicKey(draft.blindingSecretKey) !== draft.blindingPublicKey.toLowerCase()) throw new Error("Liquid blinding keypair does not match.");
  const [registry, capabilities] = await Promise.all([api.registry(), api.capabilities()]);
  assertLiquidRegistry(registry, capabilities);
  const compiled = await api.compile(draft.source);
  if (!hash.test(compiled.cmr_hex) || !compiled.program_base64) throw new Error("Invalid Liquid policy compilation.");
  const encoded = await api.recoveryScript(draft.recoveryScript);
  if (!/^(?:[0-9a-f]{2})*$/i.test(encoded.redeem_script_hex) || !hash.test(encoded.user_leaf_hash_hex)) throw new Error("Invalid Elements recovery script encoding.");
  const binding = { network: "liquidtestnet" as const, cmr_hex: compiled.cmr_hex,
    redeem_script_hex: encoded.redeem_script_hex, base_public_key_hex: capabilities.base_public_key_hex };
  const [local, remote] = await Promise.all([
    api.localTweak(binding),
    api.tweak({ profile_hash: registry.profile_hash, network: binding.network, program: compiled.program_base64, redeem_script_hex: binding.redeem_script_hex }),
  ]);
  if (local.profile !== LIQUID_PROFILE || local.profile_hash !== registry.profile_hash || local.network !== binding.network
    || local.genesis_hash !== capabilities.genesis_hash || local.cmr !== compiled.cmr_hex
    || local.base_public_key_hex !== capabilities.base_public_key_hex || stableJson(local) !== stableJson(remote)) {
    throw new Error("Liquid policy commitment or local/service oracle key mismatch. Do not fund.");
  }
  const address = await api.address({ binding, user_pubkey: userPubkey, user_leaf_hash_hex: encoded.user_leaf_hash_hex, blinding_public_key_hex: draft.blindingPublicKey });
  if (address.profile !== LIQUID_PROFILE || address.profile_hash !== registry.profile_hash || address.network !== binding.network
    || key(address.service_pubkey) !== key(local.public_key_hex)
    || !address.address || !address.unconfidential_address || !/^[0-9a-f]+$/i.test(address.script_pubkey_hex)) {
    throw new Error("Invalid Liquid confidential address derivation. Rebuild matching WASM bindings.");
  }
  return { fingerprint: fingerprint(draft), binding, registry, capabilities, program: compiled.program_base64, source: draft.source,
    userPubkey, recoveryLeafHash: encoded.user_leaf_hash_hex, servicePubkey: key(local.public_key_hex),
    address: address.address, unconfidentialAddress: address.unconfidential_address,
    scriptPubkeyHex: address.script_pubkey_hex, signingCommitment: local.signing_commitment };
}

export async function findLiquidFunding(address: LiquidAddress, blindingSecretKey: string, signal: AbortSignal | undefined, api: Api, fetcher: typeof fetch = fetch): Promise<LiquidFunding[]> {
  const response = await fetcher(`${DEMO_NETWORKS.liquidtestnet.api}/address/${encodeURIComponent(address.unconfidentialAddress)}/utxo`, {
    cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Liquid funding lookup failed (${response.status}). Retry or inspect the explorer.`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Invalid Liquid funding list.");
  const parents = new Map<string, Promise<string>>();
  const found: LiquidFunding[] = [];
  for (const item of body) {
    if (typeof item !== "object" || item === null || !("txid" in item) || typeof item.txid !== "string" || !hash.test(item.txid)
      || !("vout" in item) || typeof item.vout !== "number" || !Number.isInteger(item.vout) || item.vout < 0 || item.vout > 0xffff_ffff
      || !("status" in item) || typeof item.status !== "object" || item.status === null || !("confirmed" in item.status) || typeof item.status.confirmed !== "boolean") {
      throw new Error("Invalid Liquid funding metadata.");
    }
    if (signal?.aborted) throw signal.reason;
    const txid = item.txid.toLowerCase();
    let parent = parents.get(txid);
    if (!parent) { parent = api.fetchParent(txid); parents.set(txid, parent); }
    const parentTxHex = await parent;
    const unblinded = await api.unblind({ parent_tx_hex: parentTxHex, txid, vout: item.vout, blinding_secret_key_hex: blindingSecretKey });
    if (unblinded.txid !== txid || unblinded.vout !== item.vout || unblinded.script_pubkey_hex !== address.scriptPubkeyHex
      || !hash.test(unblinded.disclosure.asset_id) || !Number.isSafeInteger(unblinded.disclosure.value_sat) || unblinded.disclosure.value_sat < 0) {
      throw new Error("Liquid funding does not match this contract or verified disclosure.");
    }
    found.push({ txid, vout: item.vout, parentTxHex, confirmed: item.status.confirmed,
      assetId: unblinded.disclosure.asset_id, value: unblinded.disclosure.value_sat, confidential: unblinded.disclosure.confidential });
  }
  return found.sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.value - a.value);
}

export function liquidContextRequest(address: LiquidAddress, psetHex: string, index: number): LiquidContextRequest {
  return { ...address.binding, pset_hex: psetHex, input_index: index, user_pubkey: address.userPubkey, user_leaf_hash_hex: address.recoveryLeafHash };
}
function serviceRequest(address: LiquidAddress, psetHex: string, index: number): LiquidServiceRequest {
  return { profile_hash: address.registry.profile_hash, network: address.binding.network, program: address.program,
    redeem_script_hex: address.binding.redeem_script_hex, pset_hex: psetHex, input_index: index,
    user_pubkey: address.userPubkey, user_leaf_hash_hex: address.recoveryLeafHash };
}
function assertContext(address: LiquidAddress, local: LiquidContextSummary, remote: LiquidContextSummary, index: number) {
  if (stableJson(local) !== stableJson(remote)) throw new Error("Liquid service context differs from locally verified proofs. Nothing was approved.");
  if (local.profile !== LIQUID_PROFILE || local.profile_hash !== address.registry.profile_hash || local.network !== address.binding.network
    || local.genesis_hash !== address.capabilities.genesis_hash || local.cmr !== address.binding.cmr_hex
    || local.signing_commitment !== address.signingCommitment || local.script_pubkey_hex !== address.scriptPubkeyHex
    || local.chain_status_verified !== false || local.input_index !== index
    || key(local.user_pubkey) !== key(address.userPubkey) || key(local.service_pubkey) !== address.servicePubkey
    || local.recovery_leaf_hash !== address.recoveryLeafHash || local.fee_asset_id !== LIQUID_TESTNET_ASSET
    || !hash.test(local.disclosures_hash) || !hash.test(local.policy_approval_hash) || !hash.test(local.policy_transaction_approval_hash)
    || local.inputs.length !== local.input_count || local.outputs.length !== local.output_count || local.output_scripts_hex.length !== local.output_count) {
    throw new Error("Unexpected Liquid policy signing context.");
  }
  for (const asset of local.assets) {
    if (!hash.test(asset.asset_id) || [asset.total_input_value, asset.total_output_value, asset.fee, asset.returned_value, asset.debit].some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error("Invalid verified Liquid asset accounting.");
    }
  }
}
function uint32(value: string, label: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 0xffff_ffff) throw new Error(`${label} must be an unsigned 32-bit integer.`);
  return Number(value);
}

export function liquidSpendOutputs(inputs: LiquidFunding[], fee: number, recipient: string) {
  if (inputs.length < 1 || inputs.length > 8 || new Set(inputs.map((input) => `${input.txid}:${input.vout}`)).size !== inputs.length) throw new Error("Select one to eight distinct funding outputs.");
  if (!Number.isSafeInteger(fee) || fee < 1 || !recipient) throw new Error("A positive integer L-BTC fee and confidential recipient are required.");
  const totals = new Map<string, number>();
  for (const input of inputs) {
    const value = (totals.get(input.assetId) ?? 0) + input.value;
    if (!hash.test(input.assetId) || !Number.isSafeInteger(input.value) || input.value < 0 || !Number.isSafeInteger(value)) throw new Error("Invalid Liquid funding amount or asset.");
    totals.set(input.assetId, value);
  }
  const networkValue = totals.get(LIQUID_TESTNET_ASSET);
  if (networkValue === undefined || networkValue <= fee) throw new Error("Include enough Liquid Testnet L-BTC to pay the fee.");
  totals.set(LIQUID_TESTNET_ASSET, networkValue - fee);
  if (totals.size > 7) throw new Error("The guided flow supports up to seven distinct assets plus the fee output.");
  return [...totals].map(([asset_id, value_sat]) => ({ address: recipient, asset_id, value_sat }))
    .concat({ address: "fee", asset_id: LIQUID_TESTNET_ASSET, value_sat: fee });
}

export async function prepareLiquidPset(address: LiquidAddress, psetHex: string, api: Api): Promise<LiquidPrepared> {
  if (!/^(?:[0-9a-f]{2})+$/i.test(psetHex)) throw new Error("Enter a PSET encoded as hex.");
  await checkLiquidCapabilities(address, api);
  const first = (await api.context(liquidContextRequest(address, psetHex, 0))).context;
  if (!Number.isInteger(first.input_count) || first.input_count < 1 || first.input_count > 8) throw new Error("Liquid policies support one to eight inputs.");
  const contexts: LiquidContextSummary[] = [];
  for (let index = 0; index < first.input_count; index++) {
    const local = index === 0 ? first : (await api.context(liquidContextRequest(address, psetHex, index))).context;
    const remote = (await api.prepare(serviceRequest(address, psetHex, index))).context;
    assertContext(address, local, remote, index);
    contexts.push(local);
  }
  return { fingerprint: fingerprint({ address: address.fingerprint, psetHex, contexts }), addressFingerprint: address.fingerprint, psetHex, contexts };
}

export async function prepareLiquidSpend(address: LiquidAddress, inputs: LiquidFunding[], draft: LiquidDraft,
  options: { recipient: string; fee: number; sequence: string; lockTime: string }, api: Api): Promise<LiquidPrepared> {
  if (fingerprint(draft) !== address.fingerprint) throw new Error("Liquid contract inputs changed; prepare the address again.");
  const outputs = liquidSpendOutputs(inputs, options.fee, options.recipient || address.address);
  const pset = await api.createPset({ network: "liquidtestnet", lock_time: uint32(options.lockTime, "Locktime"),
    inputs: inputs.map((input) => ({ txid: input.txid, vout: input.vout, parent_tx_hex: input.parentTxHex,
      blinding_secret_key_hex: draft.blindingSecretKey, sequence: uint32(options.sequence, "Sequence") })), outputs });
  const prepared = await prepareLiquidPset(address, pset.pset_hex, api);
  return { ...prepared, recipient: options.recipient || address.address };
}

function assertEvaluation(address: LiquidAddress, expected: LiquidContextSummary, evaluation: LiquidEvaluation, index: number) {
  assertContext(address, expected, evaluation.context, index);
  if (evaluation.accepted !== true || !Number.isSafeInteger(evaluation.execution_cost_milliweight)
    || evaluation.execution_cost_milliweight < 0 || evaluation.execution_cost_milliweight > 10_000_000) throw new Error("Liquid policy evaluation failed or exceeded its execution limit.");
}

export async function approveAndCosignLiquid(address: LiquidAddress, transaction: LiquidPrepared, draft: LiquidDraft,
  assertCurrent: () => void, api: Api): Promise<LiquidFinalized> {
  if (fingerprint(draft) !== address.fingerprint || transaction.addressFingerprint !== address.fingerprint) throw new Error("Liquid contract changed; prepare fresh evidence and approvals.");
  await checkLiquidCapabilities(address, api);
  assertCurrent();
  const extra: unknown = JSON.parse(draft.extraWitnessJson);
  if (typeof extra !== "object" || extra === null || Array.isArray(extra)) throw new Error("Extra witnesses must be a JSON object.");
  const values: Record<string, WitnessValue> = {};
  for (const [name, witness] of Object.entries(extra)) {
    if (name === "APPROVAL" || typeof witness !== "object" || witness === null || !("value" in witness) || typeof witness.value !== "string"
      || !("type" in witness) || typeof witness.type !== "string" || witness.type.includes("Signature")) throw new Error("Invalid extra witness; approval signatures are generated fresh.");
    values[name] = { value: witness.value, type: witness.type };
  }
  const witnesses: string[] = [];
  for (const [index, context] of transaction.contexts.entries()) {
    const digest = draft.scope === "input" ? context.policy_approval_hash : context.policy_transaction_approval_hash;
    if (!hash.test(digest)) throw new Error("Invalid Liquid approval digest.");
    const signature = Buffer.from(schnorr.sign(bytes(digest), bytes(draft.userSecretKey))).toString("hex");
    const compiled = await api.compile(address.source, { ...values, APPROVAL: { value: `0x${signature}`, type: "Signature" } });
    if (compiled.program_base64 !== address.program || compiled.cmr_hex !== address.binding.cmr_hex || !compiled.witness_base64) throw new Error("Liquid witness compilation changed the policy commitment.");
    assertCurrent();
    const local = await api.localEvaluate({ prepared: liquidContextRequest(address, transaction.psetHex, index), program_base64: address.program, witness_base64: compiled.witness_base64 });
    const remote = await api.evaluate({ ...serviceRequest(address, transaction.psetHex, index), witness: compiled.witness_base64 });
    assertEvaluation(address, context, local, index);
    assertEvaluation(address, context, remote, index);
    witnesses.push(compiled.witness_base64);
    assertCurrent();
  }
  let psetHex = transaction.psetHex;
  for (const [index, context] of transaction.contexts.entries()) {
    assertCurrent();
    const signed = await api.sign({ ...serviceRequest(address, psetHex, index), witness: witnesses[index] });
    assertContext(address, context, signed.context, index);
    if (signed.input_index !== index || key(signed.public_key_hex) !== address.servicePubkey || !/^[0-9a-f]{128}$/i.test(signed.signature_hex)
      || !Number.isSafeInteger(signed.execution_cost_milliweight) || signed.execution_cost_milliweight > 10_000_000 || signed.execution_cost_milliweight < 0) throw new Error("Invalid Liquid oracle signature response.");
    const verified = await api.verify({ prepared: liquidContextRequest(address, transaction.psetHex, index), signed_pset_hex: signed.pset_hex,
      signature_hex: signed.signature_hex, public_key_hex: signed.public_key_hex });
    assertContext(address, context, verified.context, index);
    if (verified.verified !== true) throw new Error("Liquid oracle signature did not verify.");
    psetHex = signed.pset_hex;
  }
  const signatures: Array<{ input_index: number; signature_hex: string; public_key_hex: string }> = [];
  for (const [index, context] of transaction.contexts.entries()) {
    assertCurrent();
    const signed = await api.userSign({ prepared: liquidContextRequest(address, transaction.psetHex, index), signed_pset_hex: psetHex, secret_key_hex: draft.userSecretKey });
    assertContext(address, context, signed.context, index);
    if (signed.input_index !== index || key(signed.public_key_hex) !== key(address.userPubkey) || !/^[0-9a-f]{128}$/i.test(signed.signature_hex)
      || !schnorr.verify(bytes(signed.signature_hex), bytes(context.cooperative_sighash_default), bytes(key(address.userPubkey)))) throw new Error("Liquid user signature did not verify.");
    signatures.push({ input_index: index, signature_hex: signed.signature_hex, public_key_hex: signed.public_key_hex });
    psetHex = signed.pset_hex;
  }
  const finalized = await api.finalize({ prepared: liquidContextRequest(address, transaction.psetHex, 0), signed_pset_hex: psetHex, signatures });
  assertCurrent();
  if (finalized.finalized !== true || finalized.inputs !== transaction.contexts.length || finalized.outputs !== transaction.contexts[0].output_count
    || !hash.test(finalized.txid) || !/^(?:[0-9a-f]{2})+$/i.test(finalized.transaction_hex)) throw new Error("Liquid transaction did not securely finalize.");
  return { transactionFingerprint: transaction.fingerprint, transactionHex: finalized.transaction_hex, txid: finalized.txid };
}
