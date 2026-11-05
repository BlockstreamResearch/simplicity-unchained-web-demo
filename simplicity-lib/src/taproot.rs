use anyhow::{Context, Result, ensure};
use elements::bitcoin::{self, PublicKey};
use std::str::FromStr;

pub const NUMS_KEY: &str = "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

pub fn multisig_script(service: &PublicKey, user: &PublicKey) -> bitcoin::ScriptBuf {
    bitcoin::script::Builder::new()
        .push_x_only_key(&service.inner.x_only_public_key().0)
        .push_opcode(bitcoin::opcodes::all::OP_CHECKSIG)
        .push_x_only_key(&user.inner.x_only_public_key().0)
        .push_opcode(bitcoin::opcodes::all::OP_CHECKSIGADD)
        .push_int(2)
        .push_opcode(bitcoin::opcodes::all::OP_EQUAL)
        .into_script()
}

pub fn multisig_keys(script: &[u8]) -> Result<[bitcoin::XOnlyPublicKey; 2]> {
    ensure!(
        script.len() == 70
            && script[0] == 32
            && script[33] == 0xac
            && script[34] == 32
            && script[67..] == [0xba, 0x52, 0x87],
        "Expected the development service's 2-of-2 Taproot multisig leaf"
    );
    Ok([
        bitcoin::XOnlyPublicKey::from_slice(&script[1..33])?,
        bitcoin::XOnlyPublicKey::from_slice(&script[35..67])?,
    ])
}

pub fn bitcoin_cooperative_leaf(
    input: &bitcoin::psbt::Input,
) -> Result<(&bitcoin::taproot::ControlBlock, &bitcoin::ScriptBuf)> {
    let output = &input
        .witness_utxo
        .as_ref()
        .context("Missing witness UTXO")?
        .script_pubkey;
    ensure!(output.is_p2tr(), "Input is not P2TR");
    let key = bitcoin::XOnlyPublicKey::from_slice(&output.as_bytes()[2..])?;
    let secp = bitcoin::secp256k1::Secp256k1::verification_only();
    let mut candidates = input
        .tap_scripts
        .iter()
        .filter(|(control, (script, version))| {
            *version == bitcoin::taproot::LeafVersion::TapScript
                && control.leaf_version == *version
                && multisig_keys(script.as_bytes()).is_ok()
                && control.verify_taproot_commitment(&secp, key, script)
        });
    let (control, (script, _)) = candidates
        .next()
        .context("No committed canonical multisig leaf")?;
    ensure!(
        candidates.next().is_none(),
        "Ambiguous committed multisig leaves"
    );
    Ok((control, script))
}

pub fn elements_cooperative_leaf(
    input: &elements::pset::Input,
) -> Result<(&elements::taproot::ControlBlock, &elements::Script)> {
    let output = &input
        .witness_utxo
        .as_ref()
        .context("Missing witness UTXO")?
        .script_pubkey;
    ensure!(output.is_v1_p2tr(), "Input is not P2TR");
    let key = elements::schnorr::TweakedPublicKey::new(
        elements::secp256k1_zkp::XOnlyPublicKey::from_slice(&output.as_bytes()[2..])?,
    );
    let secp = elements::secp256k1_zkp::Secp256k1::verification_only();
    let mut candidates = input
        .tap_scripts
        .iter()
        .filter(|(control, (script, version))| {
            *version == elements::taproot::LeafVersion::default()
                && control.leaf_version == *version
                && multisig_keys(script.as_bytes()).is_ok()
                && control.verify_taproot_commitment(&secp, &key, script)
        });
    let (control, (script, _)) = candidates
        .next()
        .context("No committed canonical multisig leaf")?;
    ensure!(
        candidates.next().is_none(),
        "Ambiguous committed multisig leaves"
    );
    Ok((control, script))
}

pub fn elements_genesis(network: &str) -> Result<elements::BlockHash> {
    Ok(elements::BlockHash::from_str(match network {
        "liquid" => "1466275836220db2944ca059a3a10ef6fd2ea684b0688d2c379296888a206003",
        "liquid_testnet" => "a771da8e52ee6ad581ed1e9a99825e5b3b7992225534eaa2ae23244fe26ab1c1",
        _ => anyhow::bail!("Unsupported Elements network: {network}"),
    })?)
}
