import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ClaudeHookInput, HookCommand, HookEventName, HookHandler, HookResponse } from "@/types/hooks";
import { resolveConfigDirectoryPath } from "@/utils/config-directory";
import { log } from "@/utils/log";
import { buildInlineEnvCommandPrefix, shQuote } from "@/utils/shell-command";

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RuntimeHookHandler = (input: ClaudeHookInput) => Promise<HookResponse | void>;
export type HookAgentScope = "all" | "main";
export type HookBatchCommandSource = "builtin" | "config" | "plugin";

export interface HookBatchCommandEntry {
  hookId: string;
  matchers: string[];
  scope: HookAgentScope;
  source: HookBatchCommandSource;
}

interface InternalHookCommandMetadata {
  hookId: string;
  scope: HookAgentScope;
  batchable: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const launcherRoot = dirname(dirname(__dirname));

const hooksMap = new Map<string, RuntimeHookHandler>();
const internalHookCommandMetadata = new WeakMap<HookCommand, InternalHookCommandMetadata>();
let currentInstanceId: string | undefined;
let currentConfigDirectory: string | undefined;

export const getHook = (id: string) => hooksMap.get(id);
export const getInternalHookCommandMetadata = (
  hook: HookCommand,
): InternalHookCommandMetadata | undefined => {
  return internalHookCommandMetadata.get(hook);
};

const generateHookId = <E extends HookEventName>(eventName: E, stableId: string) =>
  `hook_${eventName}_${stableId}`;

const getRunnerPath = () => {
  return join(dirname(__dirname), "cli", "runner.ts");
};

const getHookCommandEnvPrefix = (): string => {
  return buildInlineEnvCommandPrefix({
    DEBUG: process.env.DEBUG,
    CCC_INSTANCE_ID: currentInstanceId,
    CCC_CONFIG_DIR: currentConfigDirectory,
  });
};

const getRunnerCommand = (mode: "hook-batch" | "hook", ...args: string[]): string => {
  const runnerPath = getRunnerPath();
  const envPrefix = getHookCommandEnvPrefix();
  const prefix = envPrefix.length > 0 ? `${envPrefix} ` : "";
  const serializedArgs = args.map((arg) => shQuote(arg)).join(" ");
  return `${prefix}bun ${shQuote(runnerPath)} ${mode}${serializedArgs.length > 0 ? ` ${serializedArgs}` : ""}`;
};

export const isSubagentLocalHookInput = (input: ClaudeHookInput): boolean => {
  if (!input.agent_id) return false;
  return input.hook_event_name !== "SubagentStart" && input.hook_event_name !== "SubagentStop";
};

const shouldSkipHookForScope = (scope: HookAgentScope, input: ClaudeHookInput): boolean => {
  if (scope === "all") return false;
  return isSubagentLocalHookInput(input);
};

export const setInstanceId = (instanceId: string, configDirectory = "config") => {
  const absoluteConfigDirectory = resolveConfigDirectoryPath(launcherRoot, configDirectory);
  currentInstanceId = instanceId;
  currentConfigDirectory = absoluteConfigDirectory;
  log.debug("HOOKS", `Set instance ID: ${instanceId}, configDir=${absoluteConfigDirectory}`);
};

export interface CreateHookOptions<E extends HookEventName> {
  event: E;
  id: string;
  handler: HookHandler<E>;
  scope?: HookAgentScope;
  batchable?: boolean;
  timeout?: number;
  once?: boolean;
}

export const createHook = <E extends HookEventName>(options: CreateHookOptions<E>): HookCommand => {
  const { event, id, handler, scope = "main", batchable = false, timeout, once } = options;
  const hookId = generateHookId(event, id);

  hooksMap.set(hookId, async (input) => {
    if (shouldSkipHookForScope(scope, input)) return;
    return (handler as RuntimeHookHandler)(input);
  });

  const hook: HookCommand = {
    type: "command",
    get command() {
      return getRunnerCommand("hook", hookId, scope);
    },
    timeout,
    once,
  };

  internalHookCommandMetadata.set(hook, { hookId, scope, batchable });
  return hook;
};

export const createHookBatchCommand = (entries: HookBatchCommandEntry[]): HookCommand => {
  const payload = Buffer.from(JSON.stringify(entries), "utf8").toString("base64url");
  return {
    type: "command",
    get command() {
      return getRunnerCommand("hook-batch", payload);
    },
  };
};
