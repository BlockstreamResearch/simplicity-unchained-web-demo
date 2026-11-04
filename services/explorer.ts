import { DEMO_NETWORKS, type DemoNetwork } from "@/utils/demo";

export interface FundingOutput {
  txid: string;
  vout: number;
  value: number;
  scriptpubkey: string;
  asset?: string;
  confirmed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The explorer is temporarily unusable: rate-limited (HTTP 429; Blockstream allows 700
 * requests/hour per IP) or unreachable. mempool.space sends 429s without CORS headers, so browsers
 * report those as network errors rather than 429s.
 */
export class ExplorerUnavailableError extends Error {
  constructor(readonly rateLimited: boolean) {
    super(rateLimited
      ? "The block explorer is rate-limiting requests from this network."
      : "The block explorer could not be reached.");
    this.name = "ExplorerUnavailableError";
  }
}

async function explorerFetch(fetcher: typeof fetch, url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    if (error instanceof TypeError) throw new ExplorerUnavailableError(false);
    throw error;
  }
  if (response.status === 429) throw new ExplorerUnavailableError(true);
  return response;
}

type ExplorerOutput = { value: number; scriptpubkey: string; asset?: string };

// Funding outputs never change once broadcast, so each is fetched once per fetcher.
const outputCaches = new WeakMap<typeof fetch, Map<string, ExplorerOutput>>();

export async function fetchExplorerOutput(
  api: string,
  txid: string,
  vout: number,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ExplorerOutput> {
  if (!/^[0-9a-fA-F]{64}$/.test(txid) || !Number.isSafeInteger(vout) || vout < 0) {
    throw new Error("Enter a 64-character transaction ID and a non-negative output index.");
  }
  const response = await explorerFetch(fetcher, `${api}/tx/${txid}`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Cannot read funding transaction (${response.status}): ${await response.text()}`);
  }
  const data: unknown = await response.json();
  const output: unknown = isRecord(data) && Array.isArray(data.vout) ? data.vout[vout] : undefined;
  if (!isRecord(output)) throw new Error(`Output ${vout} was not found in the funding transaction.`);
  if (typeof output.value !== "number" || !Number.isSafeInteger(output.value) || output.value < 0) {
    throw new Error("The funding amount is unavailable. Use an unconfidential testnet output.");
  }
  if (typeof output.scriptpubkey !== "string" || !/^(?:[0-9a-fA-F]{2})+$/.test(output.scriptpubkey)) {
    throw new Error("The explorer did not return a valid funding script.");
  }
  if (output.asset !== undefined && (typeof output.asset !== "string" || !/^[0-9a-fA-F]{64}$/.test(output.asset))) {
    throw new Error("The explorer returned an invalid asset ID.");
  }
  return {
    value: output.value,
    scriptpubkey: output.scriptpubkey,
    ...(typeof output.asset === "string" ? { asset: output.asset } : {}),
  };
}

export interface TransactionStatus {
  indexed: boolean;
  confirmed: boolean;
  blockHeight?: number;
}

export async function fetchTransactionStatus(
  network: DemoNetwork,
  txid: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<TransactionStatus> {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) throw new Error("Invalid transaction ID.");
  const response = await explorerFetch(fetcher, `${DEMO_NETWORKS[network].api}/tx/${txid}/status`, { signal, cache: "no-store" });
  if (response.status === 404) return { indexed: false, confirmed: false };
  if (!response.ok) throw new Error(`Transaction status lookup failed (${response.status}).`);
  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.confirmed !== "boolean") {
    throw new Error("The explorer returned an invalid transaction status.");
  }
  if (!data.confirmed) return { indexed: true, confirmed: false };
  if (typeof data.block_height !== "number" || !Number.isSafeInteger(data.block_height)) {
    throw new Error("The explorer returned a confirmation without a block height.");
  }
  return { indexed: true, confirmed: true, blockHeight: data.block_height };
}

export async function findFundingOutputs(
  network: DemoNetwork,
  address: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<FundingOutput[]> {
  const config = DEMO_NETWORKS[network];
  const response = await explorerFetch(fetcher, `${config.api}/address/${encodeURIComponent(address)}/utxo`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Funding lookup failed (${response.status}). Retry or enter the funding transaction in Advanced.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("The explorer returned an invalid UTXO list.");
  const outputs = await Promise.all(data.map(async (utxo: unknown) => {
    if (!isRecord(utxo) || typeof utxo.txid !== "string" || typeof utxo.vout !== "number"
      || !isRecord(utxo.status) || typeof utxo.status.confirmed !== "boolean") {
      throw new Error("The explorer returned an invalid funding output.");
    }
    let cache = outputCaches.get(fetcher);
    if (!cache) outputCaches.set(fetcher, cache = new Map());
    const key = `${config.api}/${utxo.txid}:${utxo.vout}`;
    const output = cache.get(key) ?? await fetchExplorerOutput(config.api, utxo.txid, utxo.vout, fetcher, signal);
    cache.set(key, output);
    if (network === "elements" && !output.asset) {
      throw new Error("The explorer did not return the Liquid funding asset.");
    }
    return { ...output, txid: utxo.txid, vout: utxo.vout, confirmed: utxo.status.confirmed };
  }));
  return outputs.filter((output) => !config.asset || output.asset === config.asset)
    .sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || a.value - b.value || a.txid.localeCompare(b.txid) || a.vout - b.vout);
}
