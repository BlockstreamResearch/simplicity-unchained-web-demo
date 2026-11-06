use simplicityhl::simplicity;
#[allow(dead_code)]
mod common {
    use super::simplicity;
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../simplicity-unchained/policy/tests/common/liquid.rs"
    ));
}
use super::{
    compiler::{self, CompileRequest, Environment, Profile},
    liquid_policy as api,
    liquid_policy_jets::LiquidPolicy,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use common::*;
use kernel::elements::{
    Address,
    encode::{deserialize, serialize},
    secp256k1_zkp::{PublicKey, Secp256k1},
};
use simplicity::{BitIter, BitWriter, jet::Jet};
use simplicity_unchained_policy::liquid::{self as kernel, Builtin};
use simplicityhl::{
    jet::{source_type, target_type},
    types::{ResolvedType, StructuralType, TypeConstructible},
};
use std::{io::Write, str::FromStr};

fn compile(source: &str) -> compiler::CompileResponse {
    compiler::compile_program(CompileRequest {
        script: source.into(),
        witness: None,
        include_debug: false,
        environment: Environment::Elements,
        profile: Profile::LiquidPolicy,
    })
    .unwrap()
}
fn request(f: &Fixture) -> api::ContextRequest {
    api::ContextRequest {
        pset_hex: hex::encode(serialize(&f.pset)),
        input_index: 0,
        cmr_hex: hex::encode(f.cmr),
        redeem_script_hex: hex::encode(&f.data),
        network: f.network,
        base_public_key_hex: f.base.to_string(),
        user_pubkey: f.user.to_string(),
        user_leaf_hash_hex: hex::encode(f.recovery.to_byte_array()),
    }
}
#[test]
fn all_66_liquid_compiler_jets_match_portable_types_encodings_and_identities() {
    let manifest = kernel::manifest();
    assert_eq!(manifest["jets"].as_array().unwrap().len(), 66);
    for j in Builtin::all() {
        let jet = LiquidPolicy::Builtin(j);
        let entry = &manifest["jets"][j.id() as usize];
        assert_eq!(entry["name"], j.name());
        assert_eq!(entry["cmr"], hex::encode(jet.cmr().to_byte_array()));
        let args = source_type(&jet);
        let source = ResolvedType::tuple(args.iter().map(|t| t.resolve_builtin().unwrap()));
        let target = target_type(&jet).resolve_builtin().unwrap();
        assert_eq!(
            StructuralType::from(&source).as_ref(),
            jet.source_ty().to_final().as_ref()
        );
        assert_eq!(
            StructuralType::from(&target).as_ref(),
            jet.target_ty().to_final().as_ref()
        );
        compile(&format!(
            "fn main() {{ let _value: {target} = jet::{j}({}); }}",
            args.iter().map(|_| "0").collect::<Vec<_>>().join(", ")
        ));
        for offset in [0, 1, 3, 7] {
            let mut bytes = vec![];
            let mut writer = BitWriter::new(&mut bytes as &mut dyn Write);
            writer.write_bits_be(0, offset).unwrap();
            assert_eq!(jet.encode(&mut writer).unwrap(), 8);
            writer.write_bits_be(5, 3).unwrap();
            writer.flush_all().unwrap();
            let mut bits = BitIter::from(bytes);
            for _ in 0..offset {
                bits.next();
            }
            assert_eq!(LiquidPolicy::decode(&mut bits).unwrap(), jet);
            assert_eq!(bits.take(3).collect::<Vec<_>>(), vec![true, false, true]);
        }
    }
    assert!(
        compiler::compile_program(CompileRequest {
            script: "fn main() {}".into(),
            witness: None,
            include_debug: false,
            environment: Environment::Bitcoin,
            profile: Profile::LiquidPolicy
        })
        .is_err()
    );
    compile(
        "fn main() { let _user: Pubkey = jet::cooperative_user_pubkey(); let _service: Pubkey = jet::cooperative_service_pubkey(); }",
    );
}
#[test]
fn confidential_address_unconfidential_lookup_tweak_and_unblinding_are_bound() {
    let f = Fixture::new();
    let binding = api::TweakRequest {
        network: f.network,
        cmr_hex: hex::encode(f.cmr),
        redeem_script_hex: hex::encode(&f.data),
        base_public_key_hex: f.base.to_string(),
    };
    let blind = PublicKey::from_secret_key(&Secp256k1::new(), &f.blinding_secret).to_string();
    let r = api::AddressRequest {
        binding: binding.clone(),
        user_pubkey: f.user.to_string(),
        user_leaf_hash_hex: hex::encode(f.recovery.to_byte_array()),
        blinding_public_key_hex: Some(blind.clone()),
    };
    let result = api::address(&r).unwrap();
    let confidential = Address::from_str(result["address"].as_str().unwrap()).unwrap();
    let unconfidential =
        Address::from_str(result["unconfidential_address"].as_str().unwrap()).unwrap();
    assert!(confidential.blinding_pubkey.is_some());
    assert!(unconfidential.blinding_pubkey.is_none());
    assert_eq!(confidential.script_pubkey(), unconfidential.script_pubkey());
    assert_eq!(
        hex::encode(confidential.script_pubkey().as_bytes()),
        result["script_pubkey_hex"]
    );
    let local = api::local_tweak(&binding).unwrap();
    assert_eq!(local["public_key_hex"], result["service_pubkey"]);
    let mut changed = r.clone();
    changed.binding.network = kernel::Network::Liquid;
    assert_ne!(
        api::address(&changed).unwrap()["script_pubkey_hex"],
        result["script_pubkey_hex"]
    );
    let parent = f.pset.inputs()[0].non_witness_utxo.as_ref().unwrap();
    let req = api::UnblindRequest {
        parent_tx_hex: hex::encode(serialize(parent)),
        txid: parent.txid().to_string(),
        vout: 0,
        blinding_secret_key_hex: Some(hex::encode(f.blinding_secret.secret_bytes())),
    };
    let disclosed = api::unblind(&req).unwrap();
    assert_eq!(disclosed["disclosure"]["value_sat"], 100_000);
    assert_eq!(
        disclosed["disclosure"]["asset_id"],
        f.network.fee_asset().to_string()
    );
    let mut bad = req;
    bad.blinding_secret_key_hex = Some(hex::encode(f.user_secret.secret_bytes()));
    assert!(api::unblind(&bad).is_err());
}

#[test]
fn recovery_parser_hash_matches_revealed_leaf_of_actual_cooperative_address() {
    use kernel::elements::{
        Script,
        secp256k1_zkp::XOnlyPublicKey,
        taproot::{LeafVersion, TapLeafHash, TapNodeHash, TaprootBuilder},
    };
    let f = Fixture::new();
    let human = format!(
        "OP_5 OP_CHECKSEQUENCEVERIFY OP_DROP OP_PUSHBYTES_32 {} OP_CHECKSIG",
        f.user
    );
    let result = api::recovery_script(&human).unwrap();
    let parsed =
        crate::converter::parse_human_readable(&human.replace("OP_CHECKSEQUENCEVERIFY", "OP_CSV"))
            .unwrap();
    assert_eq!(result["redeem_script_hex"], hex::encode(&parsed));
    let recovery = Script::from(parsed);
    let leaf = TapLeafHash::from_script(&recovery, LeafVersion::default());
    assert_eq!(
        result["user_leaf_hash_hex"],
        hex::encode(leaf.to_byte_array())
    );
    let binding = api::TweakRequest {
        network: f.network,
        cmr_hex: hex::encode(f.cmr),
        redeem_script_hex: result["redeem_script_hex"].as_str().unwrap().into(),
        base_public_key_hex: f.base.to_string(),
    };
    let req = api::AddressRequest {
        binding,
        user_pubkey: f.user.to_string(),
        user_leaf_hash_hex: hex::encode(leaf.to_byte_array()),
        blinding_public_key_hex: Some(
            PublicKey::from_secret_key(&Secp256k1::new(), &f.blinding_secret).to_string(),
        ),
    };
    let address = api::address(&req).unwrap();
    let cooperative = kernel::cooperative_output(
        f.base,
        f.cmr,
        recovery.as_bytes(),
        f.network,
        f.user,
        TapNodeHash::from_byte_array(leaf.to_byte_array()),
    )
    .unwrap();
    let nums = XOnlyPublicKey::from_str(
        "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
    )
    .unwrap();
    let spend = TaprootBuilder::new()
        .add_leaf(1, cooperative.script.clone())
        .unwrap()
        .add_leaf(1, recovery.clone())
        .unwrap()
        .finalize(&Secp256k1::verification_only(), nums)
        .unwrap();
    assert_eq!(
        hex::encode(Script::new_v1_p2tr_tweaked(spend.output_key()).as_bytes()),
        address["script_pubkey_hex"]
    );
    assert_eq!(
        spend
            .control_block(&(cooperative.script.clone(), LeafVersion::default()))
            .unwrap(),
        cooperative.control_block
    );
    assert!(api::recovery_script("OP_PUSHBYTES_32").is_err());
    assert!(api::recovery_script("NOT_AN_OPCODE").is_err());
}
#[test]
fn browser_context_evaluate_cosign_finalize_and_tamper_roundtrip() {
    let compiled = compile(
        "fn main() { let asset: u256 = jet::current_asset(); let _debit: u64 = jet::asset_current_script_debit(asset); }",
    );
    let mut f = Fixture::with_program(STANDARD.decode(&compiled.program_base64).unwrap());
    let request = request(&f);
    let before = api::prepare_context(&request).unwrap();
    let evaluation = api::evaluate(&api::EvaluateRequest {
        prepared: request.clone(),
        program_base64: compiled.program_base64,
        witness_base64: String::new(),
    })
    .unwrap();
    assert_eq!(evaluation["context"], before["context"]);
    let mut signatures = Vec::new();
    for index in 0..2 {
        let c = f.context(index).unwrap();
        let secret = f.service_secret();
        let sig = kernel::add_signature(&c, &mut f.pset, secret, true).unwrap();
        let mut selected = request.clone();
        selected.input_index = index;
        api::verify_signed_pset(&api::VerifyRequest {
            prepared: selected.clone(),
            signed_pset_hex: hex::encode(serialize(&f.pset)),
            signature_hex: hex::encode(sig.sig.as_ref()),
            public_key_hex: c.cooperative().service_pubkey.to_string(),
        })
        .unwrap();
        let signed = api::user_sign(&api::UserSignRequest {
            prepared: selected.clone(),
            signed_pset_hex: hex::encode(serialize(&f.pset)),
            secret_key_hex: hex::encode(f.user_secret.secret_bytes()),
        })
        .unwrap();
        f.pset = deserialize(&hex::decode(signed["pset_hex"].as_str().unwrap()).unwrap()).unwrap();
        signatures.push(api::UserSignature {
            input_index: index,
            signature_hex: signed["signature_hex"].as_str().unwrap().into(),
            public_key_hex: f.user.to_string(),
        });
    }

    let signed_hex = hex::encode(serialize(&f.pset));
    let final_result = api::finalize_pset(&api::FinalizeRequest {
        prepared: request.clone(),
        signed_pset_hex: signed_hex.clone(),
        signatures,
    })
    .unwrap();
    assert_eq!(final_result["finalized"], true);
    let tx: kernel::elements::Transaction =
        deserialize(&hex::decode(final_result["transaction_hex"].as_str().unwrap()).unwrap())
            .unwrap();
    assert!(tx.input.iter().all(|i| i.witness.script_witness.len() == 4));
    let mut changed = f.pset.clone();
    changed.outputs_mut()[0].amount = Some(20_001);
    let mut bad = request.clone();
    bad.pset_hex = hex::encode(serialize(&changed));
    assert!(api::prepare_context(&bad).is_err());
    let mut bad = request.clone();
    bad.network = kernel::Network::Liquid;
    assert!(api::prepare_context(&bad).is_err());
    let mut invalid = api::VerifyRequest {
        prepared: request.clone(),
        signed_pset_hex: signed_hex,
        signature_hex: hex::encode([1; 64]),
        public_key_hex: f
            .context(0)
            .unwrap()
            .cooperative()
            .service_pubkey
            .to_string(),
    };
    assert!(api::verify_signed_pset(&invalid).is_err());
    invalid.signed_pset_hex = hex::encode(serialize(&changed));
    assert!(api::verify_signed_pset(&invalid).is_err());
}

#[test]
fn explicit_budget_example_passes_both_assets_and_rejects_asset_switch_bypass() {
    let source =
        include_str!("../../../simplicity-unchained/examples/liquid-policy/per_asset_budget.simf");
    for (source, expected) in [
        (source.to_string(), true),
        (source.replace("21000", "20999"), false),
        (source.replace("15000", "14999"), false),
        (source.replace("1000)", "999)"), false),
    ] {
        let compiled = compile(&source);
        let f = Fixture::with_program(STANDARD.decode(&compiled.program_base64).unwrap());
        for index in 0..2 {
            let mut r = request(&f);
            r.input_index = index;
            let result = api::evaluate(&api::EvaluateRequest {
                prepared: r,
                program_base64: compiled.program_base64.clone(),
                witness_base64: String::new(),
            });
            assert_eq!(
                result.is_ok(),
                expected,
                "selected asset index {index}, expected={expected}"
            );
        }
    }
}
