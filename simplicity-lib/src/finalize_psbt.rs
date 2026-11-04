use anyhow::{Context, Result, ensure};
use elements::bitcoin::{
    self, PublicKey, TapLeafHash, TapSighashType,
    psbt::Psbt,
    secp256k1::{Message, Secp256k1, schnorr::Signature},
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
pub struct FinalizePsbtRequest {
    pub psbt_hex: String,
    pub input_index: usize,
    pub signature_hex: String,
    pub public_key_hex: String,
}

#[wasm_bindgen]
pub fn finalize_psbt(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: FinalizePsbtRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {e}")))?;
    let result = execute(&request).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {e}")))
}

pub fn execute(request: &FinalizePsbtRequest) -> Result<serde_json::Value> {
    let mut psbt = Psbt::deserialize(&hex::decode(&request.psbt_hex)?)?;
    let signature = Signature::from_slice(&hex::decode(&request.signature_hex)?)?;
    let key = PublicKey::from_slice(&hex::decode(&request.public_key_hex)?)?
        .inner
        .x_only_public_key()
        .0;
    let input = psbt
        .inputs
        .get_mut(request.input_index)
        .context("PSBT input index out of bounds")?;
    ensure!(
        input.tap_scripts.len() == 1,
        "Expected one cooperative taproot leaf"
    );
    let (_, (script, version)) = input
        .tap_scripts
        .iter()
        .next()
        .context("Missing tap_scripts")?;
    let keys = crate::taproot::multisig_keys(script.as_bytes())?;
    ensure!(
        key == keys[1],
        "Cosign key does not match the user key in the Taproot leaf"
    );
    let leaf_hash = TapLeafHash::from_script(script, *version);
    input.tap_script_sigs.insert(
        (key, leaf_hash),
        bitcoin::taproot::Signature {
            signature,
            sighash_type: TapSighashType::Default,
        },
    );
    let mut tx = psbt.clone().extract_tx_unchecked_fee_rate();
    for (i, input) in psbt.inputs.iter().enumerate() {
        let hash = crate::sighash_psbt::signing_hash(&psbt, i)?;
        let (control, (script, version)) = input
            .tap_scripts
            .iter()
            .next()
            .context("Missing tap_scripts")?;
        let keys = crate::taproot::multisig_keys(script.as_bytes())?;
        let leaf_hash = TapLeafHash::from_script(script, *version);
        let service = input
            .tap_script_sigs
            .get(&(keys[0], leaf_hash))
            .context("Missing oracle signature")?;
        let user = input
            .tap_script_sigs
            .get(&(keys[1], leaf_hash))
            .context("Missing user signature")?;
        for (key, sig) in keys.iter().zip([service, user]) {
            ensure!(
                sig.sighash_type == TapSighashType::Default,
                "Expected SIGHASH_DEFAULT"
            );
            Secp256k1::verification_only().verify_schnorr(
                &sig.signature,
                &Message::from_digest(hash),
                key,
            )?;
        }
        tx.input[i].witness = bitcoin::Witness::from_slice(&[
            user.to_vec(),
            service.to_vec(),
            script.to_bytes(),
            control.serialize(),
        ]);
    }
    Ok(serde_json::json!({
        "transaction_hex": hex::encode(bitcoin::consensus::serialize(&tx)),
        "txid": tx.compute_txid().to_string(),
        "inputs": tx.input.len(), "outputs": tx.output.len(), "finalized": true,
        "witnesses": tx.input.iter().enumerate().map(|(i, input)| serde_json::json!({
            "input_index": i, "witness_elements": input.witness.len(),
        })).collect::<Vec<_>>(),
    }))
}
