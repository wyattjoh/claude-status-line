import { emphasizePercentage, formatDuration } from "./format.ts";
import type { RateLimitWindow } from "./types.ts";

const TWELVE_HOURS_IN_SECONDS = 12 * 60 * 60;

export const FIVE_HOURS_IN_SECONDS = 5 * 60 * 60;
export const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

export function formatResetAt(
  resetUnixSeconds: number,
  nowUnixSeconds: number,
): string {
  const deltaSeconds = resetUnixSeconds - nowUnixSeconds;

  if (deltaSeconds <= 0) {
    return "";
  }

  if (deltaSeconds < TWELVE_HOURS_IN_SECONDS) {
    return formatDuration(deltaSeconds * 1000);
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(resetUnixSeconds * 1000));
}

function formatPaceVariance(
  usedPercentage: number,
  windowSeconds: number,
  resetUnixSeconds: number,
  nowUnixSeconds: number,
): string {
  const startSeconds = resetUnixSeconds - windowSeconds;
  const elapsedSeconds = nowUnixSeconds - startSeconds;
  const expectedPercentage = Math.max(
    0,
    Math.min(100, (elapsedSeconds / windowSeconds) * 100),
  );
  const delta = Math.round(usedPercentage - expectedPercentage);
  const sign = delta >= 0 ? "+" : "";
  const text = `(${sign}${delta}%)`;

  if (delta > 0) {
    return `\x1b[31m${text}\x1b[39m`;
  }
  return `\x1b[2m${text}\x1b[22m`;
}

export function formatRateLimitModule(
  label: string,
  windowSeconds: number,
  window: RateLimitWindow | undefined,
  nowUnixSeconds: number,
): string | undefined {
  if (!window) {
    return undefined;
  }

  const resetDisplay = formatResetAt(window.resets_at, nowUnixSeconds);
  if (!resetDisplay) {
    return undefined;
  }

  const variance = formatPaceVariance(
    window.used_percentage,
    windowSeconds,
    window.resets_at,
    nowUnixSeconds,
  );

  return emphasizePercentage(
    `${label} ${
      Math.round(window.used_percentage)
    }% ${variance} (${resetDisplay})`,
  );
}
