import { assertEquals, assertThrows } from "jsr:@std/assert";

import {
  ALL_MODULES,
  formatCacheModule,
  formatContextModule,
  parseModules,
} from "../src/status_modules.ts";

Deno.test("ALL_MODULES includes session and week", () => {
  assertEquals(ALL_MODULES.includes("session"), true);
  assertEquals(ALL_MODULES.includes("week"), true);
});

Deno.test("parseModules accepts rate-limit module names", () => {
  assertEquals([...parseModules("session,week,git")], [
    "session",
    "week",
    "git",
  ]);
});

Deno.test("parseModules rejects invalid module names", () => {
  assertThrows(
    () => parseModules("session,bogus"),
    Error,
    "Invalid module(s): bogus. Valid modules:",
  );
});

Deno.test("formatCacheModule emphasizes the percentage when color is enabled", () => {
  assertEquals(
    formatCacheModule(87),
    "⚡ \x1b[37m87%\x1b[39m",
  );
});

Deno.test("formatContextModule emphasizes only the percentage token", () => {
  assertEquals(
    formatContextModule({
      percentage: 5,
      inputTokens: 51_000,
      contextLimit: 1_000_000,
    }),
    "🧠 \x1b[37m5%\x1b[39m (51K/1.0M)",
  );
});

Deno.test("formatContextModule keeps ANSI emphasis in non-TTY style scenarios", () => {
  assertEquals(
    formatContextModule({
      percentage: 5,
      inputTokens: 51_000,
      contextLimit: 1_000_000,
    }),
    "🧠 \x1b[37m5%\x1b[39m (51K/1.0M)",
  );
});
