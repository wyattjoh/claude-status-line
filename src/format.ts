/**
 * Formats a number with K (thousands) or M (millions) suffix.
 * @param num - The number to format
 * @returns Formatted string like "1.2K", "3.4M", or "123"
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    const value = num / 1_000_000;
    return `${value.toFixed(value >= 10 ? 0 : 1)}M`;
  }
  if (num >= 1_000) {
    const value = num / 1_000;
    return `${value.toFixed(value >= 10 ? 0 : 1)}K`;
  }
  return num.toString();
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "1h 23m", "45m", or "30s"
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Calculates cache efficiency as a percentage.
 * @param cacheReadTokens - Tokens read from cache
 * @param inputTokens - Direct input tokens
 * @returns Percentage of tokens served from cache (0-100)
 */
export function calculateCacheEfficiency(
  cacheReadTokens: number,
  inputTokens: number,
): number {
  const total = cacheReadTokens + inputTokens;
  if (total === 0) {
    return 0;
  }
  return Math.round((cacheReadTokens / total) * 100);
}

/**
 * Shortens a model name for compact display.
 * @param modelName - Full model name like "claude-opus-4-5-20251101"
 * @returns Shortened name like "Opus 4.5"
 */
export function shortenModelName(modelName: string): string {
  // Handle common Claude model patterns
  const match = modelName.match(
    /claude-?(opus|sonnet|haiku)-?(\d+)?-?(\d+)?/i,
  );
  if (!match) {
    return modelName;
  }

  const [, variant, major, minor] = match;
  const capitalizedVariant = variant.charAt(0).toUpperCase() +
    variant.slice(1).toLowerCase();

  if (major && minor) {
    return `${capitalizedVariant} ${major}.${minor}`;
  }
  if (major) {
    return `${capitalizedVariant} ${major}`;
  }
  return capitalizedVariant;
}
