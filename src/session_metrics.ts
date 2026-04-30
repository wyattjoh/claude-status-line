export interface SessionMetrics {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
}

export interface SessionUsageEntry {
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number | undefined;
      cache_read_input_tokens?: number | undefined;
    };
    model?: string | undefined;
  };
}

export function aggregateSessionMetrics(
  totalCost: number,
  entries: SessionUsageEntry[],
): SessionMetrics {
  const modelsSet = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;

  for (const entry of entries) {
    const usage = entry.message.usage;
    inputTokens += usage.input_tokens;
    outputTokens += usage.output_tokens;
    cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    if (entry.message.model) {
      modelsSet.add(entry.message.model);
    }
  }

  return {
    totalCost,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    modelsUsed: Array.from(modelsSet),
  };
}
