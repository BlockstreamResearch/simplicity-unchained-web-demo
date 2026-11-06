pub mod compiler;
pub mod converter;
#[cfg(test)]
mod create_psbt;
#[cfg(test)]
mod create_pset;
#[cfg(test)]
mod finalize;
mod finalize_psbt;
pub mod jets;
pub mod policy;
pub mod policy_jets;
pub mod liquid_policy_jets;
pub mod liquid_policy;
#[cfg(test)]
mod liquid_policy_tests;
#[cfg(test)]
mod policy_tests;
#[cfg(test)]
mod sighash;
mod sighash_psbt;
mod taproot;
#[cfg(test)]
mod tests;

// Re-export main functions for easier access
pub use compiler::compile;
pub use converter::{convert_script, encode_script};
#[cfg(test)]
mod approval_hash;
