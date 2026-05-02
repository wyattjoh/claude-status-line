# Rate-Limit Hit Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `%/m` burn-rate display with a relative `hit in ...` forecast that only appears when recent pace would exhaust the rate-limit window before reset.

**Architecture:** Reuse the existing persisted 15-minute history and compute a projected hit time from the same rolling samples. Keep the projection logic in `src/rate_limit_history.ts`, keep formatting in `src/limits.ts`, and wire the new optional forecast through `src/main.ts`.

**Tech Stack:** TypeScript, Deno 2, Deno std assert, persisted JSON history, ANSI string formatting

---

## File Map

- `src/rate_limit_history.ts`: Add forecast computation from rolling samples.
- `src/limits.ts`: Replace `%/m` rendering with `hit in ...`.
- `src/main.ts`: Pass optional projected hit durations into the formatter.
- `tests/rate_limit_history_test.ts`: Add forecast calculation coverage.
- `tests/limits_test.ts`: Add `hit in ...` rendering coverage and remove old `%/m` expectations.
- `README.md`: Update examples and feature description.

### Task 1: Write Failing Forecast Tests

**Files:**

- Modify: `tests/rate_limit_history_test.ts`
- Modify: `tests/limits_test.ts`

- [ ] **Step 1: Add failing forecast calculation tests**

Add to `tests/rate_limit_history_test.ts`:

```ts
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
```

Replace the burn-rate rendering tests in `tests/limits_test.ts` with:

```ts
Deno.test("formatRateLimitModule appends hit forecast", () => {
  const resetUnixSeconds = 4 * 60 * 60;

  assertEquals(
    formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      { used_percentage: 50, resets_at: resetUnixSeconds },
      0,
      45 * 60,
    ),
    "5h \\x1b[37m50%\\x1b[39m \\x1b[31m(+30%, hit in 45m)\\x1b[39m (4h)",
  );
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `deno test --allow-read --allow-write tests/rate_limit_history_test.ts tests/limits_test.ts`

Expected: FAIL because the current code still expects `%/m` values.

### Task 2: Implement Forecast Computation

**Files:**

- Modify: `src/rate_limit_history.ts`

- [ ] **Step 1: Add a helper that computes time-to-hit within the reset window**

Implement:

```ts
export function computeTimeToHitSeconds(
  samples: RateLimitSample[],
  nowUnixSeconds: number,
): number | undefined {
  const burnRate = computeBurnRate(samples);
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
```

- [ ] **Step 2: Run `tests/rate_limit_history_test.ts`**

Run: `deno test --allow-read --allow-write tests/rate_limit_history_test.ts`

Expected: PASS

### Task 3: Replace Burn-Rate Rendering With Hit Forecasts

**Files:**

- Modify: `src/limits.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Update the formatter to accept optional time-to-hit seconds**

Render:

```ts
const details = timeToHitSeconds == null
  ? `${sign}${delta}%`
  : `${sign}${delta}%, hit in ${formatDuration(timeToHitSeconds * 1000)}`;
```

- [ ] **Step 2: Update main orchestration to pass forecast values**

Use `computeTimeToHitSeconds(nextRateLimitHistory.five_hour, nowUnixSeconds)`
and the equivalent `seven_day` call in place of the current burn-rate values.

- [ ] **Step 3: Run the focused tests**

Run: `deno test --allow-read --allow-write tests/rate_limit_history_test.ts tests/limits_test.ts`

Expected: PASS

### Task 4: Update Docs And Verify

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README examples**

Change examples from `%/m` to `hit in ...` and note that the forecast only
appears when the recent trend would exhaust the current window before reset.

- [ ] **Step 2: Run full verification**

Run: `deno test --allow-read --allow-write`
Expected: PASS

Run: `deno fmt --check && deno lint && deno check src/ tests/`
Expected: PASS
