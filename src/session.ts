import { loadSessionUsageById } from "ccusage/data-loader";

export interface SessionMetrics {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
}

interface UsageEntry {
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number | undefined;
      cache_read_input_tokens: number | undefined;
    };
    model: string;
  };
}

/**
 * Loads session usage data and aggregates metrics.
 */
export async function loadSessionMetrics(
  sessionId: string,
): Promise<SessionMetrics | undefined> {
  const sessionUsage = await loadSessionUsageById(sessionId, {
    mode: "auto",
    offline: false,
  });

  if (!sessionUsage) {
    return undefined;
  }

  const modelsSet = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  for (const entry of sessionUsage.entries as UsageEntry[]) {
    const usage = entry.message.usage;
    inputTokens += usage.input_tokens;
    outputTokens += usage.output_tokens;
    cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    modelsSet.add(entry.message.model);
  }

  return {
    totalCost: sessionUsage.totalCost,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    modelsUsed: Array.from(modelsSet),
  };
}
