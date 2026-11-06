//! Emit reproducible browser-compiler vectors for the sibling backend's template execution tests.
use anyhow::{Context, Result};
use serde_json::json;
use simplicity_lib::compiler::{CompileRequest, Environment, Profile, compile_program};
use simplicity_unchained_policy::{
    bitcoin::hashes::{Hash, sha256},
    profile_hash,
};

fn main() -> Result<()> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../simplicity-unchained/examples/policy");
    let mut paths = std::fs::read_dir(root)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    paths.retain(|path| path.extension().is_some_and(|ext| ext == "simf"));
    paths.sort();
    let mut templates = serde_json::Map::new();
    for path in paths {
        let source = std::fs::read_to_string(&path)?;
        let compiled = compile_program(CompileRequest {
            script: source.clone(),
            witness: None,
            include_debug: false,
            environment: Environment::Bitcoin,
            profile: Profile::BitcoinPolicy,
        })
        .map_err(anyhow::Error::msg)
        .with_context(|| path.display().to_string())?;
        let mut entry = json!({
            "profile_hash": hex::encode(profile_hash()),
            "source_sha256": sha256::Hash::hash(source.as_bytes()).to_string(),
            "program_base64": compiled.program_base64,
            "cmr_hex": compiled.cmr_hex,
        });
        if path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("approvals_2_of_3")
        {
            let duplicate_source = source.replace(
                "0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
                "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            );
            anyhow::ensure!(
                duplicate_source != source,
                "threshold fixture key literal not found"
            );
            let duplicate = compile_program(CompileRequest {
                script: duplicate_source,
                witness: None,
                include_debug: false,
                environment: Environment::Bitcoin,
                profile: Profile::BitcoinPolicy,
            })
            .map_err(anyhow::Error::msg)?;
            entry["duplicate_keys_program_base64"] = duplicate.program_base64.into();
            entry["duplicate_keys_cmr_hex"] = duplicate.cmr_hex.into();
        }
        templates.insert(
            path.file_name().unwrap().to_string_lossy().into_owned(),
            entry,
        );
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "profile": "bitcoin-policy-v1", "profile_hash": hex::encode(profile_hash()), "templates": templates,
        }))?
    );
    Ok(())
}
