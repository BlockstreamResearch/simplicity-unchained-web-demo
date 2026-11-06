import { POLICY_EXAMPLES, type PolicyExample } from "./policyExamples";

const equivalents: PolicyExample[] = POLICY_EXAMPLES.map((example) => {
  if (example.id === "one-recipient") return { ...example, title: "One asset recipient",
    description: "Require one asset output plus the explicit L-BTC fee output.",
    source: example.source.replace("jet::num_outputs(), 1", "jet::num_outputs(), 2") };
  return { ...example, description: example.description.replaceAll("sats", "asset units").replace("1,000-sat fee", "1,000-unit L-BTC fee").replace("100,000-sat debit", "100,000-unit current-asset debit") };
});

function assetExample(id: string, title: string, description: string, check: string, jets: string[]): PolicyExample {
  return { id, title, description, jets: [...jets, "policy_transaction_approval_hash"], fee: 1000, scope: "transaction",
    sequence: "4294967293", lockTime: "0", source: `fn main() {
    ${check}
    assert!(jet::le_64(jet::tx_fee(), 1000));
    jet::bip_0340_verify(
        (jet::cooperative_user_pubkey(), jet::policy_transaction_approval_hash()),
        witness::APPROVAL
    );
}` };
}

export const LIQUID_POLICY_EXAMPLES: PolicyExample[] = [
  ...equivalents,
  assetExample("fee-asset-only", "L-BTC inputs only", "Accept only L-BTC inputs; select L-BTC funding rather than issued assets.",
    "assert!(jet::eq_256(jet::current_asset(), jet::fee_asset()));", ["current_asset", "fee_asset", "tx_fee"]),
  assetExample("asset-fee-budget", "Explicit asset fee budget", "Cap the network-asset fee using an explicit asset selector.",
    "assert!(jet::le_64(jet::asset_fee(jet::fee_asset()), 1000));", ["asset_fee", "fee_asset", "tx_fee"]),
  assetExample("asset-debit-budget", "Multi-asset debit budget", "Limit net debit in the current asset independently on every input.",
    "assert!(jet::le_64(jet::asset_current_script_debit(jet::current_asset()), 100000));", ["asset_current_script_debit", "current_asset", "tx_fee"]),
  assetExample("lbtc-debit-budget", "L-BTC debit budget", "Limit L-BTC debit to 10,000 units regardless of which asset the input carries.",
    "assert!(jet::le_64(jet::asset_current_script_debit(jet::fee_asset()), 10000));", ["asset_current_script_debit", "fee_asset", "tx_fee"]),
  assetExample("lbtc-input-budget", "L-BTC funding budget", "Cap verified L-BTC input totals while retaining other approved assets.",
    "assert!(jet::le_64(jet::asset_total_input_value(jet::fee_asset()), 200000));", ["asset_total_input_value", "fee_asset", "tx_fee"]),
];
