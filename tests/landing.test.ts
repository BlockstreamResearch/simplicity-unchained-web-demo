import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage from "../app/page";
import ExtensionsPage, { metadata as extensionsMetadata } from "../app/docs/extensions/page";

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
  assert.doesNotMatch(html, /<select|<textarea|Security Warning - Demo Environment/);
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
  assert.equal(extensionsMetadata.title, "Jet Extensions | Simplicity Unchained");
});
