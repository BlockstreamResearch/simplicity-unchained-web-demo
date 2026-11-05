use anyhow::{Context, Result, ensure};
use elements::bitcoin::{
    TapSighashType,
    hashes::Hash,
    psbt::Psbt,
    sighash::{Prevouts, SighashCache},
    taproot::LeafVersion,
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
pub struct SighashPsbtRequest {
    pub psbt_hex: String,
    pub input_index: usize,
}

#[wasm_bindgen]
pub fn sighash_psbt(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: SighashPsbtRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {e}")))?;
    let result = execute(&request.psbt_hex, request.input_index)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {e}")))
}

pub fn signing_hash(psbt: &Psbt, input_index: usize) -> Result<[u8; 32]> {
    let input = psbt
        .inputs
        .get(input_index)
        .context("PSBT input index out of bounds")?;
    let (_, script) = crate::taproot::bitcoin_cooperative_leaf(input)?;
    ensure!(
        psbt.unsigned_tx.input[input_index].script_sig.is_empty(),
        "Expected an empty scriptSig"
    );
    let prevouts = psbt
        .inputs
        .iter()
        .map(|input| input.witness_utxo.clone().context("Missing witness UTXO"))
        .collect::<Result<Vec<_>>>()?;
    let tx = &psbt.unsigned_tx;
    let hash = SighashCache::new(tx).taproot_script_spend_signature_hash(
        input_index,
        &Prevouts::All(&prevouts),
        elements::bitcoin::TapLeafHash::from_script(script, LeafVersion::TapScript),
        TapSighashType::Default,
    )?;
    Ok(hash.to_byte_array())
}

pub fn execute(psbt_hex: &str, input_index: usize) -> Result<serde_json::Value> {
    let psbt = Psbt::deserialize(&hex::decode(psbt_hex)?)?;
    let hash = signing_hash(&psbt, input_index)?;
    Ok(serde_json::json!({
        "sighash_hex": hex::encode(hash),
        "message_hex": hex::encode(hash),
        "input_index": input_index,
        "sighash_type": "SIGHASH_DEFAULT",
    }))
}
