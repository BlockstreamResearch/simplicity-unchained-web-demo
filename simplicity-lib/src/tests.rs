use crate::{
    compiler, converter, finalize, finalize_psbt,
    jets::{CoreExtension, ElementsExtension},
    sighash, sighash_psbt, taproot,
};
use anyhow::{Context, Result};
use elements::{
    bitcoin::{
        self,
        hashes::Hash,
        secp256k1::{Keypair, Message, Secp256k1, SecretKey},
    },
    encode::{deserialize, serialize},
};
use serde_json::{Value, json};
use simplicityhl::simplicity::{BitWriter, jet::Jet};
use std::{
    io::Write,
    process::{Command, Stdio},
    str::FromStr,
};

fn keypair(byte: u8) -> Keypair {
    Keypair::from_secret_key(
        &Secp256k1::new(),
        &SecretKey::from_slice(&[byte; 32]).unwrap(),
    )
}

fn public_key(key: &Keypair) -> String {
    key.public_key().to_string()
}

fn conversion(network: &str, service: &str) -> converter::ConvertResponse {
    converter::convert(&converter::ConvertRequest {
        script: include_str!("../../public/presets/bitcoin_script/signature-recovery.bs").into(),
        network: network.into(),
        service_pubkey: service.into(),
        user_pubkey: public_key(&keypair(2)),
    })
    .unwrap()
}

fn bitcoin_fixture(service: &str) -> bitcoin::psbt::Psbt {
    let converted = conversion("testnet4", service);
    let address = bitcoin::Address::from_str(&converted.address)
        .unwrap()
        .assume_checked();
    let mut psbt = bitcoin::psbt::Psbt::from_unsigned_tx(bitcoin::Transaction {
        version: bitcoin::transaction::Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![bitcoin::TxIn::default()],
        output: vec![bitcoin::TxOut {
            value: bitcoin::Amount::from_sat(4000),
            script_pubkey: address.script_pubkey(),
        }],
    })
    .unwrap();
    psbt.inputs[0].witness_utxo = Some(bitcoin::TxOut {
        value: bitcoin::Amount::from_sat(5000),
        script_pubkey: address.script_pubkey(),
    });
    psbt
}

fn elements_fixture(service: &str) -> elements::pset::PartiallySignedTransaction {
    let converted = conversion("liquid_testnet", service);
    let address = elements::Address::from_str(&converted.address).unwrap();
    let asset = elements::AssetId::from_str(
        "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
    )
    .unwrap();
    let output = elements::TxOut {
        asset: elements::confidential::Asset::Explicit(asset),
        value: elements::confidential::Value::Explicit(99000),
        nonce: elements::confidential::Nonce::Null,
        script_pubkey: address.script_pubkey(),
        witness: elements::TxOutWitness::default(),
    };
    let mut pset = elements::pset::PartiallySignedTransaction::from_tx(elements::Transaction {
        version: 2,
        lock_time: elements::LockTime::ZERO,
        input: vec![elements::TxIn::default()],
        output: vec![output.clone(), elements::TxOut::new_fee(1000, asset)],
    });
    pset.inputs_mut()[0].witness_utxo = Some(elements::TxOut {
        value: elements::confidential::Value::Explicit(100000),
        ..output
    });
    pset
}

fn bitcoin_oracle_metadata(psbt: &mut bitcoin::psbt::Psbt, service: &Keypair) {
    let script = taproot::multisig_script(
        &bitcoin::PublicKey::from_str(&public_key(service)).unwrap(),
        &bitcoin::PublicKey::from_str(&public_key(&keypair(2))).unwrap(),
    );
    let recovery_hash = bitcoin::TapNodeHash::from_slice(
        &hex::decode(conversion("testnet4", &public_key(service)).user_leaf_hash_hex).unwrap(),
    )
    .unwrap();
    let info = bitcoin::taproot::TaprootBuilder::new()
        .add_leaf(1, script.clone())
        .unwrap()
        .add_hidden_node(1, recovery_hash)
        .unwrap()
        .finalize(
            &Secp256k1::new(),
            bitcoin::XOnlyPublicKey::from_str(taproot::NUMS_KEY).unwrap(),
        )
        .unwrap();
    let version = bitcoin::taproot::LeafVersion::TapScript;
    psbt.inputs[0].tap_scripts.insert(
        info.control_block(&(script.clone(), version)).unwrap(),
        (script.clone(), version),
    );
    let hash = sighash_psbt::signing_hash(psbt, 0).unwrap();
    psbt.inputs[0].tap_script_sigs.insert(
        (
            service.x_only_public_key().0,
            bitcoin::TapLeafHash::from_script(&script, version),
        ),
        bitcoin::taproot::Signature {
            signature: Secp256k1::new()
                .sign_schnorr_no_aux_rand(&Message::from_digest(hash), service),
            sighash_type: bitcoin::TapSighashType::Default,
        },
    );
}

fn elements_oracle_metadata(
    pset: &mut elements::pset::PartiallySignedTransaction,
    service: &Keypair,
) {
    let script = elements::Script::from(
        taproot::multisig_script(
            &bitcoin::PublicKey::from_str(&public_key(service)).unwrap(),
            &bitcoin::PublicKey::from_str(&public_key(&keypair(2))).unwrap(),
        )
        .into_bytes(),
    );
    let recovery_hash = elements::taproot::TapNodeHash::from_byte_array(
        hex::decode(conversion("liquid_testnet", &public_key(service)).user_leaf_hash_hex)
            .unwrap()
            .try_into()
            .unwrap(),
    );
    let info = elements::taproot::TaprootBuilder::new()
        .add_leaf(1, script.clone())
        .unwrap()
        .add_hidden(1, recovery_hash)
        .unwrap()
        .finalize(
            &Secp256k1::new(),
            bitcoin::XOnlyPublicKey::from_str(taproot::NUMS_KEY).unwrap(),
        )
        .unwrap();
    let version = elements::taproot::LeafVersion::default();
    pset.inputs_mut()[0].tap_scripts.insert(
        info.control_block(&(script.clone(), version)).unwrap(),
        (script.clone(), version),
    );
    let hash = sighash::signing_hash(pset, 0, "liquid_testnet").unwrap();
    pset.inputs_mut()[0].tap_script_sigs.insert(
        (
            service.x_only_public_key().0,
            elements::taproot::TapLeafHash::from_script(&script, version),
        ),
        elements::SchnorrSig {
            sig: Secp256k1::new().sign_schnorr_no_aux_rand(&Message::from_digest(hash), service),
            hash_ty: elements::SchnorrSighashType::Default,
        },
    );
}

fn finalize_bitcoin(psbt: &bitcoin::psbt::Psbt) -> Result<Value> {
    let hash = sighash_psbt::signing_hash(psbt, 0)?;
    finalize_psbt::execute(&finalize_psbt::FinalizePsbtRequest {
        psbt_hex: hex::encode(psbt.serialize()),
        input_index: 0,
        public_key_hex: public_key(&keypair(2)),
        signature_hex: Secp256k1::new()
            .sign_schnorr_no_aux_rand(&Message::from_digest(hash), &keypair(2))
            .to_string(),
    })
}

fn finalize_elements(pset: &elements::pset::PartiallySignedTransaction) -> Result<Value> {
    let hash = sighash::signing_hash(pset, 0, "liquid_testnet")?;
    finalize::execute(&finalize::FinalizeRequest {
        pset_hex: hex::encode(serialize(pset)),
        input_index: 0,
        network: "liquid_testnet".into(),
        public_key_hex: public_key(&keypair(2)),
        signature_hex: Secp256k1::new()
            .sign_schnorr_no_aux_rand(&Message::from_digest(hash), &keypair(2))
            .to_string(),
    })
}

#[test]
fn bitcoin_taproot_roundtrip() {
    let service = keypair(1);
    let mut psbt = bitcoin_fixture(&public_key(&service));
    bitcoin_oracle_metadata(&mut psbt, &service);
    let result = finalize_bitcoin(&psbt).unwrap();
    let tx: bitcoin::Transaction = bitcoin::consensus::deserialize(
        &hex::decode(result["transaction_hex"].as_str().unwrap()).unwrap(),
    )
    .unwrap();
    let witness = tx.input[0].witness.to_vec();
    assert_eq!(
        witness.iter().map(Vec::len).collect::<Vec<_>>(),
        [64, 64, 70, 65]
    );
    let (keys, leaf) = psbt.inputs[0]
        .tap_script_sigs
        .keys()
        .find(|(key, _)| *key == service.x_only_public_key().0)
        .unwrap();
    assert_eq!(
        witness[1],
        psbt.inputs[0].tap_script_sigs[&(*keys, *leaf)].to_vec()
    );
    assert_eq!(result["finalized"], true);
}

#[test]
fn elements_taproot_roundtrip() {
    let service = keypair(1);
    let mut pset = elements_fixture(&public_key(&service));
    elements_oracle_metadata(&mut pset, &service);
    let result = finalize_elements(&pset).unwrap();
    let tx: elements::Transaction =
        deserialize(&hex::decode(result["transaction_hex"].as_str().unwrap()).unwrap()).unwrap();
    assert_eq!(
        tx.input[0]
            .witness
            .script_witness
            .iter()
            .map(<[u8]>::len)
            .collect::<Vec<_>>(),
        [64, 64, 70, 65]
    );
    assert_eq!(result["finalized"], true);
}

#[test]
fn rejects_missing_metadata_and_out_of_bounds() {
    let psbt = bitcoin_fixture(&public_key(&keypair(1)));
    let pset = elements_fixture(&public_key(&keypair(1)));
    assert!(sighash_psbt::signing_hash(&psbt, 0).is_err());
    assert!(sighash_psbt::signing_hash(&psbt, 1).is_err());
    assert!(sighash::signing_hash(&pset, 0, "liquid_testnet").is_err());
    assert!(sighash::signing_hash(&pset, 1, "liquid_testnet").is_err());
}

#[test]
fn rejects_wrong_funding_output_and_missing_oracle_signature() {
    let service = keypair(1);
    let mut psbt = bitcoin_fixture(&public_key(&service));
    bitcoin_oracle_metadata(&mut psbt, &service);
    psbt.inputs[0].tap_script_sigs.clear();
    assert!(
        finalize_bitcoin(&psbt)
            .unwrap_err()
            .to_string()
            .contains("Missing oracle")
    );
    psbt.inputs[0].witness_utxo.as_mut().unwrap().script_pubkey = bitcoin::ScriptBuf::new();
    assert!(sighash_psbt::signing_hash(&psbt, 0).is_err());
    let mut pset = elements_fixture(&public_key(&service));
    elements_oracle_metadata(&mut pset, &service);
    pset.inputs_mut()[0].tap_script_sigs.clear();
    assert!(
        finalize_elements(&pset)
            .unwrap_err()
            .to_string()
            .contains("Missing oracle")
    );
    pset.inputs_mut()[0]
        .witness_utxo
        .as_mut()
        .unwrap()
        .script_pubkey = elements::Script::new();
    assert!(sighash::signing_hash(&pset, 0, "liquid_testnet").is_err());
}

#[test]
fn rejects_invalid_signatures() {
    let service = keypair(1);
    let mut psbt = bitcoin_fixture(&public_key(&service));
    bitcoin_oracle_metadata(&mut psbt, &service);
    psbt.unsigned_tx.output[0].value = bitcoin::Amount::from_sat(3999);
    assert!(finalize_bitcoin(&psbt).is_err());
    let mut pset = elements_fixture(&public_key(&service));
    elements_oracle_metadata(&mut pset, &service);
    pset.outputs_mut()[0].amount = Some(98999);
    assert!(finalize_elements(&pset).is_err());
}

#[test]
fn elements_sighash_commits_to_network() {
    let service = keypair(1);
    let mut pset = elements_fixture(&public_key(&service));
    elements_oracle_metadata(&mut pset, &service);
    assert_ne!(
        sighash::signing_hash(&pset, 0, "liquid").unwrap(),
        sighash::signing_hash(&pset, 0, "liquid_testnet").unwrap()
    );
    assert!(sighash::signing_hash(&pset, 0, "unknown").is_err());
}

#[test]
fn recovery_leaf_hash_is_network_specific() {
    let service = public_key(&keypair(1));
    let bitcoin = conversion("testnet4", &service);
    let elements = conversion("liquid_testnet", &service);
    assert!(bitcoin.address.starts_with("tb1p"));
    assert!(elements.address.starts_with("tex1p"));
    assert_ne!(bitcoin.user_leaf_hash_hex, elements.user_leaf_hash_hex);
    assert_eq!(bitcoin.hex, elements.hex);
    assert!(converter::parse_human_readable("OP_PUSHBYTES_32").is_err());
}

#[test]
fn custom_jet_encoding_matches_development() {
    fn encoded<J: Jet>(name: &str) -> Vec<u8> {
        let jet = J::parse(name).unwrap();
        let mut bytes = vec![];
        let mut writer = BitWriter::new(&mut bytes as &mut dyn Write);
        jet.encode(&mut writer).unwrap();
        writer.flush_all().unwrap();
        bytes
    }
    for (name, expected) in [
        ("get_opcode_from_script", vec![0xf8]),
        ("get_pubkey_from_script", vec![0xfc]),
    ] {
        assert_eq!(encoded::<CoreExtension>(name), expected);
        assert_eq!(encoded::<ElementsExtension>(name), expected);
    }
}

#[test]
fn compiles_all_presets_for_supported_environments() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/presets/simplicity");
    for file in std::fs::read_dir(dir).unwrap() {
        let path = file.unwrap().path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("simf") {
            continue;
        }
        let source = std::fs::read_to_string(&path).unwrap();
        let witness = if path.with_extension("wit").exists() {
            std::fs::read_to_string(path.with_extension("wit")).unwrap()
        } else {
            "{}".into()
        };
        for environment in [
            compiler::Environment::Elements,
            compiler::Environment::Bitcoin,
        ] {
            if matches!(environment, compiler::Environment::Bitcoin)
                && !matches!(
                    path.file_name().and_then(|name| name.to_str()),
                    Some("check_opcode.simf" | "sig_verify_with_pubkey_from_script.simf")
                )
            {
                continue;
            }
            let result = compiler::compile_program(compiler::CompileRequest {
                script: source.clone(),
                witness: Some(serde_json::from_str(&witness).unwrap()),
                include_debug: false,
                environment,
            });
            assert!(
                result.is_ok(),
                "{} ({environment:?}): {result:?}",
                path.display()
            );
        }
    }
}

fn service_request(endpoint: &str, body: Value) -> Result<Value> {
    let base = std::env::var("SIMPLICITY_TEST_SERVICE_URL")
        .context("Set SIMPLICITY_TEST_SERVICE_URL to a running development service")?;
    let mut child = Command::new("curl")
        .args([
            "--silent",
            "--show-error",
            "--fail-with-body",
            "--max-time",
            "20",
            "-H",
            "Content-Type: application/json",
            "--data-binary",
            "@-",
            &format!("{base}/simplicity-unchained/{endpoint}"),
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(body.to_string().as_bytes())?;
    let output = child.wait_with_output()?;
    anyhow::ensure!(
        output.status.success(),
        "Service rejected {endpoint}: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    Ok(serde_json::from_slice(&output.stdout)?)
}

#[test]
#[ignore = "requires a development service; set SIMPLICITY_TEST_SERVICE_URL"]
fn development_service_roundtrip() -> Result<()> {
    for (script, witness) in [
        (
            include_str!("../../public/presets/simplicity/check_opcode.simf"),
            "{}",
        ),
        (
            "fn main() {
                let pk: Pubkey = jet::get_pubkey_from_script(0);
                assert!(jet::eq_256(pk, 0x5eb4655feae15a304653e27441ca8e8ced2bef89c22ab6b20424b4c07b3d14cc));
                assert!(jet::eq_8(jet::get_opcode_from_script(0), witness::OPCODE));
            }",
            r#"{"OPCODE":{"value":"0x21","type":"u8"}}"#,
        ),
    ] {
        for (network, environment) in [
            ("bitcoin", compiler::Environment::Bitcoin),
            ("elements", compiler::Environment::Elements),
        ] {
            let compiled = compiler::compile_program(compiler::CompileRequest {
                script: script.into(),
                witness: Some(serde_json::from_str(witness)?),
                include_debug: false,
                environment,
            })
            .map_err(anyhow::Error::msg)?;
            let tweak = service_request(
                "tweak",
                json!({ "program": compiled.program_base64, "jet_env": network }),
            )?;
            assert_eq!(
                tweak["cmr_hex"].as_str(),
                Some(compiled.cmr_hex.as_str()),
                "{network}: the browser's jet definitions must match the service's",
            );
            let service = tweak["tweaked_public_key_hex"]
                .as_str()
                .context("Missing oracle key")?;
            let converted = conversion(
                if network == "bitcoin" {
                    "testnet4"
                } else {
                    "liquid_testnet"
                },
                service,
            );
            let mut body = json!({
                "input_index": 0, "program": compiled.program_base64, "witness": compiled.witness_base64,
                "user_pubkey": public_key(&keypair(2)), "user_leaf_hash_hex": converted.user_leaf_hash_hex,
                "redeem_script_hex": converted.hex,
            });
            if network == "bitcoin" {
                body["psbt_hex"] = hex::encode(bitcoin_fixture(service).serialize()).into();
                let signed = service_request("sign/psbt", body)?;
                let psbt = bitcoin::psbt::Psbt::deserialize(&hex::decode(
                    signed["psbt_hex"].as_str().context("Missing PSBT")?,
                )?)?;
                assert!(finalize_bitcoin(&psbt)?["finalized"].as_bool().unwrap());
            } else {
                body["pset_hex"] = hex::encode(serialize(&elements_fixture(service))).into();
                let signed = service_request("sign/pset", body)?;
                let pset = deserialize(&hex::decode(
                    signed["pset_hex"].as_str().context("Missing PSET")?,
                )?)?;
                assert!(finalize_elements(&pset)?["finalized"].as_bool().unwrap());
            }
        }
    }
    Ok(())
}
