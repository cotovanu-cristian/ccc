export const shQuote = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

export const buildInlineEnvCommandPrefix = (env: Record<string, string | undefined>): string => {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${shQuote(value as string)}`)
    .join(" ");
};
