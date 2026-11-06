import { DEFAULT_POLICY_SOURCE } from "./policyDefaults";

export interface PolicyExample {
  id: string;
  title: string;
  description: string;
  source: string;
  jets: string[];
  fee: number;
  scope: "transaction" | "input";
  sequence: string;
  lockTime: string;
}

function example(id: string, title: string, description: string, checks: string[], jets: string[], options: Partial<Pick<PolicyExample, "fee" | "scope" | "sequence" | "lockTime">> = {}): PolicyExample {
  const settings = { fee: 1000, scope: "transaction" as const, sequence: "4294967293", lockTime: "0", ...options };
  const approval = settings.scope === "input" ? "policy_approval_hash" : "policy_transaction_approval_hash";
  return {
    id, title, description, ...settings, jets: [...jets, approval],
    source: `fn main() {
${checks.map((check) => `    ${check}`).join("\n")}
    jet::bip_0340_verify(
        (jet::cooperative_user_pubkey(), jet::${approval}()),
        witness::APPROVAL
    );
}`,
  };
}

export const POLICY_EXAMPLES: PolicyExample[] = [
  { ...example("approved-spend", "Approved spend", "Fresh approval, a 1,000-sat fee cap and a 100,000-sat debit cap.", [], ["tx_fee", "current_script_debit"]), source: DEFAULT_POLICY_SOURCE },
  example("small-spend", "Small payment", "Limit net debit to 10,000 sats, including fees.", ["assert!(jet::le_64(jet::tx_fee(), 1000));", "assert!(jet::le_64(jet::current_script_debit(), 10000));"], ["tx_fee", "current_script_debit"]),
  example("low-fee", "Low fee", "Reject transactions charging more than 250 sats.", ["assert!(jet::le_64(jet::tx_fee(), 250));"], ["tx_fee"], { fee: 250 }),
  example("larger-spend", "Larger payment", "Allow up to 500,000 sats of net debit with fresh approval.", ["assert!(jet::le_64(jet::tx_fee(), 1000));", "assert!(jet::le_64(jet::current_script_debit(), 500000));"], ["tx_fee", "current_script_debit"]),
  example("one-input", "One funding output", "Require exactly one input: simple funding and review.", ["assert!(jet::eq_32(jet::num_inputs(), 1));", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["num_inputs", "tx_fee"]),
  example("one-recipient", "One recipient", "Require exactly one output, so the approved send has one destination.", ["assert!(jet::eq_32(jet::num_outputs(), 1));", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["num_outputs", "tx_fee"]),
  example("small-batch", "Small batch", "Allow up to three inputs and three recipients.", ["assert!(jet::le_32(jet::num_inputs(), 3));", "assert!(jet::le_32(jet::num_outputs(), 3));", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["num_inputs", "num_outputs", "tx_fee"]),
  example("rbf", "Fee-bump enabled", "Require replace-by-fee signaling; later edits still need new approval.", ["assert!(jet::is_rbf_signaled());", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["is_rbf_signaled", "tx_fee"]),
  example("csv-blocks", "Six-block delay", "Require a six-block relative lock. Chain maturity must be checked separately.", ["jet::check_csv_blocks(6);", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["check_csv_blocks", "tx_fee"], { sequence: "6" }),
  example("cltv-height", "Block-height lock", "Require a locktime of at least block 200 with locktime-enabled inputs.", ["jet::check_cltv_height(200);", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["check_cltv_height", "tx_fee"], { lockTime: "200" }),
  example("cltv-time", "Date-based lock", "Require a timestamp lock from January 2025 or later.", ["jet::check_cltv_time(1735689600);", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["check_cltv_time", "tx_fee"], { lockTime: "1735689600" }),
  example("per-input", "Per-input approval", "Bind your approval to this exact input and its signing digest.", ["assert!(jet::le_64(jet::tx_fee(), 1000));"], ["tx_fee"], { scope: "input" }),
  example("input-budget", "Funding cap", "Accept at most 200,000 sats of total verified input value.", ["assert!(jet::le_64(jet::total_input_value(), 200000));", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["total_input_value", "tx_fee"]),
  example("return-change", "Return change", "Return at least 1,000 sats to the same policy address.", ["assert!(jet::le_64(1000, jet::value_returned_to_current_script()));", "assert!(jet::le_64(jet::tx_fee(), 1000));"], ["value_returned_to_current_script", "tx_fee"]),
];
