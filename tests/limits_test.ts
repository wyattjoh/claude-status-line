import { assertEquals } from "jsr:@std/assert";

import { formatRateLimitModule, formatResetAt } from "../src/limits.ts";

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

Deno.test("formatRateLimitModule rounds percentages and includes reset text", () => {
  assertEquals(
    formatRateLimitModule("5h", {
      used_percentage: 23.5,
      resets_at: 1_200,
    }, 0),
    "5h \x1b[1m24%\x1b[22m (20m)",
  );
});

Deno.test("formatRateLimitModule omits missing or rolled-over windows", () => {
  assertEquals(formatRateLimitModule("7d", undefined, 0), undefined);
  assertEquals(
    formatRateLimitModule("7d", {
      used_percentage: 41.2,
      resets_at: 1_000,
    }, 1_000),
    undefined,
  );
});
