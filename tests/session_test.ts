import { assertEquals } from "jsr:@std/assert";

import { aggregateSessionMetrics } from "../src/session.ts";

Deno.test("aggregateSessionMetrics ignores missing model names", () => {
  const metrics = aggregateSessionMetrics(12.34, [
    {
      message: {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 40,
        },
        model: "claude-sonnet-4-5",
      },
    },
    {
      message: {
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      },
    },
  ]);

  assertEquals(metrics.totalCost, 12.34);
  assertEquals(metrics.inputTokens, 110);
  assertEquals(metrics.outputTokens, 55);
  assertEquals(metrics.cacheCreationTokens, 20);
  assertEquals(metrics.cacheReadTokens, 40);
  assertEquals(metrics.modelsUsed, ["claude-sonnet-4-5"]);
});
