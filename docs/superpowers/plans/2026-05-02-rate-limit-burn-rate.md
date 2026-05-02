# Rate-Limit Burn Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted 15-minute rolling burn-rate output to the existing `session` (`5h`) and `week` (`7d`) status-line modules without breaking current rate-limit rendering.

**Architecture:** Keep persistence and burn-rate math in a new `src/rate_limit_history.ts` module so `src/limits.ts` stays a pure formatter. Extend `src/main.ts` to sample current rate-limit windows, compute burn rates from user-config history, and pass those values into the existing module rendering flow. Finish with focused tests and README updates for the new inline output.

**Tech Stack:** TypeScript, Deno 2, Deno std assert, Cliffy command parsing, user config filesystem APIs, ANSI string formatting

---

## File Map

- `src/rate_limit_history.ts`: User-config history path resolution, JSON load/save, 15-minute pruning, window reset handling, and burn-rate calculation.
- `src/limits.ts`: Pure rate-limit formatter updates for optional burn-rate rendering.
- `src/main.ts`: Startup orchestration, history sampling, and status-line assembly.
- `tests/rate_limit_history_test.ts`: Unit tests for pruning, reset handling, file recovery, and burn-rate math.
- `tests/limits_test.ts`: Unit tests for rendering burn-rate suffixes.
- `README.md`: Public documentation and example output updates.

### Task 1: Add Failing Burn-Rate History Tests

**Files:**

- Create: `tests/rate_limit_history_test.ts`
- Modify: `tests/limits_test.ts:1-999`

- [ ] **Step 1: Write the failing persistence and rendering tests**

```ts
import {
  assert,
  assertEquals,
} from "jsr:@std/assert";
import { join } from "node:path";

import {
  computeBurnRate,
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

Deno.test("loadRateLimitHistory returns empty history for invalid JSON", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "rate-limit-history.json");
  await Deno.writeTextFile(filePath, "{not json");

  const history = await loadRateLimitHistory(filePath);
  assertEquals(history, { five_hour: [], seven_day: [] });
});

Deno.test("saveRateLimitHistory writes the pruned JSON payload", async () => {
  const tempDir = await Deno.makeTempDir();
  const filePath = join(tempDir, "state", "rate-limit-history.json");

  await saveRateLimitHistory(filePath, {
    five_hour: [{ timestamp: 100, used_percentage: 10, resets_at: 500 }],
    seven_day: [],
  });

  const text = await Deno.readTextFile(filePath);
  assert(text.includes("\"five_hour\""));
});
```

Append these tests to `tests/limits_test.ts`:

```ts
Deno.test("formatRateLimitModule appends integer burn rates", () => {
  const resetUnixSeconds = 4 * 60 * 60;

  assertEquals(
    formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      { used_percentage: 50, resets_at: resetUnixSeconds },
      0,
      5,
    ),
    "5h \\x1b[37m50%\\x1b[39m \\x1b[31m(+30%, +5%/m)\\x1b[39m (4h)",
  );
});

Deno.test("formatRateLimitModule appends decimal burn rates", () => {
  const resetUnixSeconds = 6 * 24 * 60 * 60;
  const resetDisplay = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(resetUnixSeconds * 1000));

  assertEquals(
    formatRateLimitModule(
      "7d",
      SEVEN_DAYS_IN_SECONDS,
      { used_percentage: 50, resets_at: resetUnixSeconds },
      0,
      0.4,
    ),
    `7d \\x1b[37m50%\\x1b[39m \\x1b[31m(+36%, +0.4%/m)\\x1b[39m (${resetDisplay})`,
  );
});

Deno.test("formatRateLimitModule hides burn rate when no history exists", () => {
  const resetUnixSeconds = 4 * 60 * 60;

  assertEquals(
    formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      { used_percentage: 50, resets_at: resetUnixSeconds },
      0,
    ),
    "5h \\x1b[37m50%\\x1b[39m \\x1b[31m(+30%)\\x1b[39m (4h)",
  );
});
```

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run: `deno test tests/rate_limit_history_test.ts tests/limits_test.ts`

Expected: FAIL because `src/rate_limit_history.ts` does not exist and `formatRateLimitModule` does not yet accept burn-rate input.

- [ ] **Step 3: Commit the red test scaffold if working in checkpoint commits**

```bash
git add tests/rate_limit_history_test.ts tests/limits_test.ts
git commit -m "test: add burn rate history coverage"
```

### Task 2: Implement History Persistence And Burn-Rate Math

**Files:**

- Create: `src/rate_limit_history.ts`

- [ ] **Step 1: Add the minimal history module to satisfy the new tests**

Create `src/rate_limit_history.ts`:

```ts
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

export function pruneWindowSamples(
  samples: RateLimitSample[],
  options: {
    nowUnixSeconds: number;
    currentResetAt: number;
    retentionSeconds?: number;
  },
): RateLimitSample[] {
  const retentionSeconds = options.retentionSeconds ??
    RATE_LIMIT_HISTORY_RETENTION_SECONDS;
  const oldestTimestamp = options.nowUnixSeconds - retentionSeconds;

  return samples.filter((sample) =>
    sample.resets_at === options.currentResetAt &&
    sample.timestamp >= oldestTimestamp
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
  });
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
      five_hour: parsed.five_hour ?? [],
      seven_day: parsed.seven_day ?? [],
    };
  } catch {
    return { five_hour: [], seven_day: [] };
  }
}

export async function saveRateLimitHistory(
  filePath: string,
  history: RateLimitHistory,
): Promise<void> {
  await Deno.mkdir(new URL(".", `file://${filePath}`), { recursive: true });
  await Deno.writeTextFile(filePath, JSON.stringify(history, null, 2));
}
```

- [ ] **Step 2: Run the new history tests**

Run: `deno test tests/rate_limit_history_test.ts`

Expected: PASS with the new file-based and pure helper tests green.

- [ ] **Step 3: Refine path creation if needed after the first green pass**

If `Deno.mkdir(new URL(...))` is awkward in review, switch to `dirname(filePath)`
from `node:path` while keeping the tests green:

```ts
import { dirname } from "node:path";

await Deno.mkdir(dirname(filePath), { recursive: true });
```

### Task 3: Render Burn Rate In Rate-Limit Modules

**Files:**

- Modify: `src/limits.ts:1-999`

- [ ] **Step 1: Extend the formatter signature and compose the inline burn string**

Update `src/limits.ts`:

```ts
function formatBurnRate(burnRate: number): string {
  const rounded = Math.abs(burnRate) >= 1
    ? Math.round(burnRate).toString()
    : burnRate.toFixed(1);
  const sign = burnRate >= 0 ? "+" : "";
  return `${sign}${rounded}%/m`;
}

function formatPaceVariance(
  usedPercentage: number,
  windowSeconds: number,
  resetUnixSeconds: number,
  nowUnixSeconds: number,
  burnRate?: number,
): string {
  const startSeconds = resetUnixSeconds - windowSeconds;
  const elapsedSeconds = nowUnixSeconds - startSeconds;
  const expectedPercentage = Math.max(
    0,
    Math.min(100, (elapsedSeconds / windowSeconds) * 100),
  );
  const delta = Math.round(usedPercentage - expectedPercentage);
  const sign = delta >= 0 ? "+" : "";
  const details = burnRate == null
    ? `${sign}${delta}%`
    : `${sign}${delta}%, ${formatBurnRate(burnRate)}`;
  const text = `(${details})`;

  if (delta > 0) {
    return `\\x1b[31m${text}\\x1b[39m`;
  }
  return `\\x1b[2m${text}\\x1b[22m`;
}

export function formatRateLimitModule(
  label: string,
  windowSeconds: number,
  window: RateLimitWindow | undefined,
  nowUnixSeconds: number,
  burnRate?: number,
): string | undefined {
  // existing guards...
  const variance = formatPaceVariance(
    window.used_percentage,
    windowSeconds,
    window.resets_at,
    nowUnixSeconds,
    burnRate,
  );
  return emphasizePercentage(
    `${label} ${Math.round(window.used_percentage)}% ${variance} (${resetDisplay})`,
  );
}
```

- [ ] **Step 2: Run the rate-limit rendering tests**

Run: `deno test tests/limits_test.ts`

Expected: PASS with both existing pace-variance tests and the new burn-rate formatting tests green.

### Task 4: Wire History Sampling Into Main And Update Docs

**Files:**

- Modify: `src/main.ts:1-999`
- Modify: `README.md:1-999`

- [ ] **Step 1: Write the main-entry integration with minimal orchestration**

Update `src/main.ts` imports and orchestration:

```ts
import { join } from "node:path";
import {
  computeBurnRate,
  loadRateLimitHistory,
  saveRateLimitHistory,
  updateWindowSamples,
  type RateLimitHistory,
} from "./rate_limit_history.ts";

function getRateLimitHistoryPath(): string | undefined {
  const configDir = Deno.env.get("XDG_CONFIG_HOME") ??
    Deno.env.get("HOME") && join(Deno.env.get("HOME")!, ".config");
  return configDir
    ? join(configDir, "claude-status-line", "rate-limit-history.json")
    : undefined;
}

function updateRateLimitHistory(
  history: RateLimitHistory,
  rateLimits: ClaudeContext["rate_limits"],
  nowUnixSeconds: number,
): {
  history: RateLimitHistory;
  fiveHourBurnRate: number | undefined;
  sevenDayBurnRate: number | undefined;
} {
  const nextHistory: RateLimitHistory = {
    five_hour: history.five_hour,
    seven_day: history.seven_day,
  };

  if (rateLimits?.five_hour) {
    nextHistory.five_hour = updateWindowSamples(nextHistory.five_hour, {
      timestamp: nowUnixSeconds,
      used_percentage: rateLimits.five_hour.used_percentage,
      resets_at: rateLimits.five_hour.resets_at,
    }, nowUnixSeconds);
  }

  if (rateLimits?.seven_day) {
    nextHistory.seven_day = updateWindowSamples(nextHistory.seven_day, {
      timestamp: nowUnixSeconds,
      used_percentage: rateLimits.seven_day.used_percentage,
      resets_at: rateLimits.seven_day.resets_at,
    }, nowUnixSeconds);
  }

  return {
    history: nextHistory,
    fiveHourBurnRate: computeBurnRate(nextHistory.five_hour),
    sevenDayBurnRate: computeBurnRate(nextHistory.seven_day),
  };
}
```

Use the new flow inside `buildStatusLine`:

```ts
  const historyPath = getRateLimitHistoryPath();
  const history = historyPath
    ? await loadRateLimitHistory(historyPath)
    : { five_hour: [], seven_day: [] };
  const { history: nextHistory, fiveHourBurnRate, sevenDayBurnRate } =
    updateRateLimitHistory(history, rateLimits, nowUnixSeconds);

  if (historyPath) {
    try {
      await saveRateLimitHistory(historyPath, nextHistory);
    } catch {
      // Persistence is best-effort and must not fail the status line.
    }
  }
```

Pass the computed rates into the existing module calls:

```ts
const sessionRateLimit = formatRateLimitModule(
  "5h",
  FIVE_HOURS_IN_SECONDS,
  rateLimits?.five_hour,
  nowUnixSeconds,
  fiveHourBurnRate,
);

const weeklyRateLimit = formatRateLimitModule(
  "7d",
  SEVEN_DAYS_IN_SECONDS,
  rateLimits?.seven_day,
  nowUnixSeconds,
  sevenDayBurnRate,
);
```

- [ ] **Step 2: Update the README examples and usage notes**

Add to `README.md`:

```md
- 📈 **Burn Rate**: `session` and `week` can show a rolling 15-minute `%/m` burn rate when enough local history exists
```

Update the pace-variance section:

```md
`session` and `week` also include a pace-variance indicator. When enough local
history exists, they append a rolling 15-minute burn rate sourced from a small
user-config history file, e.g. `5h 24% (+10%, +5%/m) (20m)`.
```

- [ ] **Step 3: Run the focused tests, then the full project checks**

Run: `deno test tests/rate_limit_history_test.ts tests/limits_test.ts`
Expected: PASS

Run: `deno test`
Expected: PASS

Run: `deno fmt --check && deno lint && deno check src/main.ts`
Expected: PASS

### Task 5: Final Verification And Commit

**Files:**

- Modify: all files above

- [ ] **Step 1: Inspect the final diff for accidental churn**

Run: `git diff -- src/main.ts src/limits.ts src/rate_limit_history.ts tests/rate_limit_history_test.ts tests/limits_test.ts README.md`

Expected: Only burn-rate persistence, formatting, tests, and docs changes.

- [ ] **Step 2: Commit the implementation**

```bash
git add src/main.ts src/limits.ts src/rate_limit_history.ts \
  tests/rate_limit_history_test.ts tests/limits_test.ts README.md
git commit -m "feat: add rolling burn rate to rate limit modules"
```
