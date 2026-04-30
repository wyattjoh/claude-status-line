import { emphasizePercentage, formatCompactNumber } from "./format.ts";

export const ALL_MODULES = [
  "project",
  "model",
  "cost",
  "tokens",
  "cache",
  "context",
  "session",
  "week",
  "duration",
  "lines",
  "dir",
  "git",
  "weather",
] as const;

export type Module = typeof ALL_MODULES[number];

export function parseModules(modules: string): Set<Module> {
  const names = modules.split(",").map((name) => name.trim());
  const invalid = names.filter((name) => !ALL_MODULES.includes(name as Module));

  if (invalid.length > 0) {
    throw new Error(
      `Invalid module(s): ${invalid.join(", ")}. Valid modules: ${
        ALL_MODULES.join(", ")
      }`,
    );
  }

  return new Set(names as Module[]);
}

export function formatCacheModule(efficiency: number): string {
  return emphasizePercentage(`⚡ ${efficiency}%`);
}

export function formatContextModule(
  contextTokens: {
    percentage: number;
    inputTokens: number;
    contextLimit: number;
  },
): string {
  if (contextTokens.contextLimit <= 0) {
    return emphasizePercentage(`🧠 ${contextTokens.percentage}%`);
  }

  const currentDisplay = formatCompactNumber(contextTokens.inputTokens);
  const limitDisplay = formatCompactNumber(contextTokens.contextLimit);
  return emphasizePercentage(
    `🧠 ${contextTokens.percentage}% (${currentDisplay}/${limitDisplay})`,
  );
}
