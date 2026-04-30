import { assertEquals, assertThrows } from "jsr:@std/assert";

import { ALL_MODULES, parseModules } from "../src/main.ts";

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
