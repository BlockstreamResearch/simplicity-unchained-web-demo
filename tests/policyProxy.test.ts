import assert from "node:assert/strict";
import { test } from "node:test";
import { POLICY_BODY_LIMIT, proxyPolicyRequest, type PolicyEndpoint } from "../services/policyProxy";

const service = "http://localhost:30431";
const tweak = { profile_hash: "11".repeat(32), network: "testnet4", program: "AA==", redeem_script_hex: "" };
const prepare = { ...tweak, psbt_hex: "70736274ff", input_index: 0, user_pubkey: "02" + "22".repeat(32), user_leaf_hash_hex: "33".repeat(32) };
const post = (body: unknown) => new Request("http://demo/api/policy/bitcoin/sign", { method: "POST", body: JSON.stringify(body) });

test("policy proxy uses only fixed capabilities/tweak/prepare/evaluate/sign endpoints with no-store", async () => {
  for (const endpoint of ["capabilities", "tweak", "prepare", "evaluate", "sign"] as const) {
    const body = endpoint === "tweak" ? tweak : endpoint === "prepare" ? prepare : { ...prepare, witness: "" };
    const request = endpoint === "capabilities" ? new Request("http://demo/api/policy/bitcoin/capabilities") : post(body);
    const result = await proxyPolicyRequest(request, endpoint, service, async (url, init) => {
      assert.equal(url, `${service}/simplicity-unchained/policy/bitcoin/${endpoint}`);
      assert.equal(init?.method, endpoint === "capabilities" ? "GET" : "POST");
      assert.equal(init?.cache, "no-store");
      if (endpoint !== "capabilities") assert.deepEqual(JSON.parse(init?.body as string), body);
      return Response.json({ accepted: true });
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
});

test("policy proxy rejects malformed, missing, arbitrary-upstream and legacy request fields", async () => {
  let upstreamCalls = 0;
  const upstream: typeof fetch = async () => { upstreamCalls++; return Response.json({}); };
  for (const body of [
    null, [], {}, { ...prepare, witness: "", url: "http://other-host" },
    { ...prepare, witness: "", jet_env: "bitcoin" }, { ...prepare, witness: "", profile_hash: "wrong" },
    { ...prepare, witness: "", network: "liquid_testnet" }, { ...prepare, witness: "", program: "not base64" },
    { ...prepare, witness: "", redeem_script_hex: "0" }, { ...prepare, witness: "", user_pubkey: "04" + "11".repeat(64) },
    { ...prepare, witness: "", input_index: 8 }, { ...prepare, witness: "", user_leaf_hash_hex: "bad" },
    { ...prepare, witness: "xyz" }, { ...prepare, witness: "", psbt_hex: "" },
  ]) assert.equal((await proxyPolicyRequest(post(body), "sign", service, upstream)).status, 400);
  const unknown = await proxyPolicyRequest(post(tweak), "../tweak" as PolicyEndpoint, service, upstream);
  assert.equal(unknown.status, 404);
  assert.equal((await proxyPolicyRequest(post(tweak), "capabilities", service, upstream)).status, 405);
  assert.equal(upstreamCalls, 0);
});

test("policy proxy enforces 2 MiB on streamed bodies without a Content-Length", async () => {
  const request = new Request("http://demo/api/policy/bitcoin/tweak", {
    method: "POST", body: JSON.stringify({ ...tweak, program: "A".repeat(POLICY_BODY_LIMIT) }),
  });
  const result = await proxyPolicyRequest(request, "tweak", service, async () => { throw new Error("Must not forward oversized bodies"); });
  assert.equal(result.status, 413);
});

test("Liquid proxies use fixed PSET policy routes and reject private keys, Bitcoin and unsupported networks", async () => {
    const liquidTweak = { ...tweak, network: "liquidtestnet" };
    const liquidPrepare = { ...liquidTweak, pset_hex: "70736574ff", input_index: 0, user_pubkey: prepare.user_pubkey, user_leaf_hash_hex: prepare.user_leaf_hash_hex };
    for (const endpoint of ["capabilities", "tweak", "prepare", "evaluate", "sign"] as const) {
      const body = endpoint === "tweak" ? liquidTweak : endpoint === "prepare" ? liquidPrepare : { ...liquidPrepare, witness: "" };
      const response = await proxyPolicyRequest(endpoint === "capabilities" ? new Request("http://demo") : post(body), endpoint, service, async (url, init) => {
        assert.equal(url, `${service}/simplicity-unchained/policy/liquid/${endpoint}`);
        if (endpoint !== "capabilities") assert.deepEqual(JSON.parse(String(init?.body)), body);
        return Response.json({ accepted: true });
      }, "liquid");
      assert.equal(response.status, 200);
    }
    const sign = { ...liquidPrepare, witness: "" };
    for (const body of [{ ...sign, psbt_hex: prepare.psbt_hex }, { ...sign, blinding_secret_key_hex: "01".repeat(32) },
      { ...sign, secret_key_hex: "02".repeat(32) }, { ...sign, verified: true }, { ...sign, network: "testnet4" },
      { ...sign, network: "liquid" }, { ...sign, pset_hex: "" }, { ...sign, input_index: 8 }]) {
      const response = await proxyPolicyRequest(post(body), "sign", service, async () => { throw new Error("Invalid Liquid body must not reach SU"); }, "liquid");
      assert.equal(response.status, 400);
    }
    for (const network of ["bitcoin", "testnet", "liquidtestnet"]) {
      assert.equal((await proxyPolicyRequest(post({ ...tweak, network }), "tweak", service, async () => { throw new Error("Unsupported demo network"); })).status, 400);
    }
});

test("policy proxy validates JSON and preserves service rejection without fallback", async () => {
  assert.equal((await proxyPolicyRequest(new Request("http://demo", { method: "POST", body: "{" }), "tweak", service)).status, 400);
  for (const status of [400, 409, 422, 429]) {
    const result = await proxyPolicyRequest(post(tweak), "tweak", service, async () => Response.json({ error: "profile rejected" }, { status }));
    assert.equal(result.status, status);
    assert.deepEqual(await result.json(), { error: "profile rejected" });
  }
  assert.equal((await proxyPolicyRequest(post(tweak), "tweak", service, async () => new Response("<html>bad</html>"))).status, 502);
  assert.equal((await proxyPolicyRequest(post(tweak), "tweak", service, async () => Response.json([]))).status, 502);
  const offline = await proxyPolicyRequest(post(tweak), "tweak", service, async () => { throw new Error("offline"); });
  assert.equal(offline.status, 503);
  assert.match((await offline.json()).error, /legacy endpoints are not a fallback/);
});
