use anyhow::{Context, Result};
use wasm_bindgen::prelude::*;
use serde::Deserialize;
use elements::{
    EcdsaSighashType, encode::deserialize, hashes::Hash, pset::PartiallySignedTransaction,
    script::Script, sighash::SighashCache,
};

#[derive(Deserialize)]
pub struct SighashPsetRequest {
    pub pset_hex: String,
    pub input_index: usize,
    pub redeem_script_hex: String,
}

#[wasm_bindgen]
pub fn sighash_pset(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: SighashPsetRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    let result = execute(
        &request.pset_hex,
        request.input_index,
        &request.redeem_script_hex,
    );

    match result {
        Ok(output) => serde_wasm_bindgen::to_value(&output)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e))),
        Err(e) => Err(JsValue::from_str(&e.to_string())),
    }
}

pub fn execute(
    pset_hex: &str,
    input_index: usize,
    redeem_script_hex: &str,
) -> Result<serde_json::Value> {
    let pset_bytes = hex::decode(pset_hex).context("Failed to decode PSET hex")?;
    let pset: PartiallySignedTransaction =
        deserialize(&pset_bytes).context("Failed to deserialize PSET")?;

    if input_index >= pset.inputs().len() {
        return Err(anyhow::anyhow!(
            "Input index {} out of bounds (PSET has {} inputs)",
            input_index,
            pset.inputs().len()
        ));
    }

    let redeem_script_bytes =
        hex::decode(redeem_script_hex).context("Failed to decode redeem script hex")?;
    let redeem_script = Script::from(redeem_script_bytes);

    let tx = pset.extract_tx()?;

    let pset_input = &pset.inputs()[input_index];

    let prev_value = pset_input
        .witness_utxo
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Missing witness UTXO for input {}", input_index))?
        .value;

    let mut sighash_cache = SighashCache::new(&tx);
    let sighash = sighash_cache.segwitv0_sighash(
        input_index,
        &redeem_script,
        prev_value,
        EcdsaSighashType::All,
    );

    let output = serde_json::json!({
        "sighash_hex": hex::encode(sighash.as_byte_array()),
        "message_hex": hex::encode(sighash.as_byte_array()),
        "input_index": input_index,
        "sighash_type": "SIGHASH_ALL",
    });

    Ok(output)
}
