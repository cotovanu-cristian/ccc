#!/usr/bin/env bun
import { writeFileSync } from "fs";
import type { PopupFormDefinition } from "./types";
import { runForm } from "./form";

const main = async () => {
  const encoded = process.env.CCC_POPUP_FORM;
  const resultFile = process.env.CCC_POPUP_RESULT_FILE;

  if (!encoded || !resultFile) {
    process.stderr.write("renderer: missing CCC_POPUP_FORM or CCC_POPUP_RESULT_FILE\n");
    process.exit(2);
  }

  let definition: PopupFormDefinition;
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    definition = JSON.parse(json);
  } catch (error) {
    process.stderr.write(`renderer: failed to decode form definition: ${error}\n`);
    process.exit(2);
  }

  const result = await runForm(definition);

  if (result === null) {
    process.exit(1);
  }

  writeFileSync(resultFile, JSON.stringify(result));
  process.exit(0);
};

main().catch((error: unknown) => {
  process.stderr.write(`renderer: unhandled error: ${error}\n`);
  process.exit(2);
});
