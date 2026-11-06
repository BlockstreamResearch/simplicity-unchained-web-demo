import type { PolicyRegistry, PolicyManifest, WitnessValue } from "./policyTypes";

export const LIQUID_PROFILE = "liquid-policy-v1" as const;
export interface LiquidBinding {
  network: "liquidtestnet";
  cmr_hex: string;
  redeem_script_hex: string;
  base_public_key_hex: string;
}
export interface LiquidContextRequest extends LiquidBinding {
  pset_hex: string;
  input_index: number;
  user_pubkey: string;
  user_leaf_hash_hex: string;
}
export interface LiquidDisclosure {
  asset_id: string;
  value: number;
  confidential_asset: boolean;
  confidential_value: boolean;
}
export interface LiquidAssetAccounting {
  asset_id: string;
  total_input_value: number;
  total_output_value: number;
  fee: number;
  returned_value: number;
  debit: number;
}
export interface LiquidContextSummary {
  profile: typeof LIQUID_PROFILE;
  profile_hash: string;
  network: "liquidtestnet";
  genesis_hash: string;
  cmr: string;
  signing_commitment: string;
  redeem_script_hash: string;
  input_index: number;
  input_count: number;
  output_count: number;
  unsigned_tx_hash: string;
  prevouts_hash: string;
  disclosures_hash: string;
  cooperative_leaf_hash: string;
  cooperative_sighash_default: string;
  policy_approval_hash: string;
  policy_transaction_approval_hash: string;
  service_pubkey: string;
  user_pubkey: string;
  recovery_leaf_hash: string;
  current_asset_id: string;
  fee_asset_id: string;
  assets: LiquidAssetAccounting[];
  inputs: LiquidDisclosure[];
  outputs: LiquidDisclosure[];
  output_scripts_hex: string[];
  script_pubkey_hex: string;
  vsize_lower_bound: number;
  provenance: string;
  chain_status_verified: false;
}
export interface LiquidCapabilities {
  profile: typeof LIQUID_PROFILE;
  profile_hash: string;
  network: "liquidtestnet";
  genesis_hash: string;
  base_public_key_hex: string;
  manifest: PolicyManifest;
  limits: Record<string, unknown>;
  provenance: string;
}
export interface LiquidTweak {
  profile: typeof LIQUID_PROFILE;
  profile_hash: string;
  network: "liquidtestnet";
  genesis_hash: string;
  cmr: string;
  signing_commitment: string;
  public_key_hex: string;
  base_public_key_hex: string;
}
export interface LiquidServiceRequest {
  profile_hash: string;
  network: "liquidtestnet";
  program: string;
  redeem_script_hex: string;
  pset_hex: string;
  input_index: number;
  user_pubkey: string;
  user_leaf_hash_hex: string;
}
export interface LiquidEvaluation {
  accepted: true;
  context: LiquidContextSummary;
  execution_cost_milliweight: number;
}
export interface LiquidSigned {
  context: LiquidContextSummary;
  execution_cost_milliweight: number;
  pset_hex: string;
  signature_hex: string;
  public_key_hex: string;
  input_index: number;
}
export interface LiquidAddress {
  fingerprint: string;
  binding: LiquidBinding;
  registry: PolicyRegistry;
  capabilities: LiquidCapabilities;
  program: string;
  source: string;
  userPubkey: string;
  recoveryLeafHash: string;
  servicePubkey: string;
  address: string;
  unconfidentialAddress: string;
  scriptPubkeyHex: string;
  signingCommitment: string;
}
export interface LiquidFunding {
  txid: string;
  vout: number;
  parentTxHex: string;
  confirmed: boolean;
  assetId: string;
  value: number;
  confidential: boolean;
}
export interface LiquidPrepared {
  fingerprint: string;
  addressFingerprint: string;
  psetHex: string;
  contexts: LiquidContextSummary[];
  recipient?: string;
}
export interface LiquidFinalized {
  transactionFingerprint: string;
  transactionHex: string;
  txid: string;
}
export interface LiquidDraft {
  source: string;
  recoveryScript: string;
  userSecretKey: string;
  blindingSecretKey: string;
  blindingPublicKey: string;
  scope: "transaction" | "input";
  extraWitnessJson: string;
}
export interface LiquidApproval {
  values: Record<string, WitnessValue>;
  base64: string;
}
