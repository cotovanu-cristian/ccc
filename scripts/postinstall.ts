#!/usr/bin/env bun
import p from "picoprint";

// all cli patches are now applied at runtime via src/patches/cli-patches.ts
// postinstall is kept for future non-cli patches if needed

const run = () => {
  p.color.dim.log("⚙", "postinstall");
  p.color.dim.log("·", "cli patches: applied at runtime");
};

run();
