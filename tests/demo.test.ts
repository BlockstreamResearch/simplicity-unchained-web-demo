import assert from "node:assert/strict";
import { test } from "node:test";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { createDemoSource, createSpendPlan, DEMO_NETWORKS, DEMO_PROGRAM_NOTES, demoProgram, recoveryScriptForKey, transactionExplorerUrl, type DemoNetwork } from "../utils/demo";
import { assertSameProgram, prepareDemo, sendDemoTransaction, type PreparedProgram } from "../services/demoFlow";

const secret = "01".padStart(64, "0");
const txid = "ab".repeat(32);
const sighash = "12".repeat(32);
type SigningApi = Parameters<typeof sendDemoTransaction>[2];

function fixture(network: DemoNetwork, reject = false) {
  const source = createDemoSource("opcode", secret);
  const program: PreparedProgram = {
    ...source, network, compiledProgramBase64: "program", compiledWitnessBase64: "witness",
    compiledHex: "script", compiledAddress: "address", tweakedPublicKey: "oracle", userLeafHash: "leaf",
  };
  const calls: string[] = [];
  const expectedSignRequest = {
    input_index: 0, program: "program", witness: "witness", redeem_script_hex: "script",
    user_pubkey: source.compiledUserPubkey, user_leaf_hash_hex: "leaf",
  };
  const finalized = { finalized: true, inputs: 1, outputs: 1, transaction_hex: "transaction", txid, witnesses: [] };
  const hash = { sighash_hex: sighash, message_hex: sighash, input_index: 0, sighash_type: "DEFAULT" };
  const checkSignature = (signature: string, key: string) => {
    assert.equal(key, source.compiledUserPubkey);
    assert.ok(schnorr.verify(Buffer.from(signature, "hex"), Buffer.from(sighash, "hex"), Buffer.from(key.slice(2), "hex")));
  };
  const api: SigningApi = {
    async createPsbt(request) {
      calls.push("create");
      assert.equal(network, "bitcoin");
      assert.deepEqual(request, { inputs: [`${txid}:2`], outputs: ["address:99000"], network: "testnet4" });
      return { inputs: 1, outputs: 1, network: "testnet4", psbt: "unsigned" };
    },
    async createPset(request) {
      calls.push("create");
      assert.equal(network, "elements");
      assert.deepEqual(request, {
        inputs: [`${txid}:2`], outputs: ["address:99000", "fee:1000"],
        network: "liquid_testnet", asset_id: DEMO_NETWORKS.elements.asset,
      });
      return { inputs: 1, outputs: 2, network: "liquid_testnet", asset: DEMO_NETWORKS.elements.asset, pset: "unsigned" };
    },
    async simplicitySignPsbt(request) {
      calls.push("oracle");
      assert.deepEqual(request, { ...expectedSignRequest, psbt_hex: "unsigned" });
      if (reject) throw new Error("Program rejected");
      return { psbt_hex: "signed", signature_hex: "", public_key_hex: "", input_index: 0, partial_sigs_count: 0 };
    },
    async simplicitySignPset(request) {
      calls.push("oracle");
      assert.deepEqual(request, { ...expectedSignRequest, pset_hex: "unsigned" });
      if (reject) throw new Error("Program rejected");
      return { pset_hex: "signed", signature_hex: "", public_key_hex: "", input_index: 0, partial_sigs_count: 0 };
    },
    async sighashPsbt(request) {
      calls.push("sighash");
      assert.deepEqual(request, { psbt_hex: "signed", input_index: 0 });
      return hash;
    },
    async sighashPset(request) {
      calls.push("sighash");
      assert.deepEqual(request, { pset_hex: "signed", input_index: 0, network: "liquid_testnet" });
      return hash;
    },
    async finalizePsbt(request) {
      calls.push("finalize");
      assert.equal(request.psbt_hex, "signed");
      checkSignature(request.signature_hex, request.public_key_hex);
      return finalized;
    },
    async finalizePset(request) {
      calls.push("finalize");
      assert.equal(request.pset_hex, "signed");
      assert.equal(request.network, "liquid_testnet");
      checkSignature(request.signature_hex, request.public_key_hex);
      return finalized;
    },
    async broadcastTransaction(request, selectedNetwork) {
      calls.push("broadcast");
      assert.equal(selectedNetwork, network);
      assert.deepEqual(request, { transaction_hex: "transaction" });
      return { txid, explorer_url: transactionExplorerUrl(network, txid) };
    },
  };
  const funding = { txid, vout: 2, value: 100000, asset: DEMO_NETWORKS.elements.asset };
  return { api, calls, program, funding };
}

test("guided scenarios keep the same key and construct matching recovery metadata", () => {
  for (const scenario of ["opcode", "signature"] as const) {
    const source = createDemoSource(scenario, secret);
    assert.equal(source.cosignSecretKey, secret);
    assert.match(source.bitcoinScript, new RegExp(`^OP_PUSHBYTES_33 0x${source.compiledUserPubkey} OP_DROP OP_PUSHBYTES_32 0x${source.compiledUserPubkey.slice(2)} OP_CHECKSIG$`));
    if (scenario === "opcode") {
      assert.deepEqual(JSON.parse(source.witProgram), {});
      assert.match(source.simplicityProgram, /get_opcode_from_script\(0\), 0x21/);
    } else {
      const signature = JSON.parse(source.witProgram).SIG.value.slice(2);
      const message = sha256(new TextEncoder().encode("Simplicity Unchained live demo"));
      assert.ok(schnorr.verify(Buffer.from(signature, "hex"), message, Buffer.from(source.compiledUserPubkey.slice(2), "hex")));
      assert.ok(source.simplicityProgram.includes(Buffer.from(message).toString("hex")));
    }
  }
});

test("new keys are generated only when no key exists, and invalid keys are rejected", () => {
  assert.match(createDemoSource("opcode").cosignSecretKey, /^[0-9a-f]{64}$/);
  for (const key of ["bad", "00".repeat(32), "ff".repeat(32)]) {
    assert.throws(() => createDemoSource("opcode", key));
  }
});

test("spend plans enforce the exact threshold and conserve all excess funding", () => {
  assert.deepEqual(createSpendPlan(2000), { inputValue: 2000, fee: 1000, outputValue: 1000 });
  assert.deepEqual(createSpendPlan(1000000), { inputValue: 1000000, fee: 1000, outputValue: 999000 });
  for (const value of [0, -1, 1999, 2000.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createSpendPlan(value), /at least 2000/);
  }
});

for (const network of ["bitcoin", "elements"] as const) {
  for (const scenario of ["opcode", "signature"] as const) {
    test(`${network}/${scenario}: prepares all artifacts atomically with the supplied key`, async () => {
      const source = createDemoSource(scenario, secret);
      const progress: string[] = [];
      const demo = await prepareDemo(network, scenario, secret, {
        async compile(request) {
          assert.equal(request.environment, network);
          assert.equal(request.script, source.simplicityProgram);
          assert.equal(Boolean(request.witness?.SIG), scenario === "signature");
          return { program_base64: "program", cmr_hex: "AB".repeat(32), witness_base64: "witness" };
        },
        async tweak(request) {
          assert.deepEqual(request, { program: "program", jet_env: network });
          return { cmr_hex: "ab".repeat(32), tweaked_public_key_hex: "oracle" };
        },
        async convert(request) {
          assert.deepEqual(request, { script: source.bitcoinScript, network: DEMO_NETWORKS[network].network, service_pubkey: "oracle", user_pubkey: source.compiledUserPubkey });
          return { hex: "script", address: "address", user_leaf_hash_hex: "leaf" };
        },
      }, (message) => progress.push(message));
      assert.equal(demo.compiledAddress, "address");
      assert.equal(demo.cosignSecretKey, secret);
      assert.equal(demo.userLeafHash, "leaf");
      assert.equal(demo.compiledWitnessBase64, "witness");
      assert.equal(progress.length, 4);
    });
  }

  test(`${network}: co-signs, verifies, broadcasts, and returns a real explorer link`, async () => {
    const { api, program, funding, calls } = fixture(network);
    const progress: string[] = [];
    const result = await sendDemoTransaction(program, funding, api, (message) => progress.push(message));
    assert.deepEqual(calls, ["create", "oracle", "sighash", "finalize", "broadcast"]);
    assert.deepEqual(progress.map((message) => message.slice(0, 3)), ["1/4", "2/4", "3/4", "4/4"]);
    assert.deepEqual(result, { txid, explorer_url: transactionExplorerUrl(network, txid), network, outputValue: 99000, fee: 1000 });
  });

  test(`${network}: a rejected program never signs locally or broadcasts`, async () => {
    const { api, program, funding, calls } = fixture(network, true);
    await assert.rejects(sendDemoTransaction(program, funding, api, () => {}), /Program rejected/);
    assert.deepEqual(calls, ["create", "oracle"]);
  });
}

test("invalid inputs, wrong assets, and changed keys are rejected before creating a transaction", async () => {
  const { api, program, funding, calls } = fixture("elements");
  for (const invalid of [{ ...funding, txid: "bad" }, { ...funding, vout: -1 }, { ...funding, value: 1999 }, { ...funding, asset: txid }]) {
    await assert.rejects(sendDemoTransaction(program, invalid, api, () => {}));
  }
  await assert.rejects(sendDemoTransaction({ ...program, cosignSecretKey: "02".padStart(64, "0") }, funding, api, () => {}), /key changed/);
  assert.deepEqual(calls, []);
});

test("explorer URLs use the correct testnet and reject arbitrary broadcast text", () => {
  assert.equal(transactionExplorerUrl("bitcoin", txid), `https://mempool.space/testnet4/tx/${txid}`);
  assert.equal(transactionExplorerUrl("elements", txid), `https://blockstream.info/liquidtestnet/tx/${txid}`);
  for (const invalid of ["", "success", "https://example.org", txid + "\n"]) {
    assert.throws(() => transactionExplorerUrl("bitcoin", invalid));
  }
});

test("program previews match the prepared programs without needing a key", () => {
  for (const scenario of ["opcode", "signature"] as const) {
    assert.equal(demoProgram(scenario), createDemoSource(scenario, secret).simplicityProgram);
    assert.equal(demoProgram(scenario), createDemoSource(scenario).simplicityProgram);
    assert.ok(DEMO_PROGRAM_NOTES[scenario].length > 0);
  }
});

test("recovery script helper embeds compressed and x-only forms of the key", () => {
  const { compiledUserPubkey, bitcoinScript } = createDemoSource("opcode", secret);
  assert.equal(recoveryScriptForKey(compiledUserPubkey), bitcoinScript);
  for (const invalid of ["", "04" + "11".repeat(32), "02" + "11".repeat(31), compiledUserPubkey.slice(2)]) {
    assert.throws(() => recoveryScriptForKey(invalid), /compressed/);
  }
});

test("preparation stops when the service decodes a different program than the browser compiled", async () => {
  assert.doesNotThrow(() => assertSameProgram("ab".repeat(32), "AB".repeat(32)));
  assert.throws(() => assertSameProgram("ab".repeat(32), "cd".repeat(32)), /different program/);
  let converted = false;
  await assert.rejects(prepareDemo("elements", "opcode", secret, {
    async compile() { return { program_base64: "program", cmr_hex: "ab".repeat(32) }; },
    async tweak() { return { cmr_hex: "cd".repeat(32), tweaked_public_key_hex: "oracle" }; },
    async convert() { converted = true; return { hex: "", address: "", user_leaf_hash_hex: "" }; },
  }, () => {}), /different program/);
  assert.equal(converted, false);
});
