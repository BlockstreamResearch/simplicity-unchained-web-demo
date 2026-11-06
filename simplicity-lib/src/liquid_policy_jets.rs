//! Compiler adapter for the separate portable Liquid manifest.
use simplicity_unchained_policy::liquid::Builtin;
use simplicityhl::{
    ast::JetHinter,
    jet::{JetHL, SourceJetClassification, TargetJetClassification},
    simplicity::{
        BitIter, BitWriter, Cmr, Cost, decode,
        jet::{Core, Jet, type_name::TypeName},
    },
    types::BuiltinAlias,
};
use std::{fmt, io::Write, str::FromStr};

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LiquidPolicy {
    Core(Core),
    Builtin(Builtin),
}
impl Jet for LiquidPolicy {
    fn cmr(&self) -> Cmr {
        match self {
            Self::Core(j) => j.cmr(),
            Self::Builtin(j) => Cmr::from_byte_array(j.cmr()),
        }
    }
    fn source_ty(&self) -> TypeName {
        match self {
            Self::Core(j) => j.source_ty(),
            Self::Builtin(j) => j.source_type(),
        }
    }
    fn target_ty(&self) -> TypeName {
        match self {
            Self::Core(j) => j.target_ty(),
            Self::Builtin(j) => j.target_type(),
        }
    }
    fn cost(&self) -> Cost {
        match self {
            Self::Core(j) => j.cost(),
            Self::Builtin(j) => Cost::from_milliweight(j.cost_milliweight()),
        }
    }
    fn encode(&self, w: &mut BitWriter<&mut dyn Write>) -> std::io::Result<usize> {
        match self {
            Self::Core(j) => {
                w.write_bit(false)?;
                j.encode(w).map(|n| n + 1)
            }
            Self::Builtin(j) => w.write_bits_be(128 | u64::from(j.id()), 8),
        }
    }
    fn decode<I: Iterator<Item = u8>>(bits: &mut BitIter<I>) -> Result<Self, decode::Error> {
        if !bits.next().ok_or(decode::Error::EndOfStream)? {
            return Core::decode(bits).map(Self::Core);
        }
        let mut id = 0;
        for _ in 0..7 {
            id = (id << 1) | u8::from(bits.next().ok_or(decode::Error::EndOfStream)?);
        }
        Builtin::from_id(id)
            .map(Self::Builtin)
            .ok_or(decode::Error::InvalidJet)
    }
    fn parse(name: &str) -> Result<Self, simplicityhl::simplicity::Error> {
        name.parse()
    }
}
impl fmt::Display for LiquidPolicy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Core(j) => j.fmt(f),
            Self::Builtin(j) => j.fmt(f),
        }
    }
}
impl FromStr for LiquidPolicy {
    type Err = simplicityhl::simplicity::Error;
    fn from_str(name: &str) -> Result<Self, Self::Err> {
        if let Ok(j) = name.parse::<Builtin>() {
            Ok(Self::Builtin(j))
        } else {
            name.parse().map(Self::Core)
        }
    }
}
impl JetHL for LiquidPolicy {
    fn source_jet_classification(&self) -> SourceJetClassification {
        match self {
            Self::Core(j) => j.source_jet_classification(),
            Self::Builtin(j) => {
                let mut b = j.source_type().0;
                let args = match b[0] {
                    b'1' => vec![],
                    b'*' => {
                        b = &b[1..];
                        vec![
                            crate::policy_jets::aliased_type(&mut b),
                            crate::policy_jets::aliased_type(&mut b),
                        ]
                    }
                    _ => vec![crate::policy_jets::aliased_type(&mut b)],
                };
                SourceJetClassification::Custom(args)
            }
        }
    }
    fn target_jet_classification(&self) -> TargetJetClassification {
        match self {
            Self::Core(j) => j.target_jet_classification(),
            Self::Builtin(Builtin::Policy(
                simplicity_unchained_policy::Builtin::CooperativeUserPubkey
                | simplicity_unchained_policy::Builtin::CooperativeServicePubkey,
            )) => TargetJetClassification::Custom(BuiltinAlias::Pubkey.into()),
            Self::Builtin(j) => TargetJetClassification::Custom(crate::policy_jets::aliased_type(
                &mut j.target_type().0,
            )),
        }
    }
    fn is_disabled(&self) -> bool {
        false
    }
    fn clone_box(&self) -> Box<dyn JetHL> {
        Box::new(*self)
    }
    fn as_jet(&self) -> &dyn Jet {
        self
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct LiquidPolicyHinter;
impl JetHinter for LiquidPolicyHinter {
    fn parse_jet(&self, name: &str) -> Option<Box<dyn JetHL>> {
        name.parse::<LiquidPolicy>()
            .ok()
            .map(|j| Box::new(j) as Box<dyn JetHL>)
    }
    fn construct_verify(&self) -> Box<dyn JetHL> {
        Box::new(LiquidPolicy::Core(Core::Verify))
    }
    fn conjure(&self, jet: &dyn Jet) -> Option<Box<dyn JetHL>> {
        jet.as_any()
            .downcast_ref::<LiquidPolicy>()
            .copied()
            .or_else(|| {
                jet.as_any()
                    .downcast_ref::<Core>()
                    .copied()
                    .map(LiquidPolicy::Core)
            })
            .map(|j| Box::new(j) as Box<dyn JetHL>)
    }
    fn clone_box(&self) -> Box<dyn JetHinter> {
        Box::new(*self)
    }
}
