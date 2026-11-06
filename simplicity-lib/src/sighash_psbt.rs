use anyhow::{Context, Result, ensure};
use elements::bitcoin::{
    TapSighashType,
    hashes::Hash,
    psbt::Psbt,
    sighash::{Prevouts, SighashCache},
    taproot::LeafVersion,
};

pub fn signing_hash(psbt: &Psbt, input_index: usize) -> Result<[u8; 32]> {
    let input = psbt
        .inputs
        .get(input_index)
        .context("PSBT input index out of bounds")?;
    let (_, script) = crate::taproot::bitcoin_cooperative_leaf(input)?;
    ensure!(
        psbt.unsigned_tx.input[input_index].script_sig.is_empty(),
        "Expected an empty scriptSig"
    );
    let prevouts = psbt
        .inputs
        .iter()
        .map(|input| input.witness_utxo.clone().context("Missing witness UTXO"))
        .collect::<Result<Vec<_>>>()?;
    let tx = &psbt.unsigned_tx;
    let hash = SighashCache::new(tx).taproot_script_spend_signature_hash(
        input_index,
        &Prevouts::All(&prevouts),
        elements::bitcoin::TapLeafHash::from_script(script, LeafVersion::TapScript),
        TapSighashType::Default,
    )?;
    Ok(hash.to_byte_array())
}
