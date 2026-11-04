//! The development service's script-inspection jets, exposed to the SimplicityHL compiler.
//!
//! Mirrors `CoreExtension` / `ElementsExtension` in
//! `simplicity-unchained/core/src/jets/{bitcoin,elements}.rs`: same names, types, CMRs, costs
//! and bit encodings. The core crate itself can't be a dependency because its plugin loader
//! pulls in `dlopen2`, which doesn't build for wasm32. `tests::development_service_roundtrip`
//! checks these definitions against a running service.
use std::fmt;
use std::io::Write;
use std::str::FromStr;

use simplicityhl::ast::JetHinter;
use simplicityhl::jet::{JetHL, SourceJetClassification, TargetJetClassification};
use simplicityhl::simplicity::jet::type_name::TypeName;
use simplicityhl::simplicity::jet::{Core, Elements, Jet};
use simplicityhl::simplicity::{BitIter, BitWriter, Cmr, Cost, decode};
use simplicityhl::types::BuiltinAlias;

pub const GET_OPCODE_FROM_SCRIPT_CMR: [u8; 32] = [
    0xdc, 0xcc, 0xd2, 0x89, 0x59, 0x22, 0xe7, 0x5b, 0x01, 0x8b, 0x08, 0x46, 0xe5, 0xcd, 0x49, 0x63,
    0x80, 0x8b, 0xbf, 0xd4, 0x8b, 0x47, 0x23, 0x44, 0x75, 0x60, 0x7f, 0x90, 0xe7, 0x0e, 0xe0, 0x32,
];
pub const GET_PUBKEY_FROM_SCRIPT_CMR: [u8; 32] = [
    0x27, 0xea, 0xb0, 0x90, 0x68, 0xb0, 0x35, 0xaf, 0x61, 0x97, 0x13, 0x33, 0x5b, 0x73, 0xd2, 0x52,
    0x0e, 0xcc, 0x02, 0x09, 0x00, 0x67, 0xc8, 0xfc, 0xca, 0xbb, 0x4d, 0x72, 0xa6, 0x55, 0xcd, 0xcb,
];

macro_rules! extension_jets {
    ($name:ident, $hinter:ident, $base:ident) => {
        /// The base jets plus `get_opcode_from_script` and `get_pubkey_from_script`.
        #[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Debug, Hash)]
        pub enum $name {
            Base($base),
            GetOpcodeFromScript,
            GetPubkeyFromScript,
        }

        impl Jet for $name {
            fn cmr(&self) -> Cmr {
                match self {
                    Self::Base(jet) => jet.cmr(),
                    Self::GetOpcodeFromScript => Cmr::from_byte_array(GET_OPCODE_FROM_SCRIPT_CMR),
                    Self::GetPubkeyFromScript => Cmr::from_byte_array(GET_PUBKEY_FROM_SCRIPT_CMR),
                }
            }

            fn source_ty(&self) -> TypeName {
                match self {
                    Self::Base(jet) => jet.source_ty(),
                    Self::GetOpcodeFromScript | Self::GetPubkeyFromScript => TypeName(b"c"),
                }
            }

            fn target_ty(&self) -> TypeName {
                match self {
                    Self::Base(jet) => jet.target_ty(),
                    Self::GetOpcodeFromScript => TypeName(b"c"),
                    Self::GetPubkeyFromScript => TypeName(b"h"),
                }
            }

            fn encode(&self, w: &mut BitWriter<&mut dyn Write>) -> std::io::Result<usize> {
                match self {
                    Self::Base(jet) => jet.encode(w),
                    Self::GetOpcodeFromScript => w.write_bits_be(62, 6),
                    Self::GetPubkeyFromScript => w.write_bits_be(126, 7),
                }
            }

            fn decode<I: Iterator<Item = u8>>(_: &mut BitIter<I>) -> Result<Self, decode::Error> {
                // The browser only compiles; the service decodes. Decoding the base jets and the
                // custom codes needs to rewind the bit iterator, which can't be done safely here.
                Err(decode::Error::InvalidJet)
            }

            fn cost(&self) -> Cost {
                match self {
                    Self::Base(jet) => jet.cost(),
                    Self::GetOpcodeFromScript | Self::GetPubkeyFromScript => {
                        Cost::from_milliweight(100)
                    }
                }
            }

            fn parse(s: &str) -> Result<Self, simplicityhl::simplicity::Error> {
                s.parse()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                match self {
                    Self::Base(jet) => fmt::Display::fmt(jet, f),
                    Self::GetOpcodeFromScript => f.write_str("get_opcode_from_script"),
                    Self::GetPubkeyFromScript => f.write_str("get_pubkey_from_script"),
                }
            }
        }

        impl FromStr for $name {
            type Err = simplicityhl::simplicity::Error;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                match s {
                    "get_opcode_from_script" => Ok(Self::GetOpcodeFromScript),
                    "get_pubkey_from_script" => Ok(Self::GetPubkeyFromScript),
                    _ => s.parse::<$base>().map(Self::Base),
                }
            }
        }

        impl JetHL for $name {
            fn source_jet_classification(&self) -> SourceJetClassification {
                match self {
                    Self::Base(jet) => jet.source_jet_classification(),
                    Self::GetOpcodeFromScript | Self::GetPubkeyFromScript => {
                        SourceJetClassification::Unary
                    }
                }
            }

            fn target_jet_classification(&self) -> TargetJetClassification {
                match self {
                    Self::Base(jet) => jet.target_jet_classification(),
                    Self::GetOpcodeFromScript => TargetJetClassification::Unary,
                    Self::GetPubkeyFromScript => {
                        TargetJetClassification::Custom(BuiltinAlias::Pubkey.into())
                    }
                }
            }

            fn is_disabled(&self) -> bool {
                match self {
                    Self::Base(jet) => jet.is_disabled(),
                    Self::GetOpcodeFromScript | Self::GetPubkeyFromScript => false,
                }
            }

            fn clone_box(&self) -> Box<dyn JetHL> {
                Box::new(*self)
            }

            fn as_jet(&self) -> &dyn Jet {
                self
            }
        }

        #[derive(Clone, Copy, Debug, Default)]
        pub struct $hinter;

        impl JetHinter for $hinter {
            fn parse_jet(&self, name: &str) -> Option<Box<dyn JetHL>> {
                name.parse::<$name>()
                    .ok()
                    .map(|jet| Box::new(jet) as Box<dyn JetHL>)
            }

            fn construct_verify(&self) -> Box<dyn JetHL> {
                Box::new($name::Base($base::Verify))
            }

            fn conjure(&self, jet: &dyn Jet) -> Option<Box<dyn JetHL>> {
                let any = jet.as_any();
                any.downcast_ref::<$name>()
                    .copied()
                    .or_else(|| any.downcast_ref::<$base>().copied().map($name::Base))
                    .map(|jet| Box::new(jet) as Box<dyn JetHL>)
            }

            fn clone_box(&self) -> Box<dyn JetHinter> {
                Box::new(*self)
            }
        }
    };
}

extension_jets!(CoreExtension, CoreExtensionHinter, Core);
extension_jets!(ElementsExtension, ElementsExtensionHinter, Elements);
