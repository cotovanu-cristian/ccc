import { describe, expect, test } from "bun:test";
import {
  createHook,
  getHook,
  isSubagentLocalHookInput,
  setInstanceId,
} from "@/hooks/hook-generator";
import type {
  PreToolUseHookInput,
  SessionStartHookInput,
  SubagentStartHookInput,
  SubagentStopHookInput,
} from "@/types/hooks";

const baseInput = {
  session_id: "session-1",
  transcript_path: "/tmp/transcript.jsonl",
  cwd: "/tmp/project",
  permission_mode: "default" as const,
};

const createPreToolUseInput = (overrides: Partial<PreToolUseHookInput> = {}): PreToolUseHookInput => ({
  ...baseInput,
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "pwd" },
  tool_use_id: "tool-1",
  ...overrides,
});

const createSessionStartInput = (
  overrides: Partial<SessionStartHookInput> = {},
): SessionStartHookInput => ({
  ...baseInput,
  hook_event_name: "SessionStart",
  source: "startup",
  ...overrides,
});

const createSubagentStartInput = (
  overrides: Partial<SubagentStartHookInput> = {},
): SubagentStartHookInput => ({
  ...baseInput,
  hook_event_name: "SubagentStart",
  agent_id: "agent-1",
  agent_type: "general-purpose",
  ...overrides,
});

const createSubagentStopInput = (
  overrides: Partial<SubagentStopHookInput> = {},
): SubagentStopHookInput => ({
  ...baseInput,
  hook_event_name: "SubagentStop",
  stop_hook_active: false,
  agent_id: "agent-1",
  agent_transcript_path: "/tmp/agent-transcript.jsonl",
  agent_type: "general-purpose",
  ...overrides,
});

describe("hook generator scope", () => {
  test("createHook defaults to passing main scope to the runner", () => {
    setInstanceId("hook-scope-test");

    const hook = createHook({
      event: "PreToolUse",
      id: "default-main-command",
      handler: () => undefined,
    });

    expect(hook.command.startsWith("sh -c ")).toBe(false);
    expect(hook.command).toContain("tsx ");
    expect(hook.command).toContain("hook_PreToolUse_default-main-command");
    expect(hook.command).toContain("main");
  });

  test("scope all preserves the direct runner command", () => {
    const hook = createHook({
      event: "PreToolUse",
      id: "all-scope-command",
      scope: "all",
      handler: () => undefined,
    });

    expect(hook.command.startsWith("sh -c ")).toBe(false);
    expect(hook.command).toContain("tsx ");
    expect(hook.command).toContain("all");
  });

  test("main scope skips subagent-local events at runtime", async () => {
    let calls = 0;
    createHook({
      event: "PreToolUse",
      id: "skip-subagent-runtime",
      handler: () => {
        calls++;
      },
    });

    const hook = getHook("hook_PreToolUse_skip-subagent-runtime");
    expect(hook).toBeDefined();

    await hook?.(
      createPreToolUseInput({
        agent_id: "agent-1",
        agent_type: "general-purpose",
      }),
    );

    expect(calls).toBe(0);
  });

  test("main scope still allows subagent lifecycle hooks on the main thread", async () => {
    let calls = 0;
    createHook({
      event: "SubagentStop",
      id: "allow-subagent-stop-runtime",
      handler: () => {
        calls++;
      },
    });

    const hook = getHook("hook_SubagentStop_allow-subagent-stop-runtime");
    expect(hook).toBeDefined();

    await hook?.(createSubagentStopInput());

    expect(calls).toBe(1);
  });

  test("scope all still runs for subagent-local events", async () => {
    let calls = 0;
    createHook({
      event: "PreToolUse",
      id: "allow-all-runtime",
      scope: "all",
      handler: () => {
        calls++;
      },
    });

    const hook = getHook("hook_PreToolUse_allow-all-runtime");
    expect(hook).toBeDefined();

    await hook?.(
      createPreToolUseInput({
        agent_id: "agent-1",
        agent_type: "general-purpose",
      }),
    );

    expect(calls).toBe(1);
  });

  test("agent_type alone is not treated as a subagent-local invocation", () => {
    expect(
      isSubagentLocalHookInput(
        createSessionStartInput({
          agent_type: "reviewer",
        }),
      ),
    ).toBe(false);
  });

  test("subagent lifecycle inputs are not treated as subagent-local invocations", () => {
    expect(isSubagentLocalHookInput(createSubagentStartInput())).toBe(false);
    expect(isSubagentLocalHookInput(createSubagentStopInput())).toBe(false);
  });
});
