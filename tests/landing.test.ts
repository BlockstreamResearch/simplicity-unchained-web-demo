import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage from "../app/page";
import ExtensionsPage, { metadata as extensionsMetadata } from "../app/docs/extensions/page";
import { QuickSetup, exampleConfig, pullCommand, setupCommand } from "../components/QuickSetup";
import { VAULT_SCENARIOS, evaluateVaultScenario } from "../services/vaultExample";

test("SU landing introduces both policy networks and links into the separate demo", () => {
  const html = renderToStaticMarkup(createElement(LandingPage));
  assert.match(html, /Simplicity Unchained/);
  assert.match(html, /Bitcoin Testnet4/);
  assert.match(html, /Liquid Testnet/);
  assert.match(html, /Illustrative example/);
  assert.match(html, /Your own jets/);
  assert.match(html, /href="\/docs\/extensions"/);
  assert.equal((html.match(/href="\/demo"/g) ?? []).length, 3);
  assert.match(html, /href="\/docs\?network=liquidtestnet#jet-reference"/);
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /aria-label="Footer navigation"/);
  assert.match(html, />Testnet</);
  assert.match(html, /Open source\. Testnet\./);
  assert.doesNotMatch(html, /Experimental|The web demo uses fixed, versioned policy profiles/);
  assert.doesNotMatch(html, /<select|<textarea|Security Warning - Demo Environment/);
});

test("quick setup explains operator-provided config and exposes a minimal Docker command", () => {
  const html = renderToStaticMarkup(createElement(LandingPage));
  assert.match(html, /id="quick-setup"/);
  assert.match(html, /href="#quick-setup"/);
  assert.match(html, /Quick SU setup/);
  assert.match(html, /Prepare your own <code>config\.toml<\/code>/);
  assert.match(html, /readable by container UID <code>1000<\/code>/);
  assert.match(exampleConfig, /^bitcoin_network = "testnet4"\nliquid_network = "liquidtestnet"$/m);
  assert.match(exampleConfig, /^# bitcoin_network = "bitcoin"\n# liquid_network = "liquid"$/m);
  assert.match(html, /ARM hosts need emulation/);
  assert.doesNotMatch(html, /Provision once|Verify the API|set -C|umask|chown|\/dev\/urandom/);
});

test("quick setup keeps the complete commands collapsed by default", () => {
  const html = renderToStaticMarkup(createElement(QuickSetup));
  assert.equal((html.match(/<details\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<details\b[^>]*\bopen(?:=|\s|>)/);
  assert.match(html, /<summary\b[^>]*>Docker command/);
  const details = html.match(/<details\b[\s\S]*?<\/details>/)?.[0];
  assert.ok(details);
  assert.equal((details.match(/<pre\b/g) ?? []).length, 3);
  assert.match(details, /aria-label="Docker pull command"/);
  assert.match(details, /aria-label="Docker run command"/);
  assert.match(details, /aria-label="Example config\.toml"/);
  assert.match(details, /data-token="command">docker<\/span>/);
  assert.match(details, /data-token="command">pull<\/span>/);
  assert.match(details, /data-token="option">--publish<\/span>/);
  assert.match(details, /data-token="variable">\$PWD<\/span>/);
  assert.match(details, /data-token="image">ghcr\.io\/blockstreamresearch\/simplicity-unchained/);
  assert.match(details, /data-token="section">\[service\]<\/span>/);
  assert.match(details, /data-token="key">private_key<\/span>/);
  assert.match(details, /data-token="string">&quot;&lt;64-hex-private-key&gt;&quot;<\/span>/);
  assert.match(details, /data-token="comment"># Bitcoin Testnet4<\/span>/);
  assert.match(html, /Full setup guide/);
});

test("vault section shows the policy, a co-signed withdrawal and the Script comparison", () => {
  const html = renderToStaticMarkup(createElement(LandingPage));
  const section = html.match(/<section id="beyond-script"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.match(section, /A vault Bitcoin Script can&#x27;t write\./);
  assert.match(section, /data-token="keyword">fn<\/span>/);
  assert.match(section, /data-token="function">jet::current_script_debit<\/span>/);
  assert.match(section, /data-token="type">u64<\/span>/);
  assert.match(section, /data-token="variable">witness::APPROVAL<\/span>/);
  assert.match(section, /data-token="comment">\/\/ 1\. At most 50,000 sats leave/);
  assert.equal((section.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((section.match(/aria-pressed=/g) ?? []).length, VAULT_SCENARIOS.length);
  assert.match(section, /<strong class="font-semibold">Co-signed\.<\/strong> 50,000 sats leave; 950,000 stay in the vault\./);
  assert.doesNotMatch(section, /bg-danger\/25/);
  assert.match(section, /recovery leaf bypasses the policy/);
});

test("each vault scenario passes or fails exactly the policy rule it demonstrates", () => {
  const outcomes = Object.fromEntries(VAULT_SCENARIOS.map((scenario) => [scenario.id, evaluateVaultScenario(scenario)]));
  assert.deepEqual(Object.fromEntries(Object.entries(outcomes).map(([id, result]) => [id, result.failed])), {
    withdraw: [], drain: [1], redirect: [1], split: [2], rush: [3],
  });
  assert.deepEqual([outcomes.withdraw.debit, outcomes.drain.debit, outcomes.redirect.debit, outcomes.split.debit], [50_000, 150_000, 1_000_000, 50_000]);
  for (const result of Object.values(outcomes)) assert.equal(result.fee, 1_000);
});

test("Docker example uses the supplied config read-only and handles directory names with spaces", () => {
  const result = spawnSync("sh", ["-eu"], {
    input: `PWD='/tmp/my SU config'\ndocker() { printf '%s\\n' "$@"; }\n${setupCommand}`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const args = result.stdout.trim().split("\n");
  assert.equal(args[0], "run");
  assert.equal(args[args.indexOf("--platform") + 1], "linux/amd64");
  assert.equal(args[args.indexOf("--publish") + 1], "127.0.0.1:30431:30431");
  assert.equal(args[args.indexOf("--mount") + 1], "type=bind,src=/tmp/my SU config/config.toml,dst=/app/config.toml,readonly");
  assert.ok(args.includes("ghcr.io/blockstreamresearch/simplicity-unchained:v0.1.0-alpha.0"));
  assert.deepEqual(args.slice(-3), ["start", "--config", "/app/config.toml"]);

  const pull = spawnSync("sh", ["-eu"], {
    input: `docker() { printf '%s\\n' "$@"; }\n${pullCommand}`,
    encoding: "utf8",
  });
  assert.equal(pull.status, 0, pull.stderr);
  const pullArgs = pull.stdout.trim().split("\n");
  assert.deepEqual(pullArgs.slice(0, 3), ["pull", "--platform", args[args.indexOf("--platform") + 1]]);
  assert.equal(pullArgs.length, 4);
  assert.ok(args.includes(pullArgs[3]));
});

test("jet extensions have a standalone developer guide with navigation and browser limitations", () => {
  const html = renderToStaticMarkup(createElement(ExtensionsPage));
  assert.match(html, /Implement a custom jet extension/);
  assert.match(html, /jet_plugin_abi::register_jets!/);
  assert.match(html, /ScriptJets::load/);
  assert.match(html, /unsafe extern &quot;C&quot; fn script_len/);
  assert.match(html, /cargo build --locked -p script_jets/);
  assert.match(html, /descriptor validation is not a sandbox/);
  assert.match(html, /Native plugins are not uploaded through this demo/);
  assert.match(html, /href="\/docs"/);
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /Loading the local jet registry|<select/);
  assert.doesNotMatch(html, /They are not a verified PSBT\/PSET disclosure context or a chain-state oracle/);
  assert.equal(extensionsMetadata.title, "Jet Extensions | Simplicity Unchained");
});
