//! Liquid browser APIs: receiving keys stay local, PSET disclosures are proof-verified.
use anyhow::{Context as _, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use simplicity_unchained_policy::liquid::{
    self as kernel, Context, Network,
    elements::{
        Address, SchnorrSig, SchnorrSighashType, Transaction,
        encode::{deserialize, serialize},
        pset::PartiallySignedTransaction as Pset,
        secp256k1_zkp::{
            Message, PublicKey, Secp256k1, SecretKey, XOnlyPublicKey, rand::rngs::OsRng,
            schnorr::Signature,
        },
        taproot::TapNodeHash,
    },
};
use std::{collections::HashSet, str::FromStr};
use wasm_bindgen::prelude::*;

fn from_js<T: serde::de::DeserializeOwned>(v: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(v)
        .map_err(|e| JsValue::from_str(&format!("invalid Liquid request: {e}")))
}
fn to_js(v: Result<Value>) -> Result<JsValue, JsValue> {
    let value = v.map_err(|e| JsValue::from_str(&format!("{e:#}")))?;
    safe_numbers(&value).map_err(|e| JsValue::from_str(&e.to_string()))?;
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
const MAX_JS_INTEGER: u64 = 9_007_199_254_740_991;
fn safe_numbers(v: &Value) -> Result<()> {
    match v {
        Value::Number(n) => ensure!(
            n.as_u64().is_none_or(|v| v <= MAX_JS_INTEGER),
            "amount/total exceeds JavaScript's safe integer range"
        ),
        Value::Array(a) => {
            for v in a {
                safe_numbers(v)?;
            }
        }
        Value::Object(o) => {
            for v in o.values() {
                safe_numbers(v)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn hash(h: &str) -> Result<[u8; 32]> {
    hex::decode(h)?
        .try_into()
        .map_err(|_| anyhow::anyhow!("expected exactly 32 bytes"))
}
fn key(h: &str) -> Result<XOnlyPublicKey> {
    match h.len() {
        64 => Ok(XOnlyPublicKey::from_str(h)?),
        66 => Ok(PublicKey::from_str(h)?.x_only_public_key().0),
        _ => anyhow::bail!("expected compressed/x-only key"),
    }
}
fn pset(h: &str) -> Result<Pset> {
    ensure!(
        h.len() <= simplicity_unchained_policy::MAX_REQUEST_BYTES * 2,
        "PSET exceeds 2 MiB"
    );
    Ok(deserialize(&hex::decode(h)?)?)
}

#[wasm_bindgen]
pub fn liquid_policy_registry() -> Result<JsValue, JsValue> {
    to_js(Ok(
        json!({"profile":kernel::PROFILE_NAME,"profile_hash":hex::encode(kernel::profile_hash()),"manifest":kernel::manifest()}),
    ))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TweakRequest {
    #[serde(default)]
    pub network: Network,
    pub cmr_hex: String,
    pub redeem_script_hex: String,
    pub base_public_key_hex: String,
}
pub fn local_tweak(r: &TweakRequest) -> Result<Value> {
    let cmr = hash(&r.cmr_hex)?;
    let data = hex::decode(&r.redeem_script_hex)?;
    let base = key(&r.base_public_key_hex)?;
    Ok(json!({
        "profile":kernel::PROFILE_NAME,"profile_hash":hex::encode(kernel::profile_hash()),"network":r.network.name(),
        "genesis_hash":hex::encode(r.network.genesis_hash().to_byte_array()),"cmr":hex::encode(cmr),
        "signing_commitment":hex::encode(kernel::signing_commitment(cmr,&data,r.network)?),
        "public_key_hex":kernel::tweak_public_key(base,cmr,&data,r.network)?.to_string(),"base_public_key_hex":base.to_string(),
    }))
}
#[wasm_bindgen]
pub fn liquid_policy_local_tweak(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(local_tweak(&from_js(request)?))
}

#[wasm_bindgen]
pub fn liquid_policy_generate_blinding_key() -> Result<JsValue, JsValue> {
    let secp = Secp256k1::new();
    let secret = SecretKey::new(&mut OsRng);
    to_js(Ok(
        json!({"blinding_secret_key_hex":hex::encode(secret.secret_bytes()),"blinding_public_key_hex":PublicKey::from_secret_key(&secp,&secret).to_string()}),
    ))
}

pub fn recovery_script(script: &str) -> Result<Value> {
    ensure!(
        script.len() <= simplicity_unchained_policy::MAX_REQUEST_BYTES,
        "human-readable recovery script exceeds request limit"
    );
    let normalized = script
        .split_whitespace()
        .map(|token| match token {
            "OP_CHECKSEQUENCEVERIFY" => "OP_CSV",
            "OP_CHECKLOCKTIMEVERIFY" => "OP_CLTV",
            other => other,
        })
        .collect::<Vec<_>>()
        .join(" ");
    let bytes = crate::converter::parse_human_readable(&normalized)?;
    ensure!(
        bytes.len() <= simplicity_unchained_policy::MAX_SCRIPT_BYTES,
        "recovery script exceeds 10000 bytes"
    );
    let script = kernel::elements::Script::from(bytes);
    let leaf = kernel::elements::taproot::TapLeafHash::from_script(
        &script,
        kernel::elements::taproot::LeafVersion::default(),
    );
    Ok(
        json!({"redeem_script_hex":hex::encode(script.as_bytes()),"user_leaf_hash_hex":hex::encode(leaf.to_byte_array())}),
    )
}
#[wasm_bindgen]
pub fn liquid_policy_recovery_script(script: &str) -> Result<JsValue, JsValue> {
    to_js(recovery_script(script))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AddressRequest {
    pub binding: TweakRequest,
    pub user_pubkey: String,
    pub user_leaf_hash_hex: String,
    pub blinding_public_key_hex: Option<String>,
}
pub fn address(r: &AddressRequest) -> Result<Value> {
    let output = kernel::cooperative_output(
        key(&r.binding.base_public_key_hex)?,
        hash(&r.binding.cmr_hex)?,
        &hex::decode(&r.binding.redeem_script_hex)?,
        r.binding.network,
        key(&r.user_pubkey)?,
        TapNodeHash::from_byte_array(hash(&r.user_leaf_hash_hex)?),
    )?;
    let blinding = r
        .blinding_public_key_hex
        .as_deref()
        .map(PublicKey::from_str)
        .transpose()?;
    let addr = Address::from_script(
        &output.script_pubkey,
        blinding,
        r.binding.network.address_params(),
    )
    .context("cannot encode funding address")?;
    let unconfidential = Address::from_script(
        &output.script_pubkey,
        None,
        r.binding.network.address_params(),
    )
    .context("cannot encode unconfidential funding address")?;
    Ok(
        json!({"address":addr.to_string(),"unconfidential_address":unconfidential.to_string(),"script_pubkey_hex":hex::encode(output.script_pubkey.as_bytes()),"service_pubkey":output.service_pubkey.to_string(),"cooperative_script_hex":hex::encode(output.script.as_bytes()),"control_block_hex":hex::encode(output.control_block.serialize()),"profile":kernel::PROFILE_NAME,"profile_hash":hex::encode(kernel::profile_hash()),"network":r.binding.network.name()}),
    )
}
#[wasm_bindgen]
pub fn liquid_policy_address(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(address(&from_js(request)?))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnblindRequest {
    pub parent_tx_hex: String,
    pub txid: String,
    pub vout: u32,
    pub blinding_secret_key_hex: Option<String>,
}
pub fn unblind(r: &UnblindRequest) -> Result<Value> {
    ensure!(
        r.parent_tx_hex.len() <= simplicity_unchained_policy::MAX_REQUEST_BYTES * 2,
        "parent exceeds evidence limit"
    );
    let parent: Transaction = deserialize(&hex::decode(&r.parent_tx_hex)?)?;
    ensure!(parent.txid().to_string() == r.txid, "parent txid mismatch");
    let out = parent
        .output
        .get(r.vout as usize)
        .context("parent vout out of bounds")?;
    let opening = kernel::unblind_output(out, r.blinding_secret_key_hex.as_deref())?;
    let proof = kernel::disclosure_proofs(out, opening)?;
    Ok(
        json!({"txid":r.txid,"vout":r.vout,"disclosure":proof,"script_pubkey_hex":hex::encode(out.script_pubkey.as_bytes()),"chain_status_verified":false}),
    )
}
#[wasm_bindgen]
pub fn liquid_policy_unblind_output(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(unblind(&from_js(request)?))
}
#[wasm_bindgen]
pub fn liquid_policy_create_pset(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(create_pset(&from_js(request)?))
}
pub fn create_pset(r: &kernel::CreateRequest) -> Result<Value> {
    ensure!(
        r.outputs.iter().all(|o| o.value_sat <= MAX_JS_INTEGER),
        "output exceeds JavaScript safe integer range"
    );
    let p = kernel::create_pset(r)?;
    ensure!(
        p.inputs()
            .iter()
            .all(|i| i.amount.is_none_or(|v| v <= MAX_JS_INTEGER)),
        "input exceeds JavaScript safe integer range"
    );
    let tx = p.extract_tx()?;
    Ok(
        json!({"pset_hex":hex::encode(serialize(&p)),"transaction_hex":hex::encode(serialize(&tx)),"txid":tx.txid().to_string(),"inputs":p.inputs().len(),"outputs":p.outputs().len(),"network":r.network.name()}),
    )
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextRequest {
    pub pset_hex: String,
    pub input_index: usize,
    pub cmr_hex: String,
    pub redeem_script_hex: String,
    #[serde(default)]
    pub network: Network,
    pub base_public_key_hex: String,
    pub user_pubkey: String,
    pub user_leaf_hash_hex: String,
}
fn context(r: &ContextRequest, p: &Pset, index: usize) -> Result<Context> {
    Ok(Context::new(
        p,
        index,
        hash(&r.cmr_hex)?,
        &hex::decode(&r.redeem_script_hex)?,
        r.network,
        key(&r.base_public_key_hex)?,
        key(&r.user_pubkey)?,
        TapNodeHash::from_byte_array(hash(&r.user_leaf_hash_hex)?),
    )?)
}
pub fn prepare_context(r: &ContextRequest) -> Result<Value> {
    Ok(json!({"context":context(r,&pset(&r.pset_hex)?,r.input_index)?.summary()}))
}
#[wasm_bindgen]
pub fn liquid_policy_context(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(prepare_context(&from_js(request)?))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvaluateRequest {
    pub prepared: ContextRequest,
    pub program_base64: String,
    pub witness_base64: String,
}
pub fn evaluate(r: &EvaluateRequest) -> Result<Value> {
    let p = pset(&r.prepared.pset_hex)?;
    let program = STANDARD.decode(&r.program_base64)?;
    let witness = STANDARD.decode(&r.witness_base64)?;
    let c = &r.prepared;
    let prepared = kernel::PreparedPolicy::new(
        &program,
        &p,
        c.input_index,
        &hex::decode(&c.redeem_script_hex)?,
        c.network,
        key(&c.base_public_key_hex)?,
        key(&c.user_pubkey)?,
        TapNodeHash::from_byte_array(hash(&c.user_leaf_hash_hex)?),
    )?;
    ensure!(
        prepared.cmr().to_byte_array() == hash(&c.cmr_hex)?,
        "program CMR differs from prepared binding"
    );
    Ok(
        json!({"accepted":true,"context":prepared.summary(),"execution_cost_milliweight":prepared.evaluate_default(&witness)?}),
    )
}
#[wasm_bindgen]
pub fn liquid_policy_evaluate(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(evaluate(&from_js(request)?))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyRequest {
    pub prepared: ContextRequest,
    pub signed_pset_hex: String,
    pub signature_hex: String,
    pub public_key_hex: String,
}
fn verified_pair(r: &ContextRequest, signed_hex: &str, index: usize) -> Result<(Context, Pset)> {
    let original = pset(&r.pset_hex)?;
    let signed = pset(signed_hex)?;
    let before = context(r, &original, index)?;
    let after = context(r, &signed, index)?;
    safe_numbers(&serde_json::to_value(before.summary())?)?;
    ensure!(
        before.summary() == after.summary(),
        "signer changed the locally verified context"
    );
    Ok((after, signed))
}
fn service_signature(c: &Context, p: &Pset) -> Result<Signature> {
    let map = &p.inputs()[c.input_index()];
    ensure!(
        map.tap_scripts.get(&c.cooperative().control_block)
            == Some(&(
                c.cooperative().script.clone(),
                kernel::elements::taproot::LeafVersion::default()
            )),
        "missing canonical cooperative leaf/control block"
    );
    Ok(map
        .tap_script_sigs
        .get(&(c.cooperative().service_pubkey, c.cooperative().leaf_hash))
        .context("missing service signature")?
        .sig)
}
pub fn verify_signed_pset(r: &VerifyRequest) -> Result<Value> {
    let (c, p) = verified_pair(&r.prepared, &r.signed_pset_hex, r.prepared.input_index)?;
    ensure!(
        key(&r.public_key_hex)? == c.cooperative().service_pubkey,
        "service response key mismatch"
    );
    ensure!(
        service_signature(&c, &p)? == Signature::from_slice(&hex::decode(&r.signature_hex)?)?,
        "service response signature mismatch"
    );
    Ok(json!({"verified":true,"context":c.summary()}))
}
#[wasm_bindgen]
pub fn liquid_policy_verify_signed_pset(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(verify_signed_pset(&from_js(request)?))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserSignRequest {
    pub prepared: ContextRequest,
    pub signed_pset_hex: String,
    pub secret_key_hex: String,
}
pub fn user_sign(r: &UserSignRequest) -> Result<Value> {
    let (c, mut p) = verified_pair(&r.prepared, &r.signed_pset_hex, r.prepared.input_index)?;
    service_signature(&c, &p)?;
    let sig = kernel::add_signature(&c, &mut p, SecretKey::from_str(&r.secret_key_hex)?, false)?;
    Ok(
        json!({"pset_hex":hex::encode(serialize(&p)),"signature_hex":hex::encode(sig.sig.as_ref()),"public_key_hex":c.user_pubkey().to_string(),"input_index":c.input_index(),"context":c.summary()}),
    )
}
#[wasm_bindgen]
pub fn liquid_policy_user_sign(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(user_sign(&from_js(request)?))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserSignature {
    pub input_index: usize,
    pub signature_hex: String,
    pub public_key_hex: String,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FinalizeRequest {
    pub prepared: ContextRequest,
    pub signed_pset_hex: String,
    pub signatures: Vec<UserSignature>,
}
pub fn finalize_pset(r: &FinalizeRequest) -> Result<Value> {
    let original = pset(&r.prepared.pset_hex)?;
    ensure!(
        r.signatures.len() == original.inputs().len(),
        "require a user signature for every input"
    );
    let mut p = pset(&r.signed_pset_hex)?;
    let mut seen = HashSet::new();
    for sig in &r.signatures {
        ensure!(seen.insert(sig.input_index), "duplicate signature");
        let (c, _) = verified_pair(&r.prepared, &hex::encode(serialize(&p)), sig.input_index)?;
        service_signature(&c, &p)?;
        ensure!(
            key(&sig.public_key_hex)? == c.user_pubkey(),
            "user key differs from committed key"
        );
        let signature = Signature::from_slice(&hex::decode(&sig.signature_hex)?)?;
        Secp256k1::verification_only().verify_schnorr(
            &signature,
            &Message::from_digest(c.sighash()),
            &c.user_pubkey(),
        )?;
        p.inputs_mut()[sig.input_index].tap_script_sigs.insert(
            (c.user_pubkey(), c.cooperative().leaf_hash),
            SchnorrSig {
                sig: signature,
                hash_ty: SchnorrSighashType::Default,
            },
        );
    }
    let c = context(&r.prepared, &p, r.prepared.input_index)?;
    let tx = kernel::finalize(&c, &p)?;
    Ok(
        json!({"transaction_hex":hex::encode(serialize(&tx)),"txid":tx.txid().to_string(),"finalized":true,"inputs":tx.input.len(),"outputs":tx.output.len()}),
    )
}
#[wasm_bindgen]
pub fn liquid_policy_finalize_pset(request: JsValue) -> Result<JsValue, JsValue> {
    to_js(finalize_pset(&from_js(request)?))
}
