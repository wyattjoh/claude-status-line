import { assertEquals } from "jsr:@std/assert";

import {
  emphasizePercentage,
  packComponentsIntoLines,
  prepareStatusLineOutput,
  visibleWidth,
} from "../src/format.ts";

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

Deno.test("visibleWidth ignores ANSI escapes", () => {
  assertEquals(visibleWidth("\x1b[37m87%\x1b[39m"), 3);
});

Deno.test("visibleWidth counts emoji as two columns", () => {
  // "🤖 Opus" = emoji(2) + space(1) + "Opus"(4) = 7
  assertEquals(visibleWidth("🤖 Opus"), 7);
});

Deno.test("visibleWidth handles VS16 emoji presentation", () => {
  // ⏱️ is U+23F1 + U+FE0F → width 2
  assertEquals(visibleWidth("⏱️ 1h"), 5);
});

Deno.test("packComponentsIntoLines keeps everything on one line when it fits", () => {
  assertEquals(
    packComponentsIntoLines(["a", "b", "c"], " | ", 80),
    ["a | b | c"],
  );
});

Deno.test("packComponentsIntoLines wraps when width is exceeded", () => {
  // "aaaa" + " | " + "bbbb" = 11 cols; maxWidth 10 forces a break.
  assertEquals(
    packComponentsIntoLines(["aaaa", "bbbb", "cc"], " | ", 10),
    ["aaaa", "bbbb | cc"],
  );
});

Deno.test("packComponentsIntoLines accounts for emoji width when packing", () => {
  // Each "🤖 X" is width 4; with " | " (3) two fit in 11 cols (4+3+4=11).
  assertEquals(
    packComponentsIntoLines(["🤖 A", "🤖 B", "🤖 C"], " | ", 11),
    ["🤖 A | 🤖 B", "🤖 C"],
  );
});

Deno.test("packComponentsIntoLines puts oversized components on their own line", () => {
  assertEquals(
    packComponentsIntoLines(["short", "way-too-long-component"], " | ", 8),
    ["short", "way-too-long-component"],
  );
});

Deno.test("packComponentsIntoLines returns empty for empty input", () => {
  assertEquals(packComponentsIntoLines([], " | ", 80), []);
});
