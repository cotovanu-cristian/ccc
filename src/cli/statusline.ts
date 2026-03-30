#!/usr/bin/env bun
import { existsSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import type { StatusLineInput } from "@/types/statusline";
import { resolveConfigDirectoryPath } from "@/utils/config-directory";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const resolveConfigDirectory = (launcherRoot: string) => {
  const override = process.env.CCC_CONFIG_DIR?.trim();
  if (override) {
    const configBase = resolveConfigDirectoryPath(launcherRoot, override);
    if (existsSync(configBase)) return configBase;
  }

  const devConfigPath = join(launcherRoot, "dev-config");
  if (existsSync(devConfigPath)) return devConfigPath;

  return join(launcherRoot, "config");
};

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
};

(async () => {
  const input = await readStdin();
  const data: StatusLineInput = JSON.parse(input);

  const launcherRoot = join(__dirname, "../..");
  const configBase = resolveConfigDirectory(launcherRoot);
  const statuslineConfigPath = join(configBase, "global/statusline.ts");

  if (existsSync(statuslineConfigPath)) {
    const module = await import(statuslineConfigPath);
    const statuslineFunction = module.default;
    if (typeof statuslineFunction === "function") {
      await statuslineFunction(data);
    } else {
      console.log(`${statuslineConfigPath} must export default createStatusline(..)`);
    }
  } else {
    console.log(`${statuslineConfigPath} not found`);
  }
})();
