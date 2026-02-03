use anyhow::{Context, Result};
use wasm_bindgen::prelude::*;
use serde::Deserialize;
use elements::bitcoin::{EcdsaSighashType, hashes::Hash, psbt::Psbt, sighash::SighashCache};

#[derive(Deserialize)]
pub struct SighashPsbtRequest {
    pub psbt_hex: String,
    pub input_index: usize,
    pub redeem_script_hex: String,
}

#[wasm_bindgen]
pub fn sighash_psbt(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: SighashPsbtRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    let result = execute(
        &request.psbt_hex,
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
    psbt_hex: &str,
    input_index: usize,
    redeem_script_hex: &str,
) -> Result<serde_json::Value> {
    let psbt_bytes = hex::decode(psbt_hex).context("Failed to decode PSBT hex")?;
    let psbt: Psbt = Psbt::deserialize(&psbt_bytes).context("Failed to deserialize PSBT")?;

    if input_index >= psbt.inputs.len() {
        return Err(anyhow::anyhow!(
            "Input index {} out of bounds (PSBT has {} inputs)",
            input_index,
            psbt.inputs.len()
        ));
    }

    let redeem_script_bytes =
        hex::decode(redeem_script_hex).context("Failed to decode redeem script hex")?;
    let redeem_script = elements::bitcoin::ScriptBuf::from_bytes(redeem_script_bytes);

    let psbt_input = &psbt.inputs[input_index];
    let prev_value = psbt_input
        .witness_utxo
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Missing witness UTXO for input {}", input_index))?
        .value;

    let tx = psbt.clone().extract_tx_unchecked_fee_rate();

    let mut sighash_cache = SighashCache::new(&tx);
    let sighash = sighash_cache
        .p2wsh_signature_hash(
            input_index,
            &redeem_script,
            prev_value,
            EcdsaSighashType::All,
        )
        .context("Failed to compute sighash")?;

    let output = serde_json::json!({
        "sighash_hex": hex::encode(sighash.as_byte_array()),
        "message_hex": hex::encode(sighash.as_byte_array()),
        "input_index": input_index,
        "sighash_type": "SIGHASH_ALL",
    });

    Ok(output)
}
