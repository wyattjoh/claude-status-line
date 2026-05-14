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

export function emphasizePercentage(text: string): string {
  return text.replace(/(\d+%)/, "\x1b[37m$1\x1b[39m");
}

export function prepareStatusLineOutput(text: string): string {
  return `\x1b[0m${text}`;
}

// deno-lint-ignore no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function isWideCodepoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2E80 && cp <= 0x303E) ||
    (cp >= 0x3041 && cp <= 0x33FF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    (cp >= 0xA000 && cp <= 0xA4CF) ||
    (cp >= 0xAC00 && cp <= 0xD7A3) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE30 && cp <= 0xFE4F) ||
    (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    (cp >= 0x1F000 && cp <= 0x1FFFF) ||
    (cp >= 0x20000 && cp <= 0x2FFFD) ||
    (cp >= 0x30000 && cp <= 0x3FFFD)
  );
}

/**
 * Returns the visible column width of `text`, stripping ANSI escapes and
 * counting wide characters (emoji, CJK) as 2 columns. Variation selector
 * U+FE0F promotes the preceding base character to emoji (wide) presentation;
 * U+200D (ZWJ) and other VS chars contribute zero width.
 */
export function visibleWidth(text: string): number {
  const stripped = text.replace(ANSI_PATTERN, "");
  const chars = [...stripped];
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0x200D || (cp >= 0xFE00 && cp <= 0xFE0F)) continue;
    const next = chars[i + 1]?.codePointAt(0);
    if (next === 0xFE0F) {
      width += 2;
      continue;
    }
    width += isWideCodepoint(cp) ? 2 : 1;
  }
  return width;
}

/**
 * Greedily packs components onto lines so each line's visible width fits
 * within `maxWidth`. Components are never split mid-token; if a single
 * component is wider than `maxWidth` it occupies its own line.
 */
export function packComponentsIntoLines(
  components: string[],
  separator: string,
  maxWidth: number,
): string[] {
  if (components.length === 0) return [];
  if (maxWidth <= 0) return [components.join(separator)];

  const sepWidth = visibleWidth(separator);
  const lines: string[] = [];
  let current: string[] = [];
  let currentWidth = 0;

  for (const comp of components) {
    const compWidth = visibleWidth(comp);
    if (current.length === 0) {
      current.push(comp);
      currentWidth = compWidth;
      continue;
    }
    if (currentWidth + sepWidth + compWidth > maxWidth) {
      lines.push(current.join(separator));
      current = [comp];
      currentWidth = compWidth;
    } else {
      current.push(comp);
      currentWidth += sepWidth + compWidth;
    }
  }
  if (current.length > 0) {
    lines.push(current.join(separator));
  }
  return lines;
}
