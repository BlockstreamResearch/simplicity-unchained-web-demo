use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use simplicityhl::{
    ResolvedType, Value, WitnessNameToValueMap, WitnessValues, ast::JetHinter,
    parse::ParseFromStr, str::Identifier,
};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use crate::jets::{CoreExtensionHinter, ElementsExtensionHinter};

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Elements,
    Bitcoin,
}

#[derive(Debug, Deserialize)]
pub struct CompileRequest {
    pub script: String,
    pub witness: Option<HashMap<String, Witness>>,
    #[serde(default)]
    pub include_debug: bool,
    #[serde(default = "default_environment")]
    pub environment: Environment,
}

fn default_environment() -> Environment {
    Environment::Elements
}

#[derive(Debug, Serialize)]
pub struct CompileResponse {
    pub program_base64: String,
    /// Commitment Merkle root; the service tweaks its key with this value.
    pub cmr_hex: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub witness_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Witness {
    pub value: String,
    #[serde(rename = "type")]
    pub type_: String,
}

#[wasm_bindgen]
pub fn compile(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {e}")))?;
    let result = compile_program(request).map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {e}")))
}

pub fn compile_program(request: CompileRequest) -> Result<CompileResponse, String> {
    match request.environment {
        Environment::Elements => compile_with(Box::new(ElementsExtensionHinter), request),
        Environment::Bitcoin => compile_with(Box::new(CoreExtensionHinter), request),
    }
}

fn compile_with(
    jet_hinter: Box<dyn JetHinter>,
    request: CompileRequest,
) -> Result<CompileResponse, String> {
    let compiled = simplicityhl::CompiledProgram::new(
        request.script,
        simplicityhl::Arguments::default(),
        request.include_debug,
        jet_hinter,
    )
    .map_err(|e| format!("Compile error: {e}"))?;

    let commit = compiled.commit();
    let program_base64 = STANDARD.encode(commit.to_vec_without_witness());
    let cmr_hex = commit.cmr().to_string();
    let witness_base64 = request
        .witness
        .map(|witness| {
            let values = witness
                .into_iter()
                .map(|(name, witness)| {
                    let ty = ResolvedType::parse_from_str(&witness.type_)
                        .map_err(|e| format!("Invalid witness type: {e}"))?;
                    let value = Value::parse_from_str(&witness.value, &ty)
                        .map_err(|e| format!("Invalid witness value: {e}"))?;
                    let key = WitnessValues::ident_to_key(&Identifier::from_str_unchecked(&name));
                    Ok((key, value))
                })
                .collect::<Result<HashMap<_, _>, String>>()?;
            let satisfied = compiled
                .satisfy(WitnessValues::from_map(values))
                .map_err(|e| format!("Satisfy error: {e}"))?;
            let (_, witness_bytes) = satisfied.redeem().to_vec_with_witness();
            Ok::<_, String>(STANDARD.encode(witness_bytes))
        })
        .transpose()?;

    Ok(CompileResponse {
        program_base64,
        cmr_hex,
        witness_base64,
    })
}
