/* eslint-disable no-param-reassign */
import type {
  FieldState,
  FormField,
  FormResultData,
  MultiSelectFieldState,
  PopupFormDefinition,
  SelectFieldState,
  TextFieldState,
  ToggleFieldState,
} from "./types";
import { ansi, getTerminalSize, type KeyEvent, parseKeypress, write } from "./terminal";

const SYM = {
  FOCUS: "▸",
  RADIO_ON: "●",
  RADIO_OFF: "○",
  CHECK_ON: "✓",
  CHECK_OFF: " ",
  CURSOR: "█",
  SEP: "─",
} as const;

const createFieldState = (field: FormField): FieldState => {
  switch (field.type) {
    case "text": {
      return {
        type: "text",
        name: field.name,
        label: field.label,
        value: field.defaultValue ?? "",
        placeholder: field.placeholder ?? "",
        cursorPos: field.defaultValue?.length ?? 0,
        required: field.required ?? false,
        masked: false,
      };
    }
    case "password": {
      return {
        type: "text",
        name: field.name,
        label: field.label,
        value: "",
        placeholder: field.placeholder ?? "",
        cursorPos: 0,
        required: field.required ?? false,
        masked: true,
      };
    }
    case "select": {
      if (field.options.length === 0) throw new Error(`Select field "${field.name}" has no options`);
      const initialIdx =
        field.initialValue ? field.options.findIndex((o) => o.value === field.initialValue) : 0;
      return {
        type: "select",
        name: field.name,
        label: field.label,
        options: field.options,
        selectedIndex: Math.max(0, initialIdx),
        required: field.required ?? false,
      };
    }
    case "multiselect": {
      if (field.options.length === 0) throw new Error(`Multiselect field "${field.name}" has no options`);
      const initial = new Set<number>();
      if (field.initialValues) {
        for (const v of field.initialValues) {
          const idx = field.options.findIndex((o) => o.value === v);
          if (idx >= 0) initial.add(idx);
        }
      }
      return {
        type: "multiselect",
        name: field.name,
        label: field.label,
        options: field.options,
        selectedIndices: initial,
        focusedIndex: 0,
        required: field.required ?? false,
      };
    }
    case "toggle": {
      return {
        type: "toggle",
        name: field.name,
        label: field.label,
        value: field.defaultValue ?? false,
        required: field.required ?? false,
      };
    }
    default: {
      throw new Error(`Unknown field type`);
    }
  }
};

const renderTextField = (field: TextFieldState, focused: boolean, cols: number) => {
  const label =
    focused ? `  ${ansi.cyan(SYM.FOCUS)} ${ansi.bold(field.label)}` : `    ${ansi.dim(field.label)}`;
  const maxW = Math.max(10, cols - 8);
  const displayValue = field.masked ? "•".repeat(field.value.length) : field.value;

  let input: string;
  if (focused) {
    const before = displayValue.slice(0, field.cursorPos);
    const cursorChar = displayValue[field.cursorPos] ?? " ";
    const after = displayValue.slice(field.cursorPos + 1);
    input = `    ${before}${ansi.inverse(cursorChar)}${after}`;
  } else if (field.value) {
    input = `    ${ansi.dim(displayValue)}`;
  } else if (field.placeholder) {
    input = `    ${ansi.gray(field.placeholder)}`;
  } else {
    input = `    ${ansi.gray("(empty)")}`;
  }

  return [label, input.slice(0, maxW + 8)];
};

const renderSelectField = (field: SelectFieldState, focused: boolean, _cols: number) => {
  const label =
    focused ? `  ${ansi.cyan(SYM.FOCUS)} ${ansi.bold(field.label)}` : `    ${ansi.dim(field.label)}`;
  const lines = [label];

  for (const [i, opt] of field.options.entries()) {
    const selected = i === field.selectedIndex;
    const icon = selected ? SYM.RADIO_ON : SYM.RADIO_OFF;
    const text = opt.label;
    const hint = opt.hint ? ` ${ansi.gray(opt.hint)}` : "";

    if (focused) {
      lines.push(
        selected ?
          `    ${ansi.cyan(icon)} ${ansi.bold(text)}${hint}`
        : `    ${ansi.dim(icon)} ${text}${hint}`,
      );
    } else {
      lines.push(
        selected ?
          `    ${icon} ${ansi.dim(text)}${hint}`
        : `    ${ansi.dim(`${icon} ${text}`)}${hint ? ansi.dim(hint) : ""}`,
      );
    }
  }

  return lines;
};

const renderMultiSelectField = (field: MultiSelectFieldState, focused: boolean, _cols: number) => {
  const label =
    focused ? `  ${ansi.cyan(SYM.FOCUS)} ${ansi.bold(field.label)}` : `    ${ansi.dim(field.label)}`;
  const lines = [label];

  for (let i = 0; i < field.options.length; i++) {
    const opt = field.options[i]!;
    const checked = field.selectedIndices.has(i);
    const icon = checked ? `[${SYM.CHECK_ON}]` : `[${SYM.CHECK_OFF}]`;
    const text = opt.label;
    const hint = opt.hint ? ` ${ansi.gray(opt.hint)}` : "";
    const isFocusedOption = focused && i === field.focusedIndex;

    if (isFocusedOption) {
      lines.push(`    ${ansi.cyan("›")} ${icon} ${ansi.bold(text)}${hint}`);
    } else if (focused) {
      lines.push(`      ${checked ? ansi.green(icon) : ansi.dim(icon)} ${text}${hint}`);
    } else {
      lines.push(`      ${ansi.dim(`${icon} ${text}`)}${hint ? ansi.dim(hint) : ""}`);
    }
  }

  return lines;
};

const renderToggleField = (field: ToggleFieldState, focused: boolean, _cols: number) => {
  const label =
    focused ? `  ${ansi.cyan(SYM.FOCUS)} ${ansi.bold(field.label)}` : `    ${ansi.dim(field.label)}`;

  const yes = field.value ? `${SYM.RADIO_ON} Yes` : `${SYM.RADIO_OFF} Yes`;
  const no = !field.value ? `${SYM.RADIO_ON} No` : `${SYM.RADIO_OFF} No`;

  let toggle: string;
  if (focused) {
    toggle =
      field.value ?
        `    ${ansi.cyan(ansi.bold(yes))}   ${ansi.dim(no)}`
      : `    ${ansi.dim(yes)}   ${ansi.cyan(ansi.bold(no))}`;
  } else {
    toggle = `    ${ansi.dim(yes)}   ${ansi.dim(no)}`;
  }

  return [label, toggle];
};

const renderField = (field: FieldState, focused: boolean, cols: number) => {
  switch (field.type) {
    case "text": {
      return renderTextField(field, focused, cols);
    }
    case "select": {
      return renderSelectField(field, focused, cols);
    }
    case "multiselect": {
      return renderMultiSelectField(field, focused, cols);
    }
    case "toggle": {
      return renderToggleField(field, focused, cols);
    }
    default: {
      throw new Error(`Unknown field type`);
    }
  }
};

// -- key handling --

const handleTextKey = (field: TextFieldState, event: KeyEvent) => {
  if (event.type === "char") {
    field.value = field.value.slice(0, field.cursorPos) + event.char + field.value.slice(field.cursorPos);
    field.cursorPos += event.char.length;
    return;
  }
  if (event.type === "backspace") {
    if (field.cursorPos > 0) {
      // handle surrogate pairs: check if previous code unit is a low surrogate
      const prev = field.value.charCodeAt(field.cursorPos - 1);
      const deleteLen = prev >= 0xDC_00 && prev <= 0xDF_FF && field.cursorPos >= 2 ? 2 : 1;
      field.value = field.value.slice(0, field.cursorPos - deleteLen) + field.value.slice(field.cursorPos);
      field.cursorPos -= deleteLen;
    }
    return;
  }
  if (event.type === "delete") {
    if (field.cursorPos < field.value.length) {
      field.value = field.value.slice(0, field.cursorPos) + field.value.slice(field.cursorPos + 1);
    }
    return;
  }
  if (event.type === "left") {
    if (field.cursorPos > 0) field.cursorPos--;
    return;
  }
  if (event.type === "right") {
    if (field.cursorPos < field.value.length) field.cursorPos++;
    return;
  }
  if (event.type === "home") {
    field.cursorPos = 0;
    return;
  }
  if (event.type === "end") {
    field.cursorPos = field.value.length;
  }
};

const handleSelectKey = (field: SelectFieldState, event: KeyEvent) => {
  if (event.type === "up") {
    field.selectedIndex = Math.max(0, field.selectedIndex - 1);
    return;
  }
  if (event.type === "down") {
    field.selectedIndex = Math.min(field.options.length - 1, field.selectedIndex + 1);
  }
};

const handleMultiSelectKey = (field: MultiSelectFieldState, event: KeyEvent) => {
  if (event.type === "up") {
    field.focusedIndex = Math.max(0, field.focusedIndex - 1);
    return;
  }
  if (event.type === "down") {
    field.focusedIndex = Math.min(field.options.length - 1, field.focusedIndex + 1);
    return;
  }
  if (event.type === "char" && event.char === " ") {
    const idx = field.focusedIndex;
    if (field.selectedIndices.has(idx)) {
      field.selectedIndices.delete(idx);
    } else {
      field.selectedIndices.add(idx);
    }
  }
};

const handleToggleKey = (field: ToggleFieldState, event: KeyEvent) => {
  if (event.type === "char" && event.char === " ") {
    field.value = !field.value;
    return;
  }
  if (event.type === "left" || event.type === "right") {
    field.value = !field.value;
  }
};

const handleFieldKey = (field: FieldState, event: KeyEvent) => {
  switch (field.type) {
    case "text": {
      handleTextKey(field, event);
      break;
    }
    case "select": {
      handleSelectKey(field, event);
      break;
    }
    case "multiselect": {
      handleMultiSelectKey(field, event);
      break;
    }
    case "toggle": {
      handleToggleKey(field, event);
      break;
    }
    default: {
      throw new Error(`Unknown field type`);
    }
  }
};

const extractResult = (fields: FieldState[]): FormResultData => {
  const data: FormResultData = {};
  for (const field of fields) {
    switch (field.type) {
      case "text": {
        data[field.name] = field.value;
        break;
      }
      case "select": {
        data[field.name] = field.options[field.selectedIndex]!.value;
        break;
      }
      case "multiselect": {
        data[field.name] = Array.from(field.selectedIndices)
          .sort((a, b) => a - b)
          .map((i) => field.options[i]!.value);
        break;
      }
      case "toggle": {
        data[field.name] = field.value;
        break;
      }
      default: {
        throw new Error(`Unknown field type`);
      }
    }
  }
  return data;
};

export const runForm = (definition: PopupFormDefinition): Promise<FormResultData | null> =>
  new Promise((resolve) => {
    const fields = definition.fields.map(createFieldState);
    if (fields.length === 0) {
      resolve(null);
      return;
    }
    let focusIndex = 0;
    let done = false;

    const { stdin } = process;
    if (!stdin.isTTY) {
      resolve(null);
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    write(ansi.altScreenOn + ansi.hideCursor);

    const render = () => {
      const { cols, rows } = getTerminalSize();
      const lines: string[] = [""];
      const fieldStartRows: number[] = [];

      for (const [i, field] of fields.entries()) {
        fieldStartRows.push(lines.length);
        const focused = i === focusIndex;
        lines.push(...renderField(field!, focused, cols));
        lines.push("");
      }

      const sep = `  ${ansi.dim(SYM.SEP.repeat(Math.min(40, cols - 4)))}`;
      const help = `  ${ansi.dim("Tab: next  Shift+Tab: prev  Enter: submit  Esc: cancel")}`;
      lines.push(sep, help);

      // scroll: ensure focused field is visible
      const maxVisible = rows;
      let scrollOffset = 0;
      const focusStart = fieldStartRows[focusIndex] ?? 0;
      if (focusStart >= maxVisible - 4) {
        scrollOffset = focusStart - 2;
      }

      const visible = lines.slice(scrollOffset, scrollOffset + maxVisible);
      write(ansi.moveTo(1, 1) + ansi.clearDown);
      write(visible.join("\n"));
    };

    const cleanup = () => {
      if (done) return;
      done = true;
      stdin.off("data", onData);
      try {
        stdin.setRawMode(false);
      } catch {
        /* already restored */
      }
      stdin.pause();
      write(ansi.altScreenOff + ansi.showCursor);
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
    };

    const onSignal = () => {
      cleanup();
      resolve(null);
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    const onData = (data: Buffer) => {
      if (done) return;
      try {
        const events = parseKeypress(data);

        for (const event of events) {
          if (event.type === "escape" || event.type === "ctrl-c") {
            cleanup();
            resolve(null);
            return;
          }

          if (event.type === "enter") {
            cleanup();
            resolve(extractResult(fields));
            return;
          }

          if (event.type === "tab") {
            focusIndex = (focusIndex + 1) % fields.length;
            continue;
          }

          if (event.type === "shift-tab") {
            focusIndex = (focusIndex - 1 + fields.length) % fields.length;
            continue;
          }

          // select/multiselect consume up/down for option navigation; others use them for focus
          const field = fields[focusIndex]!;
          const fieldConsumesArrows = field.type === "select" || field.type === "multiselect";
          if (fieldConsumesArrows) {
            handleFieldKey(field, event);
          } else if (event.type === "up") {
            focusIndex = (focusIndex - 1 + fields.length) % fields.length;
          } else if (event.type === "down") {
            focusIndex = (focusIndex + 1) % fields.length;
          } else {
            handleFieldKey(field, event);
          }
        }

        render();
      } catch {
        cleanup();
        resolve(null);
      }
    };

    stdin.on("data", onData);
    try {
      render();
    } catch (error) {
      cleanup();
      process.stderr.write(`form render error: ${String(error)}\n`);
      resolve(null);
    }
  });

export const calculatePopupHeight = (definition: PopupFormDefinition) => {
  let lines = 2; // top padding + bottom padding
  for (const field of definition.fields) {
    lines++; // label
    switch (field.type) {
      case "text":
      case "password":
      case "toggle": {
        lines++;
        break;
      }
      case "select": {
        lines += field.options.length;
        break;
      }
      case "multiselect": {
        lines += field.options.length;
        break;
      }
      default: {
        throw new Error(`Unknown field type`);
      }
    }
    lines++; // spacing
  }
  lines += 2; // footer
  return lines + 2; // tmux border
};
