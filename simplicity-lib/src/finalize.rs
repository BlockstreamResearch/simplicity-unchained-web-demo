use anyhow::{Context, Result, ensure};
use elements::{
    SchnorrSig, SchnorrSighashType,
    bitcoin::PublicKey,
    encode::{deserialize, serialize},
    pset::PartiallySignedTransaction,
    secp256k1_zkp::{Message, Secp256k1, schnorr::Signature},
    taproot::TapLeafHash,
};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
pub struct FinalizeRequest {
    pub pset_hex: String,
    pub input_index: usize,
    pub signature_hex: String,
    pub public_key_hex: String,
    pub network: String,
}

#[wasm_bindgen]
pub fn finalize_pset(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: FinalizeRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {e}")))?;
    let result = execute(&request).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {e}")))
}

pub fn execute(request: &FinalizeRequest) -> Result<serde_json::Value> {
    let mut pset: PartiallySignedTransaction = deserialize(&hex::decode(&request.pset_hex)?)?;
    let signature = Signature::from_slice(&hex::decode(&request.signature_hex)?)?;
    let key = PublicKey::from_slice(&hex::decode(&request.public_key_hex)?)?
        .inner
        .x_only_public_key()
        .0;
    let input = pset
        .inputs_mut()
        .get_mut(request.input_index)
        .context("PSET input index out of bounds")?;
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
        SchnorrSig {
            sig: signature,
            hash_ty: SchnorrSighashType::Default,
        },
    );
    let mut tx = pset.extract_tx()?;
    for (i, input) in pset.inputs().iter().enumerate() {
        let hash = crate::sighash::signing_hash(&pset, i, &request.network)?;
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
                sig.hash_ty == SchnorrSighashType::Default,
                "Expected SIGHASH_DEFAULT"
            );
            Secp256k1::verification_only().verify_schnorr(
                &sig.sig,
                &Message::from_digest(hash),
                key,
            )?;
        }
        tx.input[i].witness.script_witness = vec![
            user.to_vec(),
            service.to_vec(),
            script.to_bytes(),
            control.serialize(),
        ]
        .into();
    }
    Ok(serde_json::json!({
        "transaction_hex": hex::encode(serialize(&tx)), "txid": tx.txid().to_string(),
        "inputs": tx.input.len(), "outputs": tx.output.len(), "finalized": true,
        "witnesses": tx.input.iter().enumerate().map(|(i, input)| serde_json::json!({
            "input_index": i, "witness_elements": input.witness.script_witness.len(),
        })).collect::<Vec<_>>(),
    }))
}
