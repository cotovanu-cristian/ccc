import { log } from "@/utils/log";
import { readCached, writeCachedAtomic } from "./cache";
import { detectNativeMode, type NativeInfo } from "./detect";
import { extractEmbeddedJs } from "./extract";
import { PREAMBLE_VERSION, wrapForNode } from "./preamble";

export interface ResolvedCli {
  path: string;
  native: boolean;
  info?: NativeInfo;
  cacheHit?: boolean;
}

export const resolveCliForLaunch = (wrapperDir: string): ResolvedCli | null => {
  const info = detectNativeMode(wrapperDir);
  if (!info) return null;

  const cached = readCached(info.version, info.binaryPath, PREAMBLE_VERSION);
  if (cached) {
    log.info("NATIVE", `using cached cli.js for ${info.version}: ${cached}`);
    return { path: cached, native: true, info, cacheHit: true };
  }

  log.info("NATIVE", `extracting cli.js from ${info.binaryPath} (${info.platformPkg})`);

  const segment = extractEmbeddedJs(info.binaryPath);
  log.debug(
    "NATIVE",
    `extracted segment offset=${segment.offset} length=${segment.length} sha256=${segment.sha256}`,
  );

  const wrapped = wrapForNode(segment.content);
  const cachedPath = writeCachedAtomic(info.version, wrapped, info.binaryPath, PREAMBLE_VERSION);
  log.info("NATIVE", `cached extracted cli.js at ${cachedPath}`);

  return { path: cachedPath, native: true, info, cacheHit: false };
};
