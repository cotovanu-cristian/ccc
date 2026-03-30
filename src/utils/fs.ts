import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ensureFileExists = (filePath: string) => {
  const dirPath = dirname(filePath);

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, "");
  }
};

export const ensureDirectoryExists = (dirPath: string) => {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
};
