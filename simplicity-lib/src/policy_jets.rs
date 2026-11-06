//! Bitcoin policy compiler adapter. The portable registry owns every new jet definition.
use std::{fmt, io::Write, str::FromStr, sync::OnceLock};

use simplicity_unchained_policy::Builtin;
use simplicityhl::{
    ast::JetHinter,
    jet::{JetHL, SourceJetClassification, TargetJetClassification},
    simplicity::{
        BitIter, BitWriter, Cmr, Cost, decode,
        jet::{Core, Jet, type_name::TypeName},
    },
    types::{AliasedType, BuiltinAlias, TypeConstructible},
};

use crate::jets::CoreExtension;

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BitcoinPolicy {
    Legacy(CoreExtension),
    Builtin(Builtin),
}

impl Jet for BitcoinPolicy {
    fn cmr(&self) -> Cmr {
        match self {
            Self::Legacy(jet) => jet.cmr(),
            Self::Builtin(jet) => Cmr::from_byte_array(jet.cmr()),
        }
    }

    fn source_ty(&self) -> TypeName {
        match self {
            Self::Legacy(jet) => jet.source_ty(),
            Self::Builtin(jet) => jet.source_type(),
        }
    }

    fn target_ty(&self) -> TypeName {
        match self {
            Self::Legacy(jet) => jet.target_ty(),
            Self::Builtin(jet) => jet.target_type(),
        }
    }

    fn cost(&self) -> Cost {
        match self {
            Self::Legacy(jet) => jet.cost(),
            Self::Builtin(jet) => Cost::from_milliweight(jet.cost_milliweight()),
        }
    }

    fn encode(&self, writer: &mut BitWriter<&mut dyn Write>) -> std::io::Result<usize> {
        match self {
            Self::Legacy(jet) => Ok(writer.write_bits_be(0, 1)? + jet.encode(writer)?),
            Self::Builtin(jet) => writer.write_bits_be(64 | u64::from(jet.id()), 7),
        }
    }

    fn decode<I: Iterator<Item = u8>>(bits: &mut BitIter<I>) -> Result<Self, decode::Error> {
        if bits.next().ok_or(decode::Error::EndOfStream)? {
            let mut id = 0;
            for _ in 0..6 {
                id = (id << 1) | u8::from(bits.next().ok_or(decode::Error::EndOfStream)?);
            }
            return Builtin::from_id(id)
                .map(Self::Builtin)
                .ok_or(decode::Error::InvalidJet);
        }
        decode_legacy(bits).map(Self::Legacy)
    }

    fn parse(name: &str) -> Result<Self, simplicityhl::simplicity::Error> {
        name.parse()
    }
}

impl fmt::Display for BitcoinPolicy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Legacy(jet) => fmt::Display::fmt(jet, f),
            Self::Builtin(jet) => f.write_str(jet.name()),
        }
    }
}

impl FromStr for BitcoinPolicy {
    type Err = simplicityhl::simplicity::Error;

    fn from_str(name: &str) -> Result<Self, Self::Err> {
        if let Some(jet) = Builtin::ALL.into_iter().find(|jet| jet.name() == name) {
            Ok(Self::Builtin(jet))
        } else {
            name.parse().map(Self::Legacy)
        }
    }
}

/// Retain words, Options, bools and tuples rather than flattening every type to an integer.
pub(crate) fn aliased_type(bytes: &mut &[u8]) -> AliasedType {
    let (first, rest) = bytes
        .split_first()
        .expect("registry type must not be empty");
    *bytes = rest;
    match first {
        b'1' => AliasedType::unit(),
        b'2' => AliasedType::boolean(),
        b'c' => AliasedType::u8(),
        b's' => AliasedType::u16(),
        b'i' => AliasedType::u32(),
        b'l' => AliasedType::u64(),
        b'h' => AliasedType::u256(),
        b'*' => AliasedType::product(aliased_type(bytes), aliased_type(bytes)),
        b'+' if bytes.first() == Some(&b'1') => {
            *bytes = &bytes[1..];
            AliasedType::option(aliased_type(bytes))
        }
        b'+' => AliasedType::either(aliased_type(bytes), aliased_type(bytes)),
        _ => unreachable!("unsupported canonical policy registry type"),
    }
}

impl JetHL for BitcoinPolicy {
    fn source_jet_classification(&self) -> SourceJetClassification {
        match self {
            Self::Legacy(jet) => jet.source_jet_classification(),
            Self::Builtin(jet) => {
                let mut bytes = jet.source_type().0;
                let args = match bytes[0] {
                    b'1' => vec![],
                    b'*' => {
                        bytes = &bytes[1..];
                        vec![aliased_type(&mut bytes), aliased_type(&mut bytes)]
                    }
                    _ => vec![aliased_type(&mut bytes)],
                };
                SourceJetClassification::Custom(args)
            }
        }
    }

    fn target_jet_classification(&self) -> TargetJetClassification {
        match self {
            Self::Legacy(jet) => jet.target_jet_classification(),
            Self::Builtin(Builtin::CooperativeUserPubkey | Builtin::CooperativeServicePubkey) => {
                TargetJetClassification::Custom(BuiltinAlias::Pubkey.into())
            }
            Self::Builtin(jet) => {
                TargetJetClassification::Custom(aliased_type(&mut jet.target_type().0))
            }
        }
    }

    fn is_disabled(&self) -> bool {
        matches!(self, Self::Legacy(jet) if jet.is_disabled())
    }

    fn clone_box(&self) -> Box<dyn JetHL> {
        Box::new(*self)
    }

    fn as_jet(&self) -> &dyn Jet {
        self
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct BitcoinPolicyHinter;

impl JetHinter for BitcoinPolicyHinter {
    fn parse_jet(&self, name: &str) -> Option<Box<dyn JetHL>> {
        name.parse::<BitcoinPolicy>()
            .ok()
            .map(|jet| Box::new(jet) as Box<dyn JetHL>)
    }

    fn construct_verify(&self) -> Box<dyn JetHL> {
        Box::new(BitcoinPolicy::Legacy(CoreExtension::Base(Core::Verify)))
    }

    fn conjure(&self, jet: &dyn Jet) -> Option<Box<dyn JetHL>> {
        let any = jet.as_any();
        any.downcast_ref::<BitcoinPolicy>()
            .copied()
            .or_else(|| {
                any.downcast_ref::<CoreExtension>()
                    .copied()
                    .map(BitcoinPolicy::Legacy)
            })
            .or_else(|| {
                any.downcast_ref::<Core>()
                    .copied()
                    .map(|jet| BitcoinPolicy::Legacy(CoreExtension::Base(jet)))
            })
            .map(|jet| Box::new(jet) as Box<dyn JetHL>)
    }

    fn clone_box(&self) -> Box<dyn JetHinter> {
        Box::new(*self)
    }
}

#[derive(Default)]
struct LegacyNode {
    children: [Option<usize>; 2],
    jet: Option<CoreExtension>,
}

/// A cached prefix trie avoids copying or rewinding an arbitrary bit iterator.
fn decode_legacy<I: Iterator<Item = u8>>(
    bits: &mut BitIter<I>,
) -> Result<CoreExtension, decode::Error> {
    static TRIE: OnceLock<Vec<LegacyNode>> = OnceLock::new();
    let trie = TRIE.get_or_init(|| {
        let mut trie = vec![LegacyNode::default()];
        let jets = Core::ALL.into_iter().map(CoreExtension::Base).chain([
            CoreExtension::GetOpcodeFromScript,
            CoreExtension::GetPubkeyFromScript,
            CoreExtension::TxApprovalHash,
        ]);
        for jet in jets {
            let mut bytes = vec![];
            let mut writer = BitWriter::new(&mut bytes as &mut dyn Write);
            let len = jet.encode(&mut writer).expect("encoding into a Vec");
            writer.flush_all().expect("flushing into a Vec");
            let mut node = 0;
            for bit in BitIter::from(bytes).take(len) {
                let branch = usize::from(bit);
                node = if let Some(next) = trie[node].children[branch] {
                    next
                } else {
                    let next = trie.len();
                    trie.push(LegacyNode::default());
                    trie[node].children[branch] = Some(next);
                    next
                };
            }
            assert!(trie[node].jet.replace(jet).is_none());
        }
        trie
    });
    let mut node = 0;
    loop {
        if let Some(jet) = trie[node].jet {
            return Ok(jet);
        }
        let branch = usize::from(bits.next().ok_or(decode::Error::EndOfStream)?);
        node = trie[node].children[branch].ok_or(decode::Error::InvalidJet)?;
    }
}
