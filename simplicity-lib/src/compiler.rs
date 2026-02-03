use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use simplicityhl::parse::ParseFromStr;
use simplicityhl::simplicity_unchained::jets::bitcoin::CoreExtension;
use simplicityhl::simplicity_unchained::jets::elements::ElementsExtension;
use simplicityhl::str::WitnessName;
use simplicityhl::{ResolvedType, Value, WitnessValues};

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
    let req: CompileRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    match req.environment {
        Environment::Elements => compile_with_elements(req),
        Environment::Bitcoin => compile_with_bitcoin(req),
    }
}

fn compile_with_elements(req: CompileRequest) -> Result<JsValue, JsValue> {
    let script = req.script;
    let include_debug = req.include_debug;

    let args = simplicityhl::Arguments::<ElementsExtension>::default();

    let compiled = simplicityhl::CompiledProgram::<ElementsExtension>::new(script, args, include_debug)
        .map_err(|e| JsValue::from_str(&format!("compile error: {}", e)))?;

    let program_bytes = compiled.commit().to_vec_without_witness();
    let program_b64 = STANDARD.encode(&program_bytes);

    let witness_b64 = if let Some(witness) = req.witness {
        let mut converted_witness = HashMap::new();

        for (key, value) in witness {
            let name = WitnessName::from_str_unchecked(key.as_str());
            let value = Value::parse_from_str(
                &value.value,
                &ResolvedType::parse_from_str(value.type_.as_str())
                    .map_err(|e| JsValue::from_str(&format!("value of witness is incorrect: {}", e)))?,
            )
            .map_err(|e| JsValue::from_str(&format!("witness is incorrect: {}", e)))?;

            converted_witness.insert(name, value);
        }

        let witness = WitnessValues::from(converted_witness);

        let satisfied = compiled
            .satisfy(witness)
            .map_err(|e| JsValue::from_str(&format!("satisfy error: {}", e)))?;

        let (_, witness_bytes) = satisfied.redeem().to_vec_with_witness();

        Some(STANDARD.encode(&witness_bytes))
    } else {
        None
    };

    let response = CompileResponse {
        program_base64: program_b64,
        witness_base64: witness_b64,
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))
}

fn compile_with_bitcoin(req: CompileRequest) -> Result<JsValue, JsValue> {
    let script = req.script;
    let include_debug = req.include_debug;

    let args = simplicityhl::Arguments::<CoreExtension>::default();

    let compiled = simplicityhl::CompiledProgram::<CoreExtension>::new(script, args, include_debug)
        .map_err(|e| JsValue::from_str(&format!("compile error: {}", e)))?;

    let program_bytes = compiled.commit().to_vec_without_witness();
    let program_b64 = STANDARD.encode(&program_bytes);

    let witness_b64 = if let Some(witness) = req.witness {
        let mut converted_witness = HashMap::new();

        for (key, value) in witness {
            let name = WitnessName::from_str_unchecked(key.as_str());
            let value = Value::parse_from_str(
                &value.value,
                &ResolvedType::parse_from_str(value.type_.as_str())
                    .map_err(|e| JsValue::from_str(&format!("value of witness is incorrect: {}", e)))?,
            )
            .map_err(|e| JsValue::from_str(&format!("witness is incorrect: {}", e)))?;

            converted_witness.insert(name, value);
        }

        let witness = WitnessValues::from(converted_witness);

        let satisfied = compiled
            .satisfy(witness)
            .map_err(|e| JsValue::from_str(&format!("satisfy error: {}", e)))?;

        let (_, witness_bytes) = satisfied.redeem().to_vec_with_witness();

        Some(STANDARD.encode(&witness_bytes))
    } else {
        None
    };

    let response = CompileResponse {
        program_base64: program_b64,
        witness_base64: witness_b64,
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))
}
