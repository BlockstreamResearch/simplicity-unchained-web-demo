import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage from "../app/page";
import ExtensionsPage, { metadata as extensionsMetadata } from "../app/docs/extensions/page";
import { QuickSetup, setupCommands } from "../components/QuickSetup";

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

test("quick setup exposes the published image, persistent signer config and local API checks", () => {
  const html = renderToStaticMarkup(createElement(LandingPage));
  assert.match(html, /id="quick-setup"/);
  assert.match(html, /href="#quick-setup"/);
  assert.match(html, /Quick SU setup/);
  assert.match(html, /base_public_key_hex/);
  assert.match(html, /not a Bitcoin or Liquid full node/);
  assert.match(html, /ARM hosts need emulation/);
  assert.match(html, /Back up the config/);
  assert.match(html, /HTTPS reverse proxy/);
  assert.match(setupCommands.provision, /ghcr\.io\/blockstreamresearch\/simplicity-unchained:v0\.1\.0-alpha\.0/);
  assert.match(setupCommands.provision, /chown 1000:1000/);
  assert.match(setupCommands.run, /--publish 127\.0\.0\.1:30431:30431/);
  assert.match(setupCommands.run, /src=su-config,dst=\/app\/config,readonly/);
  assert.match(setupCommands.run, /start --config \/app\/config\/config\.toml/);
  for (const script of Object.values(setupCommands)) {
    const result = spawnSync("sh", ["-n"], { input: script, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  for (const path of ["version", "policy/bitcoin/capabilities", "policy/liquid/capabilities"]) {
    assert.ok(setupCommands.verify.includes(`/simplicity-unchained/${path}`));
  }
});

test("quick setup keeps the complete commands collapsed by default", () => {
  const html = renderToStaticMarkup(createElement(QuickSetup));
  assert.equal((html.match(/<details\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<details\b[^>]*\bopen(?:=|\s|>)/);
  assert.match(html, /<summary\b[^>]*>Docker setup commands/);
  const details = html.match(/<details\b[\s\S]*?<\/details>/)?.[0];
  assert.ok(details);
  assert.equal((details.match(/<pre\b/g) ?? []).length, 3);
  assert.match(html, /Full setup guide/);
  assert.match(html, /Keep your existing signing key/);
});

test("setup provisioning generates a private testnet config and refuses to replace the signing key", () => {
  const directory = mkdtempSync(join(tmpdir(), "su-setup-"));
  const inner = setupCommands.provision.match(/"\$IMAGE" -euc '([\s\S]+)'$/)?.[1];
  assert.ok(inner);
  const script = `chown() { [ "$1" = "1000:1000" ] && [ "$2" = "$SU_SETUP_TEST_DIR/config.toml" ]; }\n${inner.replaceAll("/config/config.toml", '"$SU_SETUP_TEST_DIR/config.toml"')}`;
  const env = { ...process.env, SU_SETUP_TEST_DIR: directory };
  try {
    const first = spawnSync("sh", ["-euc", script], { env, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, "");
    const configPath = join(directory, "config.toml");
    const config = readFileSync(configPath, "utf8");
    assert.match(config, /^\[service\]\nport = 30431\nprivate_key = "[a-f0-9]{64}"\nbitcoin_network = "testnet4"\nliquid_network = "liquidtestnet"\n$/);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    const second = spawnSync("sh", ["-euc", script], { env, encoding: "utf8" });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Configuration exists; reuse it/);
    assert.equal(readFileSync(configPath, "utf8"), config);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
