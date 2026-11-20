export const VAULT_COIN_SATS = 1_000_000;
export const VAULT_LIMIT_SATS = 50_000;
export const VAULT_WAIT_BLOCKS = 144;

export const VAULT_POLICY_SOURCE = `fn main() {
    // 1. At most 50,000 sats leave the vault, fees included.
    let debit: u64 = jet::current_script_debit();
    assert!(jet::le_64(debit, 50000));

    // 2. At most one change output returns to the vault.
    let vault: u256 = jet::current_script_hash();
    let vault_outputs: u32 = jet::output_count_for_script(vault);
    assert!(jet::le_32(vault_outputs, 1));

    // 3. The vault coin must wait 144 blocks (about a day).
    jet::check_csv_blocks(144);

    // 4. You approve this exact transaction.
    let user: Pubkey = jet::cooperative_user_pubkey();
    let tx: u256 = jet::policy_transaction_approval_hash();
    jet::bip_0340_verify((user, tx), witness::APPROVAL);
}`;

export type VaultRule = 1 | 2 | 3 | 4;
export type VaultOutput = { label: string; sats: number; to: "vault" | "recipient" | "elsewhere" };
export type VaultScenario = { id: string; tab: string; title: string; text: string; lockBlocks: number; outputs: VaultOutput[] };

const recipient: VaultOutput = { label: "Recipient", sats: 49_000, to: "recipient" };
const change: VaultOutput = { label: "Vault change", sats: 950_000, to: "vault" };

export const VAULT_SCENARIOS: VaultScenario[] = [
  { id: "withdraw", tab: "Withdraw", title: "A normal withdrawal", text: "Pay 49,000 sats with a 1,000-sat fee. The rest returns to the vault as one coin.", lockBlocks: VAULT_WAIT_BLOCKS, outputs: [recipient, change] },
  { id: "drain", tab: "Take more", title: "Take 149,000 sats at once", text: "Three times the allowance in a single transaction.", lockBlocks: VAULT_WAIT_BLOCKS, outputs: [{ ...recipient, sats: 149_000 }, { ...change, sats: 850_000 }] },
  { id: "redirect", tab: "Steal the change", title: "Send the change elsewhere", text: "Pay 49,000 sats, then route the 950,000-sat change to another address.", lockBlocks: VAULT_WAIT_BLOCKS, outputs: [recipient, { label: "Another address", sats: 950_000, to: "elsewhere" }] },
  { id: "split", tab: "Split the vault", title: "Split the change into two vault coins", text: "The coins stay in the vault, but each would get its own 50,000-sat allowance next time.", lockBlocks: VAULT_WAIT_BLOCKS, outputs: [recipient, { ...change, sats: 475_000 }, { ...change, sats: 475_000 }] },
  { id: "rush", tab: "Skip the wait", title: "Spend again after 6 blocks", text: "The same amounts as a normal withdrawal, with a 6-block relative lock instead of 144.", lockBlocks: 6, outputs: [recipient, change] },
];

export function evaluateVaultScenario(scenario: VaultScenario) {
  const sum = (outputs: VaultOutput[]) => outputs.reduce((total, output) => total + output.sats, 0);
  const vaultOutputs = scenario.outputs.filter((output) => output.to === "vault");
  const fee = VAULT_COIN_SATS - sum(scenario.outputs);
  // Mirrors current_script_debit: every sat not returned to the vault, fees included.
  const debit = VAULT_COIN_SATS - sum(vaultOutputs);
  const failed: VaultRule[] = [];
  if (debit > VAULT_LIMIT_SATS) failed.push(1);
  if (vaultOutputs.length > 1) failed.push(2);
  if (scenario.lockBlocks < VAULT_WAIT_BLOCKS) failed.push(3);
  return { fee, debit, vaultOutputCount: vaultOutputs.length, failed, accepted: failed.length === 0 };
}

export const VAULT_MIN_WITHDRAWALS_TO_DRAIN = Math.ceil(VAULT_COIN_SATS / VAULT_LIMIT_SATS);
export const VAULT_MIN_BLOCKS_TO_DRAIN = (VAULT_MIN_WITHDRAWALS_TO_DRAIN - 1) * VAULT_WAIT_BLOCKS;
