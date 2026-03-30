import { describe, expect, test } from "bun:test";
import {
  applyBuiltInPatches,
  CCH_BILLING_HASH_FIXED_VALUE,
  CCH_BILLING_HASH_MATCHER,
  insertRuntimePreludeAfterHashbang,
  sanitizeCchBillingHashRequestBody,
  sanitizeCchBillingHashString,
  sanitizeCchBillingHashValue,
} from "@/patches/cli-patches";

// use a hex value distinct from the fixed value to test actual replacement
const testHash = "cch=" + "1a2b3";

describe("cch billing hash sanitizer", () => {
  // sanity: the test hash must match the pattern and differ from the fixed value
  test("test hash matches the cch pattern and differs from the fixed value", () => {
    expect(CCH_BILLING_HASH_MATCHER.test(testHash)).toBe(true);
    expect(testHash).not.toBe(CCH_BILLING_HASH_FIXED_VALUE);
  });

  test("injects the built-in cch request sanitizer after the hashbang", () => {
    const content = '#!/usr/bin/env node\nconsole.log("hello");\n';
    const next = applyBuiltInPatches(content);

    expect(next.applied).toContain("normalize cch billing hashes in /v1/messages requests");
    expect(next.content.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(next.content).toContain('Symbol.for("ccc.cch-request-sanitizer.installed")');
    expect(next.content).toContain('console.log("hello");');
  });

  test("applyBuiltInPatches is idempotent", () => {
    const content = '#!/usr/bin/env node\nconsole.log("hello");\n';
    const first = applyBuiltInPatches(content);
    const second = applyBuiltInPatches(first.content);

    expect(second.content).toBe(first.content);
    expect(second.applied).not.toContain("normalize cch billing hashes in /v1/messages requests");
  });

  test("normalizes cch hashes in each nested location of a request body", () => {
    const body = JSON.stringify({
      messages: [
        { role: "user", content: `plain user text ${testHash}` },
        {
          role: "assistant",
          content: [{ type: "tool_result", content: `nested tool text ${testHash}` }],
        },
      ],
      system: [`system text ${testHash}`],
      priorHash: testHash,
      untouched: "cch=ggggg",
    });

    const next = sanitizeCchBillingHashRequestBody(body);
    const parsed = JSON.parse(next) as {
      messages: [{ content: string }, { content: [{ content: string }] }];
      system: [string];
      priorHash: string;
      untouched: string;
    };

    expect(parsed.messages[0].content).toBe(`plain user text ${CCH_BILLING_HASH_FIXED_VALUE}`);
    expect(parsed.messages[1].content[0].content).toBe(`nested tool text ${CCH_BILLING_HASH_FIXED_VALUE}`);
    expect(parsed.system[0]).toBe(`system text ${CCH_BILLING_HASH_FIXED_VALUE}`);
    expect(parsed.priorHash).toBe(CCH_BILLING_HASH_FIXED_VALUE);
    // cch=ggggg has non-hex chars, should not be sanitized
    expect(parsed.untouched).toBe("cch=ggggg");
  });

  test("falls back to string replacement for non-json bodies", () => {
    expect(sanitizeCchBillingHashRequestBody(`prefix ${testHash} suffix`)).toBe(
      `prefix ${CCH_BILLING_HASH_FIXED_VALUE} suffix`,
    );

    const secondHash = "cch=" + "abcde";
    expect(sanitizeCchBillingHashRequestBody(`a ${testHash} b ${secondHash} c`)).toBe(
      `a ${CCH_BILLING_HASH_FIXED_VALUE} b ${CCH_BILLING_HASH_FIXED_VALUE} c`,
    );
  });

  test("recursively sanitizes nested values", () => {
    const value = sanitizeCchBillingHashValue({
      exact: testHash,
      partial: "cch=",
      hash: testHash,
      invalid: "cch=ggggg",
      nested: ["00000", { sentinel: testHash }],
    }) as {
      exact: string;
      partial: string;
      hash: string;
      invalid: string;
      nested: [string, { sentinel: string }];
    };

    expect(value.exact).toBe(CCH_BILLING_HASH_FIXED_VALUE);
    expect(value.partial).toBe("cch=");
    expect(value.hash).toBe(CCH_BILLING_HASH_FIXED_VALUE);
    expect(value.invalid).toBe("cch=ggggg");
    expect(value.nested[0]).toBe("00000");
    expect(value.nested[1].sentinel).toBe(CCH_BILLING_HASH_FIXED_VALUE);
  });

  test("handles empty and primitive inputs", () => {
    expect(sanitizeCchBillingHashRequestBody("")).toBe("");
    expect(sanitizeCchBillingHashValue(null)).toBeNull();
    expect(sanitizeCchBillingHashValue(undefined)).toBeUndefined();
    expect(sanitizeCchBillingHashValue(42)).toBe(42);
    expect(sanitizeCchBillingHashValue(true)).toBe(true);
  });

  test("sanitizes case-insensitive cch variants", () => {
    const upper = "cch=" + "ABCDE";
    const mixed = "cch=" + "aB1C2";
    expect(sanitizeCchBillingHashString(upper)).toBe(CCH_BILLING_HASH_FIXED_VALUE);
    expect(sanitizeCchBillingHashString(mixed)).toBe(CCH_BILLING_HASH_FIXED_VALUE);
  });
});

describe("insertRuntimePreludeAfterHashbang", () => {
  test("inserts prelude after the hashbang line", () => {
    const content = '#!/usr/bin/env node\nconsole.log("hello");\n';
    const next = insertRuntimePreludeAfterHashbang(content, 'console.log("patched");');

    expect(next.startsWith('#!/usr/bin/env node\nconsole.log("patched");\n')).toBe(true);
    expect(next).toContain('console.log("hello");');
  });

  test("inserts prelude at the top when content has no hashbang", () => {
    const content = 'console.log("hello");\n';
    const next = insertRuntimePreludeAfterHashbang(content, "/* prelude */");

    expect(next.startsWith("/* prelude */\n")).toBe(true);
    expect(next).toContain('console.log("hello");');
  });

  test("handles hashbang with no trailing newline", () => {
    const content = "#!/usr/bin/env node";
    const next = insertRuntimePreludeAfterHashbang(content, "/* prelude */");

    expect(next).toBe("#!/usr/bin/env node\n/* prelude */\n");
  });

  test("returns content unchanged when prelude is empty", () => {
    const content = '#!/usr/bin/env node\nconsole.log("hello");\n';
    const next = insertRuntimePreludeAfterHashbang(content, "");

    expect(next).toBe(content);
  });
});
