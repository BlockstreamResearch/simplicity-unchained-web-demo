export const POLICY_BODY_LIMIT = 2 * 1024 * 1024;
export type PolicyEndpoint = "capabilities" | "tweak" | "prepare" | "evaluate" | "sign";

const endpoints = new Set<PolicyEndpoint>(["capabilities", "tweak", "prepare", "evaluate", "sign"]);
const hex = /^(?:[0-9a-fA-F]{2})*$/;
const hash = /^[0-9a-fA-F]{64}$/;
const publicKey = /^(?:[0-9a-fA-F]{64}|0[23][0-9a-fA-F]{64})$/;
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

class ProxyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function limitedText(body: ReadableStream<Uint8Array> | null, headers: Headers): Promise<string> {
  const length = headers.get("content-length");
  if (length && Number(length) > POLICY_BODY_LIMIT) throw new ProxyError("Policy body exceeds 2 MiB.", 413);
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > POLICY_BODY_LIMIT) {
        await reader.cancel();
        throw new ProxyError("Policy body exceeds 2 MiB.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function validateRequest(value: unknown, endpoint: PolicyEndpoint, chain: "bitcoin" | "liquid"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProxyError("Policy request must be a JSON object.", 400);
  }
  const body = value as Record<string, unknown>;
  const fields = ["profile_hash", "network", "program", "redeem_script_hex"];
  const transactionField = chain === "bitcoin" ? "psbt_hex" : "pset_hex";
  if (endpoint !== "tweak") fields.push(transactionField, "input_index", "user_pubkey", "user_leaf_hash_hex");
  if (endpoint === "evaluate" || endpoint === "sign") fields.push("witness");
  if (Object.keys(body).some((key) => !fields.includes(key)) || fields.some((key) => !(key in body))) {
    throw new ProxyError("Unexpected or missing policy request fields.", 400);
  }
  if (typeof body.profile_hash !== "string" || !hash.test(body.profile_hash)
    || !(chain === "bitcoin" ? ["testnet4"] : ["liquidtestnet"]).includes(String(body.network))
    || typeof body.program !== "string" || !body.program || !base64.test(body.program)
    || typeof body.redeem_script_hex !== "string" || !hex.test(body.redeem_script_hex)
    || body.redeem_script_hex.length > 20_000) {
    throw new ProxyError("Invalid policy profile, network, base64 program, or exact script hex.", 400);
  }
  if (endpoint !== "tweak" && (
    typeof body[transactionField] !== "string" || !body[transactionField] || !hex.test(String(body[transactionField]))
    || typeof body.input_index !== "number" || !Number.isInteger(body.input_index) || body.input_index < 0 || body.input_index >= 8
    || typeof body.user_pubkey !== "string" || !publicKey.test(body.user_pubkey)
    || typeof body.user_leaf_hash_hex !== "string" || !hash.test(body.user_leaf_hash_hex)
  )) {
    throw new ProxyError(`Invalid ${chain === "bitcoin" ? "PSBT" : "PSET"}, input index, user key, or recovery leaf hash.`, 400);
  }
  if ((endpoint === "evaluate" || endpoint === "sign")
    && (typeof body.witness !== "string" || !base64.test(body.witness))) {
    throw new ProxyError("Policy witness must be base64 (empty is allowed).", 400);
  }
  return body;
}

/** Only the five fixed policy endpoints are reachable; callers cannot select an upstream URL. */
export async function proxyPolicyRequest(
  request: Request,
  endpoint: PolicyEndpoint,
  serviceUrl: string,
  fetcher: typeof fetch = fetch,
  chain: "bitcoin" | "liquid" = "bitcoin",
): Promise<Response> {
  if (!endpoints.has(endpoint)) return Response.json({ error: "Unknown policy endpoint." }, { status: 404 });
  const method = endpoint === "capabilities" ? "GET" : "POST";
  if (request.method !== method) return Response.json({ error: "Method not allowed." }, { status: 405 });
  let body: Record<string, unknown> | undefined;
  if (method === "POST") {
    try {
      body = validateRequest(JSON.parse(await limitedText(request.body, request.headers)), endpoint, chain);
    } catch (error) {
      return Response.json(
        { error: error instanceof ProxyError ? error.message : "Policy body must be valid UTF-8 JSON." },
        { status: error instanceof ProxyError ? error.status : 400 },
      );
    }
  }
  try {
    const upstream = await fetcher(`${serviceUrl.replace(/\/$/, "")}/simplicity-unchained/policy/${chain}/${endpoint}`, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await limitedText(upstream.body, upstream.headers);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return Response.json({ error: upstream.ok ? "Policy service returned invalid JSON." : `Policy service rejected ${endpoint} (${upstream.status}).` }, { status: upstream.ok ? 502 : upstream.status });
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return Response.json({ error: "Policy service returned an invalid object." }, { status: 502 });
    }
    if (!upstream.ok) {
      const message = "error" in data && typeof data.error === "string" ? data.error : `Policy service rejected ${endpoint} (${upstream.status}).`;
      return Response.json({ error: message }, { status: upstream.status });
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof ProxyError ? "Policy service response exceeds 2 MiB." : "Policy service unavailable. Start a matching experimental backend; legacy endpoints are not a fallback." },
      { status: error instanceof ProxyError ? 502 : 503 },
    );
  }
}
