import { API_CONFIG } from "@/config/api.config";

// Types based on API documentation
export interface WitnessValue {
  value: string;
  type: string;
}

export interface CompileRequest {
  script: string;
  include_debug: boolean;
  witness?: Record<string, WitnessValue>;
  environment?: "elements" | "bitcoin";
}

export interface CompileResponse {
  program_base64: string;
  witness_base64?: string;
}

export interface ConvertRequest {
  script: string;
  network: string;
}

export interface ConvertResponse {
  hex: string;
  address: string;
}

export interface CreatePsetRequest {
  inputs: string[];
  outputs: string[];
  asset_id: string | null;
  network: string;
}

export interface CreatePsetResponse {
  asset: string;
  inputs: number;
  network: string;
  outputs: number;
  pset: string;
}

export interface SighashPsetRequest {
  pset_hex: string;
  input_index: number;
  redeem_script_hex: string;
}

export interface SighashPsetResponse {
  sighash_hex: string;
  message_hex: string;
  input_index: number;
  sighash_type: string;
}

export interface FinalizePsetRequest {
  pset_hex: string;
  redeem_script_hex: string;
  input_index: number;
  signature_hex: string;
  public_key_hex: string;
}

export interface FinalizePsetResponse {
  finalized: boolean;
  inputs: number;
  outputs: number;
  transaction_hex: string;
  txid: string;
  witnesses: Array<{
    input_index: number;
    witness_elements: number;
  }>;
}

export interface CreatePsbtRequest {
  inputs: string[];
  outputs: string[];
  network: string;
}

export interface CreatePsbtResponse {
  inputs: number;
  network: string;
  outputs: number;
  psbt: string;
}

export interface SighashPsbtRequest {
  psbt_hex: string;
  input_index: number;
  redeem_script_hex: string;
}

export interface SighashPsbtResponse {
  sighash_hex: string;
  message_hex: string;
  input_index: number;
  sighash_type: string;
}

export interface FinalizePsbtRequest {
  psbt_hex: string;
  redeem_script_hex: string;
  input_index: number;
  signature_hex: string;
  public_key_hex: string;
}

export interface FinalizePsbtResponse {
  finalized: boolean;
  inputs: number;
  outputs: number;
  transaction_hex: string;
  txid: string;
  witnesses: Array<{
    input_index: number;
    witness_elements: number;
  }>;
}

export interface BroadcastTransactionRequest {
  transaction_hex: string;
}

export interface BroadcastTransactionResponse {
  txid: string;
  explorer_url: string;
}

export interface SimplicitySignPsetRequest {
  pset_hex: string;
  input_index: number;
  redeem_script_hex: string;
  program: string;
  witness: string;
}

export interface SimplicitySignPsetResponse {
  pset_hex: string;
  signature_hex: string;
  public_key_hex: string;
  input_index: number;
  partial_sigs_count: number;
}

export interface SimplicitySignPsbtRequest {
  psbt_hex: string;
  input_index: number;
  redeem_script_hex: string;
  program: string;
  witness: string;
}

export interface SimplicitySignPsbtResponse {
  psbt_hex: string;
  signature_hex: string;
  public_key_hex: string;
  input_index: number;
  partial_sigs_count: number;
}

export interface TweakRequest {
  program: string;
  jet_env: string;
}

export interface TweakResponse {
  cmr_hex: string;
  tweaked_public_key_hex: string;
}

class ProxyApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_CONFIG.PROXY_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API Error (${response.status}): ${errorText || response.statusText}`,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`);
      }
      throw new Error("Request failed with unknown error");
    }
  }

  /**
   * Compile a Simplicity script into a base64 encoded program
   */
  async compile(request: CompileRequest): Promise<CompileResponse> {
    return this.request<CompileResponse>(
      API_CONFIG.ENDPOINTS.COMPILE,
      "POST",
      request,
    );
  }

  /**
   * Convert human-readable Bitcoin Script opcodes into a hex string
   */
  async convert(request: ConvertRequest): Promise<ConvertResponse> {
    return this.request<ConvertResponse>(
      API_CONFIG.ENDPOINTS.CONVERT,
      "POST",
      request,
    );
  }

  /**
   * Create an unsigned Partially Signed Elements Transaction (PSET)
   */
  async createPset(request: CreatePsetRequest): Promise<CreatePsetResponse> {
    return this.request<CreatePsetResponse>(
      API_CONFIG.ENDPOINTS.CREATE_PSET,
      "POST",
      request,
    );
  }

  /**
   * Compute sighash for a PSET input
   */
  async sighashPset(request: SighashPsetRequest): Promise<SighashPsetResponse> {
    return this.request<SighashPsetResponse>(
      API_CONFIG.ENDPOINTS.SIGHASH_PSET,
      "POST",
      request,
    );
  }

  /**
   * Finalize a PSET with the last signature and extract the transaction hex
   */
  async finalizePset(
    request: FinalizePsetRequest,
  ): Promise<FinalizePsetResponse> {
    return this.request<FinalizePsetResponse>(
      API_CONFIG.ENDPOINTS.FINALIZE,
      "POST",
      request,
    );
  }

  /**
   * Create an unsigned Partially Signed Bitcoin Transaction (PSBT)
   */
  async createPsbt(request: CreatePsbtRequest): Promise<CreatePsbtResponse> {
    return this.request<CreatePsbtResponse>(
      API_CONFIG.ENDPOINTS.CREATE_PSBT,
      "POST",
      request,
    );
  }

  /**
   * Compute sighash for a PSBT input
   */
  async sighashPsbt(request: SighashPsbtRequest): Promise<SighashPsbtResponse> {
    return this.request<SighashPsbtResponse>(
      API_CONFIG.ENDPOINTS.SIGHASH_PSBT,
      "POST",
      request,
    );
  }

  /**
   * Finalize a PSBT with the last signature and extract the transaction hex
   */
  async finalizePsbt(
    request: FinalizePsbtRequest,
  ): Promise<FinalizePsbtResponse> {
    return this.request<FinalizePsbtResponse>(
      API_CONFIG.ENDPOINTS.FINALIZE_PSBT,
      "POST",
      request,
    );
  }

  /**
   * Broadcast a transaction to the network (Liquid Testnet or Bitcoin Testnet4)
   */
  async broadcastTransaction(
    request: BroadcastTransactionRequest,
    network: "elements" | "bitcoin" = "elements",
  ): Promise<BroadcastTransactionResponse> {
    const url =
      network === "bitcoin"
        ? "https://mempool.space/testnet4/api/tx"
        : "https://blockstream.info/liquidtestnet/api/tx";

    try {
      const response = await fetch(url, {
        method: "POST",
        body: request.transaction_hex,
        headers: {
          "Content-Type": "text/plain",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Broadcast failed (${response.status}): ${errorText || response.statusText}`,
        );
      }

      const txid = await response.text();
      const explorer_url =
        network === "bitcoin"
          ? `https://mempool.space/testnet4/tx/${txid}`
          : `https://blockstream.info/liquidtestnet/tx/${txid}?expand`;

      return {
        txid,
        explorer_url,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to broadcast transaction: ${error.message}`);
      }
      throw new Error("Failed to broadcast transaction with unknown error");
    }
  }

  /**
   * Sign a PSET using the Simplicity Unchained service
   * Executes a Simplicity program and co-signs a 2-of-2 multisig transaction if successful
   */
  async simplicitySignPset(
    request: SimplicitySignPsetRequest,
  ): Promise<SimplicitySignPsetResponse> {
    return this.request<SimplicitySignPsetResponse>(
      API_CONFIG.ENDPOINTS.SIMPLICITY_SIGN,
      "POST",
      request,
    );
  }

  /**
   * Sign a Bitcoin PSBT using the Simplicity Unchained service
   * Executes a Simplicity program and co-signs a 2-of-2 multisig transaction if successful
   */
  async simplicitySignPsbt(
    request: SimplicitySignPsbtRequest,
  ): Promise<SimplicitySignPsbtResponse> {
    return this.request<SimplicitySignPsbtResponse>(
      API_CONFIG.ENDPOINTS.SIMPLICITY_SIGN_PSBT,
      "POST",
      request,
    );
  }

  /**
   * Compute the CMR (commitment Merkle root) of a Simplicity program
   * and return the tweaked public key using taproot key tweaking
   */
  async tweak(request: TweakRequest): Promise<TweakResponse> {
    return this.request<TweakResponse>(
      API_CONFIG.ENDPOINTS.TWEAK,
      "POST",
      request,
    );
  }
}

// Export a singleton instance
export const proxyApi = new ProxyApiService();
