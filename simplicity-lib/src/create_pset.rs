use elements::{
    Address, AddressParams, AssetId, OutPoint, Transaction, TxIn, TxOut, confidential,
    encode::serialize, pset::PartiallySignedTransaction,
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
pub struct UtxoData {
    pub asset: String,
    pub value: u64,
    pub scriptpubkey: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePsetRequest {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
    pub utxos: Vec<UtxoData>, // UTXO data for each input (fetched by caller)
    pub asset_id: Option<String>,
    pub network: String,
}

#[derive(Debug, Serialize)]
pub struct CreatePsetResponse {
    pub pset: String,
    pub inputs: usize,
    pub outputs: usize,
    pub network: String,
    pub asset: String,
}

fn get_network_params(network: &str) -> Result<&'static AddressParams, String> {
    match network {
        "elements" => Ok(&AddressParams::ELEMENTS),
        "liquid" => Ok(&AddressParams::LIQUID),
        "liquid_testnet" => Ok(&AddressParams::LIQUID_TESTNET),
        _ => Err(format!(
            "Unsupported network '{}'. Supported networks are: elements, liquid, liquid_testnet.",
            network
        )),
    }
}

fn get_default_asset(network: &str) -> &'static str {
    match network {
        "liquid" => "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d",
        "liquid_testnet" => "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
        _ => "0000000000000000000000000000000000000000000000000000000000000000",
    }
}

#[wasm_bindgen]
pub fn create_pset(request_json: JsValue) -> Result<JsValue, JsValue> {
    let req: CreatePsetRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    let params = get_network_params(&req.network).map_err(|e| JsValue::from_str(&e))?;

    let asset = if let Some(asset_str) = &req.asset_id {
        AssetId::from_str(asset_str)
            .map_err(|e| JsValue::from_str(&format!("Invalid asset ID: {}", e)))?
    } else {
        AssetId::from_str(get_default_asset(&req.network))
            .map_err(|e| JsValue::from_str(&format!("Invalid default asset ID: {}", e)))?
    };

    // Validate inputs and UTXOs match
    if req.inputs.len() != req.utxos.len() {
        return Err(JsValue::from_str(&format!(
            "Inputs count ({}) does not match UTXOs count ({})",
            req.inputs.len(),
            req.utxos.len()
        )));
    }

    // Parse inputs (txid:vout)
    let mut tx_inputs = Vec::new();
    for input_str in &req.inputs {
        let parts: Vec<&str> = input_str.split(':').collect();
        if parts.len() != 2 {
            return Err(JsValue::from_str(&format!(
                "Invalid input format. Expected txid:vout, got: {}",
                input_str
            )));
        }

        let txid = elements::Txid::from_str(parts[0])
            .map_err(|e| JsValue::from_str(&format!("Invalid txid {}: {}", parts[0], e)))?;
        let vout: u32 = parts[1]
            .parse()
            .map_err(|e| JsValue::from_str(&format!("Invalid vout {}: {}", parts[1], e)))?;

        tx_inputs.push(TxIn {
            previous_output: OutPoint::new(txid, vout),
            is_pegin: false,
            script_sig: elements::script::Script::new(),
            sequence: elements::Sequence::MAX,
            asset_issuance: elements::AssetIssuance::default(),
            witness: elements::TxInWitness::default(),
        });
    }

    // Parse outputs (address:value)
    let mut tx_outputs = Vec::new();
    for output_str in &req.outputs {
        let parts: Vec<&str> = output_str.split(':').collect();
        if parts.len() != 2 {
            return Err(JsValue::from_str(&format!(
                "Invalid output format. Expected address:value, got: {}",
                output_str
            )));
        }

        let value: u64 = parts[1]
            .parse()
            .map_err(|e| JsValue::from_str(&format!("Invalid value {}: {}", parts[1], e)))?;

        let script_pubkey = match parts[0] {
            "fee" => elements::script::Script::new(),
            address_str => {
                let address = Address::parse_with_params(address_str, params).map_err(|e| {
                    JsValue::from_str(&format!("Invalid address {}: {}", address_str, e))
                })?;
                address.script_pubkey()
            }
        };

        tx_outputs.push(TxOut {
            asset: confidential::Asset::Explicit(asset),
            value: confidential::Value::Explicit(value),
            nonce: confidential::Nonce::Null,
            script_pubkey,
            witness: elements::TxOutWitness::default(),
        });
    }

    let tx = Transaction {
        version: 2,
        lock_time: elements::LockTime::ZERO,
        input: tx_inputs,
        output: tx_outputs,
    };

    let mut pset = PartiallySignedTransaction::from_tx(tx);

    // Populate witness UTXO for each input from provided UTXO data
    for (i, utxo_data) in req.utxos.iter().enumerate() {
        let asset_id = AssetId::from_str(&utxo_data.asset)
            .map_err(|e| JsValue::from_str(&format!("Invalid asset ID for input {}: {}", i, e)))?;

        let script_bytes = hex::decode(&utxo_data.scriptpubkey).map_err(|e| {
            JsValue::from_str(&format!("Invalid scriptpubkey hex for input {}: {}", i, e))
        })?;

        let prev_output = TxOut {
            asset: confidential::Asset::Explicit(asset_id),
            value: confidential::Value::Explicit(utxo_data.value),
            nonce: confidential::Nonce::Null,
            script_pubkey: elements::script::Script::from(script_bytes),
            witness: elements::TxOutWitness::default(),
        };

        pset.inputs_mut()[i].witness_utxo = Some(prev_output);
    }

    let response = CreatePsetResponse {
        pset: hex::encode(serialize(&pset)),
        inputs: pset.inputs().len(),
        outputs: pset.outputs().len(),
        network: req.network.clone(),
        asset: asset.to_string(),
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))
}
