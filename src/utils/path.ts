import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const expandPath = (path: string) => {
  let expandedPath = path;
  if (path.startsWith("~/")) {
    expandedPath = join(homedir(), path.slice(2));
  }
  expandedPath = expandedPath.replace(/\$([A-Z_][\dA-Z_]*)/g, (_, varName) => {
    return process.env[varName] || "";
  });
  return resolve(expandedPath);
};

export const convertPathToId = (path: string, fallback = "root") => {
  const sanitized = path
    .replace(/[^\dA-Za-z-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || fallback;
};
