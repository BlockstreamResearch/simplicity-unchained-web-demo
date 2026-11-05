import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";

export type DemoNetwork = "elements" | "bitcoin";
export type DemoScenario = "opcode" | "signature";

export const DEMO_FEE_SATS = 1000;
export const MIN_DEMO_OUTPUT_SATS = 1000;
export const DEMO_NETWORKS = {
  elements: {
    label: "Liquid Testnet",
    network: "liquid_testnet",
    api: "https://blockstream.info/liquidtestnet/api",
    explorer: "https://blockstream.info/liquidtestnet",
    faucet: "https://liquidtestnet.com/faucet",
    asset: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
    suggestedFunding: 100000,
  },
  bitcoin: {
    label: "Bitcoin Testnet4",
    network: "testnet4",
    api: "https://mempool.space/testnet4/api",
    explorer: "https://mempool.space/testnet4",
    faucet: "https://mempool.space/testnet4/faucet",
    asset: null,
    suggestedFunding: 5000,
  },
} as const;

export const DEMO_SCENARIOS = [
  {
    id: "opcode",
    title: "Inspect a script",
    description: "The oracle checks an opcode in the recovery script before it co-signs.",
  },
  {
    id: "signature",
    title: "Prove authorization",
    description: "The oracle checks a message signature against a key in the recovery script.",
  },
] as const;

export interface DemoSource {
  simplicityProgram: string;
  witProgram: string;
  bitcoinScript: string;
  cosignSecretKey: string;
  compiledUserPubkey: string;
}

const DEMO_MESSAGE = "Simplicity Unchained live demo";

export const DEMO_PROGRAM_NOTES: Record<DemoScenario, string[]> = {
  opcode: [
    "get_opcode_from_script(0) reads the first opcode of your recovery script.",
    "The program only succeeds if that opcode is 0x21 (OP_PUSHBYTES_33), i.e. the script starts with a compressed public key.",
    "If the assertion fails, the oracle refuses to co-sign and nothing is broadcast.",
  ],
  signature: [
    "get_pubkey_from_script(0) takes the public key embedded in your recovery script.",
    "bip_0340_verify checks the SIG witness is a valid Schnorr signature by that key over a fixed message hash.",
    "This fixed-message witness is replayable. It demonstrates key authorization, not per-transaction approval.",
  ],
};

export function recoveryScriptForKey(compressedPublicKey: string) {
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(compressedPublicKey)) {
    throw new Error("Expected a 33-byte compressed public key.");
  }
  return `OP_PUSHBYTES_33 0x${compressedPublicKey} OP_DROP OP_PUSHBYTES_32 0x${compressedPublicKey.slice(2)} OP_CHECKSIG`;
}

export function demoProgram(scenario: DemoScenario) {
  if (scenario === "opcode") {
    return `fn main() {
    // Require compressed public-key metadata in the recovery script.
    assert!(jet::eq_8(jet::get_opcode_from_script(0), 0x21));
}`;
  }
  const messageHash = Buffer.from(sha256(new TextEncoder().encode(DEMO_MESSAGE))).toString("hex");
  return `fn main() {
    // Only authorize the spend if the supplied message signature is valid.
    let pk: Pubkey = jet::get_pubkey_from_script(0);
    let message: u256 = 0x${messageHash};
    jet::bip_0340_verify((pk, message), witness::SIG);
}`;
}

export function createDemoSource(scenario: DemoScenario, existingKey = ""): DemoSource {
  const secret = existingKey || Buffer.from(secp256k1.utils.randomSecretKey()).toString("hex");
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error("The demo key must be 32 bytes of hexadecimal. Correct it in Advanced.");
  }
  const key = Buffer.from(secret, "hex");
  const publicKey = Buffer.from(secp256k1.getPublicKey(key, true)).toString("hex");
  const bitcoinScript = recoveryScriptForKey(publicKey);
  const messageHash = sha256(new TextEncoder().encode(DEMO_MESSAGE));
  const witness = scenario === "signature" ? {
    SIG: {
      value: `0x${Buffer.from(schnorr.sign(messageHash, key)).toString("hex")}`,
      type: "Signature",
    },
  } : {};

  return {
    simplicityProgram: demoProgram(scenario),
    witProgram: JSON.stringify(witness, null, 2),
    bitcoinScript,
    cosignSecretKey: secret,
    compiledUserPubkey: publicKey,
  };
}

export function createSpendPlan(inputValue: number) {
  if (!Number.isSafeInteger(inputValue) || inputValue < DEMO_FEE_SATS + MIN_DEMO_OUTPUT_SATS) {
    throw new Error(`Use an unspent output of at least ${DEMO_FEE_SATS + MIN_DEMO_OUTPUT_SATS} sats.`);
  }
  return { inputValue, fee: DEMO_FEE_SATS, outputValue: inputValue - DEMO_FEE_SATS };
}

export function transactionExplorerUrl(network: DemoNetwork, txid: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
    throw new Error("The explorer returned an invalid transaction ID.");
  }
  return `${DEMO_NETWORKS[network].explorer}/tx/${txid}`;
}
