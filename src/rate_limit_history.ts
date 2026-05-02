import { dirname, join } from "node:path";

export const RATE_LIMIT_HISTORY_RETENTION_SECONDS = 15 * 60;

export interface RateLimitSample {
  timestamp: number;
  used_percentage: number;
  resets_at: number;
}

export interface RateLimitHistory {
  five_hour: RateLimitSample[];
  seven_day: RateLimitSample[];
}

interface PathOptions {
  os: typeof Deno.build.os;
  env: Record<string, string | undefined>;
}

const EMPTY_HISTORY: RateLimitHistory = {
  five_hour: [],
  seven_day: [],
};

function isRateLimitSample(value: unknown): value is RateLimitSample {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const sample = value as Record<string, unknown>;
  return typeof sample.timestamp === "number" &&
    typeof sample.used_percentage === "number" &&
    typeof sample.resets_at === "number";
}

function normalizeSamples(value: unknown): RateLimitSample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRateLimitSample).sort((a, b) =>
    a.timestamp - b.timestamp
  );
}

export function createEmptyRateLimitHistory(): RateLimitHistory {
  return {
    five_hour: [],
    seven_day: [],
  };
}

export function getDefaultRateLimitHistoryPath(
  options: PathOptions = {
    os: Deno.build.os,
    env: Deno.env.toObject(),
  },
): string | undefined {
  const { os, env } = options;

  if (os === "darwin" && env.HOME) {
    return join(
      env.HOME,
      "Library",
      "Application Support",
      "claude-status-line",
      "rate-limit-history.json",
    );
  }

  if (os === "windows") {
    const baseDir = env.APPDATA ??
      (env.USERPROFILE
        ? join(env.USERPROFILE, "AppData", "Roaming")
        : undefined);
    return baseDir
      ? join(baseDir, "claude-status-line", "rate-limit-history.json")
      : undefined;
  }

  const baseDir = env.XDG_CONFIG_HOME ??
    (env.HOME ? join(env.HOME, ".config") : undefined);
  return baseDir
    ? join(baseDir, "claude-status-line", "rate-limit-history.json")
    : undefined;
}

export function pruneWindowSamples(
  samples: RateLimitSample[],
  options: {
    nowUnixSeconds: number;
    currentResetAt?: number;
    retentionSeconds?: number;
  },
): RateLimitSample[] {
  const retentionSeconds = options.retentionSeconds ??
    RATE_LIMIT_HISTORY_RETENTION_SECONDS;
  const oldestTimestamp = options.nowUnixSeconds - retentionSeconds;

  return samples.filter((sample) =>
    sample.timestamp >= oldestTimestamp &&
    (options.currentResetAt == null ||
      sample.resets_at === options.currentResetAt)
  );
}

export function updateWindowSamples(
  samples: RateLimitSample[],
  sample: RateLimitSample,
  nowUnixSeconds: number,
): RateLimitSample[] {
  return pruneWindowSamples([...samples, sample], {
    nowUnixSeconds,
    currentResetAt: sample.resets_at,
  }).sort((a, b) => a.timestamp - b.timestamp);
}

export function computeBurnRate(
  samples: RateLimitSample[],
): number | undefined {
  if (samples.length < 2) {
    return undefined;
  }

  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  const elapsedMinutes = (newest.timestamp - oldest.timestamp) / 60;

  if (elapsedMinutes <= 0) {
    return undefined;
  }

  return (newest.used_percentage - oldest.used_percentage) / elapsedMinutes;
}

export async function loadRateLimitHistory(
  filePath: string,
): Promise<RateLimitHistory> {
  try {
    const text = await Deno.readTextFile(filePath);
    const parsed = JSON.parse(text) as Partial<RateLimitHistory>;

    return {
      five_hour: normalizeSamples(parsed.five_hour),
      seven_day: normalizeSamples(parsed.seven_day),
    };
  } catch {
    return createEmptyRateLimitHistory();
  }
}

export async function saveRateLimitHistory(
  filePath: string,
  history: RateLimitHistory,
): Promise<void> {
  await Deno.mkdir(dirname(filePath), { recursive: true });
  await Deno.writeTextFile(
    filePath,
    JSON.stringify(
      {
        five_hour: history.five_hour,
        seven_day: history.seven_day,
      },
      null,
      2,
    ),
  );
}

export { EMPTY_HISTORY };
