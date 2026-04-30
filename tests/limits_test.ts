import { assertEquals } from "jsr:@std/assert";

import {
  FIVE_HOURS_IN_SECONDS,
  formatRateLimitModule,
  formatResetAt,
  SEVEN_DAYS_IN_SECONDS,
} from "../src/limits.ts";

Deno.test("formatResetAt returns empty string for expired windows", () => {
  assertEquals(formatResetAt(1_000, 1_000), "");
  assertEquals(formatResetAt(999, 1_000), "");
});

Deno.test("formatResetAt uses compact relative output within twelve hours", () => {
  assertEquals(formatResetAt(1_200, 0), "20m");
  assertEquals(formatResetAt(7_500, 0), "2h 5m");
  assertEquals(formatResetAt(45, 0), "45s");
});

Deno.test("formatResetAt uses weekday and clock output after twelve hours", () => {
  const resetUnixSeconds = Date.UTC(2026, 4, 3, 14, 0, 0) / 1000;
  const nowUnixSeconds = resetUnixSeconds - (13 * 60 * 60);

  assertEquals(
    formatResetAt(resetUnixSeconds, nowUnixSeconds),
    new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(resetUnixSeconds * 1000)),
  );
});

Deno.test("formatRateLimitModule shows red positive variance when ahead of pace", () => {
  // 5h window: window started 1h ago, so 20% expected. Used 50% → +30% over pace.
  const resetUnixSeconds = 4 * 60 * 60;
  assertEquals(
    formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      {
        used_percentage: 50,
        resets_at: resetUnixSeconds,
      },
      0,
    ),
    "5h \x1b[37m50%\x1b[39m \x1b[31m(+30%)\x1b[39m (4h)",
  );
});

Deno.test("formatRateLimitModule shows dim negative variance when behind pace", () => {
  // 5h window: window started 4h ago, so 80% expected. Used 24% → -56% behind pace.
  const resetUnixSeconds = 60 * 60;
  assertEquals(
    formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      {
        used_percentage: 23.5,
        resets_at: resetUnixSeconds,
      },
      0,
    ),
    "5h \x1b[37m24%\x1b[39m \x1b[2m(-56%)\x1b[22m (1h)",
  );
});

Deno.test("formatRateLimitModule dims zero variance", () => {
  // 5h window: window started 1h ago, so 20% expected. Used 20% → 0% on pace.
  const resetUnixSeconds = 4 * 60 * 60;
  assertEquals(
    formatRateLimitModule(
      "5h",
      FIVE_HOURS_IN_SECONDS,
      {
        used_percentage: 20,
        resets_at: resetUnixSeconds,
      },
      0,
    ),
    "5h \x1b[37m20%\x1b[39m \x1b[2m(+0%)\x1b[22m (4h)",
  );
});

Deno.test("formatRateLimitModule computes 7d weekly pace", () => {
  // 7d window: window started 1 day ago, so ~14% expected. Used 50% → +36% over pace.
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
      {
        used_percentage: 50,
        resets_at: resetUnixSeconds,
      },
      0,
    ),
    `7d \x1b[37m50%\x1b[39m \x1b[31m(+36%)\x1b[39m (${resetDisplay})`,
  );
});

Deno.test("formatRateLimitModule omits missing or rolled-over windows", () => {
  assertEquals(
    formatRateLimitModule("7d", SEVEN_DAYS_IN_SECONDS, undefined, 0),
    undefined,
  );
  assertEquals(
    formatRateLimitModule("7d", SEVEN_DAYS_IN_SECONDS, {
      used_percentage: 41.2,
      resets_at: 1_000,
    }, 1_000),
    undefined,
  );
});
