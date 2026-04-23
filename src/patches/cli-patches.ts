// runtime patches for claude cli

export type PatchFn = (content: string) => string;

export type RuntimePatch = { find: string; replace: string } | { fn: PatchFn; name: string };

// built-in string replacements
const builtInStringPatches: RuntimePatch[] = [
  // disable unwanted features
  { find: "security-review", replace: "zsecurityreview" },
];

const labelFor = (patch: RuntimePatch) =>
  "fn" in patch ? patch.name : `"${patch.find}" => "${patch.replace}"`;

const applyOne = (content: string, patch: RuntimePatch) => {
  const result = "fn" in patch ? patch.fn(content) : content.replaceAll(patch.find, patch.replace);
  return { content: result, matched: result !== content };
};

const applyAll = (content: string, patches: RuntimePatch[]) => {
  const applied: string[] = [];
  const missed: string[] = [];
  let result = content;
  for (const patch of patches) {
    const { content: next, matched } = applyOne(result, patch);
    result = next;
    (matched ? applied : missed).push(labelFor(patch));
  }
  return { content: result, applied, missed };
};

// apply all built-in patches to CLI content
export const applyBuiltInPatches = (content: string) => applyAll(content, builtInStringPatches);

// apply user-defined patches
export const applyUserPatches = (content: string, patches: RuntimePatch[]) => applyAll(content, patches);
