import { assert, assertEquals } from "jsr:@std/assert";
import { join } from "node:path";

import {
  compactSamples,
  computeBurnRate,
  computeTimeToHitSeconds,
  getDefaultRateLimitHistoryPath,
  loadRateLimitHistory,
  makeWeekTieredBucketKey,
  minuteBucketKey,
  pruneWindowSamples,
  saveRateLimitHistory,
  updateWindowSamples,
} from "../src/rate_limit_history.ts";

Deno.test("pruneWindowSamples filters by retention and resets_at", () => {
  assertEquals(
    pruneWindowSamples([
      { timestamp: 100, used_percentage: 10, resets_at: 500 },
      { timestamp: 1_000, used_percentage: 20, resets_at: 500 },
      { timestamp: 1_001, used_percentage: 21, resets_at: 500 },
    ], {
      nowUnixSeconds: 1_001,
      currentResetAt: 500,
      retentionSeconds: 900,
    }),
    [
      { timestamp: 1_000, used_percentage: 20, resets_at: 500 },
      { timestamp: 1_001, used_percentage: 21, resets_at: 500 },
    ],
  );
});

Deno.test("updateWindowSamples resets history when the window changes", () => {
  const updated = updateWindowSamples(
    [
      { timestamp: 900, used_percentage: 30, resets_at: 1_500 },
    ],
    {
      timestamp: 1_000,
      used_percentage: 5,
      resets_at: 2_000,
    },
    1_000,
    900,
    minuteBucketKey,
  );

  assertEquals(updated, [
    { timestamp: 1_000, used_percentage: 5, resets_at: 2_000 },
  ]);
});

Deno.test("compactSamples with minute buckets keeps the newest sample per minute", () => {
  const compacted = compactSamples(
    [
      { timestamp: 0, used_percentage: 1, resets_at: 9_000 },
      { timestamp: 30, used_percentage: 2, resets_at: 9_000 },
      { timestamp: 59, used_percentage: 3, resets_at: 9_000 },
      { timestamp: 65, used_percentage: 4, resets_at: 9_000 },
      { timestamp: 119, used_percentage: 5, resets_at: 9_000 },
      { timestamp: 120, used_percentage: 6, resets_at: 9_000 },
    ],
    minuteBucketKey,
  );

  assertEquals(compacted, [
    { timestamp: 59, used_percentage: 3, resets_at: 9_000 },
    { timestamp: 119, used_percentage: 5, resets_at: 9_000 },
    { timestamp: 120, used_percentage: 6, resets_at: 9_000 },
  ]);
});

Deno.test("updateWindowSamples collapses bursts within the same minute", () => {
  const initial = [
    { timestamp: 1_200, used_percentage: 10, resets_at: 9_000 },
    { timestamp: 1_210, used_percentage: 11, resets_at: 9_000 },
    { timestamp: 1_220, used_percentage: 12, resets_at: 9_000 },
  ];

  const updated = updateWindowSamples(
    initial,
    { timestamp: 1_230, used_percentage: 15, resets_at: 9_000 },
    1_230,
    900,
    minuteBucketKey,
  );

  assertEquals(updated, [
    { timestamp: 1_230, used_percentage: 15, resets_at: 9_000 },
  ]);
});

Deno.test("updateWindowSamples preserves samples across minute boundaries", () => {
  const initial = [
    { timestamp: 1_000, used_percentage: 10, resets_at: 9_000 },
  ];

  const updated = updateWindowSamples(
    initial,
    { timestamp: 1_120, used_percentage: 15, resets_at: 9_000 },
    1_120,
    900,
    minuteBucketKey,
  );

  assertEquals(updated, [
    { timestamp: 1_000, used_percentage: 10, resets_at: 9_000 },
    { timestamp: 1_120, used_percentage: 15, resets_at: 9_000 },
  ]);
});

Deno.test("week-tiered bucket keeps per-minute samples within the current hour", () => {
  const hour = 50 * 3600;
  const now = hour + 30 * 60;
  const bucketKey = makeWeekTieredBucketKey(now);

  const compacted = compactSamples([
    { timestamp: hour + 30, used_percentage: 1, resets_at: 9_000 },
    { timestamp: hour + 45, used_percentage: 2, resets_at: 9_000 },
    { timestamp: hour + 65, used_percentage: 3, resets_at: 9_000 },
    { timestamp: hour + 130, used_percentage: 4, resets_at: 9_000 },
  ], bucketKey);

  assertEquals(compacted, [
    { timestamp: hour + 45, used_percentage: 2, resets_at: 9_000 },
    { timestamp: hour + 65, used_percentage: 3, resets_at: 9_000 },
    { timestamp: hour + 130, used_percentage: 4, resets_at: 9_000 },
  ]);
});

Deno.test("week-tiered bucket collapses earlier hours into hourly samples", () => {
  const now = 50 * 3600;
  const bucketKey = makeWeekTieredBucketKey(now);

  const compacted = compactSamples([
    { timestamp: 48 * 3600 + 100, used_percentage: 1, resets_at: 9_000 },
    { timestamp: 48 * 3600 + 200, used_percentage: 2, resets_at: 9_000 },
    { timestamp: 48 * 3600 + 3_000, used_percentage: 3, resets_at: 9_000 },
    { timestamp: 49 * 3600 + 30, used_percentage: 5, resets_at: 9_000 },
    { timestamp: 50 * 3600 + 30, used_percentage: 10, resets_at: 9_000 },
    { timestamp: 50 * 3600 + 90, used_percentage: 11, resets_at: 9_000 },
  ], bucketKey);

  assertEquals(compacted, [
    { timestamp: 48 * 3600 + 3_000, used_percentage: 3, resets_at: 9_000 },
    { timestamp: 49 * 3600 + 30, used_percentage: 5, resets_at: 9_000 },
    { timestamp: 50 * 3600 + 30, used_percentage: 10, resets_at: 9_000 },
    { timestamp: 50 * 3600 + 90, used_percentage: 11, resets_at: 9_000 },
  ]);
});

Deno.test("week-tiered bucket compacts the previous hour after rollover", () => {
  const previousHourSamples = [
    { timestamp: 50 * 3600 + 60, used_percentage: 1, resets_at: 9_000 },
    { timestamp: 50 * 3600 + 1_200, used_percentage: 3, resets_at: 9_000 },
    { timestamp: 50 * 3600 + 3_500, used_percentage: 7, resets_at: 9_000 },
  ];

  const bucketKeyAfterRollover = makeWeekTieredBucketKey(51 * 3600 + 30);
  const compacted = compactSamples(previousHourSamples, bucketKeyAfterRollover);

  assertEquals(compacted, [
    { timestamp: 50 * 3600 + 3_500, used_percentage: 7, resets_at: 9_000 },
  ]);
});

Deno.test("computeBurnRate uses oldest and newest sample in the window", () => {
  assertEquals(
    computeBurnRate([
      { timestamp: 100, used_percentage: 10, resets_at: 500 },
      { timestamp: 400, used_percentage: 25, resets_at: 500 },
    ]),
    3,
  );
});

Deno.test("computeBurnRate restricts to a recent time window when provided", () => {
  assertEquals(
    computeBurnRate([
      { timestamp: 100, used_percentage: 5, resets_at: 10_000 },
      { timestamp: 1_000, used_percentage: 10, resets_at: 10_000 },
      { timestamp: 1_300, used_percentage: 25, resets_at: 10_000 },
    ], { nowUnixSeconds: 1_300, windowSeconds: 400 }),
    3,
  );
});

Deno.test("computeBurnRate returns undefined without enough elapsed time", () => {
  assertEquals(
    computeBurnRate([
      { timestamp: 100, used_percentage: 10, resets_at: 500 },
      { timestamp: 100, used_percentage: 25, resets_at: 500 },
    ]),
    undefined,
  );
});

Deno.test("computeTimeToHitSeconds projects exhaustion before reset", () => {
  assertEquals(
    computeTimeToHitSeconds([
      { timestamp: 0, used_percentage: 40, resets_at: 4_000 },
      { timestamp: 300, used_percentage: 55, resets_at: 4_000 },
    ], 300),
    900,
  );
});

Deno.test("computeTimeToHitSeconds honors burn-rate window", () => {
  // Old sample at ts=0 with 10%, newer two within the 600s window.
  // Without the window, oldest->newest covers 1200s and 50% growth = 2.5%/min,
  // hit in 40m.
  // With a 600s window, only the last two samples count: 30%->50% across 600s
  // = 2%/min, hit in 50m / wait remaining = 100-50=50%, 50/2 = 25 min => 1500s.
  assertEquals(
    computeTimeToHitSeconds(
      [
        { timestamp: 0, used_percentage: 0, resets_at: 10_000 },
        { timestamp: 600, used_percentage: 30, resets_at: 10_000 },
        { timestamp: 1_200, used_percentage: 50, resets_at: 10_000 },
      ],
      1_200,
      600,
    ),
    1_500,
  );
});

Deno.test("computeTimeToHitSeconds hides projections after reset", () => {
  assertEquals(
    computeTimeToHitSeconds([
      { timestamp: 0, used_percentage: 40, resets_at: 1_000 },
      { timestamp: 300, used_percentage: 41, resets_at: 1_000 },
    ], 300),
    undefined,
  );
});

Deno.test("computeTimeToHitSeconds hides flat or negative burn", () => {
  assertEquals(
    computeTimeToHitSeconds([
      { timestamp: 0, used_percentage: 55, resets_at: 4_000 },
      { timestamp: 300, used_percentage: 55, resets_at: 4_000 },
    ], 300),
    undefined,
  );
});

Deno.test({
  name: "loadRateLimitHistory returns empty history for invalid JSON",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const tempDir = await Deno.makeTempDir();
    const filePath = join(tempDir, "rate-limit-history.json");
    await Deno.writeTextFile(filePath, "{not json");

    const history = await loadRateLimitHistory(filePath);
    assertEquals(history, { five_hour: [], seven_day: [] });
  },
});

Deno.test({
  name: "saveRateLimitHistory writes the JSON payload",
  permissions: {
    read: true,
    write: true,
  },
  async fn() {
    const tempDir = await Deno.makeTempDir();
    const filePath = join(tempDir, "state", "rate-limit-history.json");

    await saveRateLimitHistory(filePath, {
      five_hour: [{ timestamp: 100, used_percentage: 10, resets_at: 500 }],
      seven_day: [],
    });

    const text = await Deno.readTextFile(filePath);
    assert(text.includes('"five_hour"'));
  },
});

Deno.test("getDefaultRateLimitHistoryPath uses application config directories", () => {
  assertEquals(
    getDefaultRateLimitHistoryPath({
      os: "darwin",
      env: { HOME: "/Users/tester" },
    }),
    "/Users/tester/Library/Application Support/claude-status-line/rate-limit-history.json",
  );

  assertEquals(
    getDefaultRateLimitHistoryPath({
      os: "linux",
      env: { XDG_CONFIG_HOME: "/tmp/config" },
    }),
    "/tmp/config/claude-status-line/rate-limit-history.json",
  );
});
