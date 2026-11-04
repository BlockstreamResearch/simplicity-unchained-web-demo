import assert from "node:assert/strict";
import { test } from "node:test";
import { checkServiceHealth, proxyServiceRequest } from "../services/serviceProxy";

const request = () => new Request("http://demo/api/proxy/tweak", {
  method: "POST", body: JSON.stringify({ program: "program", jet_env: "bitcoin" }),
});

for (const endpoint of ["tweak", "sign/psbt", "sign/pset"] as const) {
  test(`${endpoint}: forwards the actual endpoint, body, and service response`, async () => {
    const response = await proxyServiceRequest(request(), endpoint, "http://service:30431", async (url, options) => {
      assert.equal(url, `http://service:30431/simplicity-unchained/${endpoint}`);
      assert.equal(options?.method, "POST");
      assert.deepEqual(JSON.parse(String(options?.body)), { program: "program", jet_env: "bitcoin" });
      assert.ok(options?.signal);
      return Response.json({ result: endpoint });
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: endpoint });
  });
}

test("a real connection failure gives actionable 503, not generic tweak 500", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const response = await proxyServiceRequest(request(), "tweak", "http://127.0.0.1:0");
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.match(data.error, /Cannot reach Simplicity Unchained at http:\/\/127.0.0.1:0/);
  assert.match(data.error, /Start the backend/);
  assert.match(data.error, /simplicity-unchained\/version/);
  assert.equal(logged.mock.callCount(), 1);
});

test("upstream JSON and plaintext errors keep their status and explanation", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const upstream of [
    Response.json({ error: "Failed to parse program: unrecognized jet" }, { status: 400 }),
    new Response("Service maintenance", { status: 503 }),
  ]) {
    const response = await proxyServiceRequest(request(), "tweak", "http://service", async () => upstream);
    assert.equal(response.status, upstream.status);
    assert.match((await response.json()).error, /unrecognized jet|Service maintenance/);
  }
});

test("malformed requests and invalid upstream responses are explicit failures", async (t) => {
  t.mock.method(console, "error", () => {});
  const invalid = new Request("http://demo", { method: "POST", body: "{" });
  assert.equal((await proxyServiceRequest(invalid, "tweak", "http://service", async () => {
    throw new Error("Must not contact upstream for invalid JSON");
  })).status, 400);
  for (const upstream of [new Response("<html>wrong service</html>"), Response.json(null), Response.json([])]) {
    const response = await proxyServiceRequest(request(), "tweak", "http://service", async () => upstream);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /invalid/);
  }
});

test("health check reports the running service version", async () => {
  const response = await checkServiceHealth("http://service:30431", async (url) => {
    assert.equal(url, "http://service:30431/simplicity-unchained/version");
    return Response.json({ version: "0.1.0" });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { online: true, version: "0.1.0" });
});

test("health check reports offline and wrong services explicitly", async () => {
  const offline = await checkServiceHealth("http://127.0.0.1:0");
  assert.equal(offline.status, 503);
  assert.equal((await offline.json()).online, false);
  for (const upstream of [new Response("<html></html>"), Response.json({ error: "no" }, { status: 500 })]) {
    const response = await checkServiceHealth("http://service", async () => upstream);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).online, false);
  }
});
