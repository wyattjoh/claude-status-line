import {
  aggregateSessionMetrics,
  type SessionMetrics,
} from "./session_metrics.ts";

export { aggregateSessionMetrics } from "./session_metrics.ts";

let ccusageQuieted = false;

async function silenceCcusageLogger(): Promise<void> {
  if (ccusageQuieted) return;
  const { logger } = await import("ccusage/logger");
  logger.removeReporter();
  ccusageQuieted = true;
}

export async function loadSessionMetrics(
  sessionId: string,
): Promise<SessionMetrics | undefined> {
  await silenceCcusageLogger();
  const { loadSessionUsageById } = await import("ccusage/data-loader");
  const sessionUsage = await loadSessionUsageById(sessionId, {
    mode: "auto",
    offline: false,
  });

  if (!sessionUsage) {
    return undefined;
  }

  return aggregateSessionMetrics(sessionUsage.totalCost, sessionUsage.entries);
}

export async function loadContextTokensFromTranscript(
  transcriptPath: string,
  modelId: string,
): Promise<
  {
    inputTokens: number;
    percentage: number;
    contextLimit: number;
  } | null
> {
  await silenceCcusageLogger();
  const { calculateContextTokens } = await import("ccusage/data-loader");
  return calculateContextTokens(transcriptPath, modelId);
}
