import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  POLICY_PROFILE, type ApprovalSigner, type FinalizedPolicyTransaction, type LocalContextRequest,
  type PolicyApi, type PolicyApprovals, type PolicyCapabilities, type PolicyContextSummary,
  type PolicyDraft, type PolicyNetwork, type PolicyPrepareRequest, type PolicyRegistry,
  type PolicyTransactionDraft, type PreparedPolicyAddress,   type PreparedPolicyTransaction, type WitnessValue,
} from "./policyTypes";

const hash = /^[0-9a-f]{64}$/i;
const MAX_MONEY = 2_100_000_000_000_000;
const MAX_EXECUTION_COST = 10_000_000;
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const fingerprint = (value: unknown) => toHex(sha256(new TextEncoder().encode(stableJson(value))));

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Missing policy data.");
  return result;
}

function bytes32(value: string): Uint8Array {
  if (!hash.test(value)) throw new Error("Expected an exact 32-byte policy digest.");
  return Uint8Array.from(Buffer.from(value, "hex"));
}

export function policyPublicKey(secret: string): string {
  if (!hash.test(secret)) throw new Error("Enter a valid 32-byte test signing key.");
  return toHex(secp256k1.getPublicKey(bytes32(secret), true));
}

export function policyDraftFingerprint(draft: PolicyDraft): string {
  return fingerprint(draft);
}

export function assertPolicyRegistry(local: PolicyRegistry, remote: PolicyCapabilities, network: PolicyNetwork) {
  if (local.profile !== POLICY_PROFILE || remote.profile !== POLICY_PROFILE
    || !hash.test(local.profile_hash) || local.profile_hash !== local.manifest.profile_hash
    || local.manifest.profile !== POLICY_PROFILE || local.manifest.jets.length !== 55
    || remote.profile_hash !== local.profile_hash || stableJson(remote.manifest) !== stableJson(local.manifest)) {
    throw new Error("Policy registry fingerprint/manifest mismatch. Do not fund this address; rebuild matching browser and service versions. No legacy fallback.");
  }
  if (remote.network !== network) throw new Error(`The policy service is configured for ${remote.network}, not ${network}. Do not fund.`);
  if (!hash.test(remote.genesis_hash) || !hash.test(remote.base_public_key_hex)) {
    throw new Error("The service returned invalid network identity or base key.");
  }
}

function assertContext(local: PolicyContextSummary, remote: PolicyContextSummary) {
  if (stableJson(local) !== stableJson(remote)) {
    throw new Error("Service context differs from locally verified parent evidence, transaction, or approval digests. Nothing was approved.");
  }
  if (local.profile !== POLICY_PROFILE || local.chain_status_verified !== false || local.provenance !== "parent-txid-verified") {
    throw new Error("Unexpected policy context provenance.");
  }
}

export async function checkPolicyCapabilities(address: PreparedPolicyAddress, api: PolicyApi) {
  const remote = await api.capabilities();
  assertPolicyRegistry(address.registry, remote, address.network);
  if (remote.base_public_key_hex !== address.capabilities.base_public_key_hex
    || remote.genesis_hash !== address.capabilities.genesis_hash) {
    throw new Error("The service key or network changed. Prepare the policy address again; old approvals cannot be reused.");
  }
}

export async function preparePolicyAddress(draft: PolicyDraft, api: PolicyApi): Promise<PreparedPolicyAddress> {
  if (draft.chain !== "bitcoin" || draft.profile !== POLICY_PROFILE) {
    throw new Error("Use the matching Bitcoin or Liquid policy workspace. Legacy signing flows have been removed.");
  }
  const userPubkey = policyPublicKey(draft.userSecretKey);
  const registry = await api.registry();
  const capabilities = await api.capabilities();
  assertPolicyRegistry(registry, capabilities, draft.network);
  const compiled = await api.compile({
    script: draft.source, environment: "bitcoin", profile: POLICY_PROFILE, include_debug: false,
  });
  if (!hash.test(compiled.cmr_hex) || !compiled.program_base64) throw new Error("Compiler returned an invalid policy commitment.");
  // Script encoding precedes both local and remote tweaks; even empty script bytes are exact.
  const scriptHex = await api.encodeScript(draft.recoveryScript);
  const local = await api.localTweak({
    network: draft.network, cmr_hex: compiled.cmr_hex, redeem_script_hex: scriptHex,
    base_public_key_hex: capabilities.base_public_key_hex,
  });
  const remote = await api.tweak({
    profile_hash: registry.profile_hash, network: draft.network,
    program: compiled.program_base64, redeem_script_hex: scriptHex,
  });
  if (local.profile !== POLICY_PROFILE || local.profile_hash !== registry.profile_hash
    || local.network !== draft.network || local.genesis_hash !== capabilities.genesis_hash
    || local.cmr !== compiled.cmr_hex.toLowerCase() || stableJson(local) !== stableJson(remote)) {
    throw new Error("The service CMR, script-bound commitment, network, or public key differs from the browser's derivation. Do not fund.");
  }
  const converted = await api.convert({
    script: draft.recoveryScript, network: draft.network,
    service_pubkey: `02${local.public_key_hex}`, user_pubkey: userPubkey,
  });
  if (converted.hex !== scriptHex || !hash.test(converted.user_leaf_hash_hex)) {
    throw new Error("Recovery script bytes changed while constructing the Taproot address.");
  }
  return {
    fingerprint: policyDraftFingerprint(draft), registry, capabilities, network: draft.network,
    source: draft.source, program: compiled.program_base64, cmr: compiled.cmr_hex,
    scriptHex, userPubkey, recoveryLeafHash: converted.user_leaf_hash_hex,
    servicePubkey: local.public_key_hex, signingCommitment: local.signing_commitment,
    address: converted.address,
  };
}

export function localContextRequest(address: PreparedPolicyAddress, psbtHex: string, index: number): LocalContextRequest {
  return {
    psbt_hex: psbtHex, input_index: index, cmr_hex: address.cmr,
    redeem_script_hex: address.scriptHex, network: address.network,
    base_public_key_hex: address.capabilities.base_public_key_hex,
    user_pubkey: address.userPubkey, user_leaf_hash_hex: address.recoveryLeafHash,
  };
}

function serviceRequest(address: PreparedPolicyAddress, psbtHex: string, index: number): PolicyPrepareRequest {
  return {
    profile_hash: address.registry.profile_hash, network: address.network,
    program: address.program, redeem_script_hex: address.scriptHex,
    psbt_hex: psbtHex, input_index: index, user_pubkey: address.userPubkey,
    user_leaf_hash_hex: address.recoveryLeafHash,
  };
}

function uint32(value: string, field: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 0xffff_ffff) {
    throw new Error(`${field} must be an unsigned 32-bit decimal integer.`);
  }
  return Number(value);
}

function lines(text: string): string[] {
  const result = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (result.length < 1 || result.length > 8) throw new Error("Enter between one and eight inputs and outputs, one per line.");
  return result;
}

export async function preparePolicyTransaction(
  address: PreparedPolicyAddress, transaction: PolicyTransactionDraft, api: PolicyApi,
): Promise<PreparedPolicyTransaction> {
  await checkPolicyCapabilities(address, api);
  const sequence = uint32(transaction.sequence, "Sequence");
  const lock_time = uint32(transaction.lockTime, "Locktime");
  const outpoints = lines(transaction.inputs).map((line) => {
    const [txid, vout, extra] = line.split(":");
    if (!hash.test(txid) || extra !== undefined) throw new Error("Each funding input must be txid:vout.");
    return { txid: txid.toLowerCase(), vout: uint32(vout ?? "", "Output index") };
  });
  if (new Set(outpoints.map(({ txid, vout }) => `${txid}:${vout}`)).size !== outpoints.length) throw new Error("Duplicate funding input.");
  const outputs = lines(transaction.outputs).map((line) => {
    const [address, value, extra] = line.split(":");
    if (!address || extra !== undefined || !/^[1-9][0-9]*$/.test(value ?? "")
      || !Number.isSafeInteger(Number(value)) || Number(value) > MAX_MONEY) {
      throw new Error("Each recipient must be address:positive_integer_satoshis within Bitcoin's money range.");
    }
    return { address, value_sat: Number(value) };
  });
  const parents = new Map<string, string>();
  for (const { txid } of outpoints) {
    if (!parents.has(txid)) parents.set(txid, await api.fetchParent(address.network, txid));
  }
  const created = await api.createPsbt({
    inputs: outpoints.map((outpoint) => ({ ...outpoint, parent_tx_hex: parents.get(outpoint.txid)!, sequence })),
    outputs, network: address.network, lock_time,
  });
  const local = [];
  for (let index = 0; index < outpoints.length; index++) {
    const verified = await api.localContext(localContextRequest(address, created.psbt_hex, index));
    const remote = await api.prepare(serviceRequest(address, created.psbt_hex, index));
    assertContext(verified.context, remote.context);
    if (verified.context.profile_hash !== address.registry.profile_hash
      || verified.context.cmr !== address.cmr || verified.context.service_pubkey !== address.servicePubkey
      || verified.context.user_pubkey !== address.userPubkey.slice(2)
      || verified.context.recovery_leaf_hash !== address.recoveryLeafHash
      || verified.context.input_index !== index || verified.context.input_count !== outpoints.length) {
      throw new Error("Local context does not match the compiled contract and selected input.");
    }
    local.push(verified);
  }
  return {
    fingerprint: fingerprint({ address: address.fingerprint, psbt: created.psbt_hex, transaction }),
    addressFingerprint: address.fingerprint, psbtHex: created.psbt_hex, local,
  };
}

/** Sign the decoded J53/J54 bytes directly. In particular, do NOT hash them again. */
export function policyApprovalWitness(
  context: PolicyContextSummary, signers: ApprovalSigner[], extraWitnessJson: string,
): Record<string, WitnessValue> {
  const extra: unknown = JSON.parse(extraWitnessJson);
  if (typeof extra !== "object" || extra === null || Array.isArray(extra)) throw new Error("Extra witness must be a JSON object.");
  const values: Record<string, WitnessValue> = Object.create(null);
  for (const [name, value] of Object.entries(extra)) {
    if (typeof value !== "object" || value === null || !("type" in value) || !("value" in value)
      || typeof value.type !== "string" || typeof value.value !== "string" || /Signature/.test(value.type)) {
      throw new Error("Extra witnesses need string type/value fields and cannot contain fixed signatures. Approval signatures are generated freshly.");
    }
    values[name] = { type: value.type, value: value.value };
  }
  if (signers.length < 1 || signers.length > 3) throw new Error("Select one to three fresh approval signers.");
  const keys = new Set<string>();
  const names = new Set<string>();
  const arrays = new Map<string, Array<string | null>>();
  for (const signer of signers) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[([0-2])\])?$/.exec(signer.witnessName);
    if (!match || names.has(signer.witnessName)) throw new Error("Use unique witness names: NAME or NAME[0], NAME[1], NAME[2] for a 2-of-3 template.");
    const key = policyPublicKey(signer.secretKey).slice(2);
    if (keys.has(key)) throw new Error("Approval signers must use distinct keys, not duplicate signatures.");
    keys.add(key);
    names.add(signer.witnessName);
    if (signer.scope !== "input" && signer.scope !== "transaction") throw new Error("Select the explicit J53 or J54 approval scope.");
    const message = signer.scope === "input" ? context.policy_approval_hash : context.policy_transaction_approval_hash;
    const signature = toHex(schnorr.sign(bytes32(message), bytes32(signer.secretKey)));
    if (match[2] !== undefined) {
      const slots = arrays.get(match[1]) ?? [null, null, null];
      slots[Number(match[2])] = signature;
      arrays.set(match[1], slots);
    } else {
      if (match[1] in values) throw new Error("Approval witness overlaps an extra witness.");
      values[match[1]] = { type: "Signature", value: `0x${signature}` };
    }
  }
  for (const [name, slots] of arrays) {
    if (name in values) throw new Error("Approval array overlaps another witness.");
    values[name] = { type: "[Option<Signature>; 3]", value: `[${slots.map((sig) => sig ? `Some(0x${sig})` : "None").join(", ")}]` };
  }
  return values;
}

function assertCost(cost: number) {
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > MAX_EXECUTION_COST) throw new Error("Invalid or excessive policy execution cost.");
}

function assertPrepared(address: PreparedPolicyAddress, transaction: PreparedPolicyTransaction, draft: PolicyDraft) {
  if (address.fingerprint !== policyDraftFingerprint(draft) || transaction.addressFingerprint !== address.fingerprint) {
    throw new Error("Policy inputs changed. Prepare the address and transaction again; approvals have been invalidated.");
  }
  if (policyPublicKey(draft.userSecretKey) !== address.userPubkey) throw new Error("Cooperative signing key changed.");
}

export async function approvePolicyTransaction(
  address: PreparedPolicyAddress, transaction: PreparedPolicyTransaction, draft: PolicyDraft,
  api: PolicyApi, assertCurrent: () => void = () => {},
): Promise<PolicyApprovals> {
  assertPrepared(address, transaction, draft);
  await checkPolicyCapabilities(address, api);
  const witnesses = [];
  const costs = [];
  for (let index = 0; index < transaction.local.length; index++) {
    const local = await api.localContext(localContextRequest(address, transaction.psbtHex, index));
    assertContext(transaction.local[index].context, local.context);
    assertCurrent();
    const values = policyApprovalWitness(local.context, draft.approvalSigners, draft.extraWitnessJson);
    const compiled = await api.compile({
      script: address.source, witness: values, environment: "bitcoin", profile: POLICY_PROFILE, include_debug: false,
    });
    if (compiled.cmr_hex !== address.cmr || compiled.program_base64 !== address.program || compiled.witness_base64 === undefined) {
      throw new Error("Approval witness compilation changed the committed policy program.");
    }
    assertCurrent();
    const result = await api.evaluate({
      ...serviceRequest(address, transaction.psbtHex, index), witness: compiled.witness_base64,
    });
    if (result.accepted !== true) throw new Error("Policy evaluation rejected.");
    assertContext(local.context, result.context);
    assertCost(result.execution_cost_milliweight);
    witnesses.push({ values, base64: compiled.witness_base64 });
    costs.push(result.execution_cost_milliweight);
  }
  assertCurrent();
  return { transactionFingerprint: transaction.fingerprint, witnesses, costs };
}

export async function cosignPolicyTransaction(
  address: PreparedPolicyAddress, transaction: PreparedPolicyTransaction, approvals: PolicyApprovals,
  draft: PolicyDraft, api: PolicyApi, assertCurrent: () => void = () => {},
): Promise<FinalizedPolicyTransaction> {
  assertPrepared(address, transaction, draft);
  if (approvals.transactionFingerprint !== transaction.fingerprint || approvals.witnesses.length !== transaction.local.length) {
    throw new Error("Transaction changed. Fresh approval witnesses are required.");
  }
  await checkPolicyCapabilities(address, api);
  let psbtHex = transaction.psbtHex;
  for (let index = 0; index < transaction.local.length; index++) {
    const local = await api.localContext(localContextRequest(address, transaction.psbtHex, index));
    assertContext(transaction.local[index].context, local.context);
    assertCurrent();
    const result = await api.sign({
      ...serviceRequest(address, psbtHex, index), witness: approvals.witnesses[index].base64,
    });
    assertContext(local.context, result.context);
    assertCost(result.execution_cost_milliweight);
    if (result.input_index !== index || result.public_key_hex !== address.servicePubkey) throw new Error("Service signed for a different input or key.");
    const verified = await api.verifySigned({
      prepared: localContextRequest(address, transaction.psbtHex, index),
      signed_psbt_hex: result.psbt_hex, signature_hex: result.signature_hex, public_key_hex: result.public_key_hex,
    });
    if (!verified.verified) throw new Error("Service signature or actual cooperative leaf did not verify.");
    assertContext(local.context, verified.context);
    psbtHex = result.psbt_hex;
  }
  assertCurrent();
  const signatures = transaction.local.map(({ context }, index) => ({
    input_index: index, public_key_hex: address.userPubkey,
    signature_hex: toHex(schnorr.sign(bytes32(context.cooperative_sighash_default), bytes32(draft.userSecretKey))),
  }));
  const finalized = await api.finalize({
    prepared: localContextRequest(address, transaction.psbtHex, 0), signed_psbt_hex: psbtHex, signatures,
  });
  if (!finalized.finalized || !hash.test(finalized.txid) || !finalized.transaction_hex) throw new Error("Policy transaction was not securely finalized.");
  assertCurrent();
  return { transactionFingerprint: transaction.fingerprint, transactionHex: finalized.transaction_hex, txid: finalized.txid };
}

export interface PolicyArtifacts {
  revision: number;
  address?: PreparedPolicyAddress;
  transaction?: PreparedPolicyTransaction;
  approvals?: PolicyApprovals;
  finalized?: FinalizedPolicyTransaction;
  broadcast?: { txid: string; explorer_url: string };
}

export type PolicyArtifactAction =
  | { type: "contractChanged" | "transactionChanged" }
  | { type: "address"; revision: number; value: PreparedPolicyAddress }
  | { type: "transaction"; revision: number; value: PreparedPolicyTransaction }
  | { type: "approvals"; revision: number; value: PolicyApprovals }
  | { type: "finalized"; revision: number; value: FinalizedPolicyTransaction }
  | { type: "broadcast"; revision: number; value: { txid: string; explorer_url: string } };

export function policyArtifactsReducer(state: PolicyArtifacts, action: PolicyArtifactAction): PolicyArtifacts {
  if (action.type === "contractChanged") return { revision: state.revision + 1 };
  if (action.type === "transactionChanged") return { revision: state.revision + 1, address: state.address };
  if (!("revision" in action) || action.revision !== state.revision) return state;
  switch (action.type) {
    case "address": return { revision: state.revision, address: action.value };
    case "transaction": return { revision: state.revision, address: state.address, transaction: action.value };
    case "approvals": return { ...state, approvals: action.value, finalized: undefined, broadcast: undefined };
    case "finalized": return { ...state, finalized: action.value, broadcast: undefined };
    case "broadcast": return { ...state, broadcast: action.value };
  }
}
