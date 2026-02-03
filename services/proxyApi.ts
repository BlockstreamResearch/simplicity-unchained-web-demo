import { API_CONFIG } from "@/config/api.config";
import {
  compile as wasmCompile,
  convert_script as wasmConvertScript,
  finalize_pset as wasmFinalizePset,
  finalize_psbt as wasmFinalizePsbt,
  sighash_pset as wasmSighashPset,
  sighash_psbt as wasmSighashPsbt,
  create_pset as wasmCreatePset,
  create_psbt as wasmCreatePsbt,
} from "@/simplicity-lib/pkg/simplicity_lib";

/**
 * Convert WASM Map response to plain JavaScript object
 */
function mapToObject<T>(mapOrObject: unknown): T {
  if (mapOrObject instanceof Map) {
    const obj: Record<string, unknown> = {};
    mapOrObject.forEach((value, key) => {
      obj[key] = value instanceof Map ? mapToObject(value) : value;
    });
    return obj as T;
  }
  return mapOrObject as T;
}

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

  /**
   * Fetch UTXO data from blockchain explorer for Elements/Liquid
   */
  private async fetchPsetUtxo(
    txid: string,
    vout: number,
    network: string,
  ): Promise<{ asset: string; value: number; scriptpubkey: string }> {
    const apiUrl =
      network === "liquid"
        ? `https://blockstream.info/liquid/api/tx/${txid}`
        : `https://blockstream.info/liquidtestnet/api/tx/${txid}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch transaction ${txid}: ${response.statusText}`,
      );
    }

    const txData = await response.json();
    const output = txData.vout[vout];

    if (!output) {
      throw new Error(`Output ${vout} not found in transaction ${txid}`);
    }

    return {
      asset: output.asset,
      value: output.value,
      scriptpubkey: output.scriptpubkey,
    };
  }

  /**
   * Fetch UTXO data from blockchain explorer for Bitcoin
   */
  private async fetchPsbtUtxo(
    txid: string,
    vout: number,
    network: string,
  ): Promise<{ value: number; scriptpubkey: string }> {
    const apiUrl =
      network === "bitcoin"
        ? `https://blockstream.info/api/tx/${txid}`
        : network === "testnet"
          ? `https://blockstream.info/testnet/api/tx/${txid}`
          : `https://mempool.space/testnet4/api/tx/${txid}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch transaction ${txid}: ${response.statusText}`,
      );
    }

    const txData = await response.json();
    const output = txData.vout[vout];

    if (!output) {
      throw new Error(`Output ${vout} not found in transaction ${txid}`);
    }

    return {
      value: output.value,
      scriptpubkey: output.scriptpubkey,
    };
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
    try {
      const result = wasmCompile(request);
      return mapToObject<CompileResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Compile failed: ${error.message}`);
      }
      throw new Error("Compile failed with unknown error");
    }
  }

  /**
   * Convert human-readable Bitcoin Script opcodes into a hex string
   */
  async convert(request: ConvertRequest): Promise<ConvertResponse> {
    try {
      const result = wasmConvertScript(request);
      return mapToObject<ConvertResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Convert failed: ${error.message}`);
      }
      throw new Error("Convert failed with unknown error");
    }
  }

  /**
   * Create an unsigned Partially Signed Elements Transaction (PSET)
   */
  async createPset(request: CreatePsetRequest): Promise<CreatePsetResponse> {
    try {
      // Fetch UTXO data for all inputs
      const utxos = await Promise.all(
        request.inputs.map(async (input) => {
          const [txid, voutStr] = input.split(":");
          const vout = parseInt(voutStr, 10);
          return this.fetchPsetUtxo(txid, vout, request.network);
        }),
      );

      // Call WASM function with fetched UTXO data
      const result = wasmCreatePset({
        inputs: request.inputs,
        outputs: request.outputs,
        utxos,
        asset_id: request.asset_id,
        network: request.network,
      });
      return mapToObject<CreatePsetResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Create PSET failed: ${error.message}`);
      }
      throw new Error("Create PSET failed with unknown error");
    }
  }

  /**
   * Compute sighash for a PSET input
   */
  async sighashPset(request: SighashPsetRequest): Promise<SighashPsetResponse> {
    try {
      const result = wasmSighashPset(request);
      return mapToObject<SighashPsetResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Sighash PSET failed: ${error.message}`);
      }
      throw new Error("Sighash PSET failed with unknown error");
    }
  }

  /**
   * Finalize a PSET with the last signature and extract the transaction hex
   */
  async finalizePset(
    request: FinalizePsetRequest,
  ): Promise<FinalizePsetResponse> {
    try {
      if (!request.pset_hex) {
        throw new Error("pset_hex is required but was undefined or empty");
      }
      if (!request.redeem_script_hex) {
        throw new Error(
          "redeem_script_hex is required but was undefined or empty",
        );
      }
      if (!request.signature_hex) {
        throw new Error("signature_hex is required but was undefined or empty");
      }
      if (!request.public_key_hex) {
        throw new Error(
          "public_key_hex is required but was undefined or empty",
        );
      }
      const result = wasmFinalizePset(request);
      return mapToObject<FinalizePsetResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Finalize PSET failed: ${error.message}`);
      }
      throw new Error("Finalize PSET failed with unknown error");
    }
  }

  /**
   * Create an unsigned Partially Signed Bitcoin Transaction (PSBT)
   */
  async createPsbt(request: CreatePsbtRequest): Promise<CreatePsbtResponse> {
    try {
      // Fetch UTXO data for all inputs
      const utxos = await Promise.all(
        request.inputs.map(async (input) => {
          const [txid, voutStr] = input.split(":");
          const vout = parseInt(voutStr, 10);
          return this.fetchPsbtUtxo(txid, vout, request.network);
        }),
      );

      // Call WASM function with fetched UTXO data
      const result = wasmCreatePsbt({
        inputs: request.inputs,
        outputs: request.outputs,
        utxos,
        network: request.network,
      });
      return mapToObject<CreatePsbtResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Create PSBT failed: ${error.message}`);
      }
      throw new Error("Create PSBT failed with unknown error");
    }
  }

  /**
   * Compute sighash for a PSBT input
   */
  async sighashPsbt(request: SighashPsbtRequest): Promise<SighashPsbtResponse> {
    try {
      const result = wasmSighashPsbt(request);
      return mapToObject<SighashPsbtResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Sighash PSBT failed: ${error.message}`);
      }
      throw new Error("Sighash PSBT failed with unknown error");
    }
  }

  /**
   * Finalize a PSBT with the last signature and extract the transaction hex
   */
  async finalizePsbt(
    request: FinalizePsbtRequest,
  ): Promise<FinalizePsbtResponse> {
    try {
      if (!request.psbt_hex) {
        throw new Error("psbt_hex is required but was undefined or empty");
      }
      if (!request.redeem_script_hex) {
        throw new Error(
          "redeem_script_hex is required but was undefined or empty",
        );
      }
      if (!request.signature_hex) {
        throw new Error("signature_hex is required but was undefined or empty");
      }
      if (!request.public_key_hex) {
        throw new Error(
          "public_key_hex is required but was undefined or empty",
        );
      }
      const result = wasmFinalizePsbt(request);
      return mapToObject<FinalizePsbtResponse>(result);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Finalize PSBT failed: ${error.message}`);
      }
      throw new Error("Finalize PSBT failed with unknown error");
    }
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
