import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const monaco = resolve(root, "node_modules/monaco-editor");
const destination = resolve(root, "public/monaco/vs");
mkdirSync(destination, { recursive: true });
cpSync(resolve(monaco, "min/vs"), destination, { recursive: true });
cpSync(resolve(monaco, "LICENSE"), resolve(root, "public/monaco/LICENSE"));
cpSync(resolve(monaco, "ThirdPartyNotices.txt"), resolve(root, "public/monaco/ThirdPartyNotices.txt"));
console.log("Prepared same-origin Monaco editor assets.");
