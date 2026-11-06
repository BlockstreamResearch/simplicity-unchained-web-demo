// Integration test for Node-target release WASM, not demo/UI code.
// Usage: node tests/liquid-policy-node.cjs /absolute/path/to/Node-bindings.js
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
assert.ok(process.argv[2], "Pass the isolated Node-target WASM binding path");
const wasm = require(path.resolve(process.argv[2]));
const f = JSON.parse(fs.readFileSync(path.resolve(
  __dirname, "../../../simplicity-unchained/policy/tests/fixtures/liquid-policy-v1.json",
), "utf8"));
const binding = {
  network: f.network, cmr_hex: f.cmr_hex,
  redeem_script_hex: f.redeem_script_hex, base_public_key_hex: f.base_public_key_hex,
};
const prepared = {
  ...binding, pset_hex: f.pset_hex, input_index: 0,
  user_pubkey: f.user_pubkey, user_leaf_hash_hex: f.user_leaf_hash_hex,
};
const registry = wasm.liquid_policy_registry();
assert.equal(registry.profile_hash, f.profile_hash);
assert.equal(registry.manifest.jets.length, 66);
assert.equal(wasm.compile({
  script: f.source, environment: "elements", profile: "liquid-policy-v1",
}).cmr_hex, f.cmr_hex);
assert.deepEqual(wasm.liquid_policy_recovery_script(f.recovery_script), {
  redeem_script_hex: f.redeem_script_hex, user_leaf_hash_hex: f.user_leaf_hash_hex,
});
const receiving = wasm.liquid_policy_generate_blinding_key();
assert.equal(receiving.blinding_secret_key_hex.length, 64);
assert.equal(receiving.blinding_public_key_hex.length, 66);
const address = wasm.liquid_policy_address({
  binding, user_pubkey: f.user_pubkey, user_leaf_hash_hex: f.user_leaf_hash_hex,
  blinding_public_key_hex: f.blinding_public_key_hex,
});
assert.notEqual(address.address, address.unconfidential_address);
assert.equal(address.script_pubkey_hex, f.contexts[0].script_pubkey_hex);
assert.equal(wasm.liquid_policy_local_tweak(binding).public_key_hex, address.service_pubkey);
const disclosures = [];
for (let index = 0; index < 2; index++) {
  const req = { ...prepared, input_index: index };
  assert.deepEqual(wasm.liquid_policy_context(req).context, f.contexts[index]);
  assert.deepEqual(wasm.liquid_policy_evaluate({
    prepared: req, program_base64: f.program_base64, witness_base64: "",
  }).context, f.contexts[index]);
  const d = wasm.liquid_policy_unblind_output({
    parent_tx_hex: f.parent_tx_hex, txid: f.parent_txid, vout: index,
    blinding_secret_key_hex: f.test_only_secrets.blinding_secret_key_hex,
  });
  disclosures.push(d.disclosure);
  assert.equal(d.disclosure.asset_id, f.contexts[index].current_asset_id);
  assert.equal(d.disclosure.value_sat, f.contexts[index].inputs[index].value);
  const sig = f.service_signatures[index];
  assert.equal(wasm.liquid_policy_verify_signed_pset({
    prepared: req, signed_pset_hex: f.service_signed_pset_hex,
    signature_hex: sig.signature_hex, public_key_hex: sig.public_key_hex,
  }).verified, true);
}
let signed = f.service_signed_pset_hex;
const signatures = [];
for (let index = 0; index < 2; index++) {
  const result = wasm.liquid_policy_user_sign({
    prepared: { ...prepared, input_index: index }, signed_pset_hex: signed,
    secret_key_hex: f.test_only_secrets.user_secret_key_hex,
  });
  signed = result.pset_hex;
  signatures.push({
    input_index: index, signature_hex: result.signature_hex,
    public_key_hex: result.public_key_hex,
  });
  assert.deepEqual(signatures[index], f.user_signatures[index]);
}
const finalized = wasm.liquid_policy_finalize_pset({
  prepared, signed_pset_hex: signed, signatures,
});
assert.equal(finalized.transaction_hex, f.transaction_hex);
assert.equal(finalized.txid, f.txid);
let rejected = 0;
for (const [name, pset_hex] of Object.entries(f.negative_psets)) {
  assert.throws(() => wasm.liquid_policy_context({ ...prepared, pset_hex }), undefined, name);
  rejected++;
}
assert.throws(() => wasm.liquid_policy_context({ ...prepared, network: "liquid" }));
assert.throws(() => wasm.liquid_policy_verify_signed_pset({
  prepared, signed_pset_hex: signed, signature_hex: "01".repeat(64),
  public_key_hex: address.service_pubkey,
}));
assert.throws(() => wasm.liquid_policy_finalize_pset({
  prepared, signed_pset_hex: signed,
  signatures: [{ ...signatures[0], signature_hex: "01".repeat(64) }, signatures[1]],
}));
assert.notEqual(wasm.policy_registry().profile_hash, registry.profile_hash);
assert.throws(() => wasm.compile({
  script: f.source, environment: "bitcoin", profile: "liquid-policy-v1",
}));
const tx = wasm.liquid_policy_create_pset({
  network: "liquidtestnet",
  inputs: [0, 1].map(vout => ({
    txid: f.parent_txid, vout, parent_tx_hex: f.parent_tx_hex,
    blinding_secret_key_hex: f.test_only_secrets.blinding_secret_key_hex,
  })),
  outputs: [
    ...disclosures.map(d => ({
      address: address.address, asset_id: d.asset_id,
      value_sat: d.value_sat - (d.asset_id === f.contexts[0].fee_asset_id ? 1000 : 0),
    })),
    { address: "fee", asset_id: f.contexts[0].fee_asset_id, value_sat: 1000 },
  ],
});
assert.equal(typeof tx.transaction_hex, "string");
assert.equal(typeof tx.txid, "string");
assert.equal(wasm.liquid_policy_context({ ...prepared, pset_hex: tx.pset_hex }).context.assets.length, 2);
console.log(`PASS release WASM: all 12 Liquid exports; confidential two-asset roundtrip; ${rejected} negative proof/label/evidence cases; signature/network/profile replay rejection.`);
console.log(`Liquid ${registry.profile_hash}; Bitcoin ${wasm.policy_registry().profile_hash}`);
