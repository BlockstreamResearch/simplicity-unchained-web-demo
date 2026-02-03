use anyhow::{Context, Result};
use wasm_bindgen::prelude::*;
use elements::{
    bitcoin::PublicKey,
    encode::{deserialize, serialize},
    pset::PartiallySignedTransaction,
    script::Script,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct FinalizeRequest {
    pub pset_hex: String,
    pub redeem_script_hex: String,
    pub input_index: usize,
    pub signature_hex: String,
    pub public_key_hex: String,
}

#[wasm_bindgen]
pub fn finalize_pset(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: FinalizeRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    match execute(
        &request.pset_hex,
        &request.redeem_script_hex,
        request.input_index,
        &request.signature_hex,
        &request.public_key_hex,
    ) {
        Ok(output) => serde_wasm_bindgen::to_value(&output)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e))),
        Err(e) => Err(JsValue::from_str(&e.to_string())),
    }
}

pub fn execute(
    pset_hex: &str,
    redeem_script_hex: &str,
    input_index: usize,
    signature_hex: &str,
    public_key_hex: &str,
) -> Result<serde_json::Value> {
    let pset_bytes = hex::decode(pset_hex).context("Failed to decode PSET hex")?;
    let mut pset: PartiallySignedTransaction =
        deserialize(&pset_bytes).context("Failed to deserialize PSET")?;

    if input_index >= pset.inputs().len() {
        return Err(anyhow::anyhow!(
            "Input index {} out of bounds (PSET has {} inputs)",
            input_index,
            pset.inputs().len()
        ));
    }

    let public_key_bytes =
        hex::decode(public_key_hex).context("Failed to decode public key hex")?;
    let public_key = PublicKey::from_slice(&public_key_bytes).context("Invalid public key")?;

    let sig_bytes = hex::decode(signature_hex).context("Failed to decode signature hex")?;

    let redeem_script_bytes =
        hex::decode(redeem_script_hex).context("Failed to decode redeem script hex")?;
    let redeem_script = Script::from(redeem_script_bytes);

    let input = &mut pset.inputs_mut()[input_index];
    input.partial_sigs.insert(public_key, sig_bytes);

    if input.witness_script.is_none() {
        input.witness_script = Some(redeem_script);
    }

    let mut tx = pset
        .extract_tx()
        .context("Failed to extract transaction from PSET")?;

    for (i, input) in pset.inputs().iter().enumerate() {
        if input.partial_sigs.is_empty() {
            return Err(anyhow::anyhow!("Input {} has no partial signatures", i));
        }

        let witness_script = input
            .witness_script
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Input {} missing witness script", i))?;

        if input.partial_sigs.len() < 2 {
            return Err(anyhow::anyhow!(
                "Input {} requires 2 signatures but only has {}",
                i,
                input.partial_sigs.len()
            ));
        }

        let script_bytes = witness_script.as_bytes();
        let mut pubkeys = Vec::new();
        let mut i_byte = 0;
        while i_byte < script_bytes.len() {
            if script_bytes[i_byte] == 33 {
                if i_byte + 33 < script_bytes.len() {
                    let pk_bytes = &script_bytes[i_byte + 1..i_byte + 34];
                    if let Ok(pk) = PublicKey::from_slice(pk_bytes) {
                        pubkeys.push(pk);
                    }
                    i_byte += 34;
                } else {
                    break;
                }
            } else {
                i_byte += 1;
            }
        }

        if pubkeys.len() != 2 {
            return Err(anyhow::anyhow!(
                "Input {} witness script does not contain exactly 2 public keys",
                i
            ));
        }

        let sig1 = input
            .partial_sigs
            .get(&pubkeys[0])
            .ok_or_else(|| anyhow::anyhow!("Missing signature for first public key"))?;
        let sig2 = input
            .partial_sigs
            .get(&pubkeys[1])
            .ok_or_else(|| anyhow::anyhow!("Missing signature for second public key"))?;

        tx.input[i].witness.script_witness = vec![
            vec![],
            sig1.clone(),
            sig2.clone(),
            witness_script.to_bytes(),
        ];
    }

    let all_finalized = tx
        .input
        .iter()
        .all(|input| !input.witness.script_witness.is_empty());

    if !all_finalized {
        return Err(anyhow::anyhow!(
            "Not all inputs are finalized - transaction may be missing signatures"
        ));
    }

    let witnesses: Vec<_> = tx
        .input
        .iter()
        .enumerate()
        .map(|(idx, input)| {
            serde_json::json!({
                "input_index": idx,
                "witness_elements": input.witness.script_witness.len()
            })
        })
        .collect();

    let output = serde_json::json!({
        "transaction_hex": hex::encode(serialize(&tx)),
        "txid": tx.txid().to_string(),
        "inputs": tx.input.len(),
        "outputs": tx.output.len(),
        "finalized": true,
        "witnesses": witnesses
    });

    Ok(output)
}
