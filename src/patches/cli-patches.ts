// runtime patches for claude cli

export type PatchFn = (content: string) => string;

export type RuntimePatch = { find: string; replace: string } | { fn: PatchFn; name: string };

// built-in string replacements
const builtInStringPatches: RuntimePatch[] = [
  // disable unwanted features
  { find: "pr-comments", replace: "zprcomments" },
  { find: "security-review", replace: "zsecurityreview" },
];

const applyOne = (content: string, patch: RuntimePatch) => {
  if ("fn" in patch) {
    const result = patch.fn(content);
    return { content: result, label: result !== content ? patch.name : null };
  }
  const result = content.replaceAll(patch.find, patch.replace);
  return { content: result, label: result !== content ? `"${patch.find}" => "${patch.replace}"` : null };
};

const applyAll = (content: string, patches: RuntimePatch[]) => {
  const applied: string[] = [];
  let result = content;
  for (const patch of patches) {
    const { content: next, label } = applyOne(result, patch);
    result = next;
    if (label) applied.push(label);
  }
  return { content: result, applied };
};

// apply all built-in patches to CLI content
export const applyBuiltInPatches = (content: string) => applyAll(content, builtInStringPatches);

// apply user-defined patches
export const applyUserPatches = (content: string, patches: RuntimePatch[]) => applyAll(content, patches);
