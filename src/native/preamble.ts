import { createHash } from "crypto";
import { NATIVE_BUN_ENTRY_MARKER } from "./constants";

const PREAMBLE = [
  'import { createRequire } from "module";',
  'import { fileURLToPath } from "url";',
  'import { dirname } from "path";',
  "",
  "// node-populated when running as ESM; __filename/__dirname fall back in case the bundle wrapper is invoked as CJS.",
  'const __filename__ = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);',
  'const __dirname__ = typeof __dirname !== "undefined" ? __dirname : dirname(__filename__);',
  "",
  "// The cached cli.mjs lives under ~/.cache/ccc/... which has NO node_modules chain to the",
  "// launcher's deps (yaml, undici, ajv, etc.). Anchor require() on the wrapper's package.json",
  '// so the bundle\'s Node fallback paths (e.g. `typeof Bun<"u" ? Bun.YAML.parse() : require("yaml").parse()`)',
  "// actually find their modules. CCC sets CCC_CLAUDE_WRAPPER_PKG_JSON before import().",
  "const __requireAnchor = process.env.CCC_CLAUDE_WRAPPER_PKG_JSON || import.meta.url;",
  "const __baseRequire = createRequire(__requireAnchor);",
  "",
  "// bun ships node-fetch + ws as builtins; node does not. shim at require-time only.",
  "function __require(specifier) {",
  '  if (specifier === "node-fetch") {',
  "    const fetchFn = globalThis.fetch;",
  '    if (typeof fetchFn !== "function") {',
  '      throw new Error("node-fetch shim: global fetch is not available; upgrade to node 18+ or install node-fetch");',
  "    }",
  "    return Object.assign(fetchFn, {",
  "      default: fetchFn,",
  "      Headers: globalThis.Headers,",
  "      Request: globalThis.Request,",
  "      Response: globalThis.Response,",
  "      FormData: globalThis.FormData,",
  "      Blob: globalThis.Blob,",
  "      File: globalThis.File,",
  "    });",
  "  }",
  '  if (specifier === "ws") {',
  '    try { return __baseRequire("ws"); } catch {}',
  "    const WSImpl = globalThis.WebSocket;",
  '    if (typeof WSImpl === "function") {',
  "      WSImpl.CONNECTING ??= 0;",
  "      WSImpl.OPEN ??= 1;",
  "      WSImpl.CLOSING ??= 2;",
  "      WSImpl.CLOSED ??= 3;",
  "      return WSImpl;",
  "    }",
  '    const { EventEmitter } = __baseRequire("events");',
  "    class StubWebSocket extends EventEmitter {",
  "      static CONNECTING = 0;",
  "      static OPEN = 1;",
  "      static CLOSING = 2;",
  "      static CLOSED = 3;",
  "      readyState = StubWebSocket.CONNECTING;",
  "      constructor(url) {",
  "        super();",
  "        this.url = url;",
  '        queueMicrotask(() => { this.readyState = StubWebSocket.OPEN; this.emit("open"); });',
  "      }",
  "      send() {}",
  "      ping() {}",
  '      close() { if (this.readyState !== StubWebSocket.CLOSED) { this.readyState = StubWebSocket.CLOSED; this.emit("close"); } }',
  "      terminate() { this.close(); }",
  "    }",
  "    return StubWebSocket;",
  "  }",
  "  // bun compiles some native assets (e.g. ripgrep.node) into the binary and references",
  "  // them via /$bunfs/root/... specifiers. we cannot load these from the extracted JS;",
  "  // CCC sets USE_BUILTIN_RIPGREP=0 so claude-code falls back to system ripgrep. if a",
  "  // future bundle tries to require a new bunfs asset, surface a clear error rather than",
  "  // a confusing MODULE_NOT_FOUND.",
  '  if (typeof specifier === "string" && specifier.startsWith("/$bunfs/root/")) {',
  "    throw new Error(",
  '      "native-preamble: unexpected bunfs asset require: " + specifier + ". " +',
  '      "The extracted bundle cannot load bun-embedded native assets. " +',
  '      "If this is a new asset type, extend __require in src/native/preamble.ts."',
  "    );",
  "  }",
  "  return __baseRequire(specifier);",
  "}",
  "",
  'const __module = typeof module !== "undefined" ? module : { exports: {} };',
  "const __exports = __module.exports;",
  "",
].join("\n");

const ENTRY_INVOCATION = "\n__bun_entry(__exports, __require, __module, __filename__, __dirname__);\n";

// Bun.Transpiler polyfill
const TRANSPILER_BAIL = 'if(typeof Bun>"u")throw Error("unreachable: Bun required")';
const TRANSPILER_POLYFILL = [
  'if(typeof Bun>"u")return ui$??=(()=>{',
  'const __esb=require("esbuild");',
  "const __tx=(c)=>{",
  'if(typeof c!=="string"||!c)return c;',
  "try{",
  '__esb.transformSync(c,{loader:"js",target:"esnext",supported:{"top-level-await":false}});',
  "return c;",
  "}catch(e){",
  'const tla=e&&e.errors&&e.errors.some((er)=>/top-level await/i.test(er.text||""));',
  "if(!tla)return c;",
  'const t=c.trim().replace(/;$/,"").trim();',
  'const single=(t.indexOf("\\n")<0&&t.indexOf(";")<0&&t.length>0);',
  'return single?"(async()=>("+t+"\\n))()":"(async()=>{"+c+"\\n})()";',
  "}",
  "};",
  "return{transformSync:__tx,transform:(c)=>Promise.resolve(__tx(c)),scan:()=>({imports:[],exports:[]})};",
  "})()",
].join("");

export const PREAMBLE_VERSION = createHash("sha256")
  .update(PREAMBLE)
  .update(ENTRY_INVOCATION)
  .update(TRANSPILER_BAIL)
  .update(TRANSPILER_POLYFILL)
  .digest("hex")
  .slice(0, 16);

export const wrapForNode = (raw: Buffer) => {
  let src = raw.toString("utf8");

  if (src.includes(TRANSPILER_BAIL)) {
    src = src.replace(TRANSPILER_BAIL, TRANSPILER_POLYFILL);
  }

  const entryIdx = src.indexOf(NATIVE_BUN_ENTRY_MARKER);
  if (entryIdx === -1) {
    throw new Error(
      `native-preamble: bun entry wrapper '${NATIVE_BUN_ENTRY_MARKER}' not found in extracted bundle. ` +
        "The bundle wrapping shape changed. Update NATIVE_BUN_ENTRY_MARKER in src/native/constants.ts.",
    );
  }

  const firstNl = src.indexOf("\n");
  const insertAt = firstNl === -1 ? 0 : firstNl + 1;

  const withNamedEntry = `${src.slice(0, entryIdx)}const __bun_entry = ${src.slice(entryIdx)}`;
  const withPreamble = withNamedEntry.slice(0, insertAt) + PREAMBLE + withNamedEntry.slice(insertAt);

  return withPreamble + ENTRY_INVOCATION;
};
