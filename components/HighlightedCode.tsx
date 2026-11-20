import type { ReactNode } from "react";

export type HighlightLanguage = "docker" | "toml" | "simplicityhl";
type HighlightToken = "command" | "option" | "variable" | "image" | "section" | "key" | "string" | "number" | "comment" | "keyword" | "function" | "type";

const highlightStyles: Record<HighlightToken, string> = {
  command: "text-violet-300",
  option: "text-sky-300",
  variable: "text-cyan-300",
  image: "text-amber-300",
  section: "text-amber-300",
  key: "text-violet-300",
  string: "text-emerald-300",
  number: "text-orange-300",
  comment: "text-white/45 italic",
  keyword: "text-violet-300",
  function: "text-sky-300",
  type: "text-amber-300",
};

const patterns: Record<HighlightLanguage, RegExp> = {
  docker: /\b(?:docker|pull|run|start)\b|--[a-z-]+|\$PWD|"[^"\n]*"|ghcr\.io\/[^\s\\]+/g,
  toml: /\[[^\]\n]+\]|#[^\n]*|[a-z_][a-z0-9_]*(?=\s*=)|"(?:[^"\\]|\\.)*"|\b\d+\b/g,
  simplicityhl: /\/\/[^\n]*|\b(?:jet|witness)::\w+|\b(?:fn|let)\b|\bassert!|\b(?:u8|u16|u32|u64|u256|bool|Pubkey|Signature)\b|\b\d+\b/g,
};

export function highlight(code: string, language: HighlightLanguage): ReactNode[] {
  const parts: ReactNode[] = [];
  let offset = 0;

  for (const match of code.matchAll(patterns[language])) {
    const index = match.index;
    if (index === undefined) continue;

    const token = match[0];
    const tokenType = getHighlightToken(language, token);
    parts.push(code.slice(offset, index));
    parts.push(<span key={index} className={highlightStyles[tokenType]} data-token={tokenType}>
      {language === "docker" && token.startsWith('"') && token.includes("$PWD") ? <>
        {token.slice(0, token.indexOf("$PWD"))}
        <span className={highlightStyles.variable} data-token="variable">$PWD</span>
        {token.slice(token.indexOf("$PWD") + "$PWD".length)}
      </> : token}
    </span>);
    offset = index + token.length;
  }

  parts.push(code.slice(offset));
  return parts;
}

export function HighlightedCode({ code, language }: { code: string; language: HighlightLanguage }) {
  return <code>{highlight(code, language)}</code>;
}

function getHighlightToken(language: HighlightLanguage, token: string): HighlightToken {
  if (language === "docker") {
    if (["docker", "pull", "run", "start"].includes(token)) return "command";
    if (token.startsWith("--")) return "option";
    if (token === "$PWD") return "variable";
    if (token.startsWith("ghcr.io/")) return "image";
    return "string";
  }

  if (language === "simplicityhl") {
    if (token.startsWith("//")) return "comment";
    if (token.startsWith("jet::")) return "function";
    if (token.startsWith("witness::")) return "variable";
    if (["fn", "let", "assert!"].includes(token)) return "keyword";
    if (/^\d/.test(token)) return "number";
    return "type";
  }

  if (token.startsWith("#")) return "comment";
  if (token.startsWith("[")) return "section";
  if (token.startsWith("\"")) return "string";
  if (/^\d/.test(token)) return "number";
  return "key";
}
