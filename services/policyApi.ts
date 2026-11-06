import {
  policy_registry, policy_local_tweak, policy_context, policy_create_psbt,
  policy_verify_signed_psbt, policy_finalize_psbt,
  compile, convert_script, encode_script,
} from "@/simplicity-lib/pkg/simplicity_lib";
import { broadcastPolicyTransaction, fetchPolicyParent } from "./policyExplorer";
import { POLICY_PROFILE, type PolicyApi, type CompileResponse, type ConvertResponse } from "./policyTypes";
import type { PolicyEndpoint } from "./policyProxy";

export async function requestPolicy<T>(chain: "bitcoin" | "liquid", endpoint: PolicyEndpoint, body?: unknown): Promise<T> {
  const json = body === undefined ? undefined : JSON.stringify(body);
  if (json && new TextEncoder().encode(json).length > 2 * 1024 * 1024) throw new Error("Policy request exceeds 2 MiB.");
  const response = await fetch(`/api/policy/${chain}/${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}) },
    body: json, cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
      ? data.error : `Policy request failed (${response.status}).`;
    throw new Error(message);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("Invalid policy service response.");
  return data as T;
}

const request = <T>(endpoint: PolicyEndpoint, body?: unknown) => requestPolicy<T>("bitcoin", endpoint, body);

export function wasmObject<T>(value: unknown): T {
  return (value instanceof Map ? Object.fromEntries(value) : value) as T;
}

export const policyApi: PolicyApi = {
  async registry() { return policy_registry(); },
  async capabilities() { return request("capabilities"); },
  async compile(request) {
    return wasmObject<CompileResponse>(compile({ environment: "bitcoin", profile: POLICY_PROFILE, ...request }));
  },
  async encodeScript(script) { return encode_script(script); },
  async convert(request) { return wasmObject<ConvertResponse>(convert_script(request)); },
  async localTweak(request) { return policy_local_tweak(request); },
  tweak: (body) => request("tweak", body),
  fetchParent: fetchPolicyParent,
  async createPsbt(request) { return policy_create_psbt(request); },
  async localContext(request) { return policy_context(request); },
  prepare: (body) => request("prepare", body),
  evaluate: (body) => request("evaluate", body),
  sign: (body) => request("sign", body),
  async verifySigned(request) { return policy_verify_signed_psbt(request); },
  async finalize(request) { return policy_finalize_psbt(request); },
  broadcast: broadcastPolicyTransaction,
};
