import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const backend = new URL("../../simplicity-unchained/", import.meta.url);
const required = [
  "policy/Cargo.toml",
  "policy/tests/fixtures/golden.json",
  "examples/policy/recipient_allowlist.simf",
  "examples/policy/capped_debit.simf",
  "examples/policy/approvals_2_of_3.simf",
  "examples/policy/approvals_2_of_3_per_input.simf",
  "examples/policy/constrained_source.simf",
];
const missing = required.filter((path) => !existsSync(new URL(path, backend)));
if (missing.length) {
  console.error(`Matching sibling backend checkout required at ${fileURLToPath(backend)}.`);
  console.error(`Missing: ${missing.join(", ")}.`);
  console.error("See README.md and DEPLOYMENT.md. The portable policy crate is a local path dependency, not a published package or an automatically fetched Git revision.");
  process.exitCode = 1;
}
