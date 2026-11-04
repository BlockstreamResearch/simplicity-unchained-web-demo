import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import {
  createDemoSource, createSpendPlan, DEMO_NETWORKS,
  type DemoNetwork, type DemoScenario, type DemoSource,
} from "@/utils/demo";
import type { proxyApi } from "./proxyApi";

export interface PreparedProgram {
  network: DemoNetwork;
  compiledProgramBase64: string;
  compiledWitnessBase64: string;
  compiledHex: string;
  compiledAddress: string;
  tweakedPublicKey: string;
  userLeafHash: string;
  compiledUserPubkey: string;
  cosignSecretKey: string;
}

export type PreparedDemo = PreparedProgram & DemoSource;

export interface TransactionResult {
  txid: string;
  explorer_url: string;
  network: DemoNetwork;
  outputValue: number;
  fee: number;
}

type PreparationApi = Pick<typeof proxyApi, "compile" | "tweak" | "convert">;
type SigningApi = Pick<typeof proxyApi,
  "createPsbt" | "createPset" | "simplicitySignPsbt" | "simplicitySignPset"
  | "sighashPsbt" | "sighashPset" | "finalizePsbt" | "finalizePset" | "broadcastTransaction">;

/** The service must commit to the program the browser compiled, not a different decoding of it. */
export function assertSameProgram(browserCmr: string, serviceCmr: string) {
  if (browserCmr.toLowerCase() !== serviceCmr.toLowerCase()) {
    throw new Error(`The service decoded a different program (CMR ${serviceCmr}, compiled ${browserCmr}). The browser's jet definitions are out of date with the service.`);
  }
}

export async function prepareDemo(
  network: DemoNetwork,
  scenario: DemoScenario,
  existingKey: string,
  api: PreparationApi,
  progress: (message: string) => void,
): Promise<PreparedDemo> {
  progress("Creating the demo key and program");
  const source = createDemoSource(scenario, existingKey);
  progress("Compiling the Simplicity program and witness");
  const compiled = await api.compile({
    script: source.simplicityProgram,
    witness: JSON.parse(source.witProgram),
    environment: network,
    include_debug: false,
  });
  progress("Requesting the program-tweaked Simplicity Unchained key");
  const tweak = await api.tweak({ program: compiled.program_base64, jet_env: network });
  assertSameProgram(compiled.cmr_hex, tweak.cmr_hex);
  progress("Building the cooperative and recovery Taproot leaves");
  const converted = await api.convert({
    script: source.bitcoinScript,
    network: DEMO_NETWORKS[network].network,
    service_pubkey: tweak.tweaked_public_key_hex,
    user_pubkey: source.compiledUserPubkey,
  });
  return {
    ...source, network,
    compiledProgramBase64: compiled.program_base64,
    compiledWitnessBase64: compiled.witness_base64 || "",
    compiledHex: converted.hex,
    compiledAddress: converted.address,
    tweakedPublicKey: tweak.tweaked_public_key_hex,
    userLeafHash: converted.user_leaf_hash_hex,
  };
}

export async function sendDemoTransaction(
  program: PreparedProgram,
  funding: { txid: string; vout: number; value: number; asset?: string },
  api: SigningApi,
  progress: (message: string) => void,
): Promise<TransactionResult> {
  if (!/^[0-9a-fA-F]{64}$/.test(funding.txid) || !Number.isSafeInteger(funding.vout) || funding.vout < 0) {
    throw new Error("Select a valid funding transaction and output index.");
  }
  const plan = createSpendPlan(funding.value);
  const config = DEMO_NETWORKS[program.network];
  if (config.asset && funding.asset !== config.asset) throw new Error("Use Liquid Testnet L-BTC, not a different asset.");
  if (!/^[0-9a-fA-F]{64}$/.test(program.cosignSecretKey)) throw new Error("Invalid demo secret key.");
  const secret = Buffer.from(program.cosignSecretKey, "hex");
  const publicKey = Buffer.from(secp256k1.getPublicKey(secret, true)).toString("hex");
  if (publicKey !== program.compiledUserPubkey) throw new Error("The demo key changed. Prepare the address again.");
  const inputs = [`${funding.txid}:${funding.vout}`];
  const outputs = [`${program.compiledAddress}:${plan.outputValue}`];
  const signRequest = {
    input_index: 0,
    program: program.compiledProgramBase64,
    witness: program.compiledWitnessBase64,
    redeem_script_hex: program.compiledHex,
    user_pubkey: program.compiledUserPubkey,
    user_leaf_hash_hex: program.userLeafHash,
  };
  let transactionHex: string;
  progress("1/4 Creating the unsigned transaction");
  if (program.network === "bitcoin") {
    const unsigned = await api.createPsbt({ inputs, outputs, network: config.network });
    progress("2/4 Oracle executing Simplicity and co-signing");
    const signed = await api.simplicitySignPsbt({ ...signRequest, psbt_hex: unsigned.psbt });
    progress("3/4 Signing locally and verifying both signatures");
    const hash = await api.sighashPsbt({ psbt_hex: signed.psbt_hex, input_index: 0 });
    const signature = schnorr.sign(Buffer.from(hash.sighash_hex, "hex"), secret);
    const finalized = await api.finalizePsbt({
      psbt_hex: signed.psbt_hex, input_index: 0,
      signature_hex: Buffer.from(signature).toString("hex"), public_key_hex: publicKey,
    });
    transactionHex = finalized.transaction_hex;
  } else {
    const unsigned = await api.createPset({ inputs, outputs: [...outputs, `fee:${plan.fee}`], asset_id: config.asset, network: config.network });
    progress("2/4 Oracle executing Simplicity and co-signing");
    const signed = await api.simplicitySignPset({ ...signRequest, pset_hex: unsigned.pset });
    progress("3/4 Signing locally and verifying both signatures");
    const hash = await api.sighashPset({ pset_hex: signed.pset_hex, input_index: 0, network: config.network });
    const signature = schnorr.sign(Buffer.from(hash.sighash_hex, "hex"), secret);
    const finalized = await api.finalizePset({
      pset_hex: signed.pset_hex, input_index: 0, network: config.network,
      signature_hex: Buffer.from(signature).toString("hex"), public_key_hex: publicKey,
    });
    transactionHex = finalized.transaction_hex;
  }
  progress("4/4 Broadcasting to the test network");
  const broadcast = await api.broadcastTransaction({ transaction_hex: transactionHex }, program.network);
  return { ...broadcast, network: program.network, outputValue: plan.outputValue, fee: plan.fee };
}
