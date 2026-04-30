import { assertEquals } from "jsr:@std/assert";

import { emphasizePercentage, prepareStatusLineOutput } from "../src/format.ts";

Deno.test("emphasizePercentage wraps only the percentage token in white", () => {
  assertEquals(
    emphasizePercentage("🧠 5% (51K/1M)"),
    "🧠 \x1b[37m5%\x1b[39m (51K/1M)",
  );
});

Deno.test("emphasizePercentage still applies ANSI in non-TTY style scenarios", () => {
  assertEquals(
    emphasizePercentage("⚡ 87%"),
    "⚡ \x1b[37m87%\x1b[39m",
  );
});

Deno.test("prepareStatusLineOutput prefixes an ANSI reset", () => {
  assertEquals(
    prepareStatusLineOutput("⚡ \x1b[37m87%\x1b[39m"),
    "\x1b[0m⚡ \x1b[37m87%\x1b[39m",
  );
});
