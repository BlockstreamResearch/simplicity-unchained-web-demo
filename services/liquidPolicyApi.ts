import {
  compile, liquid_policy_recovery_script, liquid_policy_registry, liquid_policy_local_tweak,
  liquid_policy_generate_blinding_key, liquid_policy_address, liquid_policy_unblind_output,
  liquid_policy_create_pset, liquid_policy_context, liquid_policy_evaluate,
  liquid_policy_verify_signed_pset, liquid_policy_user_sign, liquid_policy_finalize_pset,
} from "@/simplicity-lib/pkg/simplicity_lib";
import { requestPolicy, wasmObject } from "./policyApi";
import { fetchPolicyParent, broadcastPolicyTransaction } from "./policyExplorer";
import { LIQUID_PROFILE, type LiquidBinding, type LiquidCapabilities, type LiquidContextRequest,
  type LiquidContextSummary, type LiquidEvaluation, type LiquidServiceRequest, type LiquidSigned, type LiquidTweak } from "./liquidPolicyTypes";
import type { CompileResponse, PolicyRegistry, WitnessValue } from "./policyTypes";
import type { PolicyEndpoint } from "./policyProxy";

const request = <T>(endpoint: PolicyEndpoint, body?: unknown) => requestPolicy<T>("liquid", endpoint, body);

export const liquidPolicyApi = {
  async registry() { return wasmObject<PolicyRegistry>(liquid_policy_registry()); },
  async capabilities() { return request<LiquidCapabilities>("capabilities"); },
  async compile(source: string, witness?: Record<string, WitnessValue>) {
    return wasmObject<CompileResponse>(compile({ script: source, environment: "elements", profile: LIQUID_PROFILE, include_debug: false, ...(witness ? { witness } : {}) }));
  },
  async recoveryScript(script: string) { return wasmObject<{ redeem_script_hex: string; user_leaf_hash_hex: string }>(liquid_policy_recovery_script(script)); },
  async localTweak(binding: LiquidBinding) { return wasmObject<LiquidTweak>(liquid_policy_local_tweak(binding)); },
  async tweak(body: { profile_hash: string; network: "liquidtestnet"; program: string; redeem_script_hex: string }) { return request<LiquidTweak>("tweak", body); },
  async generateBlindingKey() {
    return wasmObject<{ blinding_secret_key_hex: string; blinding_public_key_hex: string }>(liquid_policy_generate_blinding_key());
  },
  async address(body: { binding: LiquidBinding; user_pubkey: string; user_leaf_hash_hex: string; blinding_public_key_hex: string }) {
    return wasmObject<{ address: string; unconfidential_address: string; script_pubkey_hex: string; service_pubkey: string; profile: string; profile_hash: string; network: string }>(liquid_policy_address(body));
  },
  fetchParent: (txid: string) => fetchPolicyParent("liquidtestnet", txid),
  async unblind(body: { parent_tx_hex: string; txid: string; vout: number; blinding_secret_key_hex: string }) {
    return wasmObject<{ txid: string; vout: number; script_pubkey_hex: string; chain_status_verified: false;
      disclosure: { asset_id: string; value_sat: number; confidential: boolean; blind_asset_proof_hex: string | null; blind_value_proof_hex: string | null } }>(liquid_policy_unblind_output(body));
  },
  async createPset(body: { network: "liquidtestnet"; lock_time: number;
    inputs: Array<{ txid: string; vout: number; parent_tx_hex: string; blinding_secret_key_hex: string; sequence: number }>;
    outputs: Array<{ address: string; asset_id: string; value_sat: number }> }) {
    return wasmObject<{ pset_hex: string; transaction_hex: string; txid: string; inputs: number; outputs: number; network: "liquidtestnet" }>(liquid_policy_create_pset(body));
  },
  async context(body: LiquidContextRequest) { return wasmObject<{ context: LiquidContextSummary }>(liquid_policy_context(body)); },
  async prepare(body: LiquidServiceRequest) { return request<{ context: LiquidContextSummary }>("prepare", body); },
  async evaluate(body: LiquidServiceRequest & { witness: string }) { return request<LiquidEvaluation>("evaluate", body); },
  async localEvaluate(body: { prepared: LiquidContextRequest; program_base64: string; witness_base64: string }) {
    return wasmObject<LiquidEvaluation>(liquid_policy_evaluate(body));
  },
  async sign(body: LiquidServiceRequest & { witness: string }) { return request<LiquidSigned>("sign", body); },
  async verify(body: { prepared: LiquidContextRequest; signed_pset_hex: string; signature_hex: string; public_key_hex: string }) {
    return wasmObject<{ verified: true; context: LiquidContextSummary }>(liquid_policy_verify_signed_pset(body));
  },
  async userSign(body: { prepared: LiquidContextRequest; signed_pset_hex: string; secret_key_hex: string }) {
    return wasmObject<{ pset_hex: string; signature_hex: string; public_key_hex: string; input_index: number; context: LiquidContextSummary }>(liquid_policy_user_sign(body));
  },
  async finalize(body: { prepared: LiquidContextRequest; signed_pset_hex: string; signatures: Array<{ input_index: number; signature_hex: string; public_key_hex: string }> }) {
    return wasmObject<{ transaction_hex: string; txid: string; finalized: true; inputs: number; outputs: number }>(liquid_policy_finalize_pset(body));
  },
  broadcast: (transaction: string) => broadcastPolicyTransaction("liquidtestnet", transaction),
};
