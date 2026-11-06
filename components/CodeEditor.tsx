"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type { IDisposable, editor } from "monaco-editor";
import { Callout } from "./ui";

loader.config({ paths: { vs: "/monaco/vs" } });
type Monaco = typeof import("monaco-editor");

export function CodeEditor({ label, language, value, onChange, readOnly = false, height = 320, jetNames = [] }: {
  label: string;
  language: "simplicityhl" | "bitcoin-script" | "json";
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: number;
  jetNames?: string[];
}) {
  const [loadError, setLoadError] = useState("");
  const completion = useRef<IDisposable | null>(null);
  const resize = useRef<ResizeObserver | null>(null);
  const names = useRef(jetNames);
  useEffect(() => { names.current = jetNames; }, [jetNames]);
  const controlled = useRef({ value, readOnly, onChange });
  useLayoutEffect(() => { controlled.current = { value, readOnly, onChange }; }, [value, readOnly, onChange]);
  const changed = useCallback((next: string | undefined) => {
    const current = controlled.current;
    if (!current.readOnly && next !== undefined && next !== current.value) current.onChange(next);
  }, []);

  useEffect(() => {
    let active = true;
    loader.init().catch((failure: unknown) => {
      if (active) setLoadError(`Editor failed to load: ${failure instanceof Error ? failure.message : String(failure)}. Reload the page; verify the local /monaco assets were prepared.`);
    });
    return () => { active = false; completion.current?.dispose(); resize.current?.disconnect(); };
  }, []);

  function configure(monaco: Monaco) {
    if (!monaco.languages.getLanguages().some(({ id }) => id === "simplicityhl")) {
      monaco.languages.register({ id: "simplicityhl" });
      monaco.languages.setLanguageConfiguration("simplicityhl", {
        comments: { lineComment: "//", blockComment: ["/*", "*/"] },
        brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
        autoClosingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: '"', close: '"' }],
      });
      monaco.languages.setMonarchTokensProvider("simplicityhl", {
        keywords: ["fn", "let", "const", "type", "match", "if", "else", "true", "false", "Some", "None", "Left", "Right", "assert"],
        tokenizer: {
          root: [
            [/\/\/.*$/, "comment"], [/\/\*/, "comment", "@comment"],
            [/\b(?:u(?:1|2|4|8|16|32|64|128|256)|bool|Pubkey|Signature)\b/, "type"],
            [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
            [/0x[0-9a-fA-F]+|\b\d+\b/, "number"], [/"[^"]*"/, "string"],
            [/[{}()[\]]/, "@brackets"], [/::|->|[=!:;,.]/, "delimiter"],
          ],
          comment: [[/[^/*]+/, "comment"], [/\*\//, "comment", "@pop"], [/[/*]/, "comment"]],
        },
      });
    }
    if (!monaco.languages.getLanguages().some(({ id }) => id === "bitcoin-script")) {
      monaco.languages.register({ id: "bitcoin-script" });
      monaco.languages.setMonarchTokensProvider("bitcoin-script", {
        tokenizer: { root: [[/OP_[A-Z0-9_]+/, "keyword"], [/0x[0-9a-fA-F]+/, "number"], [/\/\/.*$/, "comment"]] },
      });
    }
    monaco.editor.defineTheme("unchained", {
      base: "vs-dark", inherit: true,
      rules: [{ token: "keyword", foreground: "B9ACFF" }, { token: "type", foreground: "7AD9C2" }],
      colors: { "editor.background": "#111218", "editorLineNumber.foreground": "#6F6F71", "editor.selectionBackground": "#2308C766" },
    });
  }

  const mounted = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editor.updateOptions({ ariaLabel: label });
    const container = editor.getDomNode()?.parentElement;
    if (container) {
      const layout = () => {
        if (container.clientWidth && container.clientHeight) editor.layout({ width: container.clientWidth, height: container.clientHeight });
      };
      resize.current?.disconnect();
      resize.current = new ResizeObserver(layout);
      resize.current.observe(container);
      layout();
    }
    if (language !== "simplicityhl") return;
    completion.current?.dispose();
    completion.current = monaco.languages.registerCompletionItemProvider("simplicityhl", {
      triggerCharacters: [":"],
      provideCompletionItems(model, position) {
        if (model !== editor.getModel()) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const prefix = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
        const inJet = prefix.endsWith("jet::");
        const options = [...new Set([...names.current, "bip_0340_verify", "le_64", "eq_64"])].map((name) => ({
          label: `jet::${name}`, insertText: `${inJet ? "" : "jet::"}${name}`,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: "Simplicity jet",
          range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn },
        }));
        return { suggestions: options };
      },
    });
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-code">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-white/70">
        <span>{label}</span><span>{language === "simplicityhl" ? ".simf" : language === "json" ? ".json" : ".bs"}</span>
      </div>
      {loadError ? <div className="p-3"><Callout tone="danger">{loadError}</Callout></div> :
        <Editor height={height} language={language} value={value} theme="unchained" beforeMount={configure} onMount={mounted}
          loading={<p role="status" className="p-4 text-sm text-white/70">Loading code editor...</p>}
          onChange={changed}
          options={{ readOnly, domReadOnly: readOnly, ariaLabel: label, editContext: false, automaticLayout: true, minimap: { enabled: false },
            fontSize: 13, fontFamily: "var(--font-geist-mono), monospace", lineNumbers: "on", scrollBeyondLastLine: false,
            wordWrap: "on", tabSize: 4, insertSpaces: true, padding: { top: 12, bottom: 12 }, bracketPairColorization: { enabled: true } }} />}
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-white/50">Monaco editor · Tab to indent · Ctrl+Space for suggestions · Esc then Tab to leave</p>
    </div>
  );
}
