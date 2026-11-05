use anyhow::{Context, Result, ensure};
use elements::bitcoin::{
    consensus::serialize,
    hashes::{Hash, HashEngine, sha256},
    psbt::Psbt,
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Clone, Deserialize)]
pub struct ApprovalHashRequest {
    pub psbt_hex: String,
    pub input_index: usize,
    pub cmr_hex: String,
    pub redeem_script_hex: String,
    pub network: String,
}

fn tagged_hash(tag: &[u8], parts: &[&[u8]]) -> [u8; 32] {
    let tag = sha256::Hash::hash(tag);
    let mut engine = sha256::Hash::engine();
    engine.input(tag.as_byte_array());
    engine.input(tag.as_byte_array());
    for part in parts {
        engine.input(part);
    }
    sha256::Hash::from_engine(engine).to_byte_array()
}

pub fn execute(request: &ApprovalHashRequest) -> Result<serde_json::Value> {
    let psbt = Psbt::deserialize(&hex::decode(&request.psbt_hex)?)?;
    let cmr: [u8; 32] = hex::decode(&request.cmr_hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("CMR must be 32 bytes"))?;
    let script = hex::decode(&request.redeem_script_hex)?;
    ensure!(
        psbt.inputs.len() == psbt.unsigned_tx.input.len(),
        "PSBT input count mismatch"
    );
    ensure!(
        request.input_index < psbt.inputs.len(),
        "PSBT input index out of bounds"
    );
    let input_index = u32::try_from(request.input_index)?;
    let prevouts = psbt
        .inputs
        .iter()
        .enumerate()
        .map(|(index, input)| {
            input
                .witness_utxo
                .clone()
                .with_context(|| format!("Input {index} missing witness UTXO"))
        })
        .collect::<Result<Vec<_>>>()?;
    let network_id = match request.network.as_str() {
        "bitcoin" => 0,
        "testnet" => 1,
        "testnet4" => 2,
        _ => anyhow::bail!("Unsupported Bitcoin network: {}", request.network),
    };
    let commitment = tagged_hash(
        b"SimplicityUnchained/SigningCommitment/v1",
        &[&cmr, sha256::Hash::hash(&script).as_byte_array()],
    );
    let digest = tagged_hash(
        b"SimplicityUnchained/BitcoinApproval/v1",
        &[
            &[network_id],
            &input_index.to_be_bytes(),
            &commitment,
            sha256::Hash::hash(&serialize(&psbt.unsigned_tx)).as_byte_array(),
            sha256::Hash::hash(&serialize(&prevouts)).as_byte_array(),
        ],
    );
    Ok(serde_json::json!({
        "approval_hash_hex": hex::encode(digest),
        "cmr_hex": hex::encode(cmr),
    }))
}

#[wasm_bindgen]
pub fn bitcoin_approval_hash(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {e}")))?;
    let result = execute(&request).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {e}")))
}
