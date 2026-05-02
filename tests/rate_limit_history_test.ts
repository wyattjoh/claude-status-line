import { assert, assertEquals } from "jsr:@std/assert";
import { join } from "node:path";

import {
  computeBurnRate,
  computeTimeToHitSeconds,
  getDefaultRateLimitHistoryPath,
  loadRateLimitHistory,
  pruneWindowSamples,
  saveRateLimitHistory,
  updateWindowSamples,
} from "../src/rate_limit_history.ts";

Deno.test("pruneWindowSamples keeps only the last fifteen minutes", () => {
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
  const updated = updateWindowSamples([
    { timestamp: 900, used_percentage: 30, resets_at: 1_500 },
  ], {
    timestamp: 1_000,
    used_percentage: 5,
    resets_at: 2_000,
  }, 1_000);

  assertEquals(updated, [
    { timestamp: 1_000, used_percentage: 5, resets_at: 2_000 },
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
