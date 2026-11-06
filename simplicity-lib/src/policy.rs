//! Browser-facing policy helpers. Context and approval digests are computed locally, not trusted
//! from HTTP responses. These are the sole public transaction helpers.
use std::{collections::HashSet, str::FromStr};

use anyhow::{Context as _, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use simplicity_unchained_policy::{
    Context, PROFILE_NAME, bitcoin, genesis_hash, manifest, profile_hash, signing_commitment,
    tweak_public_key,
};
use wasm_bindgen::prelude::*;

use bitcoin::{
    Address, Network, PublicKey, TapNodeHash, Transaction, XOnlyPublicKey,
    hashes::Hash,
    psbt::Psbt,
    secp256k1::{Message, Secp256k1, schnorr::Signature},
};

fn network(name: &str) -> Result<Network> {
    match name {
        "bitcoin" => Ok(Network::Bitcoin),
        "testnet" => Ok(Network::Testnet),
        "testnet4" => Ok(Network::Testnet4),
        _ => anyhow::bail!("Unsupported policy network: {name}"),
    }
}

fn xonly(hex: &str) -> Result<XOnlyPublicKey> {
    match hex.len() {
        64 => Ok(XOnlyPublicKey::from_str(hex)?),
        66 => {
            let key = PublicKey::from_str(hex)?;
            ensure!(key.compressed, "Expected a compressed or x-only public key");
            Ok(key.inner.x_only_public_key().0)
        }
        _ => anyhow::bail!("Expected a compressed or x-only public key"),
    }
}

fn hash32(hex: &str) -> Result<[u8; 32]> {
    hex::decode(hex)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("Expected an exact 32-byte hash"))
}

fn decode_psbt(hex: &str) -> Result<Psbt> {
    ensure!(
        hex.len() <= simplicity_unchained_policy::MAX_REQUEST_BYTES * 2,
        "PSBT exceeds the policy evidence limit"
    );
    Ok(Psbt::deserialize(&hex::decode(hex)?)?)
}

fn from_js<T: serde::de::DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value)
        .map_err(|e| JsValue::from_str(&format!("Invalid policy request: {e}")))
}

fn to_js(result: Result<Value>) -> Result<JsValue, JsValue> {
    result
        .map_err(|e| JsValue::from_str(&format!("{e:#}")))?
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&format!("Invalid policy response: {e}")))
}

#[wasm_bindgen]
pub fn policy_registry() -> Result<JsValue, JsValue> {
    to_js(Ok(registry()))
}

pub fn registry() -> Value {
    json!({
        "profile": PROFILE_NAME,
        "profile_hash": hex::encode(profile_hash()),
        "manifest": manifest(),
    })
}

#[derive(Clone, Debug, Deserialize)]
pub struct LocalTweakRequest {
    pub network: String,
    pub cmr_hex: String,
    pub redeem_script_hex: String,
    pub base_public_key_hex: String,
}

#[wasm_bindgen]
pub fn policy_local_tweak(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(local_tweak(&from_js(request)?))
}

pub fn local_tweak(request: &LocalTweakRequest) -> Result<Value> {
    let net = network(&request.network)?;
    let cmr = hash32(&request.cmr_hex)?;
    let script = hex::decode(&request.redeem_script_hex)?;
    let base = xonly(&request.base_public_key_hex)?;
    let key = tweak_public_key(base, cmr, &script, net)?;
    Ok(json!({
        "profile": PROFILE_NAME,
        "profile_hash": hex::encode(profile_hash()),
        "network": request.network,
        "genesis_hash": hex::encode(genesis_hash(net)?),
        "cmr": hex::encode(cmr),
        "signing_commitment": hex::encode(signing_commitment(cmr, &script, net)?),
        "public_key_hex": key.to_string(),
        "base_public_key_hex": base.to_string(),
    }))
}

#[derive(Clone, Debug, Deserialize)]
pub struct ContextRequest {
    pub psbt_hex: String,
    pub input_index: usize,
    pub cmr_hex: String,
    pub redeem_script_hex: String,
    pub network: String,
    pub base_public_key_hex: String,
    pub user_pubkey: String,
    pub user_leaf_hash_hex: String,
}

fn context_for(request: &ContextRequest, psbt: &Psbt, index: usize) -> Result<Context> {
    Ok(Context::new(
        psbt,
        index,
        hash32(&request.cmr_hex)?,
        &hex::decode(&request.redeem_script_hex)?,
        network(&request.network)?,
        xonly(&request.base_public_key_hex)?,
        xonly(&request.user_pubkey)?,
        TapNodeHash::from_byte_array(hash32(&request.user_leaf_hash_hex)?),
    )?)
}

#[wasm_bindgen]
pub fn policy_context(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(prepare_context(&from_js(request)?))
}

pub fn prepare_context(request: &ContextRequest) -> Result<Value> {
    let psbt = decode_psbt(&request.psbt_hex)?;
    let context = context_for(request, &psbt, request.input_index)?;
    let net = network(&request.network)?;
    Ok(json!({
        "context": context.summary(),
        "outputs": psbt.unsigned_tx.output.iter().enumerate().map(|(index, output)| json!({
            "index": index,
            "value_sat": output.value.to_sat(),
            "script_pubkey_hex": hex::encode(output.script_pubkey.as_bytes()),
            "address": Address::from_script(&output.script_pubkey, net).ok().map(|a| a.to_string()),
        })).collect::<Vec<_>>(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct ProvenInput {
    pub txid: String,
    pub vout: u32,
    pub parent_tx_hex: String,
    #[serde(default = "default_sequence")]
    pub sequence: u32,
}

fn default_sequence() -> u32 {
    0xffff_fffd
}

#[derive(Debug, Deserialize)]
pub struct PolicyOutput {
    pub address: String,
    pub value_sat: u64,
}

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    pub inputs: Vec<ProvenInput>,
    pub outputs: Vec<PolicyOutput>,
    pub network: String,
    #[serde(default)]
    pub lock_time: u32,
}

#[wasm_bindgen]
pub fn policy_create_psbt(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(create_psbt(&from_js(request)?))
}

pub fn create_psbt(request: &CreateRequest) -> Result<Value> {
    let net = network(&request.network)?;
    ensure!(
        (1..=8).contains(&request.inputs.len()) && (1..=8).contains(&request.outputs.len()),
        "Policy transactions require 1..=8 inputs and outputs"
    );
    let mut outpoints = HashSet::new();
    let mut parents = Vec::new();
    let mut tx_inputs = Vec::new();
    let mut evidence_bytes = 0usize;
    for input in &request.inputs {
        evidence_bytes = evidence_bytes
            .checked_add(input.parent_tx_hex.len() / 2)
            .context("Parent evidence size overflow")?;
        ensure!(
            evidence_bytes <= simplicity_unchained_policy::MAX_REQUEST_BYTES,
            "Parent evidence exceeds the policy limit"
        );
        let parent: Transaction =
            bitcoin::consensus::deserialize(&hex::decode(&input.parent_tx_hex)?)?;
        let txid = bitcoin::Txid::from_str(&input.txid)?;
        ensure!(
            parent.compute_txid() == txid,
            "Parent transaction content does not match the requested txid"
        );
        let output = parent
            .output
            .get(input.vout as usize)
            .context("Parent output index is out of bounds")?
            .clone();
        ensure!(
            output.value.to_sat() <= simplicity_unchained_policy::MAX_MONEY,
            "Parent output exceeds Bitcoin's money range"
        );
        let outpoint = bitcoin::OutPoint::new(txid, input.vout);
        ensure!(outpoints.insert(outpoint), "Duplicate funding outpoint");
        tx_inputs.push(bitcoin::TxIn {
            previous_output: outpoint,
            sequence: bitcoin::Sequence(input.sequence),
            ..Default::default()
        });
        parents.push((parent, output));
    }
    let outputs = request
        .outputs
        .iter()
        .map(|output| {
            ensure!(
                output.value_sat <= simplicity_unchained_policy::MAX_MONEY,
                "Output exceeds Bitcoin's money range"
            );
            Ok(bitcoin::TxOut {
                value: bitcoin::Amount::from_sat(output.value_sat),
                script_pubkey: Address::from_str(&output.address)?
                    .require_network(net)?
                    .script_pubkey(),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let mut psbt = Psbt::from_unsigned_tx(Transaction {
        version: bitcoin::transaction::Version::TWO,
        lock_time: bitcoin::absolute::LockTime::from_consensus(request.lock_time),
        input: tx_inputs,
        output: outputs,
    })?;
    for (input, (parent, output)) in psbt.inputs.iter_mut().zip(parents) {
        input.non_witness_utxo = Some(parent);
        input.witness_utxo = Some(output);
    }
    ensure!(
        psbt.serialize().len() <= simplicity_unchained_policy::MAX_REQUEST_BYTES,
        "PSBT evidence exceeds the policy limit"
    );
    Ok(json!({ "psbt_hex": hex::encode(psbt.serialize()) }))
}

#[derive(Clone, Debug, Deserialize)]
pub struct VerifyRequest {
    pub prepared: ContextRequest,
    pub signed_psbt_hex: String,
    pub signature_hex: String,
    pub public_key_hex: String,
}

fn verify_input(context: &Context, psbt: &Psbt, index: usize) -> Result<Signature> {
    let input = psbt
        .inputs
        .get(index)
        .context("Input index out of bounds")?;
    let (control, script) = crate::taproot::bitcoin_cooperative_leaf(input)?;
    ensure!(
        script.as_bytes() == context.cooperative_script().as_bytes()
            && control == context.control_block(),
        "Service returned a different cooperative leaf or control block"
    );
    let leaf = bitcoin::TapLeafHash::from_script(script, bitcoin::taproot::LeafVersion::TapScript);
    let signature = input
        .tap_script_sigs
        .get(&(context.service_pubkey(), leaf))
        .context("Missing service signature for the actual cooperative leaf")?;
    ensure!(
        signature.sighash_type == bitcoin::TapSighashType::Default,
        "Service must use SIGHASH_DEFAULT"
    );
    Secp256k1::verification_only().verify_schnorr(
        &signature.signature,
        &Message::from_digest(context.cooperative_sighash_default()),
        &context.service_pubkey(),
    )?;
    Ok(signature.signature)
}

#[wasm_bindgen]
pub fn policy_verify_signed_psbt(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(verify_signed_psbt(&from_js(request)?))
}

pub fn verify_signed_psbt(request: &VerifyRequest) -> Result<Value> {
    let original = decode_psbt(&request.prepared.psbt_hex)?;
    let signed = decode_psbt(&request.signed_psbt_hex)?;
    ensure!(
        original.unsigned_tx == signed.unsigned_tx,
        "Service changed the approved transaction"
    );
    let index = request.prepared.input_index;
    let before = context_for(&request.prepared, &original, index)?;
    let after = context_for(&request.prepared, &signed, index)?;
    ensure!(
        serde_json::to_value(before.summary())? == serde_json::to_value(after.summary())?,
        "Service changed the locally verified policy context"
    );
    ensure!(
        xonly(&request.public_key_hex)? == before.service_pubkey(),
        "Service public key does not match the locally derived policy key"
    );
    let actual = verify_input(&after, &signed, index)?;
    ensure!(
        actual == Signature::from_slice(&hex::decode(&request.signature_hex)?)?,
        "Service response signature differs from the PSBT signature"
    );
    Ok(json!({ "verified": true, "context": after.summary() }))
}

#[derive(Debug, Deserialize)]
pub struct UserSignature {
    pub input_index: usize,
    pub signature_hex: String,
    pub public_key_hex: String,
}

#[derive(Debug, Deserialize)]
pub struct FinalizeRequest {
    pub prepared: ContextRequest,
    pub signed_psbt_hex: String,
    pub signatures: Vec<UserSignature>,
}

#[wasm_bindgen]
pub fn policy_finalize_psbt(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(finalize_psbt(&from_js(request)?))
}

pub fn finalize_psbt(request: &FinalizeRequest) -> Result<Value> {
    let original = decode_psbt(&request.prepared.psbt_hex)?;
    let mut signed = decode_psbt(&request.signed_psbt_hex)?;
    ensure!(
        original.unsigned_tx == signed.unsigned_tx,
        "Service changed the approved transaction"
    );
    ensure!(
        request.signatures.len() == original.inputs.len(),
        "Provide a fresh user signature for every policy input"
    );
    let mut seen = HashSet::new();
    for user in &request.signatures {
        let index = user.input_index;
        ensure!(seen.insert(index), "Duplicate input signature");
        let before = context_for(&request.prepared, &original, index)?;
        let after = context_for(&request.prepared, &signed, index)?;
        ensure!(
            serde_json::to_value(before.summary())? == serde_json::to_value(after.summary())?,
            "Service changed the locally verified policy context"
        );
        verify_input(&after, &signed, index)?;
        ensure!(
            xonly(&user.public_key_hex)? == before.user_pubkey(),
            "User signing key does not match the committed cooperative leaf"
        );
        let signature = Signature::from_slice(&hex::decode(&user.signature_hex)?)?;
        Secp256k1::verification_only().verify_schnorr(
            &signature,
            &Message::from_digest(before.cooperative_sighash_default()),
            &before.user_pubkey(),
        )?;
        let leaf = bitcoin::TapLeafHash::from_script(
            before.cooperative_script(),
            bitcoin::taproot::LeafVersion::TapScript,
        );
        signed.inputs[index].tap_script_sigs.insert(
            (before.user_pubkey(), leaf),
            bitcoin::taproot::Signature {
                signature,
                sighash_type: bitcoin::TapSighashType::Default,
            },
        );
    }
    let last = request.signatures.last().context("Missing signatures")?;
    let key = xonly(&last.public_key_hex)?;
    crate::finalize_psbt::execute(&crate::finalize_psbt::FinalizePsbtRequest {
        psbt_hex: hex::encode(signed.serialize()),
        input_index: last.input_index,
        signature_hex: last.signature_hex.clone(),
        public_key_hex: format!("02{key}"),
    })
}
