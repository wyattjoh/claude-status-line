import { formatDuration } from "./format.ts";
import type { RateLimitWindow } from "./types.ts";

const TWELVE_HOURS_IN_SECONDS = 12 * 60 * 60;

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

export function formatRateLimitModule(
  label: string,
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

  return `${label} \x1b[1m${
    Math.round(window.used_percentage)
  }%\x1b[22m (${resetDisplay})`;
}
