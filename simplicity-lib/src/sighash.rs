use anyhow::{Context, Result, ensure};
use elements::{
    SchnorrSighashType,
    encode::deserialize,
    pset::PartiallySignedTransaction,
    sighash::{Prevouts, SighashCache},
    taproot::LeafVersion,
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
pub struct SighashPsetRequest {
    pub pset_hex: String,
    pub input_index: usize,
    pub network: String,
}

#[wasm_bindgen]
pub fn sighash_pset(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: SighashPsetRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {e}")))?;
    let result = execute(&request.pset_hex, request.input_index, &request.network)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {e}")))
}

pub fn signing_hash(
    pset: &PartiallySignedTransaction,
    input_index: usize,
    network: &str,
) -> Result<[u8; 32]> {
    let input = pset
        .inputs()
        .get(input_index)
        .context("PSET input index out of bounds")?;
    let (_, script) = crate::taproot::elements_cooperative_leaf(input)?;
    let prevouts = pset
        .inputs()
        .iter()
        .map(|input| input.witness_utxo.clone().context("Missing witness UTXO"))
        .collect::<Result<Vec<_>>>()?;
    let tx = pset.extract_tx()?;
    ensure!(
        tx.input[input_index].script_sig.is_empty(),
        "Expected an empty scriptSig"
    );
    let hash = SighashCache::new(&tx).taproot_script_spend_signature_hash(
        input_index,
        &Prevouts::All(&prevouts),
        elements::taproot::TapLeafHash::from_script(script, LeafVersion::default()),
        SchnorrSighashType::Default,
        crate::taproot::elements_genesis(network)?,
    )?;
    Ok(hash.to_byte_array())
}

pub fn execute(pset_hex: &str, input_index: usize, network: &str) -> Result<serde_json::Value> {
    let pset: PartiallySignedTransaction = deserialize(&hex::decode(pset_hex)?)?;
    let hash = signing_hash(&pset, input_index, network)?;
    Ok(serde_json::json!({
        "sighash_hex": hex::encode(hash),
        "message_hex": hex::encode(hash),
        "input_index": input_index,
        "sighash_type": "SIGHASH_DEFAULT",
    }))
}
