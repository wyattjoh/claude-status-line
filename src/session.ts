import { loadSessionUsageById } from "ccusage/data-loader";
import {
  aggregateSessionMetrics,
  type SessionMetrics,
} from "./session_metrics.ts";

export { aggregateSessionMetrics } from "./session_metrics.ts";

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

  return aggregateSessionMetrics(sessionUsage.totalCost, sessionUsage.entries);
}
