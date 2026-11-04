import assert from "node:assert/strict";
import { test } from "node:test";
import { ExplorerUnavailableError, fetchExplorerOutput, fetchTransactionStatus, findFundingOutputs } from "../services/explorer";
import { DEMO_NETWORKS } from "../utils/demo";

const txid = "ab".repeat(32);
const scriptpubkey = "5120" + "12".repeat(32);
const json = (value: unknown) => Response.json(value);

test("funding discovery handles empty results without a transaction lookup", async () => {
  let calls = 0;
  assert.deepEqual(await findFundingOutputs("bitcoin", "address", undefined, async () => {
    calls++;
    return json([]);
  }), []);
  assert.equal(calls, 1);
});

test("funding discovery reads actual outputs, sorts confirmed first, and retains insufficient outputs", async () => {
  const outputs = await findFundingOutputs("bitcoin", "address", undefined, async (url) => {
    if (String(url).endsWith("/utxo")) return json([
      { txid, vout: 0, status: { confirmed: false } },
      { txid, vout: 1, status: { confirmed: true } },
      { txid, vout: 2, status: { confirmed: true } },
    ]);
    return json({ vout: [5000, 100000, 1999].map((value) => ({ value, scriptpubkey })) });
  });
  assert.deepEqual(outputs.map((output) => output.value), [1999, 100000, 5000]);
  assert.equal(outputs[0].vout, 2);
  assert.equal(outputs[0].scriptpubkey, scriptpubkey);
});

test("Liquid funding selects only explicit testnet L-BTC", async () => {
  const outputs = await findFundingOutputs("elements", "address", undefined, async (url) => {
    if (String(url).endsWith("/utxo")) return json([0, 1].map((vout) => ({ txid, vout, status: { confirmed: true } })));
    return json({ vout: [
      { value: 100000, scriptpubkey, asset: txid },
      { value: 10000, scriptpubkey, asset: DEMO_NETWORKS.elements.asset },
    ] });
  });
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].vout, 1);
});

test("output lookup validates txids, indices, explicit amounts, scripts, and assets", async () => {
  const neverFetch: typeof fetch = async () => { throw new Error("Unexpected request"); };
  await assert.rejects(fetchExplorerOutput("api", "bad", 0, neverFetch), /64-character/);
  for (const index of [-1, 0.1, NaN]) {
    await assert.rejects(fetchExplorerOutput("api", txid, index, neverFetch), /output index/);
  }
  for (const output of [
    { scriptpubkey },
    { value: "5000", scriptpubkey },
    { value: 0.1, scriptpubkey },
    { value: 5000, scriptpubkey: "not hex" },
    { value: 5000, scriptpubkey, asset: 4 },
    { value: 5000, scriptpubkey, asset: "bad" },
  ]) {
    await assert.rejects(fetchExplorerOutput("api", txid, 0, async () => json({ vout: [output] })));
  }
  await assert.rejects(fetchExplorerOutput("api", txid, 1, async () => json({ vout: [] })), /not found/);
});

test("lookup failures and malformed explorer lists are explicit errors", async () => {
  for (const data of [{}, [null], [{ txid, vout: 0, status: {} }]]) {
    await assert.rejects(findFundingOutputs("bitcoin", "address", undefined, async () => json(data)), /invalid/i);
  }
  await assert.rejects(findFundingOutputs("bitcoin", "address", undefined, async () => new Response("Unavailable", { status: 503 })), /503/);
  await assert.rejects(fetchExplorerOutput("api", txid, 0, async () => new Response("Not found", { status: 404 })), /404/);
  await assert.rejects(findFundingOutputs("elements", "address", undefined, async (url) =>
    String(url).endsWith("/utxo")
      ? json([{ txid, vout: 0, status: { confirmed: true } }])
      : json({ vout: [{ value: 10000, scriptpubkey }] })), /funding asset/);
});

test("funding lookup forwards cancellation to every explorer request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(options?.signal, controller.signal);
    assert.equal(options?.cache, "no-store");
    if (String(url).endsWith("/utxo")) return json([{ txid, vout: 0, status: { confirmed: true } }]);
    return json({ vout: [{ value: 5000, scriptpubkey }] });
  };
  await findFundingOutputs("bitcoin", "address", controller.signal, fetcher);
  assert.equal(calls, 2);
});

test("transaction status reports not-indexed, mempool, and confirmed states", async () => {
  const urls: string[] = [];
  const status = (body: unknown, init?: ResponseInit) => async (url: string | URL | Request) => {
    urls.push(String(url));
    return body === null ? new Response("Not found", init) : Response.json(body, init);
  };
  assert.deepEqual(await fetchTransactionStatus("bitcoin", txid, undefined, status(null, { status: 404 })), { indexed: false, confirmed: false });
  assert.deepEqual(await fetchTransactionStatus("elements", txid, undefined, status({ confirmed: false })), { indexed: true, confirmed: false });
  assert.deepEqual(
    await fetchTransactionStatus("bitcoin", txid, undefined, status({ confirmed: true, block_height: 120000 })),
    { indexed: true, confirmed: true, blockHeight: 120000 },
  );
  assert.equal(urls[0], `${DEMO_NETWORKS.bitcoin.api}/tx/${txid}/status`);
  assert.equal(urls[1], `${DEMO_NETWORKS.elements.api}/tx/${txid}/status`);
});

test("transaction status rejects invalid IDs and malformed explorer responses", async () => {
  await assert.rejects(fetchTransactionStatus("bitcoin", "bad", undefined, async () => { throw new Error("must not fetch"); }), /Invalid/);
  for (const body of [{}, { confirmed: "yes" }, { confirmed: true }]) {
    await assert.rejects(fetchTransactionStatus("bitcoin", txid, undefined, async () => Response.json(body)));
  }
  await assert.rejects(fetchTransactionStatus("bitcoin", txid, undefined, async () => new Response("down", { status: 503 })), /503/);
});

test("rate limits and unreachable explorers are reported as temporarily unavailable", async () => {
  const limited: typeof fetch = async () => new Response("Too Many Requests", { status: 429 });
  // Browsers surface mempool.space 429s (sent without CORS headers) as a TypeError.
  const blocked: typeof fetch = async () => { throw new TypeError("Failed to fetch"); };
  for (const [fetcher, rateLimited] of [[limited, true], [blocked, false]] as const) {
    for (const request of [
      findFundingOutputs("elements", "address", undefined, fetcher),
      fetchExplorerOutput("api", txid, 0, fetcher),
      fetchTransactionStatus("bitcoin", txid, undefined, fetcher),
    ]) {
      await assert.rejects(request, (error) => error instanceof ExplorerUnavailableError && error.rateLimited === rateLimited);
    }
  }
  const aborted: typeof fetch = async () => { throw new DOMException("Aborted", "AbortError"); };
  await assert.rejects(fetchTransactionStatus("bitcoin", txid, undefined, aborted), (error) => !(error instanceof ExplorerUnavailableError));
});

test("funding transactions are fetched once and reused on later polls", async () => {
  let txLookups = 0;
  const fetcher: typeof fetch = async (url) => {
    if (String(url).endsWith("/utxo")) return json([{ txid, vout: 0, status: { confirmed: false } }]);
    txLookups++;
    return json({ vout: [{ value: 5000, scriptpubkey }] });
  };
  for (let poll = 0; poll < 3; poll++) {
    assert.equal((await findFundingOutputs("bitcoin", "address", undefined, fetcher))[0].value, 5000);
  }
  assert.equal(txLookups, 1);
});
