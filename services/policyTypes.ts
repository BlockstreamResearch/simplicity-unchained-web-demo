export interface WitnessValue {
  value: string;
  type: string;
}

export interface CompileRequest {
  script: string;
  include_debug: boolean;
  witness?: Record<string, WitnessValue>;
  environment?: "bitcoin";
  profile?: "bitcoin-policy-v1";
}

export interface CompileResponse {
  program_base64: string;
  cmr_hex: string;
  witness_base64?: string;
}

export interface ConvertRequest {
  script: string;
  network: string;
  service_pubkey: string;
  user_pubkey: string;
}

export interface ConvertResponse {
  hex: string;
  address: string;
  user_leaf_hash_hex: string;
}

export interface FinalizePsbtResponse {
  finalized: boolean;
  inputs: number;
  outputs: number;
  transaction_hex: string;
  txid: string;
  witnesses: Array<{ input_index: number; witness_elements: number }>;
}

export const POLICY_PROFILE = "bitcoin-policy-v1" as const;
export type PolicyNetwork = "bitcoin" | "testnet" | "testnet4";

export const POLICY_NETWORKS: Record<PolicyNetwork, { label: string; api: string; explorer: string; faucet?: string }> = {
  testnet4: { label: "Bitcoin Testnet4", api: "https://mempool.space/testnet4/api", explorer: "https://mempool.space/testnet4", faucet: "https://mempool.space/testnet4/faucet" },
  bitcoin: { label: "Bitcoin mainnet (inspection only)", api: "https://blockstream.info/api", explorer: "https://blockstream.info" },
  testnet: { label: "Bitcoin Testnet3", api: "https://blockstream.info/testnet/api", explorer: "https://blockstream.info/testnet" },
};

export interface PolicyJetMetadata {
  id: number;
  name: string;
  source_type: string;
  target_type: string;
  source_bits: number;
  target_bits: number;
  encoding: string;
  cmr: string;
  cost_milliweight: number;
  semantic_contract: string;
}

export interface PolicyManifest {
  profile: string;
  profile_hash: string;
  status: string;
  schema_version: number;
  limits: Record<string, unknown>;
  jets: PolicyJetMetadata[];
  legacy_jets: PolicyJetMetadata[];
  [field: string]: unknown;
}

export interface PolicyRegistry {
  profile: string;
  profile_hash: string;
  manifest: PolicyManifest;
}

export interface PolicyCapabilities extends PolicyRegistry {
  network: PolicyNetwork;
  genesis_hash: string;
  base_public_key_hex: string;
  limits: Record<string, unknown>;
  provenance: string;
}

export interface PolicyTweakRequest {
  profile_hash: string;
  network: PolicyNetwork;
  program: string;
  redeem_script_hex: string;
}

export interface PolicyTweakResponse {
  profile: string;
  profile_hash: string;
  network: PolicyNetwork;
  genesis_hash: string;
  cmr: string;
  signing_commitment: string;
  public_key_hex: string;
  base_public_key_hex: string;
}

export interface PolicyContextSummary {
  profile: string;
  profile_hash: string;
  network: PolicyNetwork;
  genesis_hash: string;
  cmr: string;
  signing_commitment: string;
  redeem_script_hash: string;
  input_index: number;
  input_count: number;
  output_count: number;
  unsigned_tx_hash: string;
  prevouts_hash: string;
  cooperative_leaf_hash: string;
  cooperative_sighash_default: string;
  policy_approval_hash: string;
  policy_transaction_approval_hash: string;
  service_pubkey: string;
  user_pubkey: string;
  recovery_leaf_hash: string;
  total_input_value: number;
  total_output_value: number;
  fee: number;
  debit: number;
  vsize_lower_bound: number;
  script_pubkey_hex: string;
  provenance: string;
  chain_status_verified: boolean;
  outputs: Array<{ index: number; value: number; script_pubkey_hex: string; script_hash: string; script_class: number }>;
}

export interface LocalContextRequest {
  psbt_hex: string;
  input_index: number;
  cmr_hex: string;
  redeem_script_hex: string;
  network: PolicyNetwork;
  base_public_key_hex: string;
  user_pubkey: string;
  user_leaf_hash_hex: string;
}

export interface LocalPolicyContext {
  context: PolicyContextSummary;
  outputs: Array<{ index: number; value_sat: number; script_pubkey_hex: string; address: string | null }>;
}

export interface PolicyPrepareRequest extends PolicyTweakRequest {
  psbt_hex: string;
  input_index: number;
  user_pubkey: string;
  user_leaf_hash_hex: string;
}

export interface PolicyEvaluateRequest extends PolicyPrepareRequest {
  witness: string;
}

export interface PolicyEvaluation {
  accepted: true;
  context: PolicyContextSummary;
  execution_cost_milliweight: number;
}

export interface PolicySignResponse {
  psbt_hex: string;
  signature_hex: string;
  public_key_hex: string;
  input_index: number;
  context: PolicyContextSummary;
  execution_cost_milliweight: number;
}

export interface PolicyCreateRequest {
  inputs: Array<{ txid: string; vout: number; parent_tx_hex: string; sequence: number }>;
  outputs: Array<{ address: string; value_sat: number }>;
  network: PolicyNetwork;
  lock_time: number;
}

export interface PolicyUserSignature {
  input_index: number;
  signature_hex: string;
  public_key_hex: string;
}

export interface PolicyApi {
  registry(): Promise<PolicyRegistry>;
  capabilities(): Promise<PolicyCapabilities>;
  compile(request: CompileRequest): Promise<CompileResponse>;
  encodeScript(script: string): Promise<string>;
  convert(request: ConvertRequest): Promise<ConvertResponse>;
  tweak(request: PolicyTweakRequest): Promise<PolicyTweakResponse>;
  localTweak(request: { network: PolicyNetwork; cmr_hex: string; redeem_script_hex: string; base_public_key_hex: string }): Promise<PolicyTweakResponse>;
  fetchParent(network: PolicyNetwork, txid: string): Promise<string>;
  createPsbt(request: PolicyCreateRequest): Promise<{ psbt_hex: string }>;
  localContext(request: LocalContextRequest): Promise<LocalPolicyContext>;
  prepare(request: PolicyPrepareRequest): Promise<{ context: PolicyContextSummary }>;
  evaluate(request: PolicyEvaluateRequest): Promise<PolicyEvaluation>;
  sign(request: PolicyEvaluateRequest): Promise<PolicySignResponse>;
  verifySigned(request: { prepared: LocalContextRequest; signed_psbt_hex: string; signature_hex: string; public_key_hex: string }): Promise<{ verified: boolean; context: PolicyContextSummary }>;
  finalize(request: { prepared: LocalContextRequest; signed_psbt_hex: string; signatures: PolicyUserSignature[] }): Promise<FinalizePsbtResponse>;
  broadcast(network: PolicyNetwork, transactionHex: string): Promise<{ txid: string; explorer_url: string }>;
}

export interface ApprovalSigner {
  witnessName: string;
  secretKey: string;
  scope: "input" | "transaction";
}

export interface PolicyDraft {
  chain: "bitcoin" | "elements";
  profile: "legacy" | typeof POLICY_PROFILE;
  network: PolicyNetwork;
  source: string;
  recoveryScript: string;
  userSecretKey: string;
  approvalSigners: ApprovalSigner[];
  extraWitnessJson: string;
}

export interface PolicyTransactionDraft {
  inputs: string;
  outputs: string;
  sequence: string;
  lockTime: string;
}

export interface PreparedPolicyAddress {
  fingerprint: string;
  registry: PolicyRegistry;
  capabilities: PolicyCapabilities;
  network: PolicyNetwork;
  source: string;
  program: string;
  cmr: string;
  scriptHex: string;
  userPubkey: string;
  recoveryLeafHash: string;
  servicePubkey: string;
  signingCommitment: string;
  address: string;
}

export interface PreparedPolicyTransaction {
  fingerprint: string;
  addressFingerprint: string;
  psbtHex: string;
  local: LocalPolicyContext[];
}

export interface PolicyApprovals {
  transactionFingerprint: string;
  witnesses: Array<{ values: Record<string, WitnessValue>; base64: string }>;
  costs: number[];
}

export interface FinalizedPolicyTransaction {
  transactionFingerprint: string;
  transactionHex: string;
  txid: string;
}
