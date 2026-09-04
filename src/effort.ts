/**
 * Reasoning effort levels reported by Claude Code in `effort.level`.
 */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * A reasoning effort level string.
 */
export type EffortLevel = typeof EFFORT_LEVELS[number];

const EFFORT_COLORS: Record<EffortLevel, string> = {
  low: "\x1b[34m", // blue
  medium: "\x1b[36m", // cyan
  high: "\x1b[32m", // green
  xhigh: "\x1b[33m", // yellow
  max: "\x1b[31m", // red
};

/**
 * Formats the effort level as a colored bracketed suffix, e.g. `(high)`.
 * Unknown levels are rendered without color. Returns undefined when no
 * level is provided so callers can omit the suffix.
 *
 * @param level The effort level reported by Claude Code
 * @returns The colored suffix, or undefined when level is absent
 */
export function formatEffortSuffix(
  level: string | undefined,
): string | undefined {
  if (!level) return undefined;
  const color = EFFORT_COLORS[level as EffortLevel];
  if (!color) return `(${level})`;
  return `${color}(${level})\x1b[39m`;
}
