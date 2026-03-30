// runtime patches for claude cli

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PatchFn = (content: string) => string;

export type RuntimePatch = { find: string; replace: string } | { fn: PatchFn; name: string };

export const CCH_BILLING_HASH_PATTERN = /\bcch=[\da-f]{5}\b/gi;
export const CCH_BILLING_HASH_MATCHER = /\bcch=[\da-f]{5}\b/i;
export const CCH_BILLING_HASH_FIXED_VALUE = "cch=beef5";

// built-in string replacements
const builtInStringPatches: Extract<RuntimePatch, { find: string }>[] = [
  // disable unwanted features
  { find: "pr-comments", replace: "zprcomments" },
  { find: "security-review", replace: "zsecurityreview" },
];

export const sanitizeCchBillingHashString = (value: string) => {
  if (!CCH_BILLING_HASH_MATCHER.test(value)) return value;
  return value.replace(CCH_BILLING_HASH_PATTERN, CCH_BILLING_HASH_FIXED_VALUE);
};

export const sanitizeCchBillingHashValue = (value: unknown): unknown => {
  if (typeof value === "string") return sanitizeCchBillingHashString(value);

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const sanitized = sanitizeCchBillingHashValue(item);
      if (sanitized !== item) changed = true;
      return sanitized;
    });
    return changed ? next : value;
  }

  if (!value || typeof value !== "object") return value;

  let changed = false;
  const next = Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const sanitized = sanitizeCchBillingHashValue(child);
      if (sanitized !== child) changed = true;
      return [key, sanitized];
    }),
  );

  return changed ? next : value;
};

export const sanitizeCchBillingHashRequestBody = (body: string) => {
  if (!CCH_BILLING_HASH_MATCHER.test(body)) return body;

  try {
    const parsed = JSON.parse(body) as unknown;
    const sanitized = sanitizeCchBillingHashValue(parsed);
    return JSON.stringify(sanitized);
  } catch {
    return sanitizeCchBillingHashString(body);
  }
};

export const insertRuntimePreludeAfterHashbang = (content: string, prelude: string) => {
  if (!prelude) return content;

  const normalizedPrelude = prelude.endsWith("\n") ? prelude : `${prelude}\n`;
  if (!content.startsWith("#!")) return `${normalizedPrelude}${content}`;

  const newlineIndex = content.indexOf("\n");
  if (newlineIndex === -1) return `${content}\n${normalizedPrelude}`;
  return `${content.slice(0, newlineIndex + 1)}${normalizedPrelude}${content.slice(newlineIndex + 1)}`;
};

const CCH_PRELUDE_MARKER = 'Symbol.for("ccc.cch-request-sanitizer.installed")';
const patchDirectory = dirname(fileURLToPath(import.meta.url));

const loadCchPrelude = () => {
  const raw = readFileSync(join(patchDirectory, "cch-prelude.js"), "utf8");
  return raw.replace(/__CCH_FIXED_VALUE__/g, CCH_BILLING_HASH_FIXED_VALUE);
};

// lazy-loaded and cached
let cchPreludeCache: string | undefined;
const getCchPrelude = () => {
  if (cchPreludeCache === undefined) cchPreludeCache = loadCchPrelude();
  return cchPreludeCache;
};

const installCchRequestSanitizer = (content: string) => {
  if (content.includes(CCH_PRELUDE_MARKER)) return content;
  return insertRuntimePreludeAfterHashbang(content, getCchPrelude());
};

// all built-in patches: string replacements + function transforms
const builtInPatches: RuntimePatch[] = [
  ...builtInStringPatches,
  { fn: installCchRequestSanitizer, name: "normalize cch billing hashes in /v1/messages requests" },
];

const applyStringPatch = (content: string, patch: Extract<RuntimePatch, { find: string }>) => {
  const result = content.replaceAll(patch.find, patch.replace);
  return {
    content: result,
    label: result !== content ? `"${patch.find}" => "${patch.replace}"` : null,
  };
};

const applyPatches = (content: string, patches: RuntimePatch[]) => {
  const applied: string[] = [];
  let result = content;

  for (const patch of patches) {
    if ("fn" in patch) {
      const next = patch.fn(result);
      if (next !== result) applied.push(patch.name);
      result = next;
      continue;
    }

    const next = applyStringPatch(result, patch);
    result = next.content;
    if (next.label) applied.push(next.label);
  }

  return { content: result, applied };
};

// apply all built-in patches to CLI content
export const applyBuiltInPatches = (content: string) => applyPatches(content, builtInPatches);

// apply user-defined patches
export const applyUserPatches = (content: string, patches: RuntimePatch[]) => applyPatches(content, patches);
