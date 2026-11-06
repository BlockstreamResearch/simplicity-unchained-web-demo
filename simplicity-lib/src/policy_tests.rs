use std::{io::Write, str::FromStr};

use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use simplicity_unchained_policy::{
    Builtin, Context, bitcoin, cooperative_output, manifest, profile_hash, signing_commitment,
};
use simplicityhl::{
    jet::{source_type, target_type},
    simplicity::{BitIter, BitWriter, decode, jet::Jet},
    types::{ResolvedType, StructuralType, TypeConstructible},
};

use bitcoin::{
    hashes::{Hash, HashEngine, sha256},
    key::TapTweak,
    psbt::Psbt,
    secp256k1::{Keypair, Message, Secp256k1, SecretKey},
    taproot::{LeafVersion, TapLeafHash, TapNodeHash},
};

use crate::{
    compiler::{self, CompileRequest, Environment, Profile},
    jets::{CoreExtension, ElementsExtension},
    policy,
    policy_jets::BitcoinPolicy,
};

fn compile(source: &str, witness: Option<Value>) -> Result<compiler::CompileResponse> {
    compiler::compile_program(CompileRequest {
        script: source.into(),
        witness: witness.map(serde_json::from_value).transpose()?,
        include_debug: false,
        environment: Environment::Bitcoin,
        profile: Profile::BitcoinPolicy,
    })
    .map_err(anyhow::Error::msg)
}

fn encoded(jet: &impl Jet, offset: usize) -> (Vec<u8>, usize) {
    let mut bytes = vec![];
    let mut writer = BitWriter::new(&mut bytes as &mut dyn Write);
    writer.write_bits_be(0, offset).unwrap();
    let len = jet.encode(&mut writer).unwrap();
    writer.write_bits_be(5, 3).unwrap();
    writer.flush_all().unwrap();
    (bytes, len)
}

#[test]
fn all_policy_hinter_types_metadata_and_encodings_match_portable_registry() {
    let metadata = manifest();
    assert_eq!(metadata.jets.len(), 55);
    assert_eq!(metadata.profile_hash, hex::encode(profile_hash()));
    assert_eq!(
        policy::registry()["manifest"],
        serde_json::to_value(&metadata).unwrap()
    );
    for builtin in Builtin::ALL {
        let jet = BitcoinPolicy::Builtin(builtin);
        let entry = &metadata.jets[usize::from(builtin.id())];
        assert_eq!(entry.name, jet.to_string());
        assert_eq!(entry.source_type.as_bytes(), jet.source_ty().0);
        assert_eq!(entry.target_type.as_bytes(), jet.target_ty().0);
        assert_eq!(entry.cmr, jet.cmr().to_string());
        assert_eq!(entry.cost_milliweight, 10_000);
        assert_eq!(
            jet.cost(),
            simplicityhl::simplicity::Cost::from_milliweight(10_000)
        );
        let source = ResolvedType::tuple(
            source_type(&jet)
                .into_iter()
                .map(|ty| ty.resolve_builtin().unwrap()),
        );
        let target = target_type(&jet).resolve_builtin().unwrap();
        assert_eq!(
            StructuralType::from(&source).as_ref(),
            jet.source_ty().to_final().as_ref(),
            "{builtin}"
        );
        assert_eq!(
            StructuralType::from(&target).as_ref(),
            jet.target_ty().to_final().as_ref(),
            "{builtin}"
        );
        for offset in [0, 1, 3, 7] {
            let (bytes, len) = encoded(&jet, offset);
            assert_eq!(len, 7);
            let mut bits = BitIter::from(bytes);
            for _ in 0..offset {
                bits.next();
            }
            assert_eq!(BitcoinPolicy::decode(&mut bits).unwrap(), jet);
            assert_eq!(bits.n_total_read(), offset + 7);
            assert_eq!(bits.take(3).collect::<Vec<_>>(), [true, false, true]);
        }
        let args = source_type(&jet)
            .iter()
            .map(|_| "0")
            .collect::<Vec<_>>()
            .join(", ");
        let source = format!("fn main() {{ let _value: {target} = jet::{builtin}({args}); }}");
        compile(&source, None).unwrap_or_else(|e| panic!("{builtin}: {e:#}"));
    }
    assert_eq!(
        encoded(&BitcoinPolicy::Builtin(Builtin::PolicyProfileHash), 0).0[0] & 0xfe,
        0x80
    );
    assert_eq!(
        encoded(&BitcoinPolicy::Builtin(Builtin::TxVsizeLowerBound), 0).0[0] & 0xfe,
        0xec
    );
}

#[test]
fn policy_namespace_preserves_all_legacy_jets_and_rejects_reserved_ids() {
    let legacy = simplicityhl::simplicity::jet::Core::ALL
        .into_iter()
        .map(CoreExtension::Base)
        .chain([
            CoreExtension::GetOpcodeFromScript,
            CoreExtension::GetPubkeyFromScript,
            CoreExtension::TxApprovalHash,
        ]);
    for old in legacy {
        let new = BitcoinPolicy::Legacy(old);
        assert_eq!(new.cmr(), old.cmr());
        assert_eq!(new.source_ty(), old.source_ty());
        assert_eq!(new.target_ty(), old.target_ty());
        assert_eq!(new.cost(), old.cost());
        for offset in [0, 1, 3, 7] {
            let (bytes, len) = encoded(&new, offset);
            let mut bits = BitIter::from(bytes);
            for _ in 0..offset {
                bits.next();
            }
            assert_eq!(BitcoinPolicy::decode(&mut bits).unwrap(), new);
            assert_eq!(bits.n_total_read(), offset + len);
            assert_eq!(bits.take(3).collect::<Vec<_>>(), [true, false, true]);
        }
    }
    for id in 55u8..=63 {
        let bytes = [(64 | id) << 1];
        assert!(matches!(
            BitcoinPolicy::decode(&mut BitIter::from(bytes.as_slice())),
            Err(decode::Error::InvalidJet)
        ));
    }
    // Right-align truncated codes: padding must not silently complete a prefix.
    for len in 0..7 {
        let byte = [0xffu8];
        let mut bits = BitIter::from(byte.as_slice());
        for _ in 0..(8 - len) {
            bits.next();
        }
        assert!(matches!(
            BitcoinPolicy::decode(&mut bits),
            Err(decode::Error::EndOfStream)
        ));
    }
    assert!("policy_profile_hash".parse::<CoreExtension>().is_err());
    assert!("policy_profile_hash".parse::<ElementsExtension>().is_err());
    let rejected = compiler::compile_program(CompileRequest {
        script: "fn main() {}".into(),
        witness: None,
        include_debug: false,
        environment: Environment::Elements,
        profile: Profile::BitcoinPolicy,
    });
    assert!(rejected.unwrap_err().contains("Bitcoin-only"));
    let default: CompileRequest =
        serde_json::from_value(json!({ "script": "fn main() {}" })).unwrap();
    assert_eq!(default.profile, Profile::BitcoinPolicy);
    assert!(matches!(default.environment, Environment::Bitcoin));
    assert_eq!(
        compiler::compile_program(default).unwrap().cmr_hex,
        compile("fn main() {}", None).unwrap().cmr_hex
    );
}

#[test]
fn policy_templates_compile_with_the_browser_hinter() -> Result<()> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../simplicity-unchained/examples/policy");
    let mut files = std::fs::read_dir(&root)
        .with_context(|| {
            format!(
                "Matching sibling backend checkout required: {}",
                root.display()
            )
        })?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    files.retain(|file| file.extension().is_some_and(|ext| ext == "simf"));
    assert!(
        files.len() >= 5,
        "expected the sibling backend's policy examples"
    );
    files.sort();
    for file in files {
        compile(&std::fs::read_to_string(&file)?, None)
            .with_context(|| format!("browser compilation of {}", file.display()))?;
    }
    Ok(())
}

fn key(seed: u8) -> Keypair {
    Keypair::from_secret_key(
        &Secp256k1::new(),
        &SecretKey::from_slice(&[seed; 32]).unwrap(),
    )
}

fn fixture() -> (policy::ContextRequest, Psbt) {
    let cmr = [0x42; 32];
    let script = [0x51];
    let recovery = TapNodeHash::from_byte_array(
        TapLeafHash::from_script(bitcoin::Script::from_bytes(&script), LeafVersion::TapScript)
            .to_byte_array(),
    );
    let output = cooperative_output(
        key(1).x_only_public_key().0,
        cmr,
        &script,
        bitcoin::Network::Testnet4,
        key(2).x_only_public_key().0,
        recovery,
    )
    .unwrap();
    let parent = bitcoin::Transaction {
        version: bitcoin::transaction::Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![bitcoin::TxIn {
            previous_output: bitcoin::OutPoint::new(bitcoin::Txid::from_byte_array([3; 32]), 1),
            ..Default::default()
        }],
        output: vec![bitcoin::TxOut {
            value: bitcoin::Amount::from_sat(50_000),
            script_pubkey: output.script_pubkey,
        }],
    };
    let address =
        bitcoin::Address::from_script(&parent.output[0].script_pubkey, bitcoin::Network::Testnet4)
            .unwrap()
            .to_string();
    let created = policy::create_psbt(&policy::CreateRequest {
        inputs: vec![policy::ProvenInput {
            txid: parent.compute_txid().to_string(),
            vout: 0,
            parent_tx_hex: hex::encode(bitcoin::consensus::serialize(&parent)),
            sequence: 0xffff_fffd,
        }],
        outputs: vec![policy::PolicyOutput {
            address,
            value_sat: 49_000,
        }],
        network: "testnet4".into(),
        lock_time: 0,
    })
    .unwrap();
    let request = policy::ContextRequest {
        psbt_hex: created["psbt_hex"].as_str().unwrap().into(),
        input_index: 0,
        cmr_hex: hex::encode(cmr),
        redeem_script_hex: hex::encode(script),
        network: "testnet4".into(),
        base_public_key_hex: key(1).x_only_public_key().0.to_string(),
        user_pubkey: key(2).public_key().to_string(),
        user_leaf_hash_hex: recovery.to_string(),
    };
    let psbt = Psbt::deserialize(&hex::decode(&request.psbt_hex).unwrap()).unwrap();
    (request, psbt)
}

fn tagged_hash(tag: &str, fields: &[&[u8]]) -> [u8; 32] {
    let tag = sha256::Hash::hash(tag.as_bytes());
    let mut engine = sha256::Hash::engine();
    engine.input(tag.as_byte_array());
    engine.input(tag.as_byte_array());
    for field in fields {
        engine.input(field);
    }
    sha256::Hash::from_engine(engine).to_byte_array()
}

#[test]
fn local_proofs_and_j53_j54_match_independent_fixed_width_digest_construction() {
    let (request, psbt) = fixture();
    assert!(psbt.inputs[0].non_witness_utxo.is_some());
    assert!(psbt.inputs[0].witness_utxo.is_some());
    let result = policy::prepare_context(&request).unwrap();
    let summary = &result["context"];
    assert_eq!(summary["fee"], 1_000);
    assert_eq!(summary["debit"], 1_000);
    assert_eq!(summary["provenance"], "parent-txid-verified");
    assert_eq!(summary["chain_status_verified"], false);
    let bytes = |name: &str| hex::decode(summary[name].as_str().unwrap()).unwrap();
    assert_eq!(
        bytes("unsigned_tx_hash"),
        sha256::Hash::hash(&bitcoin::consensus::serialize(&psbt.unsigned_tx)).to_byte_array()
    );
    assert_eq!(
        bytes("prevouts_hash"),
        sha256::Hash::hash(&bitcoin::consensus::serialize(&vec![
            psbt.inputs[0].witness_utxo.clone().unwrap()
        ]))
        .to_byte_array()
    );
    let j54 = tagged_hash(
        "SimplicityUnchained/PolicyTransactionApproval/v1",
        &[
            &bytes("profile_hash"),
            &bytes("genesis_hash"),
            &bytes("signing_commitment"),
            &bytes("unsigned_tx_hash"),
            &bytes("prevouts_hash"),
            &bytes("cooperative_leaf_hash"),
            &bytes("recovery_leaf_hash"),
        ],
    );
    let j53 = tagged_hash(
        "SimplicityUnchained/PolicyInputApproval/v1",
        &[
            &j54,
            &0u32.to_be_bytes(),
            &bytes("cooperative_sighash_default"),
        ],
    );
    assert_eq!(bytes("policy_transaction_approval_hash"), j54);
    assert_eq!(bytes("policy_approval_hash"), j53);
    assert_ne!(j53, j54);
    for mutate in 0..5 {
        let mut changed = psbt.clone();
        match mutate {
            0 => changed.inputs[0].non_witness_utxo = None,
            1 => {
                changed.inputs[0].witness_utxo.as_mut().unwrap().value =
                    bitcoin::Amount::from_sat(49_999)
            }
            2 => {
                changed.inputs[0]
                    .non_witness_utxo
                    .as_mut()
                    .unwrap()
                    .lock_time = bitcoin::absolute::LockTime::from_consensus(1)
            }
            3 => changed
                .unsigned_tx
                .input
                .push(changed.unsigned_tx.input[0].clone()),
            4 => {
                changed.inputs[0].final_script_witness =
                    Some(bitcoin::Witness::from_slice(&[vec![0x50]]))
            }
            _ => unreachable!(),
        }
        assert!(
            policy::prepare_context(&policy::ContextRequest {
                psbt_hex: hex::encode(changed.serialize()),
                ..request.clone()
            })
            .is_err(),
            "accepted invalid proof mutation {mutate}"
        );
    }
    for mutate in 0..4 {
        let mut changed = psbt.clone();
        match mutate {
            0 => changed.unsigned_tx.output[0].value = bitcoin::Amount::from_sat(48_999),
            1 => {
                changed.unsigned_tx.output[0].script_pubkey =
                    bitcoin::ScriptBuf::from_bytes(vec![0x51])
            }
            2 => changed.unsigned_tx.lock_time = bitcoin::absolute::LockTime::from_consensus(1),
            3 => changed.unsigned_tx.input[0].sequence = bitcoin::Sequence(16),
            _ => unreachable!(),
        }
        let changed = policy::prepare_context(&policy::ContextRequest {
            psbt_hex: hex::encode(changed.serialize()),
            ..request.clone()
        })
        .unwrap();
        assert_ne!(
            changed["context"]["policy_approval_hash"],
            summary["policy_approval_hash"]
        );
        assert_ne!(
            changed["context"]["policy_transaction_approval_hash"],
            summary["policy_transaction_approval_hash"]
        );
    }
}

fn service_signed(request: &policy::ContextRequest, mut psbt: Psbt) -> (Psbt, String, String) {
    let base = key(1);
    let context = Context::new(
        &psbt,
        0,
        [0x42; 32],
        &[0x51],
        bitcoin::Network::Testnet4,
        base.x_only_public_key().0,
        key(2).x_only_public_key().0,
        TapNodeHash::from_str(&request.user_leaf_hash_hex).unwrap(),
    )
    .unwrap();
    let commitment = signing_commitment([0x42; 32], &[0x51], bitcoin::Network::Testnet4).unwrap();
    let service = base
        .tap_tweak(
            &Secp256k1::new(),
            Some(TapNodeHash::from_byte_array(commitment)),
        )
        .to_keypair();
    assert_eq!(service.x_only_public_key().0, context.service_pubkey());
    let signature = Secp256k1::new().sign_schnorr_no_aux_rand(
        &Message::from_digest(context.cooperative_sighash_default()),
        &service,
    );
    let leaf = context.cooperative_leaf_hash();
    psbt.inputs[0].tap_scripts.insert(
        context.control_block().clone(),
        (context.cooperative_script().clone(), LeafVersion::TapScript),
    );
    psbt.inputs[0].tap_script_sigs.insert(
        (context.service_pubkey(), leaf),
        bitcoin::taproot::Signature {
            signature,
            sighash_type: bitcoin::TapSighashType::Default,
        },
    );
    (
        psbt,
        signature.to_string(),
        context.service_pubkey().to_string(),
    )
}

#[test]
fn policy_cosign_verification_and_existing_secure_finalization_roundtrip() {
    let (request, psbt) = fixture();
    let (signed, signature, public_key) = service_signed(&request, psbt.clone());
    let verify = policy::VerifyRequest {
        prepared: request.clone(),
        signed_psbt_hex: hex::encode(signed.serialize()),
        signature_hex: signature,
        public_key_hex: public_key,
    };
    assert_eq!(
        policy::verify_signed_psbt(&verify).unwrap()["verified"],
        true
    );
    let context = policy::prepare_context(&request).unwrap();
    let digest: [u8; 32] = hex::decode(
        context["context"]["cooperative_sighash_default"]
            .as_str()
            .unwrap(),
    )
    .unwrap()
    .try_into()
    .unwrap();
    let user_signature = Secp256k1::new()
        .sign_schnorr_no_aux_rand(&Message::from_digest(digest), &key(2))
        .to_string();
    let finalized = policy::finalize_psbt(&policy::FinalizeRequest {
        prepared: request.clone(),
        signed_psbt_hex: verify.signed_psbt_hex.clone(),
        signatures: vec![policy::UserSignature {
            input_index: 0,
            signature_hex: user_signature,
            public_key_hex: key(2).public_key().to_string(),
        }],
    })
    .unwrap();
    assert_eq!(finalized["finalized"], true);
    for mutate in 0..5 {
        let mut forged = signed.clone();
        match mutate {
            0 => forged.unsigned_tx.output[0].value = bitcoin::Amount::from_sat(48_999),
            1 => forged.inputs[0].tap_scripts.clear(),
            2 => forged.inputs[0].tap_script_sigs.clear(),
            3 => {
                let signature = forged.inputs[0]
                    .tap_script_sigs
                    .values_mut()
                    .next()
                    .unwrap();
                signature.sighash_type = bitcoin::TapSighashType::All;
            }
            4 => {
                forged.inputs[0].witness_utxo.as_mut().unwrap().value = bitcoin::Amount::from_sat(1)
            }
            _ => unreachable!(),
        }
        assert!(
            policy::verify_signed_psbt(&policy::VerifyRequest {
                signed_psbt_hex: hex::encode(forged.serialize()),
                ..verify.clone()
            })
            .is_err(),
            "accepted invalid signed PSBT mutation {mutate}"
        );
    }
    assert!(
        policy::verify_signed_psbt(&policy::VerifyRequest {
            public_key_hex: key(3).x_only_public_key().0.to_string(),
            ..verify.clone()
        })
        .is_err()
    );
}

#[test]
#[ignore = "requires matching experimental service; set SIMPLICITY_TEST_SERVICE_URL; never broadcasts"]
fn development_service_policy_roundtrip() -> Result<()> {
    let base = std::env::var("SIMPLICITY_TEST_SERVICE_URL")
        .context("Set SIMPLICITY_TEST_SERVICE_URL to a matching experimental backend")?;
    let response = std::process::Command::new("curl")
        .args([
            "--silent",
            "--show-error",
            "--fail-with-body",
            "--max-time",
            "20",
            &format!("{base}/simplicity-unchained/policy/bitcoin/capabilities"),
        ])
        .output()?;
    anyhow::ensure!(response.status.success(), "policy capabilities failed");
    let capabilities: Value = serde_json::from_slice(&response.stdout)?;
    assert_eq!(capabilities["profile"], "bitcoin-policy-v1");
    assert_eq!(capabilities["profile_hash"], hex::encode(profile_hash()));
    assert_eq!(capabilities["manifest"], serde_json::to_value(manifest())?);
    let network_name = capabilities["network"]
        .as_str()
        .context("missing service network")?;
    let network = bitcoin::Network::from_str(network_name)?;
    let base_key = capabilities["base_public_key_hex"]
        .as_str()
        .context("missing base key")?;
    let default_source = include_str!("../../services/policyDefaults.ts");
    let source = default_source
        .split('`')
        .nth(1)
        .context("missing browser default policy source")?;
    let compiled = compile(source, None)?;
    let cmr: [u8; 32] = hex::decode(&compiled.cmr_hex)?.try_into().unwrap();
    let script = vec![0x51];
    let recovery_hash = TapNodeHash::from_byte_array(
        TapLeafHash::from_script(bitcoin::Script::from_bytes(&script), LeafVersion::TapScript)
            .to_byte_array(),
    );
    let tweak_body = json!({
        "profile_hash": hex::encode(profile_hash()), "network": network_name,
        "program": compiled.program_base64, "redeem_script_hex": hex::encode(&script),
    });
    let remote_tweak = crate::tests::service_request("policy/bitcoin/tweak", tweak_body.clone())?;
    let local_tweak = policy::local_tweak(&policy::LocalTweakRequest {
        network: network_name.into(),
        cmr_hex: compiled.cmr_hex.clone(),
        redeem_script_hex: hex::encode(&script),
        base_public_key_hex: base_key.into(),
    })?;
    assert_eq!(remote_tweak, local_tweak);
    let output = cooperative_output(
        bitcoin::XOnlyPublicKey::from_str(base_key)?,
        cmr,
        &script,
        network,
        key(2).x_only_public_key().0,
        recovery_hash,
    )?;
    let parent = bitcoin::Transaction {
        version: bitcoin::transaction::Version::TWO,
        lock_time: bitcoin::absolute::LockTime::ZERO,
        input: vec![bitcoin::TxIn {
            previous_output: bitcoin::OutPoint::new(bitcoin::Txid::from_byte_array([7; 32]), 0),
            ..Default::default()
        }],
        output: vec![bitcoin::TxOut {
            value: bitcoin::Amount::from_sat(10_000),
            script_pubkey: output.script_pubkey.clone(),
        }],
    };
    let address = bitcoin::Address::from_script(&output.script_pubkey, network)?.to_string();
    let created = policy::create_psbt(&policy::CreateRequest {
        inputs: vec![policy::ProvenInput {
            txid: parent.compute_txid().to_string(),
            vout: 0,
            parent_tx_hex: hex::encode(bitcoin::consensus::serialize(&parent)),
            sequence: 0xffff_fffd,
        }],
        outputs: vec![policy::PolicyOutput {
            address,
            value_sat: 9_000,
        }],
        network: network_name.into(),
        lock_time: 0,
    })?;
    let request = policy::ContextRequest {
        psbt_hex: created["psbt_hex"].as_str().unwrap().into(),
        input_index: 0,
        cmr_hex: compiled.cmr_hex.clone(),
        redeem_script_hex: hex::encode(&script),
        network: network_name.into(),
        base_public_key_hex: base_key.into(),
        user_pubkey: key(2).public_key().to_string(),
        user_leaf_hash_hex: recovery_hash.to_string(),
    };
    let local = policy::prepare_context(&request)?;
    let mut body = tweak_body;
    body["psbt_hex"] = request.psbt_hex.clone().into();
    body["input_index"] = 0.into();
    body["user_pubkey"] = request.user_pubkey.clone().into();
    body["user_leaf_hash_hex"] = request.user_leaf_hash_hex.clone().into();
    let prepared = crate::tests::service_request("policy/bitcoin/prepare", body.clone())?;
    assert_eq!(prepared["context"], local["context"]);
    let digest: [u8; 32] = hex::decode(
        local["context"]["policy_transaction_approval_hash"]
            .as_str()
            .unwrap(),
    )?
    .try_into()
    .unwrap();
    let approval =
        Secp256k1::new().sign_schnorr_no_aux_rand(&Message::from_digest(digest), &key(2));
    let witnessed = compile(
        source,
        Some(json!({
            "APPROVAL": { "type": "Signature", "value": format!("0x{approval}") },
        })),
    )?;
    assert_eq!(witnessed.cmr_hex, compiled.cmr_hex);
    assert_eq!(witnessed.program_base64, compiled.program_base64);
    body["witness"] = witnessed
        .witness_base64
        .context("missing approval witness")?
        .into();
    let evaluated = crate::tests::service_request("policy/bitcoin/evaluate", body.clone())?;
    assert_eq!(evaluated["accepted"], true);
    assert_eq!(evaluated["context"], local["context"]);
    anyhow::ensure!(evaluated["execution_cost_milliweight"].as_u64().unwrap() <= 10_000_000);
    let signed = crate::tests::service_request("policy/bitcoin/sign", body.clone())?;
    assert_eq!(signed["context"], local["context"]);
    let verify = policy::VerifyRequest {
        prepared: request.clone(),
        signed_psbt_hex: signed["psbt_hex"]
            .as_str()
            .context("missing signed PSBT")?
            .into(),
        signature_hex: signed["signature_hex"]
            .as_str()
            .context("missing signature")?
            .into(),
        public_key_hex: signed["public_key_hex"]
            .as_str()
            .context("missing signing key")?
            .into(),
    };
    policy::verify_signed_psbt(&verify)?;
    let sighash: [u8; 32] = hex::decode(
        local["context"]["cooperative_sighash_default"]
            .as_str()
            .unwrap(),
    )?
    .try_into()
    .unwrap();
    let finalized = policy::finalize_psbt(&policy::FinalizeRequest {
        prepared: request.clone(),
        signed_psbt_hex: verify.signed_psbt_hex,
        signatures: vec![policy::UserSignature {
            input_index: 0,
            signature_hex: Secp256k1::new()
                .sign_schnorr_no_aux_rand(&Message::from_digest(sighash), &key(2))
                .to_string(),
            public_key_hex: key(2).public_key().to_string(),
        }],
    })?;
    assert_eq!(finalized["finalized"], true);
    let mut changed = Psbt::deserialize(&hex::decode(&request.psbt_hex)?)?;
    changed.unsigned_tx.output[0].value = bitcoin::Amount::from_sat(8_999);
    body["psbt_hex"] = hex::encode(changed.serialize()).into();
    assert!(
        crate::tests::service_request("policy/bitcoin/evaluate", body.clone()).is_err(),
        "stale transaction approval accepted"
    );
    assert!(
        crate::tests::service_request("policy/bitcoin/sign", body.clone()).is_err(),
        "service signed a modified transaction"
    );
    body["profile_hash"] = "00".repeat(32).into();
    assert!(
        crate::tests::service_request("policy/bitcoin/prepare", {
            let mut invalid = body;
            invalid.as_object_mut().unwrap().remove("witness");
            invalid
        })
        .is_err(),
        "service accepted a stale registry"
    );
    Ok(())
}
