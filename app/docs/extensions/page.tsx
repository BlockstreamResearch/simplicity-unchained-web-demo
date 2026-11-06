import type { Metadata } from "next";
import Link from "next/link";

const sourceRoot = "https://github.com/BlockstreamResearch/simplicity-unchained/blob/HEAD";
const pluginManifest = `[package]
name = "script_jets"
version = "0.1.0"
edition = "2024"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
jet_plugin_abi = { path = "../../jet_plugin_abi" }`;

const pluginSource = `use jet_plugin_abi::{CFrameItem, JetEnv, write_bits};

// Unit -> u16: return the redeem-script length.
unsafe extern "C" fn script_len(
    dst: *mut CFrameItem,
    _src: CFrameItem,
    env: *const JetEnv,
) -> bool {
    let len = unsafe { &*env }.redeem_script.len;
    let Ok(len) = u16::try_from(len) else {
        return false;
    };
    unsafe { write_bits(&mut *dst, len.into(), 16) };
    true
}

jet_plugin_abi::register_jets! {
    base: Elements,
    jets: {
        script_len: "1" -> "s" {
            cost_milliweight: 100,
            code: 0b1111_1110,
            code_len: 8,
            cmr: [0x11; 32], // Test identity only.
        },
    },
}`;

const hostManifest = `[package]
name = "jet_host"
version = "0.1.0"
edition = "2024"

[dependencies]
simplicity_unchained_core = { package = "core", path = "../../core" }
simplicity = { package = "simplicity-lang", version = "0.9.0" }
hex = "0.4"`;

const hostSource = `use simplicity::jet::Jet;
use simplicity_unchained_core::{
    jets::elements::ElementsExtension,
    plugin::{PluginJet, PluginTrait},
};

simplicity_unchained_core::declare_plugin!(ScriptJets: ElementsExtension);

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let path = args.next().ok_or("missing library path")?;
    let digest = args.next().ok_or("missing pinned SHA256 hex")?;
    let expected: [u8; 32] = hex::decode(digest)?
        .try_into()
        .map_err(|_| "SHA256 must be exactly 32 bytes")?;

    ScriptJets::load(&path, Some(expected))?;
    let jet = PluginJet::<ScriptJets>::parse("script_len")?;
    println!("Loaded {jet}");
    Ok(())
}`;

function CodeBlock({ title, code }: { title: string; code: string }) {
  return <div className="min-w-0 overflow-hidden rounded-xl border border-line">
    <p className="border-b border-line bg-surface px-4 py-2 text-xs font-medium">{title}</p>
    <pre className="overflow-x-auto bg-code p-4 text-xs leading-6 text-white/85" tabIndex={0} aria-label={title}><code>{code}</code></pre>
  </div>;
}

export const metadata: Metadata = {
  title: "Jet Extensions | Simplicity Unchained",
  description: "Rust jet plugin ABI, descriptor registration, dynamic-library loading, testing and policy profile integration.",
};

export default function ExtensionsPage() {
  return <main className="mx-auto max-w-4xl space-y-10 px-4 py-8 [overflow-wrap:anywhere] sm:px-6 sm:py-12">
    <nav aria-label="Documentation navigation" className="flex flex-wrap gap-6 text-sm text-brand">
      <Link href="/" className="hover:underline">SU home</Link>
      <Link href="/docs" className="hover:underline">Policy documentation</Link>
    </nav>
    <header className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Developer guide</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Implement a custom jet extension</h1>
      <p className="text-base leading-relaxed text-muted">Build a Rust dynamic library, export a jet descriptor and load it into a native SU host. This guide follows the repository&apos;s tested <code>script_jets</code> plugin and covers the extra integration needed for a policy profile.</p>
    </header>
    <nav aria-label="Guide contents" className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-surface p-4 text-sm text-brand">
      {[["setup", "Setup"], ["implement", "Jet implementation"], ["descriptor", "ABI & descriptor"], ["load", "Host loading"], ["test", "Tests"], ["policy", "Policy & WASM"]].map(([id, title]) => <a href={`#${id}`} key={id} className="hover:underline">{title}</a>)}
    </nav>
    <section id="setup" className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">1. Start from the test plugin</h2>
      <p className="text-sm leading-relaxed text-muted">Use the matching SU checkout and its pinned Rust toolchain. Run the commands below from the repository root. The existing workspace member <code>plugin_tests/script_jets</code> is the smallest working reference; no new dependency installation is required to build it.</p>
      <CodeBlock title="Build the existing plugin" code={"cargo build --locked -p script_jets\ncargo test --locked -p core plugin::tests::loads_dynamic_library"} />
      <p className="text-sm leading-relaxed text-muted">For a new plugin crate, retain the <code>cdylib</code> target and the matching local ABI dependency. The manifest below is for the existing directory layout. Add your own crate to the workspace members, or give an independent crate its own workspace configuration.</p>
      <CodeBlock title="plugin_tests/script_jets/Cargo.toml" code={pluginManifest} />
    </section>
    <section id="implement" className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">2. Implement the frame function</h2>
      <p className="text-sm leading-relaxed text-muted">Each jet is an <code>unsafe extern &quot;C&quot;</code> function: read the declared source bits, write the declared target bits, and return <code>false</code> to fail evaluation. This example reads the redeem-script length and writes a big-endian 16-bit result. It consumes zero source bits because its source is unit.</p>
      <CodeBlock title="Single-jet variant of plugin_tests/script_jets/src/lib.rs" code={pluginSource} />
      <p className="text-sm leading-relaxed text-muted">The ABI passes <code>JetEnv</code> with <code>redeem_script</code>, the consensus-serialized spending <code>tx</code> and <code>input_index</code>. These pointers are valid only during the call.</p>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
        <li>Frames are not bounds-checked. Respect the declared bit widths and never retain frame or environment pointers.</li>
        <li>Use <code>read_bits</code> and <code>write_bits</code> with the matching big-endian layout. Return <code>false</code> for invalid values instead of panicking across the C ABI.</li>
        <li>Keep execution deterministic and bounded; declare a cost that reflects the work. The sample cost and <code>[0x11; 32]</code> identity are test fixtures, not production parameters.</li>
      </ul>
    </section>
    <section id="descriptor" className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">3. Define the descriptor contract</h2>
      <p className="text-sm leading-relaxed text-muted"><code>register_jets!</code> may be invoked once per crate. It exports <code>unchained_jet_plugin</code>, returning a static descriptor. Choose <code>base: Elements</code> for <code>ElementsExtension</code> or <code>base: Bitcoin</code> for <code>CoreExtension</code>; neither is the portable policy profile jet set.</p>
      <dl className="space-y-3 rounded-xl border border-line p-5 text-sm leading-relaxed">
        <div><dt className="font-mono font-semibold">name / source / target</dt><dd className="text-muted">A unique name using lowercase letters, digits or underscores, up to 64 bytes. Types use Simplicity TypeName notation: <code>1</code> unit, <code>2</code> bit, <code>c</code> u8, <code>s</code> u16, <code>i</code> u32, <code>l</code> u64, <code>h</code> u256; <code>*</code> product and <code>+</code> sum.</dd></div>
        <div><dt className="font-mono font-semibold">cost_milliweight</dt><dd className="text-muted">A positive value fitting <code>u32</code>. Loader validation checks the range, not whether the cost accurately models execution.</dd></div>
        <div><dt className="font-mono font-semibold">code / code_len</dt><dd className="text-muted">The low 1–64 bits of <code>code</code>, decoded most-significant bit first. Encodings must be prefix-free against all base and custom jets. Bitcoin&apos;s reserved <code>tx_approval_hash</code> encoding is <code>1111111</code>; do not reuse it or a conflicting prefix.</dd></div>
        <div><dt className="font-mono font-semibold">cmr</dt><dd className="text-muted">A unique 32-byte identity. The native loader checks collisions but trusts the plugin-supplied CMR; it does not derive or prove the jet&apos;s semantics.</dd></div>
        <div><dt className="font-mono font-semibold">ABI compatibility</dt><dd className="text-muted">Host and plugin must match the ABI version, pinned <code>simplicity-sys</code> version and base set. The current native loader supports at most 32 custom jets per plugin.</dd></div>
      </dl>
    </section>
    <section id="load" className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">4. Load it in a native host</h2>
      <p className="text-sm leading-relaxed text-muted">For a host crate at <code>plugin_tests/jet_host</code>, add it to the workspace and use this manifest and entry point. Supply the expected library digest from your build/release process, not an untrusted upload. Native plugins execute inside the host process; descriptor validation is not a sandbox.</p>
      <CodeBlock title="plugin_tests/jet_host/Cargo.toml" code={hostManifest} />
      <CodeBlock title="plugin_tests/jet_host/src/main.rs" code={hostSource} />
      <CodeBlock title="macOS development build and load, from the repository root" code={"cargo build --locked -p script_jets\nshasum -a 256 target/debug/libscript_jets.dylib\n# Replace YOUR_SHA256_HEX with the 64-character digest above:\ncargo run -p jet_host -- target/debug/libscript_jets.dylib YOUR_SHA256_HEX"} />
      <p className="text-sm leading-relaxed text-muted">Replace the digest placeholder with the actual hash. Linux uses <code>libscript_jets.so</code>; Windows uses <code>script_jets.dll</code>. For deployment, pin the reviewed artifact&apos;s digest. Passing <code>None</code> skips hash verification and is intended for development only.</p>
      <p className="text-sm leading-relaxed text-muted">A handle loads only one plugin and keeps it for the process lifetime. Decode compiled program and witness bytes with <code>Program&lt;PluginJet&lt;ScriptJets&gt;&gt;::from_str(program, Some(witness))</code>, then execute with a matching <code>PluginEnv&lt;ScriptJets&gt;</code>. This is core-library integration, not a plugin flag in the shipped policy CLI/API.</p>
      <p className="text-sm leading-relaxed text-muted">The compiler also needs the jet&apos;s name, types, encoding and identity. Loading the library does not automatically add a callable <code>jet::script_len()</code> to the SimplicityHL compiler or demo editor.</p>
    </section>
    <section id="test" className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">5. Test the jet and loader together</h2>
      <p className="text-sm leading-relaxed text-muted">The repository integration test loads the real library, rejects a wrong file digest, resolves <code>script_len</code> by name and executes it in a BitMachine against a 71-byte redeem script. Use that as the starting point for your own positive and negative tests.</p>
      <CodeBlock title="Targeted native checks" code={"cargo test --locked -p core plugin::\ncargo clippy --locked -p script_jets --all-targets -- -D warnings"} />
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
        <li>Test zero, maximum and out-of-range values; verify the exact source and target frame layout.</li>
        <li>Check declared costs, encoding roundtrips and stable identities. Reject duplicate names/CMRs, overlapping codes and incompatible descriptors.</li>
        <li>Test failure propagation, wrong-base loading, missing libraries and digest mismatches. Ensure invalid inputs cannot result in signing.</li>
      </ul>
    </section>
    <section id="policy" className="scroll-mt-6 space-y-4 rounded-xl bg-surface p-5">
      <h2 className="text-xl font-semibold">6. Integrate a policy profile and WASM</h2>
      <p className="text-sm leading-relaxed text-muted">Native plugins are not uploaded through this demo. The Bitcoin and Liquid policy APIs use portable, fixed registries, not <code>PluginJet</code> dynamic loading. Adding a policy jet is a separate versioned integration:</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
        <li>Specify the jet&apos;s deterministic semantics and verified context inputs. Add its portable implementation, types, encoding, identity and cost to a new profile manifest.</li>
        <li>Wire decoding/evaluation and the SimplicityHL compiler to the same registry. Build matching service and browser WASM versions.</li>
        <li>Add native/WASM parity tests, malformed-evidence tests and approval/signature binding tests. Publish a distinct profile fingerprint rather than altering an existing funded profile.</li>
      </ol>
      <CodeBlock title="Browser build and regression checks, from the web-demo repository" code={"pnpm build:wasm\npnpm test:frontend\npnpm test:rust"} />
    </section>
    <section className="space-y-3 border-t border-line pt-6">
      <h2 className="text-xl font-semibold">Source references</h2>
      <ul className="space-y-2 text-sm text-brand">
        {[
          ["plugin_tests/script_jets/src/lib.rs", "Working plugin implementation"],
          ["jet_plugin_abi/src/lib.rs", "C ABI, frames and environment"],
          ["core/src/plugin/loaded.rs", "Descriptor validation and limits"],
          ["core/src/plugin/tests.rs", "Dynamic-library execution test"],
          ["policy/README.md", "Portable Bitcoin profile registry"],
          ["policy/LIQUID.md", "Liquid profile and verified disclosures"],
        ].map(([path, title]) => <li key={path}><a href={`${sourceRoot}/${path}`} target="_blank" rel="noopener noreferrer" className="underline">{title}</a></li>)}
      </ul>
    </section>
  </main>;
}
