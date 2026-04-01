import pc from "picocolors";

const CSI = "\u001b[";

export const ansi = {
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  moveTo: (row: number, col: number) => `${CSI}${row};${col}H`,
  clearScreen: `${CSI}2J`,
  clearDown: `${CSI}J`,
  clearLine: `${CSI}2K`,
  altScreenOn: `${CSI}?1049h`,
  altScreenOff: `${CSI}?1049l`,
  bold: pc.bold,
  dim: pc.dim,
  italic: pc.italic,
  underline: pc.underline,
  inverse: pc.inverse,
  cyan: pc.cyan,
  green: pc.green,
  yellow: pc.yellow,
  gray: pc.gray,
  white: pc.white,
} as const;

export type KeyEvent =
  | { type: "backspace" }
  | { type: "char"; char: string }
  | { type: "ctrl-c" }
  | { type: "delete" }
  | { type: "down" }
  | { type: "end" }
  | { type: "enter" }
  | { type: "escape" }
  | { type: "home" }
  | { type: "left" }
  | { type: "right" }
  | { type: "shift-tab" }
  | { type: "tab" }
  | { type: "up" };

export const parseKeypress = (data: Buffer): KeyEvent[] => {
  const events: KeyEvent[] = [];
  let i = 0;

  while (i < data.length) {
    const byte = data[i] as number;

    if (byte === 0x1B) {
      if (i + 2 < data.length && data[i + 1] === 0x5B) {
        const code = data[i + 2] as number;
        if (code === 0x41) {
          events.push({ type: "up" });
          i += 3;
          continue;
        }
        if (code === 0x42) {
          events.push({ type: "down" });
          i += 3;
          continue;
        }
        if (code === 0x43) {
          events.push({ type: "right" });
          i += 3;
          continue;
        }
        if (code === 0x44) {
          events.push({ type: "left" });
          i += 3;
          continue;
        }
        if (code === 0x48) {
          events.push({ type: "home" });
          i += 3;
          continue;
        }
        if (code === 0x46) {
          events.push({ type: "end" });
          i += 3;
          continue;
        }
        if (code === 0x5A) {
          events.push({ type: "shift-tab" });
          i += 3;
          continue;
        }
        if (code === 0x33 && i + 3 < data.length && data[i + 3] === 0x7E) {
          events.push({ type: "delete" });
          i += 4;
          continue;
        }
        // unknown CSI sequence — skip parameter/intermediate bytes then final byte
        i += 2; // past ESC [
        while (i < data.length && (data[i] as number) >= 0x20 && (data[i] as number) <= 0x3F) i++;
        if (i < data.length) i++; // consume the final byte
        continue;
      }
      events.push({ type: "escape" });
      i++;
      continue;
    }

    if (byte === 0x0D) {
      events.push({ type: "enter" });
      i++;
      continue;
    }
    if (byte === 0x09) {
      events.push({ type: "tab" });
      i++;
      continue;
    }
    if (byte === 0x7F || byte === 0x08) {
      events.push({ type: "backspace" });
      i++;
      continue;
    }
    if (byte === 0x03) {
      events.push({ type: "ctrl-c" });
      i++;
      continue;
    }

    // printable ASCII (includes space 0x20)
    if (byte >= 0x20 && byte < 0x7F) {
      events.push({ type: "char", char: String.fromCharCode(byte) });
      i++;
      continue;
    }

    // utf-8 multi-byte: decode one codepoint
    if (byte >= 0xC0) {
      const len: number =
        byte < 0xE0 ? 2
        : byte < 0xF0 ? 3
        : 4;
      if (i + len <= data.length) {
        const char = data.subarray(i, i + len).toString("utf8");
        if (char.length > 0) {
          events.push({ type: "char", char });
          i += len;
          continue;
        }
      }
    }

    i++;
  }

  return events;
};

export const getTerminalSize = () => ({
  rows: process.stdout.rows || 24,
  cols: process.stdout.columns || 80,
});

export const write = (text: string) => {
  process.stdout.write(text);
};
