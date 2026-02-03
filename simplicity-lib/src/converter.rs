use anyhow::{Result, anyhow};
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use elements::opcodes::all;
use elements::{Address, AddressParams, bitcoin, script::Builder};

#[derive(Deserialize)]
pub struct ConvertRequest {
    pub script: String,
    pub network: String,
}

#[derive(Serialize)]
pub struct ConvertResponse {
    pub hex: String,
    pub address: String,
}

#[wasm_bindgen]
pub fn convert_script(request_json: JsValue) -> Result<JsValue, JsValue> {
    let request: ConvertRequest = serde_wasm_bindgen::from_value(request_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse request: {}", e)))?;

    let result = parse_human_readable(&request.script, request.network);

    match result {
        Ok((script, address)) => {
            let response = ConvertResponse {
                hex: hex::encode(script),
                address,
            };
            serde_wasm_bindgen::to_value(&response)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))
        }
        Err(e) => Err(JsValue::from_str(&format!("Invalid script: {}", e))),
    }
}

pub fn parse_human_readable(input: &str, network: String) -> Result<(Vec<u8>, String)> {
    let mut builder = Builder::new();

    let mut expected_len: Option<usize> = None;
    for token in input.split_whitespace() {
        if token.starts_with("OP_PUSHBYTES_") {
            let num_str = token
                .strip_prefix("OP_PUSHBYTES_")
                .ok_or(anyhow!("wrong opcode"))?;

            let len: usize = num_str
                .parse()
                .map_err(|_| anyhow::anyhow!("invalid length"))?;
            expected_len = Some(len);

            continue;
        }

        if expected_len.is_some() || token.starts_with("0x") {
            let clean = token.trim_start_matches("0x");

            let bytes =
                hex::decode(clean).map_err(|_| anyhow::anyhow!("Invalid hex data: {}", token))?;

            if let Some(len) = expected_len {
                if bytes.len() != len {
                    return Err(anyhow::anyhow!("wrong length"));
                }
                expected_len = None;
            }

            builder = builder.push_slice(&bytes);
            continue;
        }

        if expected_len.is_some() {
            return Err(anyhow::anyhow!(
                "Expected data for PUSHBYTES, found opcode: {}",
                token
            ));
        }

        let op = match token {
            "OP_FALSE" | "OP_0" => all::OP_PUSHBYTES_0,
            "OP_TRUE" | "OP_1" => all::OP_PUSHNUM_1,
            "OP_PUSHNUM_NEG1" | "OP_1NEGATE" => elements::opcodes::all::OP_PUSHNUM_NEG1,
            "OP_PUSHNUM_1" => elements::opcodes::all::OP_PUSHNUM_1,
            "OP_PUSHNUM_2" | "OP_2" => elements::opcodes::all::OP_PUSHNUM_2,
            "OP_PUSHNUM_3" | "OP_3" => elements::opcodes::all::OP_PUSHNUM_3,
            "OP_PUSHNUM_4" | "OP_4" => elements::opcodes::all::OP_PUSHNUM_4,
            "OP_PUSHNUM_5" | "OP_5" => elements::opcodes::all::OP_PUSHNUM_5,
            "OP_PUSHNUM_6" | "OP_6" => elements::opcodes::all::OP_PUSHNUM_6,
            "OP_PUSHNUM_7" | "OP_7" => elements::opcodes::all::OP_PUSHNUM_7,
            "OP_PUSHNUM_8" | "OP_8" => elements::opcodes::all::OP_PUSHNUM_8,
            "OP_PUSHNUM_9" | "OP_9" => elements::opcodes::all::OP_PUSHNUM_9,
            "OP_PUSHNUM_10" | "OP_10" => elements::opcodes::all::OP_PUSHNUM_10,
            "OP_PUSHNUM_11" | "OP_11" => elements::opcodes::all::OP_PUSHNUM_11,
            "OP_PUSHNUM_12" | "OP_12" => elements::opcodes::all::OP_PUSHNUM_12,
            "OP_PUSHNUM_13" | "OP_13" => elements::opcodes::all::OP_PUSHNUM_13,
            "OP_PUSHNUM_14" | "OP_14" => elements::opcodes::all::OP_PUSHNUM_14,
            "OP_PUSHNUM_15" | "OP_15" => elements::opcodes::all::OP_PUSHNUM_15,
            "OP_PUSHNUM_16" | "OP_16" => elements::opcodes::all::OP_PUSHNUM_16,

            "OP_NOP" => elements::opcodes::all::OP_NOP,
            "OP_IF" => elements::opcodes::all::OP_IF,
            "OP_NOTIF" => elements::opcodes::all::OP_NOTIF,
            "OP_VERIFY" => elements::opcodes::all::OP_VERIFY,
            "OP_RETURN" => elements::opcodes::all::OP_RETURN,
            "OP_ELSE" => elements::opcodes::all::OP_ELSE,
            "OP_ENDIF" => elements::opcodes::all::OP_ENDIF,
            "OP_VERIF" => elements::opcodes::all::OP_VERIF,
            "OP_VERNOTIF" => elements::opcodes::all::OP_VERNOTIF,

            "OP_TOALTSTACK" => elements::opcodes::all::OP_TOALTSTACK,
            "OP_FROMALTSTACK" => elements::opcodes::all::OP_FROMALTSTACK,
            "OP_2DROP" => elements::opcodes::all::OP_2DROP,
            "OP_2DUP" => elements::opcodes::all::OP_2DUP,
            "OP_3DUP" => elements::opcodes::all::OP_3DUP,
            "OP_2OVER" => elements::opcodes::all::OP_2OVER,
            "OP_2ROT" => elements::opcodes::all::OP_2ROT,
            "OP_2SWAP" => elements::opcodes::all::OP_2SWAP,
            "OP_IFDUP" => elements::opcodes::all::OP_IFDUP,
            "OP_DEPTH" => elements::opcodes::all::OP_DEPTH,
            "OP_DROP" => elements::opcodes::all::OP_DROP,
            "OP_DUP" => elements::opcodes::all::OP_DUP,
            "OP_NIP" => elements::opcodes::all::OP_NIP,
            "OP_OVER" => elements::opcodes::all::OP_OVER,
            "OP_PICK" => elements::opcodes::all::OP_PICK,
            "OP_ROLL" => elements::opcodes::all::OP_ROLL,
            "OP_ROT" => elements::opcodes::all::OP_ROT,
            "OP_SWAP" => elements::opcodes::all::OP_SWAP,
            "OP_TUCK" => elements::opcodes::all::OP_TUCK,
            "OP_SIZE" => elements::opcodes::all::OP_SIZE,

            "OP_INVERT" => elements::opcodes::all::OP_INVERT,
            "OP_AND" => elements::opcodes::all::OP_AND,
            "OP_OR" => elements::opcodes::all::OP_OR,
            "OP_XOR" => elements::opcodes::all::OP_XOR,
            "OP_EQUAL" => elements::opcodes::all::OP_EQUAL,
            "OP_EQUALVERIFY" => elements::opcodes::all::OP_EQUALVERIFY,
            "OP_LSHIFT" => elements::opcodes::all::OP_LSHIFT,
            "OP_RSHIFT" => elements::opcodes::all::OP_RSHIFT,

            "OP_1ADD" => elements::opcodes::all::OP_1ADD,
            "OP_1SUB" => elements::opcodes::all::OP_1SUB,
            "OP_NEGATE" => elements::opcodes::all::OP_NEGATE,
            "OP_ABS" => elements::opcodes::all::OP_ABS,
            "OP_NOT" => elements::opcodes::all::OP_NOT,
            "OP_0NOTEQUAL" => elements::opcodes::all::OP_0NOTEQUAL,
            "OP_ADD" => elements::opcodes::all::OP_ADD,
            "OP_SUB" => elements::opcodes::all::OP_SUB,
            "OP_MUL" => elements::opcodes::all::OP_MUL,
            "OP_DIV" => elements::opcodes::all::OP_DIV,
            "OP_MOD" => elements::opcodes::all::OP_MOD,
            "OP_BOOLAND" => elements::opcodes::all::OP_BOOLAND,
            "OP_BOOLOR" => elements::opcodes::all::OP_BOOLOR,
            "OP_NUMEQUAL" => elements::opcodes::all::OP_NUMEQUAL,
            "OP_NUMEQUALVERIFY" => elements::opcodes::all::OP_NUMEQUALVERIFY,
            "OP_NUMNOTEQUAL" => elements::opcodes::all::OP_NUMNOTEQUAL,
            "OP_LESSTHAN" => elements::opcodes::all::OP_LESSTHAN,
            "OP_GREATERTHAN" => elements::opcodes::all::OP_GREATERTHAN,
            "OP_LESSTHANOREQUAL" => elements::opcodes::all::OP_LESSTHANOREQUAL,
            "OP_GREATERTHANOREQUAL" => elements::opcodes::all::OP_GREATERTHANOREQUAL,
            "OP_MIN" => elements::opcodes::all::OP_MIN,
            "OP_MAX" => elements::opcodes::all::OP_MAX,
            "OP_WITHIN" => elements::opcodes::all::OP_WITHIN,

            "OP_RIPEMD160" => elements::opcodes::all::OP_RIPEMD160,
            "OP_SHA1" => elements::opcodes::all::OP_SHA1,
            "OP_SHA256" => elements::opcodes::all::OP_SHA256,
            "OP_HASH160" => elements::opcodes::all::OP_HASH160,
            "OP_HASH256" => elements::opcodes::all::OP_HASH256,
            "OP_CODESEPARATOR" => elements::opcodes::all::OP_CODESEPARATOR,
            "OP_CHECKSIG" => elements::opcodes::all::OP_CHECKSIG,
            "OP_CHECKSIGVERIFY" => elements::opcodes::all::OP_CHECKSIGVERIFY,
            "OP_CHECKMULTISIG" => elements::opcodes::all::OP_CHECKMULTISIG,
            "OP_CHECKMULTISIGVERIFY" => elements::opcodes::all::OP_CHECKMULTISIGVERIFY,
            "OP_CHECKSIGFROMSTACK" => elements::opcodes::all::OP_CHECKSIGFROMSTACK,
            "OP_CHECKSIGFROMSTACKVERIFY" => elements::opcodes::all::OP_CHECKSIGFROMSTACKVERIFY,

            "OP_CAT" => elements::opcodes::all::OP_CAT,
            "OP_SUBSTR" => elements::opcodes::all::OP_SUBSTR,
            "OP_LEFT" => elements::opcodes::all::OP_LEFT,
            "OP_RIGHT" => elements::opcodes::all::OP_RIGHT,
            "OP_CLTV" => elements::opcodes::all::OP_CLTV,
            "OP_CSV" => elements::opcodes::all::OP_CSV,
            "OP_ADD64" => elements::opcodes::all::OP_ADD64,
            "OP_SUB64" => elements::opcodes::all::OP_SUB64,
            "OP_MUL64" => elements::opcodes::all::OP_MUL64,
            "OP_DIV64" => elements::opcodes::all::OP_DIV64,
            "OP_NEG64" => elements::opcodes::all::OP_NEG64,
            "OP_LESSTHAN64" => elements::opcodes::all::OP_LESSTHAN64,
            "OP_LESSTHANOREQUAL64" => elements::opcodes::all::OP_LESSTHANOREQUAL64,
            "OP_GREATERTHAN64" => elements::opcodes::all::OP_GREATERTHAN64,
            "OP_GREATERTHANOREQUAL64" => elements::opcodes::all::OP_GREATERTHANOREQUAL64,
            "OP_SCRIPTNUMTOLE64" => elements::opcodes::all::OP_SCRIPTNUMTOLE64,
            "OP_LE64TOSCRIPTNUM" => elements::opcodes::all::OP_LE64TOSCRIPTNUM,
            "OP_LE32TOLE64" => elements::opcodes::all::OP_LE32TOLE64,
            "OP_SHA256INITIALIZE" => elements::opcodes::all::OP_SHA256INITIALIZE,
            "OP_SHA256UPDATE" => elements::opcodes::all::OP_SHA256UPDATE,
            "OP_SHA256FINALIZE" => elements::opcodes::all::OP_SHA256FINALIZE,
            "OP_INSPECTINPUTOUTPOINT" => elements::opcodes::all::OP_INSPECTINPUTOUTPOINT,
            "OP_INSPECTINPUTASSET" => elements::opcodes::all::OP_INSPECTINPUTASSET,
            "OP_INSPECTINPUTVALUE" => elements::opcodes::all::OP_INSPECTINPUTVALUE,
            "OP_INSPECTINPUTSCRIPTPUBKEY" => elements::opcodes::all::OP_INSPECTINPUTSCRIPTPUBKEY,
            "OP_INSPECTINPUTSEQUENCE" => elements::opcodes::all::OP_INSPECTINPUTSEQUENCE,
            "OP_INSPECTINPUTISSUANCE" => elements::opcodes::all::OP_INSPECTINPUTISSUANCE,
            "OP_PUSHCURRENTINPUTINDEX" => elements::opcodes::all::OP_PUSHCURRENTINPUTINDEX,
            "OP_INSPECTOUTPUTASSET" => elements::opcodes::all::OP_INSPECTOUTPUTASSET,
            "OP_INSPECTOUTPUTVALUE" => elements::opcodes::all::OP_INSPECTOUTPUTVALUE,
            "OP_INSPECTOUTPUTNONCE" => elements::opcodes::all::OP_INSPECTOUTPUTNONCE,
            "OP_INSPECTOUTPUTSCRIPTPUBKEY" => elements::opcodes::all::OP_INSPECTOUTPUTSCRIPTPUBKEY,
            "OP_INSPECTVERSION" => elements::opcodes::all::OP_INSPECTVERSION,
            "OP_INSPECTLOCKTIME" => elements::opcodes::all::OP_INSPECTLOCKTIME,
            "OP_INSPECTNUMINPUTS" => elements::opcodes::all::OP_INSPECTNUMINPUTS,
            "OP_INSPECTNUMOUTPUTS" => elements::opcodes::all::OP_INSPECTNUMOUTPUTS,
            "OP_TXWEIGHT" => elements::opcodes::all::OP_TXWEIGHT,
            "OP_ECMULSCALARVERIFY" => elements::opcodes::all::OP_ECMULSCALARVERIFY,
            "OP_TWEAKVERIFY" => elements::opcodes::all::OP_TWEAKVERIFY,
            _ => return Err(anyhow!("unexpected behaviour")),
        };
        builder = builder.push_opcode(op);
    }

    let script = builder.into_script();

    // Try Elements networks first
    if let Ok(network_type) = ElementsNetwork::try_from(network.as_str()) {
        let params = match network_type {
            ElementsNetwork::Elements => &AddressParams::ELEMENTS,
            ElementsNetwork::Liquid => &AddressParams::LIQUID,
            ElementsNetwork::LiquidTestnet => &AddressParams::LIQUID_TESTNET,
        };

        let address = Address::p2wsh(&script, None, params);
        return Ok((script.into_bytes(), address.to_string()));
    }

    // Try Bitcoin networks
    if let Ok(network_type) = BitcoinNetwork::try_from(network.as_str()) {
        let network_params = match network_type {
            BitcoinNetwork::Bitcoin => bitcoin::Network::Bitcoin,
            BitcoinNetwork::Testnet => bitcoin::Network::Testnet,
            BitcoinNetwork::Testnet4 => bitcoin::Network::Testnet4,
            BitcoinNetwork::Signet => bitcoin::Network::Signet,
            BitcoinNetwork::Regtest => bitcoin::Network::Regtest,
        };

        let bitcoin_script = bitcoin::ScriptBuf::from_bytes(script.into_bytes());
        let address = bitcoin::address::Address::p2wsh(&bitcoin_script, network_params);
        return Ok((bitcoin_script.into_bytes(), address.to_string()));
    }

    Err(anyhow!(
        "Unsupported network: {}. Supported networks are elements, liquid, liquid_testnet, bitcoin, testnet, testnet4, signet, regtest",
        network
    ))
}

#[derive(Debug)]
enum ElementsNetwork {
    Elements,
    Liquid,
    LiquidTestnet,
}

impl TryFrom<&str> for ElementsNetwork {
    type Error = anyhow::Error;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "elements" => Ok(ElementsNetwork::Elements),
            "liquid" => Ok(ElementsNetwork::Liquid),
            "liquid_testnet" => Ok(ElementsNetwork::LiquidTestnet),
            _ => Err(anyhow::anyhow!("Unsupported elements network: {}", s)),
        }
    }
}

#[derive(Debug)]
enum BitcoinNetwork {
    Bitcoin,
    Testnet,
    Testnet4,
    Signet,
    Regtest,
}

impl TryFrom<&str> for BitcoinNetwork {
    type Error = anyhow::Error;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "bitcoin" => Ok(BitcoinNetwork::Bitcoin),
            "testnet" => Ok(BitcoinNetwork::Testnet),
            "testnet4" => Ok(BitcoinNetwork::Testnet4),
            "signet" => Ok(BitcoinNetwork::Signet),
            "regtest" => Ok(BitcoinNetwork::Regtest),
            _ => Err(anyhow::anyhow!("Unsupported bitcoin network: {}", s)),
        }
    }
}
