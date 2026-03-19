import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { ClaudeHookInput, HookCommand, HookEventName, HookHandler, HookResponse } from "@/types/hooks";
import { resolveConfigDirectoryPath } from "@/utils/config-directory";
import { log } from "@/utils/log";

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RuntimeHookHandler = (input: ClaudeHookInput) => Promise<HookResponse | void>;
export type HookAgentScope = "all" | "main";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const launcherRoot = dirname(dirname(__dirname));
const tsconfigPath = join(launcherRoot, "tsconfig.json");

const hooksMap = new Map<string, RuntimeHookHandler>();
let currentInstanceId: string | undefined;
let currentConfigDirectory: string | undefined;

export const getHook = (id: string) => hooksMap.get(id);

const generateHookId = <E extends HookEventName>(eventName: E, stableId: string) =>
  `hook_${eventName}_${stableId}`;

const getRunnerPath = () => {
  return join(dirname(__dirname), "cli", "runner.ts");
};

const shQuote = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

const getHookCommandEnvPrefix = (): string => {
  return [
    process.env.DEBUG ? `DEBUG=${shQuote(process.env.DEBUG)}` : "",
    currentInstanceId ? `CCC_INSTANCE_ID=${shQuote(currentInstanceId)}` : "",
    currentConfigDirectory ? `CCC_CONFIG_DIR=${shQuote(currentConfigDirectory)}` : "",
    `TSX_TSCONFIG_PATH=${shQuote(tsconfigPath)}`,
  ]
    .filter(Boolean)
    .join(" ");
};

const getRunnerCommand = (hookId: string, scope: HookAgentScope): string => {
  const runnerPath = getRunnerPath();
  const envPrefix = getHookCommandEnvPrefix();
  const prefix = envPrefix.length > 0 ? `${envPrefix} ` : "";
  return `${prefix}tsx ${shQuote(runnerPath)} hook ${shQuote(hookId)} ${shQuote(scope)}`;
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
  timeout?: number;
  once?: boolean;
}

export const createHook = <E extends HookEventName>(options: CreateHookOptions<E>): HookCommand => {
  const { event, id, handler, scope = "main", timeout, once } = options;
  const hookId = generateHookId(event, id);

  hooksMap.set(hookId, async (input) => {
    if (shouldSkipHookForScope(scope, input)) return;
    return (handler as RuntimeHookHandler)(input);
  });

  return {
    type: "command",
    get command() {
      return getRunnerCommand(hookId, scope);
    },
    timeout,
    once,
  } satisfies HookCommand;
};
