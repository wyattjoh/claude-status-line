import { assertEquals } from "jsr:@std/assert";

import { formatEffortSuffix } from "../src/effort.ts";

Deno.test("formatEffortSuffix colors low blue and max red", () => {
  assertEquals(formatEffortSuffix("low"), "\x1b[34m(low)\x1b[39m");
  assertEquals(formatEffortSuffix("max"), "\x1b[31m(max)\x1b[39m");
});

Deno.test("formatEffortSuffix colors intermediate levels", () => {
  assertEquals(formatEffortSuffix("medium"), "\x1b[36m(medium)\x1b[39m");
  assertEquals(formatEffortSuffix("high"), "\x1b[32m(high)\x1b[39m");
  assertEquals(formatEffortSuffix("xhigh"), "\x1b[33m(xhigh)\x1b[39m");
});

Deno.test("formatEffortSuffix leaves unknown levels uncolored", () => {
  assertEquals(formatEffortSuffix("turbo"), "(turbo)");
});

Deno.test("formatEffortSuffix returns undefined when absent", () => {
  assertEquals(formatEffortSuffix(undefined), undefined);
  assertEquals(formatEffortSuffix(""), undefined);
});
