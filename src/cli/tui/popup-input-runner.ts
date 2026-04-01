import type { FormField } from "@/tui/types";
import { showPopup } from "@/tui/popup";

interface InputConfig {
  title: string;
  fields: unknown[];
  outputFormat: "json" | "text" | "value";
  width?: string;
  height?: string;
}

const isValidField = (field: unknown): field is FormField => {
  return (
    typeof field === "object" &&
    field !== null &&
    "type" in field &&
    "name" in field &&
    "label" in field &&
    typeof (field as Record<string, unknown>).type === "string" &&
    typeof (field as Record<string, unknown>).name === "string" &&
    typeof (field as Record<string, unknown>).label === "string"
  );
};

const formatValue = (v: unknown) => {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "");
};

export const runPopupInput = (encodedConfig: string) => {
  let config: InputConfig;
  try {
    config = JSON.parse(Buffer.from(encodedConfig, "base64url").toString("utf8"));
  } catch {
    process.stderr.write("failed to decode popup-input config\n");
    process.exit(2);
  }

  if (!Array.isArray(config.fields) || !config.fields.every(isValidField)) {
    process.stderr.write("popup-input: invalid field definitions\n");
    process.exit(2);
  }

  const result = showPopup({
    title: config.title,
    fields: config.fields,
    width: config.width,
    height: config.height,
  });

  if (result.status !== "ok") {
    if (result.status === "error") process.stderr.write(`popup-input: ${result.error}\n`);
    process.exit(1);
  }

  const entries = Object.entries(result.data);

  switch (config.outputFormat) {
    case "value": {
      const first = entries[0];
      if (first) process.stdout.write(formatValue(first[1]));
      break;
    }
    case "json": {
      process.stdout.write(JSON.stringify(result.data));
      break;
    }
    case "text": {
      for (const [key, val] of entries) {
        process.stdout.write(`${key}: ${formatValue(val)}\n`);
      }
      break;
    }
    default: {
      break;
    }
  }
};
