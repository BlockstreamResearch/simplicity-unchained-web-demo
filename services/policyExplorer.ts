import { POLICY_NETWORKS, type PolicyNetwork } from "./policyTypes";
import { DEMO_NETWORKS } from "./demoNetworks";

export interface PolicyFundingOutput {
  txid: string;
  vout: number;
  value: number;
  confirmed: boolean;
}

export async function findPolicyFunding(network: PolicyNetwork, address: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PolicyFundingOutput[]> {
  const config = POLICY_NETWORKS[network];
  if (!config || !address) throw new Error("A prepared policy address is required.");
  const response = await fetcher(`${config.api}/address/${encodeURIComponent(address)}/utxo`, {
    cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Funding lookup failed (${response.status}). Check the explorer or retry.`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("Explorer returned an invalid funding list.");
  return body.map((item: unknown) => {
    if (typeof item !== "object" || item === null || !("txid" in item) || typeof item.txid !== "string" || !/^[0-9a-f]{64}$/i.test(item.txid)
      || !("vout" in item) || typeof item.vout !== "number" || !Number.isInteger(item.vout) || item.vout < 0 || item.vout > 0xffff_ffff
      || !("value" in item) || typeof item.value !== "number" || !Number.isSafeInteger(item.value) || item.value < 0
      || !("status" in item) || typeof item.status !== "object" || item.status === null || !("confirmed" in item.status) || typeof item.status.confirmed !== "boolean") {
      throw new Error("Explorer returned invalid funding metadata. Nothing has been approved.");
    }
    return { txid: item.txid.toLowerCase(), vout: item.vout, value: item.value, confirmed: item.status.confirmed };
  }).sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || b.value - a.value);
}

/** Explorer JSON amounts are not evidence: the local Rust context verifies these parent bytes. */
export async function fetchPolicyParent(
  network: PolicyNetwork | "liquidtestnet", txid: string, fetcher: typeof fetch = fetch,
): Promise<string> {
  const config = network === "liquidtestnet" ? DEMO_NETWORKS.liquidtestnet : POLICY_NETWORKS[network];
  if (!config || !/^[0-9a-f]{64}$/i.test(txid)) throw new Error("Invalid policy network or funding txid.");
  const response = await fetcher(`${config.api}/tx/${txid.toLowerCase()}/hex`, {
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Cannot fetch full parent transaction (${response.status}). Parent evidence is required; witness_utxo alone is not enough.`);
  const limit = 2 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) throw new Error("Parent transaction evidence exceeds the HTTP limit.");
  if (!response.body) throw new Error("Missing parent transaction evidence.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Parent transaction evidence exceeds the HTTP limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text = (text + decoder.decode()).trim();
  } finally {
    reader.releaseLock();
  }
  if (!/^(?:[0-9a-f]{2})+$/i.test(text)) throw new Error("Explorer did not return full parent transaction hex.");
  return text.toLowerCase();
}

export async function broadcastPolicyTransaction(
  network: PolicyNetwork | "liquidtestnet", transactionHex: string, fetcher: typeof fetch = fetch,
): Promise<{ txid: string; explorer_url: string }> {
  const config = network === "liquidtestnet" ? DEMO_NETWORKS.liquidtestnet : POLICY_NETWORKS[network];
  if (!config || network === "bitcoin") throw new Error("Mainnet broadcasting is disabled in this experimental demo.");
  if (!/^(?:[0-9a-f]{2})+$/i.test(transactionHex)) throw new Error("Invalid finalized transaction hex.");
  const response = await fetcher(`${config.api}/tx`, {
    method: "POST", headers: { "Content-Type": "text/plain" }, body: transactionHex,
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  const text = (await response.text()).trim();
  if (!response.ok) throw new Error(`Broadcast rejected (${response.status}): ${text}`);
  if (!/^[0-9a-f]{64}$/i.test(text)) throw new Error("Explorer returned an invalid broadcast txid.");
  const txid = text.toLowerCase();
  return { txid, explorer_url: `${config.explorer}/tx/${txid}` };
}
