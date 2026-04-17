import { createHash } from "crypto";
import { readFileSync } from "fs";
import { NATIVE_BUN_SEGMENT_MARKER, NATIVE_MIN_SEGMENT_SIZE } from "./constants";

const MARKER_BYTES = Buffer.from(NATIVE_BUN_SEGMENT_MARKER, "utf8");

const isPrintable = (b: number) => {
  if (b === 0x09 || b === 0x0A || b === 0x0D) return true;
  return b >= 0x20 && b <= 0x7E;
};

const findAllMarkers = (buf: Buffer) => {
  const offsets: number[] = [];
  let start = 0;
  while (true) {
    const idx = buf.indexOf(MARKER_BYTES, start);
    if (idx === -1) break;
    offsets.push(idx);
    start = idx + 1;
  }
  return offsets;
};

const extractPrintableSegment = (buf: Buffer, start: number): Buffer => {
  let end = start;
  while (end < buf.length && isPrintable(buf[end]!)) end++;
  return buf.subarray(start, end);
};

export interface ExtractedSegment {
  offset: number;
  length: number;
  sha256: string;
  content: Buffer;
}

export const extractEmbeddedJs = (binaryPath: string): ExtractedSegment => {
  const data = readFileSync(binaryPath);
  const offsets = findAllMarkers(data);

  if (offsets.length === 0) {
    throw new Error(
      `native-extract: marker '${NATIVE_BUN_SEGMENT_MARKER}' not found in ${binaryPath}. ` +
        "The claude-code bundle format likely changed. " +
        "Update NATIVE_BUN_SEGMENT_MARKER in src/native/constants.ts.",
    );
  }

  const seen = new Set<string>();
  const segments: ExtractedSegment[] = [];

  for (const offset of offsets) {
    const content = extractPrintableSegment(data, offset);
    if (content.length < NATIVE_MIN_SEGMENT_SIZE) continue;
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (seen.has(sha256)) continue;
    seen.add(sha256);
    segments.push({ offset, length: content.length, sha256, content });
  }

  if (segments.length === 0) {
    throw new Error(
      `native-extract: found ${offsets.length} marker(s) but no segment >= ${NATIVE_MIN_SEGMENT_SIZE} bytes in ${binaryPath}. ` +
        "If the file is ~500 bytes it is the postinstall stub — run the wrapper's install.cjs to place the real binary.",
    );
  }

  segments.sort((a, b) => b.length - a.length);
  return segments[0]!;
};
