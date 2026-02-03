use elements::bitcoin::{
    self, Address, Amount, Network, OutPoint, ScriptBuf, Transaction, TxIn, TxOut, psbt::Psbt,
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
pub struct UtxoData {
    pub value: u64,
    pub scriptpubkey: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePsbtRequest {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
    pub utxos: Vec<UtxoData>, // UTXO data for each input (fetched by caller)
    pub network: String,
}

#[derive(Debug, Serialize)]
pub struct CreatePsbtResponse {
    pub psbt: String,
    pub inputs: usize,
    pub outputs: usize,
    pub network: String,
}

fn get_network_kind(network: &str) -> Result<Network, String> {
    match network {
        "bitcoin" => Ok(Network::Bitcoin),
        "testnet" => Ok(Network::Testnet),
        "testnet4" => Ok(Network::Testnet4),
        _ => Err(format!(
            "Unsupported network '{}'. Supported networks are: bitcoin, testnet, testnet4.",
            network
        )),
    }
}

#[wasm_bindgen]
pub fn create_psbt(request_json: JsValue) -> Result<JsValue, JsValue> {
    let req: CreatePsbtRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    let network_type = get_network_kind(&req.network).map_err(|e| JsValue::from_str(&e))?;

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

        let txid = bitcoin::Txid::from_str(parts[0])
            .map_err(|e| JsValue::from_str(&format!("Invalid txid {}: {}", parts[0], e)))?;
        let vout: u32 = parts[1]
            .parse()
            .map_err(|e| JsValue::from_str(&format!("Invalid vout {}: {}", parts[1], e)))?;

        tx_inputs.push(TxIn {
            previous_output: OutPoint::new(txid, vout),
            script_sig: ScriptBuf::new(),
            sequence: bitcoin::Sequence::MAX,
            witness: Default::default(),
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

        let address = Address::from_str(parts[0])
            .map_err(|e| JsValue::from_str(&format!("Invalid address {}: {}", parts[0], e)))?
            .require_network(network_type)
            .map_err(|e| {
                JsValue::from_str(&format!(
                    "Address {} is not valid for network {}: {}",
                    parts[0], req.network, e
                ))
            })?;

        tx_outputs.push(TxOut {
            value: Amount::from_sat(value),
            script_pubkey: address.script_pubkey(),
        });
    }

    let tx = Transaction {
        version: bitcoin::transaction::Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: tx_inputs,
        output: tx_outputs,
    };

    let mut psbt = Psbt::from_unsigned_tx(tx)
        .map_err(|e| JsValue::from_str(&format!("Failed to create PSBT: {}", e)))?;

    // Populate witness UTXO for each input from provided UTXO data
    for (i, utxo_data) in req.utxos.iter().enumerate() {
        let script_bytes = hex::decode(&utxo_data.scriptpubkey).map_err(|e| {
            JsValue::from_str(&format!("Invalid scriptpubkey hex for input {}: {}", i, e))
        })?;

        let prev_output = TxOut {
            value: Amount::from_sat(utxo_data.value),
            script_pubkey: ScriptBuf::from_bytes(script_bytes),
        };

        psbt.inputs[i].witness_utxo = Some(prev_output);
    }

    let response = CreatePsbtResponse {
        psbt: hex::encode(psbt.serialize()),
        inputs: psbt.inputs.len(),
        outputs: psbt.outputs.len(),
        network: req.network.clone(),
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))
}
