import { dirname, join } from "node:path";

export const RATE_LIMIT_HISTORY_RETENTION_FIVE_HOUR_SECONDS = 5 * 60 * 60;
export const RATE_LIMIT_HISTORY_RETENTION_SEVEN_DAY_SECONDS = 7 * 24 * 60 * 60;
export const BURN_RATE_WINDOW_FIVE_HOUR_SECONDS = 15 * 60;
export const BURN_RATE_WINDOW_SEVEN_DAY_SECONDS = 24 * 60 * 60;

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
    retentionSeconds: number;
    currentResetAt?: number;
  },
): RateLimitSample[] {
  const oldestTimestamp = options.nowUnixSeconds - options.retentionSeconds;

  return samples.filter((sample) =>
    sample.timestamp >= oldestTimestamp &&
    (options.currentResetAt == null ||
      sample.resets_at === options.currentResetAt)
  );
}

export type BucketKeyFn = (sample: RateLimitSample) => string;

export function minuteBucketKey(sample: RateLimitSample): string {
  return `m:${Math.floor(sample.timestamp / 60)}`;
}

// Per-minute granularity for samples in the same wall-clock hour as `now`;
// per-hour granularity for older samples. When the hour rolls over, the
// previous hour's minute samples collapse into a single hourly bucket on the
// next compaction.
export function makeWeekTieredBucketKey(
  nowUnixSeconds: number,
): BucketKeyFn {
  const currentHourIndex = Math.floor(nowUnixSeconds / 3600);
  return (sample) => {
    const hourIndex = Math.floor(sample.timestamp / 3600);
    if (hourIndex === currentHourIndex) {
      return `m:${Math.floor(sample.timestamp / 60)}`;
    }
    return `h:${hourIndex}`;
  };
}

export function compactSamples(
  samples: RateLimitSample[],
  bucketKey: BucketKeyFn,
): RateLimitSample[] {
  const buckets = new Map<string, RateLimitSample>();
  for (const sample of samples) {
    const key = bucketKey(sample);
    const existing = buckets.get(key);
    if (!existing || sample.timestamp > existing.timestamp) {
      buckets.set(key, sample);
    }
  }

  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function updateWindowSamples(
  samples: RateLimitSample[],
  sample: RateLimitSample,
  nowUnixSeconds: number,
  retentionSeconds: number,
  bucketKey: BucketKeyFn,
): RateLimitSample[] {
  const pruned = pruneWindowSamples([...samples, sample], {
    nowUnixSeconds,
    retentionSeconds,
    currentResetAt: sample.resets_at,
  });
  return compactSamples(pruned, bucketKey);
}

export function computeBurnRate(
  samples: RateLimitSample[],
  windowOptions?: { nowUnixSeconds: number; windowSeconds: number },
): number | undefined {
  const effective = windowOptions
    ? samples.filter((sample) =>
      sample.timestamp >=
        windowOptions.nowUnixSeconds - windowOptions.windowSeconds
    )
    : samples;

  if (effective.length < 2) {
    return undefined;
  }

  const oldest = effective[0];
  const newest = effective[effective.length - 1];
  const elapsedMinutes = (newest.timestamp - oldest.timestamp) / 60;

  if (elapsedMinutes <= 0) {
    return undefined;
  }

  return (newest.used_percentage - oldest.used_percentage) / elapsedMinutes;
}

export function computeTimeToHitSeconds(
  samples: RateLimitSample[],
  nowUnixSeconds: number,
  burnRateWindowSeconds?: number,
): number | undefined {
  const burnRate = burnRateWindowSeconds != null
    ? computeBurnRate(samples, {
      nowUnixSeconds,
      windowSeconds: burnRateWindowSeconds,
    })
    : computeBurnRate(samples);
  if (burnRate == null || burnRate <= 0) {
    return undefined;
  }

  const current = samples[samples.length - 1];
  const remainingPercentage = 100 - current.used_percentage;
  if (remainingPercentage <= 0) {
    return 0;
  }

  const secondsToHit = Math.round((remainingPercentage / burnRate) * 60);
  const projectedHitUnixSeconds = nowUnixSeconds + secondsToHit;

  return projectedHitUnixSeconds < current.resets_at ? secondsToHit : undefined;
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
